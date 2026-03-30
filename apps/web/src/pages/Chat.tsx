import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { sendChatStream } from "../lib/api";
import { useAuth } from "../app/AuthProvider";
import * as Auth from "../lib/auth";
import type { ChatMsg } from "../lib/chatStore";
import { createSession, getMessages } from "../lib/chatStore";
import AssistantProse from "./AssistantProse";
import styles from "./Chat.module.css";

type Msg = { role: "user" | "assistant"; text: string; ts?: number };

function createWelcomeMessage(): Msg {
  return {
    role: "assistant",
    text: "Welcome to Mazer. Ask anything to begin.",
    ts: Date.now(),
  };
}

function toMsg(m: ChatMsg): Msg {
  return { role: m.role, text: m.content, ts: m.ts };
}

const STARTER_PROMPTS = [
  "What is the basic EW threat chain?",
  "Explain radar cross-section in simple terms.",
  "How does jamming differ from spoofing?",
  "Summarize electronic attack vs. electronic protection.",
];

const COMPOSER_MAX_PX = 280;

export default function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useAuth();
  const isAdmin = user?.role === "admin";
  const isInstructor = user?.role === "instructor";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem("mazer-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("mazer-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  /** Skip one fetch for this conversation id while optimistic first reply is streaming (see onSend finally). */
  const skipLoadForSidRef = useRef<string | null>(null);
  /** Always matches URL ?sid= — stream callbacks must not update UI if user switched chats. */
  const sidRef = useRef<string | null>(null);

  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const sid = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get("sid");
  }, [location.search]);

  sidRef.current = sid;

  const isDraft = !sid;

  /** Clear composer + thread before paint so the previous chat never flashes when switching ?sid=. */
  useLayoutEffect(() => {
    setInput("");

    if (!sid) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (sid === skipLoadForSidRef.current) {
      setErrorBanner(null);
      return;
    }

    setMessages([]);
    setErrorBanner(null);
    setLoading(true);
  }, [sid]);

  useEffect(() => {
    if (!sid) return;
    if (sid === skipLoadForSidRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const stored = (await getMessages(sid)).map(toMsg);
        if (cancelled || sidRef.current !== sid) return;
        setMessages(stored.length > 0 ? stored : [createWelcomeMessage()]);
        setErrorBanner(null);
      } catch (error: any) {
        if (cancelled || sidRef.current !== sid) return;
        setMessages([createWelcomeMessage()]);
        setErrorBanner(error?.message || "Failed to load conversation");
      } finally {
        if (!cancelled && sidRef.current === sid) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`;
  }, [input, isDraft]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    if (isDraft) {
      setShowJumpToLatest(false);
      return;
    }
    const el = messageListRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const fromBottom = scrollHeight - scrollTop - clientHeight;
      setShowJumpToLatest(fromBottom > 160 && scrollHeight > clientHeight + 48);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [messages, loading, isDraft, sid]);

  const scrollToLatest = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    try {
      await Auth.logout();
    } finally {
      refresh();
      navigate("/", { replace: true });
    }
  }

  function newChat() {
    setErrorBanner(null);
    setSidebarOpen(false);
    setInput("");
    navigate("/chat", { replace: true });
  }

  async function onSend() {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setErrorBanner(null);

    const userMsg: Msg = { role: "user", text: prompt, ts: Date.now() };
    const assistantTs = Date.now() + 1;
    setMessages((m) => [...m, userMsg, { role: "assistant", text: "", ts: assistantTs }]);
    setInput("");
    setLoading(true);

    let activeConversationId = sid;
    if (!activeConversationId) {
      try {
        const created = await createSession("New chat");
        activeConversationId = created.id;
        skipLoadForSidRef.current = created.id;
        navigate(`/chat?sid=${encodeURIComponent(created.id)}`, { replace: true });
      } catch (error: any) {
        skipLoadForSidRef.current = null;
        setMessages((current) =>
          current.filter((message) => message.ts !== userMsg.ts && message.ts !== assistantTs)
        );
        setLoading(false);
        setErrorBanner(error?.message || "Failed to create conversation");
        return;
      }
    }
    if (!activeConversationId) return;

    try {
      const res = await sendChatStream(prompt, activeConversationId, {
        onToken(token) {
          if (sidRef.current !== activeConversationId) return;
          setMessages((current) =>
            current.map((message) =>
              message.ts === assistantTs
                ? { ...message, text: `${message.text}${token}` }
                : message
            )
          );
        },
        onComplete(payload) {
          if (sidRef.current !== activeConversationId) return;
          setMessages((current) =>
            current.map((message) =>
              message.ts === assistantTs
                ? { ...message, text: payload.reply || message.text }
                : message
            )
          );
        },
      });

      if (
        res.conversation_id &&
        res.conversation_id !== activeConversationId &&
        sidRef.current === activeConversationId
      ) {
        navigate(`/chat?sid=${encodeURIComponent(res.conversation_id)}`, { replace: true });
      }
      setHistoryRefreshKey((current) => current + 1);
    } catch (e: any) {
      if (sidRef.current !== activeConversationId) return;
      setMessages((current) =>
        current.filter((message) => !(message.ts === assistantTs && !message.text.trim()))
      );
      setErrorBanner(e?.message || "Request failed");
    } finally {
      setLoading(false);
      skipLoadForSidRef.current = null;
    }
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <div className={`${styles.shell} ${sidebarCollapsed ? styles.shellCollapsed : ""}`}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={newChat}
        historyRefreshKey={historyRefreshKey}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.leftTop}>
            <button
              className={styles.menuBtn}
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <button
              type="button"
              className={styles.appTitle}
              title="New chat"
              aria-label="Mazer, start new chat"
              onClick={() => newChat()}
            >
              <span className={styles.appTitleAccent} aria-hidden="true" />
              <span className={styles.appTitleText}>Mazer</span>
            </button>
            {isAdmin && (
              <a
                href="/admin"
                className={styles.adminLink}
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/admin");
                }}
              >
                Admin panel
              </a>
            )}
          </div>

          <div className={styles.menuWrap} ref={menuRef}>
            <button
              className={styles.dots}
              title="Menu"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
            >
              •••
            </button>

            {menuOpen && (
              <div className={styles.menuDropdown}>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    if (isInstructor) {
                      navigate("/instructor/settings");
                      return;
                    }
                    alert("Settings are available for instructor accounts.");
                  }}
                >
                  Settings
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    void handleLogout();
                  }}
                >
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>

        {errorBanner && (
          <div className={styles.errorBanner}>{errorBanner}</div>
        )}

        {isDraft ? (
          <div className={styles.draftStage}>
            <div className={styles.draftViewport}>
              <h1 className={styles.draftHeading}>What&apos;s on your mind?</h1>
              <p className={styles.draftSub}>
                Learn and apply key principles of electromagnetic warfare in a guided environment.
              </p>
              <div className={styles.draftComposer}>
                <div className={styles.starterChips} aria-label="Example prompts">
                  {STARTER_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={styles.starterChip}
                      onClick={() => {
                        setInput(p);
                        composerRef.current?.focus();
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className={styles.inputRow}>
                  <textarea
                    key="draft"
                    ref={composerRef}
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask anything"
                    onKeyDown={onComposerKeyDown}
                    rows={1}
                    aria-label="Message input"
                  />
                  <button
                    type="button"
                    className={styles.send}
                    onClick={() => void onSend()}
                    disabled={loading || !input.trim()}
                  >
                    {loading ? "Sending…" : "Send"}
                  </button>
                </div>
                <p className={styles.composerDisclaimer}>Mazer is AI and can make mistakes.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.chatArea}>
              {showJumpToLatest && (
                <button
                  type="button"
                  className={styles.jumpToLatest}
                  onClick={scrollToLatest}
                  title="Scroll to latest"
                >
                  Latest ↓
                </button>
              )}
              <div ref={messageListRef} className={styles.messageList}>
                {messages.map((m, i) => {
                  const turnKey = m.ts ?? i;
                  if (m.role === "user") {
                    return (
                      <div
                        key={turnKey}
                        className={`${styles.messageTurn} ${styles.turnUser}`}
                      >
                        <div className={styles.userBubble}>
                          <div className={styles.userBubbleText}>{m.text}</div>
                        </div>
                      </div>
                    );
                  }

                  const showTyping =
                    loading &&
                    !m.text.trim() &&
                    i === messages.length - 1;
                  return (
                    <div
                      key={turnKey}
                      className={`${styles.messageTurn} ${styles.turnAssistant}`}
                    >
                      <div className={styles.assistantBlock}>
                        {showTyping ? (
                          <div
                            className={styles.typingWrap}
                            aria-live="polite"
                            aria-busy="true"
                          >
                            <span className={styles.typingLabel}>Mazer</span>
                            <span className={styles.typingDots} aria-hidden>
                              <span className={styles.typingDot} />
                              <span className={styles.typingDot} />
                              <span className={styles.typingDot} />
                            </span>
                          </div>
                        ) : (
                          <>
                            <AssistantProse text={m.text} />
                            {m.text.trim() ? (
                              <div className={styles.assistantToolbar}>
                                <button
                                  type="button"
                                  className={styles.copyBtn}
                                  onClick={() => void copy(m.text)}
                                  title="Copy response"
                                  aria-label="Copy response"
                                >
                                  Copy
                                </button>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div ref={bottomRef} className={styles.scrollAnchor} />
              </div>
            </div>

            <div className={styles.composer}>
              <div className={styles.inputRow}>
                <textarea
                  key={sid ?? "chat"}
                  ref={composerRef}
                  className={styles.input}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything"
                  onKeyDown={onComposerKeyDown}
                  rows={2}
                  aria-label="Message input"
                />
                <button
                  type="button"
                  className={styles.send}
                  onClick={() => void onSend()}
                  disabled={loading || !input.trim()}
                >
                  {loading ? "Sending…" : "Send"}
                </button>
              </div>
              <p className={styles.composerDisclaimer}>Mazer is AI and can make mistakes.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
