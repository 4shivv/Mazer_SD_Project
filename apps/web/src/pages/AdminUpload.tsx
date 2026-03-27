import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import AuthCard from "../components/AuthCard";
import {
  deleteDocument,
  listDocuments,
  uploadDocument,
  type KnowledgeBaseDocument,
} from "../lib/api";

const DOCUMENT_TYPE_OPTIONS = [
  { value: "textbook", label: "Textbook" },
  { value: "hardware_manual", label: "Hardware Manual" },
  { value: "operational_procedure", label: "Operational Procedure" },
  { value: "amateur_radio_wiki", label: "Amateur Radio Wiki" },
] as const;

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

export default function AdminUpload() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isInstructor = user?.role === "instructor";
  const isAdmin = user?.role === "admin";

  const [docs, setDocs] = useState<KnowledgeBaseDocument[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string>("textbook");
  const [banner, setBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      nav("/chat", { replace: true });
      return;
    }

    if (user.role !== "admin" && user.role !== "instructor") {
      nav("/chat", { replace: true });
    }
  }, [user, nav]);

  async function refreshDocuments() {
    if (!isInstructor) return;

    setLoadingDocs(true);
    try {
      const response = await listDocuments();
      setDocs(response.documents);
      setErrorBanner(null);
    } catch (error: any) {
      setErrorBanner(error?.message || "Failed to load documents");
    } finally {
      setLoadingDocs(false);
    }
  }

  useEffect(() => {
    void refreshDocuments();
  }, [isInstructor]);

  async function addFiles(files: FileList | null) {
    if (!isInstructor) {
      setErrorBanner("Document upload is currently available only to approved instructor accounts.");
      return;
    }
    if (!files || files.length === 0) return;

    setUploading(true);
    setBanner(null);
    setErrorBanner(null);

    let uploadedCount = 0;

    try {
      for (const file of Array.from(files)) {
        await uploadDocument({
          file,
          documentType,
        });
        uploadedCount += 1;
      }

      setBanner(
        uploadedCount === 1
          ? "Upload submitted. The document has been sent to the knowledge base pipeline."
          : `${uploadedCount} documents were submitted to the knowledge base pipeline.`
      );
      await refreshDocuments();
    } catch (error: any) {
      setErrorBanner(error?.message || "Failed to upload document");
      await refreshDocuments();
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(id: string) {
    if (!isInstructor) {
      setErrorBanner("Document deletion is currently available only to approved instructor accounts.");
      return;
    }

    setDeletingId(id);
    setBanner(null);
    setErrorBanner(null);
    try {
      await deleteDocument(id);
      setBanner("Document deleted from the knowledge base.");
      await refreshDocuments();
    } catch (error: any) {
      setErrorBanner(error?.message || "Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  }

  const totalDocs = docs.length;
  const readyDocs = useMemo(
    () => docs.filter((doc) => doc.status === "ready").length,
    [docs]
  );
  const processingDocs = useMemo(
    () => docs.filter((doc) => doc.status === "processing").length,
    [docs]
  );
  const failedDocs = useMemo(
    () => docs.filter((doc) => doc.status === "failed").length,
    [docs]
  );

  const backPath = isAdmin ? "/admin" : "/chat";

  return (
    <AuthCard title="Knowledge Base Management">
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Upload and manage training documents used by the retrieval pipeline.
      </p>

      {isAdmin && !isInstructor && (
        <div
          style={{
            color: "#f7d48b",
            background: "rgba(247,212,139,0.08)",
            border: "1px solid rgba(247,212,139,0.2)",
            borderRadius: "10px",
            padding: "0.9rem 1rem",
            marginBottom: "1rem",
            textAlign: "left",
          }}
        >
          The live document pipeline is instructor-only on the backend. Sign in with an approved instructor
          account to upload, list, or delete knowledge-base documents from this screen.
        </div>
      )}

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

      {banner && (
        <div
          style={{
            color: "#b6f0c2",
            background: "rgba(70,170,90,0.08)",
            border: "1px solid rgba(70,170,90,0.18)",
            borderRadius: "10px",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            textAlign: "left",
          }}
        >
          {banner}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        {[
          { label: "Total Documents", value: totalDocs },
          { label: "Ready", value: readyDocs },
          { label: "Processing", value: processingDocs },
          { label: "Failed", value: failedDocs },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              padding: "1rem",
              borderRadius: "10px",
              background: "rgba(107,92,255,0.1)",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{item.label}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: "1rem", textAlign: "left" }}>
        <label style={{ display: "block", marginBottom: "0.45rem", color: "var(--muted)" }}>
          Document Type
        </label>
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          disabled={!isInstructor || uploading}
          style={{
            width: "100%",
            padding: "0.75rem",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(10,11,16,0.55)",
            color: "white",
          }}
        >
          {DOCUMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => {
          if (!isInstructor) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        style={{
          border: "2px dashed rgba(255,255,255,0.15)",
          borderRadius: "12px",
          padding: "2rem",
          textAlign: "center",
          marginBottom: "1.5rem",
          background: dragging ? "rgba(107,92,255,0.1)" : "transparent",
          transition: "0.2s",
          opacity: isInstructor ? 1 : 0.65,
        }}
      >
        <div style={{ marginBottom: "0.75rem", fontWeight: 600 }}>
          Upload Training Documents
        </div>
        <div style={{ marginBottom: "1rem", color: "var(--muted)" }}>
          Drag and drop PDF, TXT, or MD files here to send them to the document ingestion pipeline.
        </div>

        <label
          style={{
            display: "inline-block",
            padding: "0.6rem 1.2rem",
            background: isInstructor ? "#6b5cff" : "#555",
            color: "#fff",
            borderRadius: "8px",
            cursor: isInstructor ? "pointer" : "not-allowed",
          }}
        >
          {uploading ? "Uploading..." : "Browse Files"}
          <input
            type="file"
            multiple
            hidden
            disabled={!isInstructor || uploading}
            accept=".pdf,.txt,.md"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {loadingDocs ? (
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
          Loading documents...
        </div>
      ) : docs.length > 0 ? (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ marginBottom: "0.75rem", fontWeight: 600, textAlign: "left" }}>
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
                padding: "0.85rem 1rem",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "10px",
                marginBottom: "0.75rem",
                background: "rgba(10,11,16,0.35)",
              }}
            >
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600 }}>{doc.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {doc.original_filename} • {formatFileSize(doc.size_bytes)} • {formatStatus(doc.status)}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Type: {formatStatus(doc.document_type)} • Chunks: {doc.chunk_count}
                </div>
                {doc.processing_error && (
                  <div style={{ fontSize: "0.8rem", color: "#ffb4b4", marginTop: "0.35rem" }}>
                    Error: {doc.processing_error}
                  </div>
                )}
              </div>

              <button
                onClick={() => void removeDoc(doc.id)}
                disabled={!isInstructor || deletingId === doc.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color: "var(--muted)",
                  borderRadius: "8px",
                  padding: "0.45rem 0.85rem",
                  cursor: isInstructor ? "pointer" : "not-allowed",
                  flexShrink: 0,
                  opacity: isInstructor ? 1 : 0.6,
                }}
              >
                {deletingId === doc.id ? "Deleting..." : "Delete"}
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
          No documents have been uploaded yet. Use an approved instructor account to push training material into
          the knowledge base pipeline and test retrieval from the chat flow.
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          onClick={() => nav(backPath)}
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
          {isAdmin ? "Back to Admin Controls" : "Back to Chat"}
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
