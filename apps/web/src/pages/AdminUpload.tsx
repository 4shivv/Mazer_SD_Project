import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import AuthCard from "../components/AuthCard";

type Doc = {
  id: string;
  name: string;
  size: number;
  status: "Queued" | "Processing" | "Ready";
};

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function AdminUpload() {
  const nav = useNavigate();
  const { user } = useAuth();

  // admin guard
  useEffect(() => {
    if (!user || user.role !== "admin") {
      nav("/chat", { replace: true });
    }
  }, [user, nav]);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [dragging, setDragging] = useState(false);

  function addFiles(files: FileList | null) {
    if (!files) return;

    const newDocs: Doc[] = Array.from(files).map((f) => ({
      id: uid(),
      name: f.name,
      size: f.size,
      status: "Queued",
    }));

    setDocs((d) => [...newDocs, ...d]);

    // fake processing
    setTimeout(() => {
      setDocs((d) =>
        d.map((doc) =>
          newDocs.find((n) => n.id === doc.id)
            ? { ...doc, status: "Processing" }
            : doc
        )
      );
    }, 800);

    setTimeout(() => {
      setDocs((d) =>
        d.map((doc) =>
          newDocs.find((n) => n.id === doc.id)
            ? { ...doc, status: "Ready" }
            : doc
        )
      );
    }, 2000);
  }

  function removeDoc(id: string) {
    setDocs((d) => d.filter((doc) => doc.id !== id));
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
      {docs.length > 0 && (
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
      )}

      <button
        onClick={() => nav("/chat")}
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