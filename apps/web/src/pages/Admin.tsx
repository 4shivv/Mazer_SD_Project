import { useAuth } from "../app/AuthProvider";
import { useNavigate } from "react-router-dom";
import * as Auth from "../lib/auth";
import AuthCard from "../components/AuthCard";

export default function Admin() {
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
    <AuthCard title="Admin Panel">
      <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
        You can also open the sidebar (☰) on the Chat page and use <strong>All Users</strong> or <strong>Upload source documents</strong>.
      </p>
      <div style={{ textAlign: "left", marginBottom: "1.5rem" }}>
        <p><strong>Admin User:</strong> {user?.email}</p>
        <p><strong>Role:</strong> {user?.role}</p>
      </div>
      <div style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "rgba(107, 92, 255, 0.1)", borderRadius: "8px" }}>
        <p style={{ margin: "0.5rem 0" }}>Admin features coming soon:</p>
        <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem" }}>
          <li>User management</li>
          <li>System settings</li>
          <li>Analytics & reports</li>
        </ul>
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
