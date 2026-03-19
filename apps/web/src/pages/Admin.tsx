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

  function handleResetMemory() {
    alert("Memory reset endpoint not connected yet.");
  }

  function handleClearKnowledgeBase() {
    alert("Knowledge base reset endpoint not connected yet.");
  }

  return (
    <AuthCard title="Admin Controls">
      <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
        Manage system-level training controls, reset actions, and knowledge base administration.
      </p>

      <div style={{ textAlign: "left", marginBottom: "1.5rem" }}>
        <p>
          <strong>Admin User:</strong> {user?.email}
        </p>
        <p>
          <strong>Role:</strong> {user?.role}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            padding: "1rem",
            backgroundColor: "rgba(107, 92, 255, 0.1)",
            borderRadius: "8px",
            textAlign: "left",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            Conversation Controls
          </h3>
          <p style={{ marginTop: 0, marginBottom: "1rem", color: "var(--muted)" }}>
            Reset active training memory and prepare the system for a fresh session.
          </p>
          <button
            onClick={handleResetMemory}
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "#6b5cff",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Reset Memory
          </button>
        </div>

        <div
          style={{
            padding: "1rem",
            backgroundColor: "rgba(107, 92, 255, 0.1)",
            borderRadius: "8px",
            textAlign: "left",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            Knowledge Base Controls
          </h3>
          <p style={{ marginTop: 0, marginBottom: "1rem", color: "var(--muted)" }}>
            Clear or manage uploaded training documents and system knowledge.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              onClick={handleClearKnowledgeBase}
              style={{
                padding: "0.75rem 1rem",
                backgroundColor: "#6b5cff",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Clear Knowledge Base
            </button>

            <button
              onClick={() => nav("/admin/upload")}
              style={{
                padding: "0.75rem 1rem",
                backgroundColor: "#3b3b3b",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Manage Uploads
            </button>
          </div>
        </div>

        <div
          style={{
            padding: "1rem",
            backgroundColor: "rgba(107, 92, 255, 0.1)",
            borderRadius: "8px",
            textAlign: "left",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            System Status
          </h3>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Frontend admin controls are ready. Backend reset endpoints can be connected next.
          </p>
        </div>
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