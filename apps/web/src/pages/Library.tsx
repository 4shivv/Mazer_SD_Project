import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import AuthCard from "../components/AuthCard";
import { listAvailableDocuments, type KnowledgeBaseDocument } from "../lib/api";

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1024) return `${sizeBytes || 0} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Library() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isInstructor = user?.role === "instructor";

  const [docs, setDocs] = useState<KnowledgeBaseDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAvailableDocuments()
      .then((response) => {
        if (!cancelled) {
          setDocs(response.documents);
          setErrorBanner(null);
        }
      })
      .catch((error: any) => {
        if (!cancelled) {
          setErrorBanner(error?.message || "Failed to load available documents");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthCard title="Mazer Library">
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        View documents currently available to the AI knowledge base.
      </p>

      {errorBanner && (
        <div
          style={{
            color: "#ffb4b4",
            background: "rgba(255,80,80,0.08)",
            border: "1px solid rgba(255,80,80,0.18)",
            borderRadius: "10px",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            textAlign: "left",
          }}
        >
          {errorBanner}
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--muted)" }}>
          Loading available documents...
        </div>
      ) : docs.length === 0 ? (
        <div style={{ color: "var(--muted)" }}>
          No documents available yet.
        </div>
      ) : (
        <div>
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
                <div style={{ fontWeight: 600 }}>{doc.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {doc.original_filename} • {formatFileSize(doc.size_bytes)} • {formatStatus(doc.status)}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Type: {formatStatus(doc.document_type)} • Chunks: {doc.chunk_count}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
        <button
          onClick={() => nav(-1)}
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
          Back
        </button>

        {(isAdmin || isInstructor) && (
          <button
            onClick={() => nav(isAdmin ? "/admin/upload" : "/instructor/upload")}
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
            Manage Documents
          </button>
        )}
      </div>
    </AuthCard>
  );
}
