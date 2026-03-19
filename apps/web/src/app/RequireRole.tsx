import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { Role } from "../lib/auth";

type RequireRoleProps = {
  allowedRoles: Role[];
};

export function RequireRole({ allowedRoles }: RequireRoleProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}