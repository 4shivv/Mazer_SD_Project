import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { sendChatStream } from "../lib/api";
import { useAuth } from "../app/AuthProvider";
import * as Auth from "../lib/auth";
import type { ChatMsg } from "../lib/chatStore";
import { createSession, getMessages } from "../lib/chatStore";
import styles from "./Chat.module.css";

type Msg = { role: "user" | "assistant"; text: string; ts?: number };

const WELCOME_MESSAGE: Msg = {
  role: "assistant",
  text: "Welcome to Mazer. Ask anything to begin.",
  ts: Date.now(),
};

function toMsg(m: ChatMsg): Msg {
  return { role: m.role, text: m.content, ts: m.ts };
}

export default function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useAuth();
  const isAdmin = user?.role === "admin";
  const isInstructor = user?.role === "instructor";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  /** Skip one fetch for this conversation id while optimistic first reply is streaming (see onSend finally). */
  const skipLoadForSidRef = useRef<string | null>(null);

  const sid = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get("sid");
  }, [location.search]);

  const isDraft = !sid;

  useEffect(() => {
    if (!sid) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (sid === skipLoadForSidRef.current) {
      setErrorBanner(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stored = (await getMessages(sid)).map(toMsg);
        if (cancelled) return;
        setMessages(stored.length > 0 ? stored : [WELCOME_MESSAGE]);
        setErrorBanner(null);
      } catch (error: any) {
        if (cancelled) return;
        setMessages([WELCOME_MESSAGE]);
        setErrorBanner(error?.message || "Failed to load conversation");
      } finally {
        if (!cancelled) {
          setInput("");
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
          setMessages((current) =>
            current.map((message) =>
              message.ts === assistantTs
                ? { ...message, text: `${message.text}${token}` }
                : message
            )
          );
        },
        onComplete(payload) {
          setMessages((current) =>
            current.map((message) =>
              message.ts === assistantTs
                ? { ...message, text: payload.reply || message.text }
                : message
            )
          );
        },
      });

      if (res.conversation_id && res.conversation_id !== activeConversationId) {
        navigate(`/chat?sid=${encodeURIComponent(res.conversation_id)}`, { replace: true });
      }
      setHistoryRefreshKey((current) => current + 1);
    } catch (e: any) {
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
    <div className={styles.shell}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={newChat}
        historyRefreshKey={historyRefreshKey}
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
            <div className={styles.title}>Mazer</div>
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
              <h1 className={styles.draftHeading}>What are you training on?</h1>
              <p className={styles.draftSub}>
                Start a conversation — your chat is saved when you send your first message.
              </p>
              <div className={styles.draftComposer}>
                <div className={styles.inputRow}>
                  <textarea
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Message Mazer…"
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
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.chatArea}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`${styles.bubble} ${
                    m.role === "user" ? styles.user : styles.assistant
                  }`}
                >
                  <div className={styles.bubbleText}>{m.text}</div>

                  {m.role === "assistant" && m.text?.trim() && (
                    <div className={styles.bubbleFooter}>
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
                  )}
                </div>
              ))}

              {loading && (
                <div className={styles.thinkingBubble}>
                  <span className={styles.thinkingDots}>Thinking…</span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <div className={styles.composer}>
              <div className={styles.inputRow}>
                <textarea
                  className={styles.input}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Message Mazer… (Enter to send, Shift+Enter for newline)"
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
