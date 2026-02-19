import { useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";

export default function AdminUpload() {
  const nav = useNavigate();

  return (
    <AuthCard title="Upload source documents (Ollama)">
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Upload documents to use as context for Ollama. This feature will allow ingesting source files for RAG or fine-tuning.
      </p>
      <div
        style={{
          border: "2px dashed rgba(255,255,255,0.15)",
          borderRadius: "12px",
          padding: "2rem",
          textAlign: "center",
          color: "var(--muted)",
          marginBottom: "1.5rem",
        }}
      >
        Upload UI coming soon. You will be able to add PDFs, text files, or other documents here.
      </div>
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
