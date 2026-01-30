import { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import { sendChat } from "../lib/api";
import styles from "./Chat.module.css";

type Msg = { role: "user" | "assistant"; text: string };

export default function Chat() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Welcome to Mazer. Ask anything to begin." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function newChat() {
    setMessages([{ role: "assistant", text: "New chat started. What would you like to learn?" }]);
    setInput("");
    setSidebarOpen(false);
  }

  async function onSend() {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setInput("");
    setLoading(true);

    try {
      const res = await sendChat(prompt);
      setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
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
      />

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.leftTop}>
            <button className={styles.menuBtn} onClick={() => setSidebarOpen(true)}>
              ☰
            </button>
            <div className={styles.title}>Mazer</div>
          </div>
          <button className={styles.dots} title="Menu" onClick={() => alert("Settings coming soon")}>
            •••
          </button>
        </div>

        <div className={styles.chatArea}>
          {messages.map((m, i) => (
            <div
              key={i}
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
