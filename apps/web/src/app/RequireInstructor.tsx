import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function RequireInstructor() {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== "instructor") return <Navigate to="/chat" replace />;
  return <Outlet />;
}
