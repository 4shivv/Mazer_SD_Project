export type ChatMsg = { role: "user" | "assistant"; content: string; ts: number };
export type ChatSessionMeta = { id: string; title: string; updatedAt: number };

const META_KEY = "mazer.chat.sessions.meta";
const MSG_KEY_PREFIX = "mazer.chat.sessions.msg:";

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readMeta(): ChatSessionMeta[] {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeMeta(meta: ChatSessionMeta[]) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function listSessions(): ChatSessionMeta[] {
  return readMeta().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createSession(title = "New chat"): ChatSessionMeta {
  const meta = readMeta();
  const s: ChatSessionMeta = { id: uid(), title, updatedAt: Date.now() };
  writeMeta([s, ...meta]);
  localStorage.setItem(MSG_KEY_PREFIX + s.id, JSON.stringify([]));
  return s;
}

export function getMessages(sessionId: string): ChatMsg[] {
  try {
    return JSON.parse(localStorage.getItem(MSG_KEY_PREFIX + sessionId) || "[]");
  } catch {
    return [];
  }
}

export function saveMessages(sessionId: string, messages: ChatMsg[]) {
  localStorage.setItem(MSG_KEY_PREFIX + sessionId, JSON.stringify(messages));
  const meta = readMeta();
  const idx = meta.findIndex(m => m.id === sessionId);
  if (idx !== -1) {
    meta[idx] = { ...meta[idx], updatedAt: Date.now() };
    writeMeta(meta);
  }
}

export function renameSession(sessionId: string, title: string) {
  const meta = readMeta();
  const idx = meta.findIndex(m => m.id === sessionId);
  if (idx !== -1) {
    meta[idx] = { ...meta[idx], title, updatedAt: Date.now() };
    writeMeta(meta);
  }
}

export function deleteSession(sessionId: string) {
  const meta = readMeta().filter(m => m.id !== sessionId);
  writeMeta(meta);
  localStorage.removeItem(MSG_KEY_PREFIX + sessionId);
}