import { api } from "./api";

export type Role = "trainee" | "instructor" | "admin";

export type MeResponse = {
  user: {
    id: string;
    email: string;
    role: Role;
  };
};

export function login(email: string, password: string) {
  return api<MeResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(
  email: string,
  password: string,
  role: Role = "trainee"
) {
  return api<MeResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
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