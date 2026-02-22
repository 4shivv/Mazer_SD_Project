import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import {
  getConversationMessages,
  listConversations,
  sendChatWithConversation,
  type ConversationSummary,
} from "../lib/api";
import { useAuth } from "../app/AuthProvider";
import * as Auth from "../lib/auth";
import styles from "./Chat.module.css";

type Msg = { id?: string; role: "user" | "assistant"; text: string };

export default function Chat() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Welcome to Mazer. Ask anything to begin." },
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  async function refreshHistory() {
    try {
      setHistoryLoading(true);
      const res = await listConversations();
      setHistory(res.conversations);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void refreshHistory();
  }, []);

  async function handleLogout() {
    setMenuOpen(false);
    try {
      await Auth.logout();
      refresh();
      navigate("/", { replace: true });
    } catch {
      refresh();
      navigate("/", { replace: true });
    }
  }

  function newChat() {
    setConversationId(null);
    setMessages([{ role: "assistant", text: "New chat started. What would you like to learn?" }]);
    setInput("");
    setSidebarOpen(false);
  }

  async function openConversation(id: string) {
    if (loading) return;
    try {
      setLoading(true);
      const res = await getConversationMessages(id);
      setConversationId(res.conversation.id);
      if (res.messages.length === 0) {
        setMessages([{ role: "assistant", text: "This conversation has no messages yet." }]);
      } else {
        setMessages(
          res.messages.map((message) => ({
            id: message.id,
            role: message.role,
            text: message.content,
          }))
        );
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function onSend() {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setInput("");
    setLoading(true);

    try {
      const res = await sendChatWithConversation(prompt, conversationId ?? undefined);
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
      await refreshHistory();
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `Error: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={newChat}
        onOpenConversation={openConversation}
        history={history}
        historyLoading={historyLoading}
        activeConversationId={conversationId}
      />

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.leftTop}>
            <button className={styles.menuBtn} onClick={() => setSidebarOpen(true)}>
              ☰
            </button>
            <div className={styles.title}>Mazer</div>
            {isAdmin && (
              <a
                href="/admin"
                className={styles.adminLink}
                onClick={(e) => { e.preventDefault(); navigate("/admin"); }}
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
                <button type="button" className={styles.menuItem} onClick={handleLogout}>
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={styles.chatArea}>
          {messages.map((m, i) => (
            <div
              key={m.id ?? i}
              className={`${styles.bubble} ${m.role === "user" ? styles.user : styles.assistant}`}
            >
              {m.text}
            </div>
          ))}
          {loading && <div className={styles.thinking}>Thinking…</div>}
          <div ref={bottomRef} />
        </div>

        <div className={styles.composer}>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              onKeyDown={(e) => e.key === "Enter" && onSend()}
            />
            <button className={styles.send} onClick={onSend} disabled={loading}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
