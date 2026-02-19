import { useAuth } from "../app/AuthProvider";
import { useNavigate } from "react-router-dom";
import * as Auth from "../lib/auth";
import AuthCard from "../components/AuthCard";

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();

  async function logout() {
    try {
      await Auth.logout();
    } finally {
      refresh();
      nav("/", { replace: true });
    }
  }

  return (
    <AuthCard title="Dashboard">
      <div style={{ textAlign: "left", marginBottom: "1.5rem" }}>
        <p><strong>Email:</strong> {user?.email}</p>
        <p><strong>Role:</strong> {user?.role}</p>
      </div>
      <button
        onClick={() => nav("/chat")}
        style={{
          display: "block",
          width: "100%",
          marginBottom: "0.5rem",
          padding: "0.75rem",
          backgroundColor: "#6b5cff",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        Go to Chat
      </button>
      <button
        onClick={logout}
        style={{
          display: "block",
          width: "100%",
          padding: "0.75rem",
          backgroundColor: "#555",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        Logout
      </button>
    </AuthCard>
  );
}
