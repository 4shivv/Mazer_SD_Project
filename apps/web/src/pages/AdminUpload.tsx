import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import AuthCard from "../components/AuthCard";
import type { Doc } from "../lib/docsStore";
import { addDocs, deleteDoc, listDocs, updateDocStatus } from "../lib/docsStore";

export default function AdminUpload() {
  const nav = useNavigate();
  const { user } = useAuth();

  const [docs, setDocs] = useState<Doc[]>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      nav("/chat", { replace: true });
    }
  }, [user, nav]);

  useEffect(() => {
    setDocs(listDocs());
  }, []);

  function refresh() {
    setDocs(listDocs());
  }

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const newDocs = addDocs(files);
    refresh();

    const ids = newDocs.map((d) => d.id);

    setTimeout(() => {
      updateDocStatus(ids, "Processing");
      refresh();
    }, 800);

    setTimeout(() => {
      updateDocStatus(ids, "Ready");
      refresh();
    }, 2000);
  }

  function removeDoc(id: string) {
    deleteDoc(id);
    refresh();
  }

  const totalDocs = docs.length;
  const readyDocs = useMemo(
    () => docs.filter((doc) => doc.status === "Ready").length,
    [docs]
  );
  const processingDocs = useMemo(
    () => docs.filter((doc) => doc.status === "Processing").length,
    [docs]
  );
  const queuedDocs = useMemo(
    () => docs.filter((doc) => doc.status === "Queued").length,
    [docs]
  );

  return (
    <AuthCard title="Knowledge Base Management">
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Upload and manage training documents used to support the Mazer knowledge base.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            padding: "1rem",
            borderRadius: "10px",
            background: "rgba(107,92,255,0.1)",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            Total Documents
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{totalDocs}</div>
        </div>

        <div
          style={{
            padding: "1rem",
            borderRadius: "10px",
            background: "rgba(107,92,255,0.1)",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            Ready
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{readyDocs}</div>
        </div>

        <div
          style={{
            padding: "1rem",
            borderRadius: "10px",
            background: "rgba(107,92,255,0.1)",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            Processing
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>
            {processingDocs}
          </div>
        </div>

        <div
          style={{
            padding: "1rem",
            borderRadius: "10px",
            background: "rgba(107,92,255,0.1)",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            Queued
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{queuedDocs}</div>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        style={{
          border: "2px dashed rgba(255,255,255,0.15)",
          borderRadius: "12px",
          padding: "2rem",
          textAlign: "center",
          marginBottom: "1.5rem",
          background: dragging ? "rgba(107,92,255,0.1)" : "transparent",
          transition: "0.2s",
        }}
      >
        <div style={{ marginBottom: "0.75rem", fontWeight: 600 }}>
          Upload Training Documents
        </div>
        <div style={{ marginBottom: "1rem", color: "var(--muted)" }}>
          Drag and drop PDF, TXT, DOC, or DOCX files here to stage them for the
          knowledge base.
        </div>

        <label
          style={{
            display: "inline-block",
            padding: "0.6rem 1.2rem",
            background: "#6b5cff",
            color: "#fff",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          Browse Files
          <input
            type="file"
            multiple
            hidden
            accept=".pdf,.txt,.doc,.docx"
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>
      </div>

      {docs.length > 0 ? (
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              marginBottom: "0.75rem",
              fontWeight: 600,
              textAlign: "left",
            }}
          >
            Uploaded Documents
          </div>

          {docs.map((doc) => (
            <div
              key={doc.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                padding: "0.75rem 1rem",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "10px",
                marginBottom: "0.75rem",
                background: "rgba(10,11,16,0.35)",
              }}
            >
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600 }}>{doc.name}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {(doc.size / 1024).toFixed(1)} KB • Status: {doc.status}
                </div>
              </div>

              <button
                onClick={() => removeDoc(doc.id)}
                style={{
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color: "var(--muted)",
                  borderRadius: "8px",
                  padding: "0.45rem 0.85rem",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            color: "var(--muted)",
            marginBottom: "1.5rem",
            padding: "1rem",
            borderRadius: "10px",
            background: "rgba(255,255,255,0.03)",
            textAlign: "left",
          }}
        >
          No documents have been uploaded yet. Add training materials here so the
          platform can prepare them for future knowledge base integration.
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          onClick={() => nav("/admin")}
          style={{
            flex: 1,
            minWidth: "160px",
            padding: "0.75rem",
            backgroundColor: "#3b3b3b",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          Back to Admin Controls
        </button>

        <button
          onClick={() => nav("/chat")}
          style={{
            flex: 1,
            minWidth: "160px",
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
      </div>
    </AuthCard>
  );
}