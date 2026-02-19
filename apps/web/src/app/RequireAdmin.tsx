import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function RequireAdmin() {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
