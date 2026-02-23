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
  renameSession,
  saveMessages,
} from "../lib/chatStore";
import styles from "./Chat.module.css";

type Msg = { role: "user" | "assistant"; text: string; ts?: number };

function toMsg(m: ChatMsg): Msg {
  return { role: m.role, text: m.content, ts: m.ts };
}

function toChatMsg(m: Msg): ChatMsg {
  return { role: m.role, content: m.text, ts: m.ts ?? Date.now() };
}

export default function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useAuth();
  const isAdmin = user?.role === "admin";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Welcome to Mazer. Ask anything to begin.", ts: Date.now() },
  ]);
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
    const s = createSession("New chat");
    navigate(`/chat?sid=${encodeURIComponent(s.id)}`, { replace: true });
  }, [sid, navigate]);

  // Load messages for session
  useEffect(() => {
    if (!sid) return;
    const stored = getMessages(sid).map(toMsg);
    if (stored.length > 0) {
      setMessages(stored);
    } else {
      setMessages([
        { role: "assistant", text: "Welcome to Mazer. Ask anything to begin.", ts: Date.now() },
      ]);
    }
    setErrorBanner(null);
    setInput("");
    setLoading(false);
  }, [sid]);

  // Persist messages
  useEffect(() => {
    if (!sid) return;
    saveMessages(sid, messages.map(toChatMsg));
  }, [sid, messages]);

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

  function newChat() {
    const s = createSession("New chat");
    setSidebarOpen(false);
    navigate(`/chat?sid=${encodeURIComponent(s.id)}`);
  }

  async function onSend() {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setErrorBanner(null);

    // Auto-title first user message
    if (sid) {
      const title =
        prompt.length > 40 ? prompt.slice(0, 40).trim() + "…" : prompt;
      renameSession(sid, title);
    }

    const userMsg: Msg = { role: "user", text: prompt, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await sendChat(prompt);
      const assistantMsg: Msg = {
        role: "assistant",
        text: res.reply || "",
        ts: Date.now(),
      };
      setMessages((m) => [...m, assistantMsg]);
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
                    alert("Settings coming soon");
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