import { useEffect, useState } from "react";
import { useAuth } from "../app/AuthProvider";
import { useNavigate } from "react-router-dom";
import * as Auth from "../lib/auth";
import AuthCard from "../components/AuthCard";
import { runAdminWipe, updateRetentionPolicy, type AdminWipeResponse } from "../lib/api";
import styles from "./Login.module.css";

export default function Admin() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [approveTargetId, setApproveTargetId] = useState("");
  const [approving, setApproving] = useState(false);
  const [approvedUsername, setApprovedUsername] = useState<string | null>(null);
  const [pendingInstructors, setPendingInstructors] = useState<Auth.PendingInstructor[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const [retentionDays, setRetentionDays] = useState("30");
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);

  const [wipeConversations, setWipeConversations] = useState(false);
  const [wipeEmbeddings, setWipeEmbeddings] = useState(false);
  const [wipeModelWeights, setWipeModelWeights] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [wipeLoading, setWipeLoading] = useState(false);
  const [wipeResult, setWipeResult] = useState<AdminWipeResponse | null>(null);

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  async function loadPendingInstructors() {
    try {
      setPendingLoading(true);
      const result = await Auth.listPendingInstructors(200);
      setPendingInstructors(result.users);
    } catch {
      setPendingInstructors([]);
    } finally {
      setPendingLoading(false);
    }
  }

  useEffect(() => {
    void loadPendingInstructors();
  }, []);

  async function logout() {
    try {
      await Auth.logout();
    } finally {
      refresh();
      nav("/", { replace: true });
    }
  }

  async function onApproveInstructor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    resetMessages();
    setApprovedUsername(null);

    const targetId = approveTargetId.trim();
    if (!targetId) {
      setError("Instructor user ID is required.");
      return;
    }

    try {
      setApproving(true);
      const result = await Auth.approveInstructor(targetId);
      setApprovedUsername(result.user.username);
      setNotice("Instructor approved successfully.");
      setApproveTargetId("");
      await loadPendingInstructors();
    } catch (err: any) {
      setError(err?.message || "Failed to approve instructor.");
    } finally {
      setApproving(false);
    }
  }

  async function onApproveFromList(targetId: string) {
    resetMessages();
    setApprovedUsername(null);
    try {
      setApproving(true);
      const result = await Auth.approveInstructor(targetId);
      setApprovedUsername(result.user.username);
      setNotice("Instructor approved successfully.");
      await loadPendingInstructors();
    } catch (err: any) {
      setError(err?.message || "Failed to approve instructor.");
    } finally {
      setApproving(false);
    }
  }

  async function onUpdateRetention(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    resetMessages();

    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setError("Retention days must be an integer between 1 and 3650.");
      return;
    }

    try {
      setRetentionSaving(true);
      const result = await updateRetentionPolicy({
        default_retention_days: days,
        apply_to_existing: applyToExisting,
      });
      setNotice(
        `Retention updated to ${result.default_retention_days} day(s). Conversations affected: ${result.conversations_affected}.`
      );
    } catch (err: any) {
      setError(err?.message || "Failed to update retention policy.");
    } finally {
      setRetentionSaving(false);
    }
  }

  async function onRunWipe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    resetMessages();
    setWipeResult(null);

    if (!wipeConversations && !wipeEmbeddings && !wipeModelWeights) {
      setError("Select at least one wipe target.");
      return;
    }
    if (!confirmationCode.trim()) {
      setError("Confirmation code is required.");
      return;
    }

    try {
      setWipeLoading(true);
      const result = await runAdminWipe({
        wipe_conversations: wipeConversations,
        wipe_embeddings: wipeEmbeddings,
        wipe_model_weights: wipeModelWeights,
        confirmation_code: confirmationCode.trim(),
      });
      setWipeResult(result);
      setNotice(`Wipe completed with status: ${result.status}.`);
      setConfirmationCode("");
    } catch (err: any) {
      setError(err?.message || "Failed to run wipe operation.");
    } finally {
      setWipeLoading(false);
    }
  }

  return (
    <AuthCard title="Admin Controls">
      <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
        Manage instructor approvals, retention policy, knowledge base administration, and destructive data controls.
      </p>

      {error && <div style={{ color: "#ff6b6b", marginBottom: "1rem" }}>{error}</div>}
      {notice && <div style={{ color: "#3ddc97", marginBottom: "1rem" }}>{notice}</div>}

      <div style={{ textAlign: "left", marginBottom: "1.25rem" }}>
        <p><strong>Admin User:</strong> {user?.email}</p>
        <p><strong>Role:</strong> {user?.role}</p>
      </div>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Approve Instructor Account</h3>
        <button
          type="button"
          onClick={() => void loadPendingInstructors()}
          style={{
            marginBottom: "0.75rem",
            padding: "0.4rem 0.7rem",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent",
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          {pendingLoading ? "Refreshing..." : "Refresh Pending List"}
        </button>

        {pendingInstructors.length === 0 ? (
          <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
            {pendingLoading ? "Loading pending instructors..." : "No pending instructors."}
          </p>
        ) : (
          <div style={{ marginBottom: "0.75rem" }}>
            {pendingInstructors.map((pendingUser) => (
              <div
                key={pendingUser.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "10px",
                  padding: "0.65rem",
                  marginBottom: "0.5rem",
                  background: "rgba(10,11,16,0.35)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{pendingUser.username}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", overflowWrap: "anywhere" }}>
                    {pendingUser.email} • {pendingUser.id}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={approving}
                  onClick={() => void onApproveFromList(pendingUser.id)}
                  style={{
                    padding: "0.45rem 0.7rem",
                    borderRadius: "8px",
                    border: "none",
                    background: "#6b5cff",
                    color: "white",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {approving ? "Approving..." : "Approve"}
                </button>
              </div>
            ))}
          </div>
        )}

        <form className={styles.form} onSubmit={onApproveInstructor}>
          <input
            className={styles.field}
            value={approveTargetId}
            onChange={(e) => setApproveTargetId(e.target.value)}
            placeholder="Instructor user ID"
          />
          <button className={styles.submit} type="submit" disabled={approving}>
            {approving ? "Approving..." : "Approve Instructor"}
          </button>
        </form>
        {approvedUsername && (
          <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
            Approved: <strong>{approvedUsername}</strong>
          </p>
        )}
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Knowledge Base Controls</h3>
        <p style={{ marginTop: 0, marginBottom: "1rem", color: "var(--muted)" }}>
          Manage uploaded training documents from the dedicated admin upload page.
        </p>
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
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Retention Policy</h3>
        <form className={styles.form} onSubmit={onUpdateRetention}>
          <input
            className={styles.field}
            type="number"
            min={1}
            max={3650}
            step={1}
            value={retentionDays}
            onChange={(e) => setRetentionDays(e.target.value)}
            placeholder="Default retention days"
          />
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted)" }}>
            <input
              type="checkbox"
              checked={applyToExisting}
              onChange={(e) => setApplyToExisting(e.target.checked)}
            />
            Apply to existing conversations
          </label>
          <button className={styles.submit} type="submit" disabled={retentionSaving}>
            {retentionSaving ? "Saving..." : "Save Retention Policy"}
          </button>
        </form>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Secure Wipe</h3>
        <form className={styles.form} onSubmit={onRunWipe}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted)" }}>
            <input
              type="checkbox"
              checked={wipeConversations}
              onChange={(e) => setWipeConversations(e.target.checked)}
            />
            Wipe conversations
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted)" }}>
            <input
              type="checkbox"
              checked={wipeEmbeddings}
              onChange={(e) => setWipeEmbeddings(e.target.checked)}
            />
            Wipe embeddings
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted)" }}>
            <input
              type="checkbox"
              checked={wipeModelWeights}
              onChange={(e) => setWipeModelWeights(e.target.checked)}
            />
            Reset model weights and cache
          </label>
          <input
            className={styles.field}
            value={confirmationCode}
            onChange={(e) => setConfirmationCode(e.target.value)}
            placeholder="Confirmation code"
          />
          <button className={styles.submit} type="submit" disabled={wipeLoading}>
            {wipeLoading ? "Running wipe..." : "Run Wipe"}
          </button>
        </form>

        {wipeResult && (
          <pre
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.06)",
              overflowX: "auto",
              fontSize: "0.8rem",
            }}
          >
            {JSON.stringify(wipeResult, null, 2)}
          </pre>
        )}
      </section>

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
