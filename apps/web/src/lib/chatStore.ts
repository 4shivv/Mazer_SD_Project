import {
  createConversation,
  getConversationMessages,
  listConversations,
  type ConversationSummary,
} from "./api";

export type ChatMsg = { role: "user" | "assistant"; content: string; ts: number };
export type ChatSessionMeta = { id: string; title: string; updatedAt: number };

function toSessionMeta(session: ConversationSummary): ChatSessionMeta {
  return {
    id: session.id,
    title: session.title,
    updatedAt: Date.parse(session.last_message_at || session.created_at),
  };
}

export async function listSessions(): Promise<ChatSessionMeta[]> {
  const response = await listConversations(1, 20);
  return response.conversations.map(toSessionMeta);
}

export async function createSession(title = "New chat"): Promise<ChatSessionMeta> {
  const created = await createConversation(title);
  return {
    id: created.conversation_id,
    title: created.title,
    updatedAt: Date.parse(created.created_at),
  };
}

export async function getMessages(sessionId: string): Promise<ChatMsg[]> {
  const response = await getConversationMessages(sessionId);
  return response.messages.map((message) => ({
    role: message.role,
    content: message.content,
    ts: Date.parse(message.timestamp),
  }));
}

export async function saveMessages(_sessionId: string, _messages: ChatMsg[]) {
  return;
}

export async function renameSession(_sessionId: string, _title: string) {
  return;
}

export async function deleteSession(_sessionId: string) {
  return;
}
