import bcrypt from "bcrypt";
import { verifyToken, signUser } from "../../auth/jwt.js";
import { createSessionRecord, deleteSessionByToken, findValidSessionByToken } from "../../repositories/sessionRepository.js";
import {
  createUser,
  findUserById,
  findUserByIdentifier,
  findUserByUsernameOrEmail,
  listPendingInstructors,
  updateInstructorApprovalStatus,
} from "../../repositories/userRepository.js";
import type { Role } from "../../models/User.js";

type RegisterInput = {
  username?: string;
  email?: string;
  password: string;
  role?: "trainee" | "instructor" | "admin" | "user";
};

type LoginInput = {
  identifier?: string;
  email?: string;
  password: string;
};

type PublicUser = {
  id: string;
  email: string;
  username: string;
  role: Role;
};

export class AuthServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code ?? message;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toPublicUser(userDoc: {
  _id: { toString(): string };
  email?: string;
  username: string;
  role: Role;
}): PublicUser {
  return {
    id: userDoc._id.toString(),
    email: userDoc.email ?? "",
    username: userDoc.username,
    role: userDoc.role,
  };
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function resolveRegisterRole(role?: RegisterInput["role"]): Role {
  if (!role || role === "user") return "trainee";
  if (role === "instructor") return "instructor";
  if (role === "trainee") return "trainee";
  throw new AuthServiceError(
    403,
    "Admin self-registration is disabled. Use bootstrap/admin provisioning.",
    "admin_self_register_forbidden"
  );
}

function add24Hours(now: number) {
  return new Date(now + DAY_MS);
}

type RegisterResult =
  | {
      pendingApproval: true;
      message: string;
      user: PublicUser;
    }
  | {
      pendingApproval: false;
      user: PublicUser;
      token: string;
      expiresAt: Date;
    };

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const identifier = normalizeIdentifier(input.username ?? input.email ?? "");
  if (!identifier) throw new AuthServiceError(400, "username_or_email_required");
  const email = input.email ? normalizeIdentifier(input.email) : `${identifier}@local.invalid`;
  const role = resolveRegisterRole(input.role);

  const existing = await findUserByUsernameOrEmail(identifier, email);
  if (existing) throw new AuthServiceError(409, "Identity already in use", "identity_conflict");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const userDoc = await createUser({
    email,
    username: identifier,
    passwordHash,
    role,
    instructorApprovalStatus: role === "instructor" ? "pending" : "approved",
  });

  if (role === "instructor") {
    return {
      pendingApproval: true,
      message: "Instructor account created. Admin approval required before login.",
      user: toPublicUser(userDoc),
    };
  }

  const token = signUser({
    id: userDoc._id.toString(),
    email: userDoc.email,
    username: userDoc.username,
    role: userDoc.role,
  });
  const expiresAt = add24Hours(Date.now());
  await createSessionRecord({ userId: userDoc._id.toString(), sessionToken: token, expiresAt });

  return {
    pendingApproval: false,
    token,
    expiresAt,
    user: toPublicUser(userDoc),
  };
}

export async function loginUser(input: LoginInput) {
  const identifier = normalizeIdentifier(input.identifier ?? input.email ?? "");
  if (!identifier) throw new AuthServiceError(400, "identifier_required");
  const userDoc = await findUserByIdentifier(identifier);
  if (!userDoc) throw new AuthServiceError(401, "Invalid credentials", "invalid_credentials");

  const ok = await bcrypt.compare(input.password, userDoc.passwordHash);
  if (!ok) throw new AuthServiceError(401, "Invalid credentials", "invalid_credentials");

  if (userDoc.role === "instructor" && userDoc.instructorApprovalStatus !== "approved") {
    throw new AuthServiceError(
      403,
      "Instructor account pending admin approval",
      "instructor_pending_approval"
    );
  }

  const token = signUser({
    id: userDoc._id.toString(),
    email: userDoc.email,
    username: userDoc.username,
    role: userDoc.role,
  });
  const expiresAt = add24Hours(Date.now());
  await createSessionRecord({ userId: userDoc._id.toString(), sessionToken: token, expiresAt });

  return {
    token,
    expiresAt,
    user: toPublicUser(userDoc),
  };
}

export async function getUserFromSessionToken(token: string) {
  try {
    const decoded = verifyToken(token);
    const session = await findValidSessionByToken(token);
    if (!session) throw new AuthServiceError(401, "Invalid session", "invalid_session");

    const user = await findUserById(decoded.id);
    if (!user) throw new AuthServiceError(401, "Invalid session", "invalid_session");
    return {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      role: user.role,
    };
  } catch {
    throw new AuthServiceError(401, "Invalid session", "invalid_session");
  }
}

export async function logoutUser(token: string) {
  await deleteSessionByToken(token);
}

async function assertAdminActor(actorId: string) {
  const actor = await findUserById(actorId);
  if (!actor || actor.role !== "admin") {
    throw new AuthServiceError(403, "Admin only", "admin_only");
  }
  return actor;
}

export async function listPendingInstructorAccounts(args: { actorId: string; limit?: number }) {
  await assertAdminActor(args.actorId);
  const docs = await listPendingInstructors({ limit: args.limit });
  return {
    users: docs.map((doc: any) => ({
      id: doc._id.toString(),
      email: doc.email ?? "",
      username: doc.username,
      role: doc.role as Role,
      instructorApprovalStatus: doc.instructorApprovalStatus as "pending",
      created_at: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : null,
    })),
  };
}

export async function approveInstructorAccount(args: { actorId: string; targetUserId: string }) {
  const actor = await assertAdminActor(args.actorId);

  const target = await findUserById(args.targetUserId);
  if (!target) throw new AuthServiceError(404, "User not found", "user_not_found");
  if (target.role !== "instructor") {
    throw new AuthServiceError(400, "Target user is not an instructor", "target_not_instructor");
  }

  const updated = await updateInstructorApprovalStatus({
    userId: args.targetUserId,
    status: "approved",
    approvedBy: actor._id.toString(),
    rejectionReason: null,
  });

  if (!updated) throw new AuthServiceError(404, "User not found", "user_not_found");
  return toPublicUser(updated);
}
