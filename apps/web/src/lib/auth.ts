import { api } from "./api";

export type Role = "trainee" | "instructor" | "admin";
export type AuthUser = { id: string; username: string; email: string; role: Role };
export type MeResponse = { user: AuthUser };
export type RegisterResponse = {
  pendingApproval: boolean;
  message?: string;
  user?: AuthUser;
};

export function login(identifier: string, password: string) {
  return api<MeResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export function register(username: string, password: string, role: "trainee" | "instructor" = "trainee") {
  const body = { username, password, role };
  return api<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function me() {
  return api<MeResponse>("/api/auth/me");
}

export function logout() {
  return api<{ ok: true }>("/api/auth/logout", { method: "POST" });
}
