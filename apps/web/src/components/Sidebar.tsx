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
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

function IconNewChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function IconLibrary() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      <path d="M8 7h8M8 11h6" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconKnowledgeBase() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v1" />
      <ellipse cx="12" cy="13" rx="5" ry="2" />
      <path d="M7 13v3c0 1.1 2.2 2 5 2s5-.9 5-2v-3" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function Sidebar({
  open,
  onClose,
  onNewChat,
  historyRefreshKey = 0,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
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
    if (collapsed) setSearchOpen(false);
  }, [collapsed]);

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

  useEffect(() => {
    if (!searchOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  function goTo(path: string) {
    navigate(path);
    onClose();
  }

  function openChat(sessionId: string) {
    navigate(`/chat?sid=${encodeURIComponent(sessionId)}`);
    onClose();
  }

  function openSearchModal() {
    setSearchOpen(true);
  }

  function closeSearchModal() {
    setSearchOpen(false);
    setSearchQuery("");
  }

  function selectChatFromSearch(sessionId: string) {
    closeSearchModal();
    openChat(sessionId);
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

      <aside
        className={`${styles.sidebar} ${open ? styles.open : ""} ${collapsed ? styles.sidebarCollapsed : ""}`}
      >
        <div className={styles.brandRow}>
          <button
            className={styles.iconBtn}
            aria-label="Close sidebar"
            onClick={onClose}
          >
            ⟵
          </button>
          {onToggleCollapsed && (
            <button
              type="button"
              className={styles.collapseDesktopBtn}
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"}
              title={collapsed ? "Expand sidebar" : "Minimize sidebar"}
            >
              {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
            </button>
          )}
          <button
            type="button"
            className={`${styles.brand} ${styles.brandButton}`}
            title="New chat"
            aria-label="Mazer, start new chat"
            onClick={() => {
              onNewChat();
              onClose();
              void refreshSessions();
            }}
          >
            <span className={styles.brandAccent} aria-hidden="true" />
            <span className={styles.brandText}>Mazer</span>
          </button>
        </div>

        <div className={styles.section}>
          <button
            type="button"
            className={styles.item}
            title="New chat"
            onClick={() => {
              onNewChat();
              onClose();
              void refreshSessions();
            }}
          >
            <span className={styles.itemIcon}>
              <IconNewChat />
            </span>
            <span className={styles.itemLabel}>New Chat</span>
          </button>

          <button
            type="button"
            className={styles.item}
            title="Search chats"
            onClick={openSearchModal}
          >
            <span className={styles.itemIcon}>
              <IconSearch />
            </span>
            <span className={styles.itemLabel}>Search Chats</span>
          </button>

          <button type="button" className={styles.item} title="Library" onClick={() => goTo("/library")}>
            <span className={styles.itemIcon}>
              <IconLibrary />
            </span>
            <span className={styles.itemLabel}>Library</span>
          </button>

          {isInstructor && (
            <button
              type="button"
              className={styles.item}
              title="Upload documents"
              onClick={() => goTo("/instructor/upload")}
            >
              <span className={styles.itemIcon}>
                <IconUpload />
              </span>
              <span className={styles.itemLabel}>Upload Documents</span>
            </button>
          )}
        </div>

        {isInstructor && !isAdmin && (
          <>
            <div className={styles.divider} />
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Instructor</div>
              <button
                type="button"
                className={styles.item}
                title="Settings"
                onClick={() => goTo("/instructor/settings")}
              >
                <span className={styles.itemIcon}>
                  <IconSettings />
                </span>
                <span className={styles.itemLabel}>Settings</span>
              </button>
            </div>
          </>
        )}

        {isAdmin && (
          <>
            <div className={styles.divider} />
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Admin</div>
              <button type="button" className={styles.item} title="Admin" onClick={() => goTo("/admin")}>
                <span className={styles.itemIcon}>
                  <IconAdmin />
                </span>
                <span className={styles.itemLabel}>Admin Controls</span>
              </button>
              <button
                type="button"
                className={styles.item}
                title="Knowledge base"
                onClick={() => goTo("/admin/upload")}
              >
                <span className={styles.itemIcon}>
                  <IconKnowledgeBase />
                </span>
                <span className={styles.itemLabel}>Manage Knowledge Base</span>
              </button>
            </div>
          </>
        )}

        <div className={`${styles.divider} ${styles.hideWhenCollapsed}`} />

        <div className={`${styles.section} ${styles.historySection}`}>
          <div className={styles.sectionTitle}>Chats</div>

          {historyError && <div className={styles.emptyHistory}>{historyError}</div>}
          {loadingHistory && <div className={styles.emptyHistory}>Loading chats...</div>}

          {!loadingHistory && sessions.length === 0 ? (
            <div className={styles.emptyHistory}>No chats yet.</div>
          ) : (
            sessions.slice(0, 15).map((s) => (
              <div
                key={s.id}
                className={`${styles.historyRow} ${activeSid === s.id ? styles.historyRowActive : ""}`}
              >
                <button
                  type="button"
                  className={styles.historyItem}
                  title={s.title}
                  aria-current={activeSid === s.id ? "page" : undefined}
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
            type="button"
            className={`${styles.footerItem} ${styles.item}`}
            title="Profile"
            onClick={() => goTo("/profile")}
          >
            <span className={styles.itemIcon}>
              <IconProfile />
            </span>
            <span className={styles.itemLabel}>Profile</span>
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

      {searchOpen && (
        <div
          className={styles.renameOverlay}
          role="presentation"
          onClick={closeSearchModal}
        >
          <div
            className={`${styles.renameModal} ${styles.searchModalDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-chats-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="search-chats-title" className={styles.renameTitle}>
              Search chats
            </h2>
            <div className={styles.searchBox}>
              <input
                ref={searchInputRef}
                className={styles.searchInput}
                type="search"
                placeholder="Search saved chat titles"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    closeSearchModal();
                  }
                }}
              />
              <div className={styles.searchMeta}>
                {normalizedSearchQuery
                  ? `${filteredSessions.length} result${filteredSessions.length === 1 ? "" : "s"}`
                  : `${sessions.length} saved chat${sessions.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <div className={styles.searchModalList}>
              {!loadingHistory && normalizedSearchQuery && filteredSessions.length === 0 ? (
                <div className={styles.emptyHistory}>No saved chats match that title.</div>
              ) : (
                filteredSessions.slice(0, 100).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={styles.searchModalRow}
                    title={s.title}
                    onClick={() => selectChatFromSearch(s.id)}
                  >
                    {s.title || "Chat"}
                  </button>
                ))
              )}
            </div>
            <div className={styles.renameActions}>
              <button type="button" className={styles.renameCancel} onClick={closeSearchModal}>
                Close
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
