import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import styles from "./Sidebar.module.css";
import type { ConversationSummary } from "../lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string) => void;
  history: ConversationSummary[];
  historyLoading: boolean;
  activeConversationId: string | null;
};

export default function Sidebar({
  open,
  onClose,
  onNewChat,
  onOpenConversation,
  history,
  historyLoading,
  activeConversationId,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  function goTo(path: string) {
    navigate(path);
    onClose();
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
          <button className={styles.item} onClick={onNewChat}>
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
            onClick={() => alert("Library coming soon")}
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
              <button className={styles.item} onClick={() => goTo("/admin/upload")}>
                Upload source documents (Ollama)
              </button>
            </div>
          </>
        )}

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>History</div>
          {historyLoading && <div className={styles.historyHint}>Loading conversations...</div>}
          {!historyLoading && history.length === 0 && (
            <div className={styles.historyHint}>No saved conversations yet.</div>
          )}
          {!historyLoading &&
            history.map((conversation) => (
              <button
                key={conversation.id}
                className={`${styles.historyItem} ${
                  activeConversationId === conversation.id ? styles.historyActive : ""
                }`}
                onClick={() => {
                  onOpenConversation(conversation.id);
                  onClose();
                }}
                title={conversation.title}
              >
                {conversation.title}
              </button>
            ))}
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
