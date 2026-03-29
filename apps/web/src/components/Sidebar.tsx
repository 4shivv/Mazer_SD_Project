import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import styles from "./Sidebar.module.css";
import { listSessions } from "../lib/chatStore";
import type { ChatSessionMeta } from "../lib/chatStore";

type Props = {
  open: boolean;
  onClose: () => void;
  onNewChat: () => Promise<void> | void;
  historyRefreshKey?: number;
};

export default function Sidebar({ open, onClose, onNewChat, historyRefreshKey = 0 }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const role = user?.role;
  const isAdmin = role === "admin";
  const isInstructor = role === "instructor";

  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSessions = useMemo(() => {
    if (!normalizedSearchQuery) return sessions;
    return sessions.filter((session) =>
      session.title.toLowerCase().includes(normalizedSearchQuery)
    );
  }, [sessions, normalizedSearchQuery]);

  async function refreshSessions() {
    if (!user) {
      setSessions([]);
      setHistoryError(null);
      setLoadingHistory(false);
      return;
    }

    setLoadingHistory(true);
    try {
      const next = await listSessions(100);
      setSessions(next);
      setHistoryError(null);
    } catch (error: any) {
      setHistoryError(error?.message || "Failed to load chats");
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void refreshSessions();
  }, [user?.id, historyRefreshKey]);

  useEffect(() => {
    if (!open || loadingHistory || sessions.length > 0) return;
    void refreshSessions();
  }, [open, loadingHistory, sessions.length, user?.id]);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

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

  function toggleSearch() {
    setSearchOpen((current) => {
      const next = !current;
      if (!next) {
        setSearchQuery("");
      }
      return next;
    });
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
            onClick={toggleSearch}
          >
            {searchOpen ? "Close Search" : "Search Chats"}
          </button>

          <button className={styles.item} onClick={() => goTo("/library")}>
            Library
          </button>

          {isInstructor && (
            <button
              className={styles.item}
              onClick={() => goTo("/instructor/upload")}
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

          {searchOpen && (
            <div className={styles.searchBox}>
              <input
                ref={searchInputRef}
                className={styles.searchInput}
                type="search"
                placeholder="Search saved chat titles"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className={styles.searchMeta}>
                {normalizedSearchQuery
                  ? `${filteredSessions.length} result${filteredSessions.length === 1 ? "" : "s"}`
                  : `Searching ${sessions.length} saved chat${sessions.length === 1 ? "" : "s"}`}
              </div>
            </div>
          )}

          {historyError && <div className={styles.emptyHistory}>{historyError}</div>}
          {loadingHistory && <div className={styles.emptyHistory}>Loading chats...</div>}

          {!loadingHistory && sessions.length === 0 ? (
            <div className={styles.emptyHistory}>No chats yet.</div>
          ) : searchOpen && normalizedSearchQuery && filteredSessions.length === 0 ? (
            <div className={styles.emptyHistory}>No saved chats match that title.</div>
          ) : (
            (searchOpen ? filteredSessions : sessions)
              .slice(0, searchOpen ? 100 : 15)
              .map((s) => (
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
            onClick={() => goTo("/profile")}
          >
            Profile
          </button>
        </div>
      </aside>
    </>
  );
}
