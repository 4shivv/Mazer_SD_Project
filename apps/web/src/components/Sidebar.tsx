import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import styles from "./Sidebar.module.css";
import { deleteSession, listSessions, renameSession } from "../lib/chatStore";
import type { ChatSessionMeta } from "../lib/chatStore";

type Props = {
  open: boolean;
  onClose: () => void;
  onNewChat: () => Promise<void> | void;
  historyRefreshKey?: number;
};

export default function Sidebar({ open, onClose, onNewChat, historyRefreshKey = 0 }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeSid = searchParams.get("sid");
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

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSessions =
    !normalizedSearchQuery
      ? sessions
      : sessions.filter((session) => session.title.toLowerCase().includes(normalizedSearchQuery));

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

  useEffect(() => {
    if (!menuOpenId) return;
    function handleDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-history-menu]")) return;
      setMenuOpenId(null);
    }
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, [menuOpenId]);

  useEffect(() => {
    if (!renameTarget) return;
    setRenameDraft(renameTarget.title);
    const id = requestAnimationFrame(() => renameInputRef.current?.select());
    return () => cancelAnimationFrame(id);
  }, [renameTarget]);

  useEffect(() => {
    if (!renameTarget) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRenameTarget(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [renameTarget]);

  useEffect(() => {
    if (!deleteTarget || deletePending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDeleteTarget(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget, deletePending]);

  function goTo(path: string) {
    navigate(path);
    onClose();
  }

  function openChat(sessionId: string) {
    navigate(`/chat?sid=${encodeURIComponent(sessionId)}`);
    onClose();
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

  async function saveRename() {
    if (!renameTarget) return;
    const title = renameDraft.trim();
    if (!title) return;
    try {
      await renameSession(renameTarget.id, title);
      setRenameTarget(null);
      setMenuOpenId(null);
      await refreshSessions();
    } catch (error: any) {
      alert(error?.message || "Failed to rename chat");
    }
  }

  async function performDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    try {
      await deleteSession(deleteTarget.id);
      const removedId = deleteTarget.id;
      setDeleteTarget(null);
      setMenuOpenId(null);
      if (activeSid === removedId) {
        navigate("/chat", { replace: true });
      }
      await refreshSessions();
    } catch (error: any) {
      alert(error?.message || "Failed to delete chat");
    } finally {
      setDeletePending(false);
    }
  }

  function beginDelete(s: ChatSessionMeta) {
    setRenameTarget(null);
    setDeleteTarget({ id: s.id, title: s.title || "Chat" });
    setMenuOpenId(null);
  }

  function beginRename(s: ChatSessionMeta) {
    setDeleteTarget(null);
    setRenameTarget({ id: s.id, title: s.title || "Chat" });
    setMenuOpenId(null);
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
              onNewChat();
              onClose();
              void refreshSessions();
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
                  type="button"
                  className={styles.historyItem}
                  title={s.title}
                  onClick={() => openChat(s.id)}
                >
                  {s.title || "Chat"}
                </button>

                <div className={styles.historyMenuWrap} data-history-menu>
                  <button
                    type="button"
                    className={styles.historyMenuBtn}
                    aria-label={`Chat options for ${s.title || "chat"}`}
                    aria-expanded={menuOpenId === s.id}
                    aria-haspopup="menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId((current) => (current === s.id ? null : s.id));
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>

                  {menuOpenId === s.id && (
                    <div className={styles.historyMenu} role="menu">
                      <button
                        type="button"
                        className={styles.historyMenuItem}
                        role="menuitem"
                        onClick={() => beginRename(s)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className={`${styles.historyMenuItem} ${styles.historyMenuItemDanger}`}
                        role="menuitem"
                        onClick={() => beginDelete(s)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
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

      {renameTarget && (
        <div
          className={styles.renameOverlay}
          role="presentation"
          onClick={() => setRenameTarget(null)}
        >
          <div
            className={styles.renameModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-chat-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="rename-chat-title" className={styles.renameTitle}>
              Rename chat
            </h2>
            <label className={styles.renameLabel}>
              Title
              <input
                ref={renameInputRef}
                className={styles.renameInput}
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveRename();
                  }
                  if (e.key === "Escape") setRenameTarget(null);
                }}
              />
            </label>
            <div className={styles.renameActions}>
              <button
                type="button"
                className={styles.renameCancel}
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.renameSave}
                onClick={() => void saveRename()}
                disabled={!renameDraft.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className={styles.renameOverlay}
          role="presentation"
          onClick={() => {
            if (!deletePending) setDeleteTarget(null);
          }}
        >
          <div
            className={styles.renameModal}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            aria-describedby="delete-chat-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-chat-title" className={styles.renameTitle}>
              Delete chat?
            </h2>
            <p id="delete-chat-desc" className={styles.deleteModalBody}>
              <span className={styles.deleteModalChatName}>
                {deleteTarget.title}
              </span>{" "}
              will be removed permanently. This cannot be undone.
            </p>
            <div className={styles.renameActions}>
              <button
                type="button"
                className={styles.renameCancel}
                onClick={() => setDeleteTarget(null)}
                disabled={deletePending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteDangerBtn}
                onClick={() => void performDelete()}
                disabled={deletePending}
                autoFocus
              >
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
