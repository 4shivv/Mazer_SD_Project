import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { sendChat } from "../lib/api";
import { useAuth } from "../app/AuthProvider";
import * as Auth from "../lib/auth";
import type { ChatMsg } from "../lib/chatStore";
import {
  createSession,
  getMessages,
} from "../lib/chatStore";
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

  const [messages, setMessages] = useState<Msg[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sid = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.get("sid");
  }, [location.search]);

  // Ensure session exists
  useEffect(() => {
    if (sid) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await createSession("New chat");
        if (!cancelled) {
          navigate(`/chat?sid=${encodeURIComponent(session.id)}`, { replace: true });
        }
      } catch (error: any) {
        if (!cancelled) {
          setErrorBanner(error?.message || "Failed to create conversation");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sid, navigate]);

  // Load messages for session
  useEffect(() => {
    if (!sid) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = (await getMessages(sid)).map(toMsg);
        if (cancelled) return;
        if (stored.length > 0) setMessages(stored);
        else setMessages([WELCOME_MESSAGE]);
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

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Close menu on outside click
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

  async function newChat() {
    try {
      const session = await createSession("New chat");
      setSidebarOpen(false);
      navigate(`/chat?sid=${encodeURIComponent(session.id)}`);
    } catch (error: any) {
      setErrorBanner(error?.message || "Failed to create conversation");
    }
  }

  async function onSend() {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setErrorBanner(null);

    let activeConversationId = sid;
    if (!activeConversationId) {
      try {
        const created = await createSession("New chat");
        activeConversationId = created.id;
        navigate(`/chat?sid=${encodeURIComponent(created.id)}`, { replace: true });
      } catch (error: any) {
        setErrorBanner(error?.message || "Failed to create conversation");
        return;
      }
    }
    if (!activeConversationId) return;

    const userMsg: Msg = { role: "user", text: prompt, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await sendChat(prompt, activeConversationId);
      const assistantMsg: Msg = {
        role: "assistant",
        text: res.reply || "",
        ts: Date.now(),
      };
      setMessages((m) => [...m, assistantMsg]);
      if (res.conversation_id && res.conversation_id !== activeConversationId) {
        navigate(`/chat?sid=${encodeURIComponent(res.conversation_id)}`, { replace: true });
      }
    } catch (e: any) {
      setErrorBanner(e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function onComposerKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
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
      />

      <div className={styles.main}>
        {/* Topbar */}
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
                  onClick={handleLogout}
                >
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error banner */}
        {errorBanner && (
          <div className={styles.errorBanner}>{errorBanner}</div>
        )}

        {/* Chat area */}
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
                <button
                  className={styles.copyBtn}
                  onClick={() => copy(m.text)}
                  title="Copy"
                >
                  Copy
                </button>
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

        {/* Composer */}
        <div className={styles.composer}>
          <div className={styles.inputRow}>
            <textarea
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
              onKeyDown={onComposerKeyDown}
              rows={2}
            />
            <button
              className={styles.send}
              onClick={onSend}
              disabled={loading || !input.trim()}
            >
              {loading ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
