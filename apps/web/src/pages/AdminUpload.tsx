import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { useUploads } from "../app/UploadProvider";
import AuthCard from "../components/AuthCard";
import uploadStyles from "./AdminUpload.module.css";
import {
  deleteDocument,
  listDocuments,
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
  const { uploads, queueUploads } = useUploads();
  const canManageDocuments = user?.role === "instructor" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  const [docs, setDocs] = useState<KnowledgeBaseDocument[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [refreshingDocs, setRefreshingDocs] = useState(false);
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

  async function refreshDocuments(options?: { silent?: boolean }) {
    if (!canManageDocuments) return;

    if (options?.silent) {
      setRefreshingDocs(true);
    } else {
      setLoadingDocs(true);
    }
    try {
      const response = await listDocuments();
      setDocs(response.documents);
      setErrorBanner(null);
    } catch (error: any) {
      setErrorBanner(error?.message || "Failed to load documents");
    } finally {
      if (options?.silent) {
        setRefreshingDocs(false);
      } else {
        setLoadingDocs(false);
      }
    }
  }

  useEffect(() => {
    void refreshDocuments();
  }, [canManageDocuments]);

  async function addFiles(files: FileList | null) {
    if (!canManageDocuments) {
      setErrorBanner("Document upload is available only to approved instructor or admin accounts.");
      return;
    }
    if (!files || files.length === 0) return;

    setBanner(null);
    setErrorBanner(null);

    const uploadIds = queueUploads(files, documentType);
    if (uploadIds.length === 0) return;

    setBanner(
      uploadIds.length === 1
        ? "Upload started. You can return to chat while processing continues in the background."
        : `${uploadIds.length} uploads started. You can return to chat while processing continues in the background.`
    );
    await refreshDocuments({ silent: true });
  }

  async function removeDoc(id: string) {
    if (!canManageDocuments) {
      setErrorBanner("Document deletion is available only to approved instructor or admin accounts.");
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
  const activeUploads = useMemo(
    () =>
      uploads.filter(
        (entry) =>
          entry.status === "queued" || entry.status === "uploading" || entry.status === "processing"
      ),
    [uploads]
  );

  useEffect(() => {
    if (!canManageDocuments || (activeUploads.length === 0 && processingDocs === 0)) return;

    const intervalId = window.setInterval(() => {
      void refreshDocuments({ silent: true });
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [canManageDocuments, activeUploads.length, processingDocs]);

  const backPath = isAdmin ? "/admin" : "/chat";

  return (
    <AuthCard
      title="Knowledge Base Management"
      wrapClassName={uploadStyles.uploadWrap}
      cardClassName={uploadStyles.uploadCard}
      bodyClassName={uploadStyles.uploadBody}
    >
      <div className={uploadStyles.uploadTop}>
        <p style={{ color: "var(--muted)", margin: "0 0 0.85rem", fontSize: "0.95rem", lineHeight: 1.45 }}>
          Upload and manage training documents used by the retrieval pipeline.
        </p>

        {errorBanner && (
          <div
            style={{
              color: "#ffb4b4",
              background: "rgba(255,80,80,0.08)",
              border: "1px solid rgba(255,80,80,0.18)",
              borderRadius: "10px",
              padding: "0.65rem 0.85rem",
              marginBottom: "0.75rem",
              textAlign: "left",
              fontSize: "0.9rem",
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
              padding: "0.65rem 0.85rem",
              marginBottom: "0.75rem",
              textAlign: "left",
              fontSize: "0.9rem",
            }}
          >
            {banner}
          </div>
        )}

        {refreshingDocs && !loadingDocs && (
          <div
            style={{
              color: "var(--muted)",
              marginBottom: "0.55rem",
              fontSize: "0.88rem",
              textAlign: "left",
            }}
          >
            Refreshing document status...
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "0.65rem",
            marginBottom: "0.85rem",
          }}
        >
          {[
            { label: "Total", value: totalDocs },
            { label: "Ready", value: readyDocs },
            { label: "Processing", value: processingDocs },
            { label: "Failed", value: failedDocs },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "0.65rem 0.75rem",
                borderRadius: "10px",
                background: "rgba(107,92,255,0.1)",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.25 }}>{item.label}</div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.2 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: "0.75rem", textAlign: "left" }}>
          <label
            style={{ display: "block", marginBottom: "0.35rem", color: "var(--muted)", fontSize: "0.88rem" }}
          >
            Document Type
          </label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            disabled={!canManageDocuments}
            style={{
              width: "100%",
              padding: "0.55rem 0.65rem",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(10,11,16,0.55)",
              color: "white",
              fontSize: "0.92rem",
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
            if (!canManageDocuments) return;
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
            padding: "1.15rem 1.25rem",
            textAlign: "center",
            marginBottom: "0.65rem",
            background: dragging ? "rgba(107,92,255,0.1)" : "transparent",
            transition: "0.2s",
            opacity: canManageDocuments ? 1 : 0.65,
          }}
        >
          <div style={{ marginBottom: "0.35rem", fontWeight: 600, fontSize: "1.05rem" }}>
            Upload Training Documents
          </div>
          <div style={{ marginBottom: "0.65rem", color: "var(--muted)", fontSize: "0.88rem", lineHeight: 1.45 }}>
            Drag and drop PDF, TXT, or MD files here, or browse to select.
          </div>

          <label
            style={{
              display: "inline-block",
              padding: "0.55rem 1.15rem",
              background: canManageDocuments ? "#6b5cff" : "#555",
              color: "#fff",
              borderRadius: "8px",
              cursor: canManageDocuments ? "pointer" : "not-allowed",
              fontSize: "0.92rem",
            }}
          >
            {activeUploads.length > 0 ? "Add More Files" : "Browse Files"}
            <input
              type="file"
              multiple
              hidden
              disabled={!canManageDocuments}
              accept=".pdf,.txt,.md"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className={uploadStyles.uploadScroll}>
        {loadingDocs ? (
          <div
            style={{
              color: "var(--muted)",
              marginBottom: "0.65rem",
              padding: "0.75rem 0.85rem",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.03)",
              textAlign: "left",
              fontSize: "0.92rem",
            }}
          >
            Loading documents...
          </div>
        ) : activeUploads.length > 0 ? (
          <div style={{ marginBottom: "0.65rem" }}>
            <div style={{ marginBottom: "0.5rem", fontWeight: 600, textAlign: "left", fontSize: "0.98rem" }}>
              Upload In Progress
            </div>
            <div
              style={{
                padding: "0.75rem 0.85rem",
                border: "1px solid rgba(107,92,255,0.18)",
                borderRadius: "10px",
                background: "rgba(107,92,255,0.08)",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "0.35rem", fontSize: "0.92rem" }}>
                Uploading and processing {activeUploads.length} file{activeUploads.length === 1 ? "" : "s"}...
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.55rem", lineHeight: 1.35 }}>
                These continue in the background if you leave this page.
              </div>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {activeUploads.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "0.65rem",
                      alignItems: "flex-start",
                      padding: "0.55rem 0.65rem",
                      borderRadius: "8px",
                      background: "rgba(10,11,16,0.26)",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: "1 1 0", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", lineHeight: 1.35 }}>
                        {entry.fileName}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                        Type: {formatStatus(entry.documentType)}
                      </div>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#cdbfff", whiteSpace: "nowrap" }}>
                      {entry.status === "queued"
                        ? "Queued..."
                        : entry.status === "uploading"
                          ? "Uploading..."
                          : "Processing..."}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : docs.length > 0 ? (
          <div style={{ marginBottom: "0.65rem" }}>
            <div style={{ marginBottom: "0.5rem", fontWeight: 600, textAlign: "left", fontSize: "0.98rem" }}>
              Uploaded Documents
            </div>

            {docs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "0.65rem",
                  padding: "0.65rem 0.85rem",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "10px",
                  marginBottom: "0.55rem",
                  background: "rgba(10,11,16,0.35)",
                }}
              >
                <div
                  style={{
                    textAlign: "left",
                    minWidth: 0,
                    flex: "1 1 0",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.35 }}>
                    {doc.title}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem", lineHeight: 1.35 }}>
                    {doc.original_filename} • {formatFileSize(doc.size_bytes)} • {formatStatus(doc.status)}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.15rem", lineHeight: 1.35 }}>
                    Type: {formatStatus(doc.document_type)} • Chunks: {doc.chunk_count}
                  </div>
                  {doc.processing_error && (
                    <div style={{ fontSize: "0.8rem", color: "#ffb4b4", marginTop: "0.25rem", lineHeight: 1.35 }}>
                      Error: {doc.processing_error}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => void removeDoc(doc.id)}
                  disabled={!canManageDocuments || deletingId === doc.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "transparent",
                    color: "var(--muted)",
                    borderRadius: "8px",
                    padding: "0.45rem 0.75rem",
                    cursor: canManageDocuments ? "pointer" : "not-allowed",
                    flexShrink: 0,
                    opacity: canManageDocuments ? 1 : 0.6,
                    fontSize: "0.88rem",
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
              marginBottom: "0.35rem",
              padding: "0.75rem 0.85rem",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.03)",
              textAlign: "left",
              fontSize: "0.92rem",
              lineHeight: 1.45,
            }}
          >
            No documents yet. Upload PDF, TXT, or MD to add training material to the knowledge base.
          </div>
        )}
      </div>

      <div className={uploadStyles.footer}>
        <button
          type="button"
          onClick={() => nav(backPath)}
          style={{
            width: "100%",
            padding: "0.7rem",
            backgroundColor: isAdmin ? "#3b3b3b" : "#6b5cff",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "0.92rem",
          }}
        >
          {isAdmin ? "Back to Admin Controls" : "Back to Chat"}
        </button>
      </div>
    </AuthCard>
  );
}
