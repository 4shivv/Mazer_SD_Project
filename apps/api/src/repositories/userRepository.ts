import { User } from "../models/User.js";
import type { InstructorApprovalStatus, Role } from "../models/User.js";

type CreateUserInput = {
  username?: string;
  email: string;
  passwordHash: string;
  role: Role;
  instructorApprovalStatus?: InstructorApprovalStatus;
};

export async function findUserByEmail(email: string) {
  return User.findOne({ email: email.toLowerCase() });
}

export async function findUserByUsername(username: string) {
  return User.findOne({ username: username.toLowerCase() });
}

export async function findUserByIdentifier(identifier: string) {
  const normalized = identifier.toLowerCase();
  return User.findOne({
    $or: [{ username: normalized }, { email: normalized }],
  });
}

export async function findUserByUsernameOrEmail(username: string, email: string) {
  const normalizedUsername = username.toLowerCase();
  const normalizedEmail = email.toLowerCase();
  return User.findOne({
    $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
  });
}

export async function findUserById(id: string) {
  return User.findById(id);
}

export async function createUser(input: CreateUserInput) {
  return User.create(input);
}

export async function listPendingInstructors(args?: { limit?: number }) {
  const limit = Math.max(1, Math.min(args?.limit ?? 100, 500));
  return User.find({
    role: "instructor",
    instructorApprovalStatus: "pending",
  })
    .sort({ createdAt: -1 })
    .limit(limit);
}

export async function updateInstructorApprovalStatus(args: {
  userId: string;
  status: InstructorApprovalStatus;
  approvedBy?: string | null;
  rejectionReason?: string | null;
}) {
  const update: Record<string, unknown> = {
    instructorApprovalStatus: args.status,
    approvedBy: args.approvedBy ?? null,
    rejectionReason: args.rejectionReason ?? null,
  };

  if (args.status === "approved") {
    update.approvedAt = new Date();
  } else {
    update.approvedAt = null;
  }

  return User.findByIdAndUpdate(args.userId, update, { new: true });
}
