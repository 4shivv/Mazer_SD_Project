import { useMemo, useState } from "react";
import { useAuth } from "../app/AuthProvider";
import { useUploads } from "../app/UploadProvider";

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function UploadStatusDock() {
  const { user } = useAuth();
  const { uploads, dismissUpload, clearFinished } = useUploads();
  const [collapsed, setCollapsed] = useState(false);

  const activeUploads = useMemo(
    () =>
      uploads.filter(
        (entry) =>
          entry.status === "queued" || entry.status === "uploading" || entry.status === "processing"
      ),
    [uploads]
  );
  const finishedUploads = useMemo(
    () => uploads.filter((entry) => entry.status === "completed" || entry.status === "failed"),
    [uploads]
  );

  if (!user || uploads.length === 0) return null;

  const uploadPath = user.role === "admin" ? "/admin/upload" : "/instructor/upload";

  return (
    <aside
      aria-label="Upload status"
      style={{
        position: "fixed",
        right: "1rem",
        bottom: "1rem",
        width: "min(360px, calc(100vw - 2rem))",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "16px",
        background: "rgba(10,11,16,0.94)",
        boxShadow: "0 24px 50px rgba(0,0,0,0.42)",
        backdropFilter: "blur(12px)",
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.9rem 1rem",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>Background Uploads</div>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {activeUploads.length > 0
              ? `${activeUploads.length} running`
              : `${finishedUploads.length} finished`}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <a
            href={uploadPath}
            style={{
              color: "#cdbfff",
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
            }}
          >
            Open uploads
          </a>
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "transparent",
              color: "var(--muted)",
              borderRadius: "999px",
              padding: "0.35rem 0.75rem",
              cursor: "pointer",
            }}
          >
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: "0 1rem 1rem" }}>
          <div style={{ display: "grid", gap: "0.6rem", maxHeight: "280px", overflowY: "auto" }}>
            {uploads.map((entry) => {
              const tone =
                entry.status === "failed"
                  ? "#ffb4b4"
                  : entry.status === "completed"
                    ? "#b6f0c2"
                    : "#cdbfff";

              return (
                <div
                  key={entry.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "12px",
                    padding: "0.8rem 0.9rem",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{entry.fileName}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                        {entry.documentType
                          .split("_")
                          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                          .join(" ")}
                      </div>
                    </div>
                    <div style={{ color: tone, fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                      {formatStatus(entry.status)}
                    </div>
                  </div>

                  {entry.message && (
                    <div style={{ marginTop: "0.45rem", color: tone, fontSize: "0.84rem" }}>
                      {entry.message}
                    </div>
                  )}

                  {(entry.status === "completed" || entry.status === "failed") && (
                    <div style={{ marginTop: "0.55rem" }}>
                      <button
                        type="button"
                        onClick={() => dismissUpload(entry.id)}
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "transparent",
                          color: "var(--muted)",
                          borderRadius: "999px",
                          padding: "0.35rem 0.7rem",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {finishedUploads.length > 0 && (
            <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={clearFinished}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: "var(--muted)",
                  borderRadius: "999px",
                  padding: "0.4rem 0.8rem",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                Clear finished
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
