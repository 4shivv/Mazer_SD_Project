import { api } from "./api";

export type Role = "trainee" | "instructor" | "admin";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: Role;
};

export type MeResponse = {
  user: AuthUser;
};

export type RegisterResponse = {
  pendingApproval: boolean;
  message?: string;
  user?: AuthUser;
};

export type ApproveInstructorResponse = {
  user: AuthUser;
};

export type PendingInstructor = AuthUser & {
  instructorApprovalStatus: "pending";
  created_at: string | null;
};

export type PendingInstructorsResponse = {
  users: PendingInstructor[];
};

function buildIdentityPayload(identifier: string) {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return { email: trimmed };
  }
  return { username: trimmed };
}

export function login(identifier: string, password: string) {
  return api<MeResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      ...(identifier.includes("@")
        ? { email: identifier.trim() }
        : { identifier: identifier.trim() }),
      password,
    }),
  });
}

export function register(identifier: string, password: string, role: "trainee" | "instructor" = "trainee") {
  return api<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      ...buildIdentityPayload(identifier),
      password,
      role,
    }),
  });
}

export function me() {
  return api<MeResponse>("/api/auth/me");
}

export function logout() {
  return api<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export function approveInstructor(targetUserId: string) {
  return api<ApproveInstructorResponse>(`/api/auth/instructors/${encodeURIComponent(targetUserId)}/approve`, {
    method: "POST",
  });
}

export function listPendingInstructors(limit = 100) {
  return api<PendingInstructorsResponse>(`/api/auth/instructors/pending?limit=${encodeURIComponent(String(limit))}`);
}
