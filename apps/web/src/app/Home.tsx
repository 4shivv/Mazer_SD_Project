import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import RoleSelect from "../pages/RoleSelect";

/**
 * Root route (/): logged-in users go to Chat, others see RoleSelect.
 */
export function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        Loading…
      </div>
    );
  }

  if (user) {
    return <Navigate to="/chat" replace />;
  }

  return <RoleSelect />;
}
