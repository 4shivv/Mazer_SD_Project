import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import AuthCard from "../components/AuthCard";
import type { Doc } from "../lib/docsStore";
import { listDocs, deleteDoc } from "../lib/docsStore";

export default function Library() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    setDocs(listDocs());
  }, []);

  function refresh() {
    setDocs(listDocs());
  }

  function handleDelete(id: string) {
    deleteDoc(id);
    refresh();
  }

  return (
    <AuthCard title="Mazer Library">
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        View documents currently available to the AI knowledge base.
      </p>

      {docs.length === 0 ? (
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
                <div style={{ fontWeight: 600 }}>{doc.name}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {(doc.size / 1024).toFixed(1)} KB • {doc.status}
                </div>
              </div>

              {isAdmin && (
                <button
                  onClick={() => handleDelete(doc.id)}
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
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => nav(-1)}
        style={{
          marginTop: "1.5rem",
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
        Back
      </button>
    </AuthCard>
  );
}