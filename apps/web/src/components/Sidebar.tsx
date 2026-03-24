import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import styles from "./Sidebar.module.css";
import { listSessions } from "../lib/chatStore";
import type { ChatSessionMeta } from "../lib/chatStore";

type Props = {
  open: boolean;
  onClose: () => void;
  onNewChat: () => Promise<void> | void;
};

export default function Sidebar({ open, onClose, onNewChat }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const role = user?.role;
  const isAdmin = role === "admin";
  const isInstructor = role === "instructor";
  const isTrainee = role === "trainee";

  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function refreshSessions() {
    setLoadingHistory(true);
    try {
      const next = await listSessions();
      setSessions(next);
      setHistoryError(null);
    } catch (error: any) {
      setHistoryError(error?.message || "Failed to load chats");
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    if (open) {
      void refreshSessions();
    }
  }, [open]);

  function goTo(path: string) {
    navigate(path);
    onClose();
  }

  function openChat(sessionId: string) {
    navigate(`/chat?sid=${encodeURIComponent(sessionId)}`);
    onClose();
  }

  function handleDelete() {
    alert("Delete chat is not available yet for persisted conversations.");
  }

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ""}`}
        onClick={onClose}
      />

      <aside className={`${styles.sidebar} ${open ? styles.open : ""}`}>
        <div className={styles.brandRow}>
          <button
            className={styles.iconBtn}
            aria-label="Close sidebar"
            onClick={onClose}
          >
            ⟵
          </button>
          <div className={styles.brand}>Mazer</div>
        </div>

        <div className={styles.section}>
          <button
            className={styles.item}
            onClick={() => {
              void (async () => {
                await onNewChat();
                onClose();
                await refreshSessions();
              })();
            }}
          >
            New Chat
          </button>

          <button
            className={styles.item}
            onClick={() => alert("Search coming soon")}
          >
            Search Chats
          </button>

          <button className={styles.item} onClick={() => goTo("/library")}>
            Library
          </button>

          {(isTrainee || isInstructor) && (
            <button
              className={styles.item}
              onClick={() => alert("Document upload flow coming soon")}
            >
              Upload Documents
            </button>
          )}
        </div>

        {isInstructor && !isAdmin && (
          <>
            <div className={styles.divider} />
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Instructor</div>
              <button
                className={styles.item}
                onClick={() => goTo("/instructor/settings")}
              >
                Settings
              </button>
            </div>
          </>
        )}

        {isAdmin && (
          <>
            <div className={styles.divider} />
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Admin</div>
              <button className={styles.item} onClick={() => goTo("/admin")}>
                Admin Controls
              </button>
              <button
                className={styles.item}
                onClick={() => goTo("/admin/upload")}
              >
                Manage Knowledge Base
              </button>
            </div>
          </>
        )}

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>History</div>

          {historyError && <div className={styles.emptyHistory}>{historyError}</div>}
          {loadingHistory && <div className={styles.emptyHistory}>Loading chats...</div>}

          {!loadingHistory && sessions.length === 0 ? (
            <div className={styles.emptyHistory}>No chats yet.</div>
          ) : (
            sessions.slice(0, 15).map((s) => (
              <div key={s.id} className={styles.historyRow}>
                <button
                  className={styles.historyItem}
                  title={s.title}
                  onClick={() => openChat(s.id)}
                >
                  {s.title || "Chat"}
                </button>

                <button
                  className={styles.deleteBtn}
                  title="Delete chat"
                  onClick={handleDelete}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <button
            className={styles.footerItem}
            onClick={() => alert("Profile coming soon")}
          >
            Profile
          </button>
        </div>
      </aside>
    </>
  );
}
