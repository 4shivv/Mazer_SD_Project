import { useEffect, useState } from "react";
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

  // admin guard
  useEffect(() => {
    if (!user || user.role !== "admin") nav("/chat", { replace: true });
  }, [user, nav]);

  // load persisted docs
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

    // fake processing
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

  return (
    <AuthCard title="Mazer Knowledge Base">
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Upload PDFs or text files to power the AI training knowledge base.
      </p>

      {/* drop zone */}
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
        <div style={{ marginBottom: "1rem", color: "var(--muted)" }}>
          Drag & drop documents here
        </div>

        <label
          style={{
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

      {/* doc list */}
      {docs.length > 0 ? (
        <div style={{ marginBottom: "1.5rem" }}>
          {docs.map((doc) => (
            <div
              key={doc.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 1rem",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "10px",
                marginBottom: "0.75rem",
                background: "rgba(10,11,16,0.35)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{doc.name}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {(doc.size / 1024).toFixed(1)} KB • {doc.status}
                </div>
              </div>

              <button
                onClick={() => removeDoc(doc.id)}
                style={{
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color: "var(--muted)",
                  borderRadius: "8px",
                  padding: "0.4rem 0.8rem",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
          No documents uploaded yet.
        </div>
      )}

      <button
        onClick={() => nav(-1)}
        style={{
          display: "block",
          width: "100%",
          padding: "0.75rem",
          backgroundColor: "#6b5cff",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        Back to Chat
      </button>
    </AuthCard>
  );
}