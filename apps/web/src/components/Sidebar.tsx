import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import styles from "./Sidebar.module.css";
import { deleteSession, listSessions } from "../lib/chatStore";

type Props = {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
};

export default function Sidebar({ open, onClose, onNewChat }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [sessions, setSessions] = useState(() => listSessions());

  // Refresh session list when sidebar opens (and on storage changes across tabs)
  useEffect(() => {
    if (open) setSessions(listSessions());

    function onStorage(e: StorageEvent) {
      if (!e.key) return;
      if (e.key.startsWith("mazer.chat.sessions.")) {
        setSessions(listSessions());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [open]);

  function goTo(path: string) {
    navigate(path);
    onClose();
  }

  function openChat(sessionId: string) {
    navigate(`/chat?sid=${encodeURIComponent(sessionId)}`);
    onClose();
  }

  function handleDelete(sessionId: string) {
    // optional confirm (prevents accidental deletes)
    const ok = confirm("Delete this chat? This cannot be undone.");
    if (!ok) return;

    deleteSession(sessionId);
    setSessions(listSessions());
  }

  return (
    <>
      {/* Mobile overlay */}
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
              onNewChat();
              // sidebar will be closed by Chat.tsx after navigation,
              // but we still close here for immediate UX
              onClose();
              setTimeout(() => setSessions(listSessions()), 50);
            }}
          >
            New Chat
          </button>

          <button
            className={styles.item}
            onClick={() => alert("Search coming soon")}
          >
            Search chats
          </button>

          {!isAdmin && (
            <button
              className={styles.item}
              onClick={() => alert("Upload coming soon")}
            >
              Upload Documents
            </button>
          )}

          <button
            className={styles.item}
            onClick={() => goTo("/library")}
          >
            Library
          </button>
        </div>

        {isAdmin && (
          <>
            <div className={styles.divider} />
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Admin</div>
              <button className={styles.item} onClick={() => goTo("/admin")}>
                All Users
              </button>
              <button
                className={styles.item}
                onClick={() => goTo("/admin/upload")}
              >
                Mazer Knowledge Base
              </button>
            </div>
          </>
        )}

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>History</div>

          {sessions.length === 0 ? (
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
                  onClick={() => handleDelete(s.id)}
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