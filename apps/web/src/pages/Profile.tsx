import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import * as Auth from "../lib/auth";
import AuthCard from "../components/AuthCard";

export default function Profile() {
  const nav = useNavigate();
  const { user, refresh } = useAuth();

  async function logout() {
    try {
      await Auth.logout();
    } finally {
      await refresh();
      nav("/", { replace: true });
    }
  }

  const primaryDestination = user?.role === "admin"
    ? "/admin"
    : user?.role === "instructor"
      ? "/instructor/settings"
      : "/chat";

  const primaryLabel = user?.role === "admin"
    ? "Open Admin Controls"
    : user?.role === "instructor"
      ? "Open Instructor Settings"
      : "Back to Chat";

  return (
    <AuthCard title="Profile" subtitle="Account overview and role-based navigation">
      <div style={{ textAlign: "left", display: "grid", gap: "0.9rem" }}>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "1rem",
            background: "rgba(10,11,16,0.35)",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Username
          </div>
          <div style={{ fontWeight: 700, marginTop: "0.2rem", overflowWrap: "anywhere" }}>
            {user?.username ?? "Unavailable"}
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "1rem",
            background: "rgba(10,11,16,0.35)",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Email
          </div>
          <div style={{ fontWeight: 700, marginTop: "0.2rem", overflowWrap: "anywhere" }}>
            {user?.email ?? "Unavailable"}
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "1rem",
            background: "rgba(10,11,16,0.35)",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Role
          </div>
          <div style={{ fontWeight: 700, marginTop: "0.2rem", textTransform: "capitalize" }}>
            {user?.role ?? "Unavailable"}
          </div>
        </div>

        <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
          Profile editing is not implemented yet, but account identity, role, and navigation are now available here.
        </p>
      </div>

      <div style={{ display: "grid", gap: "0.75rem", marginTop: "1.5rem" }}>
        <button
          onClick={() => nav(primaryDestination)}
          style={{
            display: "block",
            width: "100%",
            minHeight: "44px",
            padding: "0.85rem 1rem",
            backgroundColor: "#6b5cff",
            color: "white",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {primaryLabel}
        </button>

        <button
          onClick={logout}
          style={{
            display: "block",
            width: "100%",
            minHeight: "44px",
            padding: "0.85rem 1rem",
            backgroundColor: "rgba(255,255,255,0.08)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "10px",
            cursor: "pointer",
          }}
        >
          Log Out
        </button>
      </div>
    </AuthCard>
  );
}
