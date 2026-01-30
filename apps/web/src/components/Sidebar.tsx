import styles from "./Sidebar.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
};

export default function Sidebar({ open, onClose, onNewChat }: Props) {
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
          <button
            className={styles.item}
            onClick={() => alert("Upload coming soon")}
          >
            Upload Documents
          </button>
          <button
            className={styles.item}
            onClick={() => alert("Library coming soon")}
          >
            Library
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>History</div>
          <button className={styles.historyItem}>Chat #1</button>
          <button className={styles.historyItem}>Chat #2</button>
          <button className={styles.historyItem}>Chat #3</button>
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
