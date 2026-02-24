import mongoose from "mongoose";
import {
  createConversationRecord,
  findConversationByIdForUser,
  listConversationsByUser,
  touchConversationActivity,
  updateConversationTitleOnFirstMessage,
} from "../../repositories/conversationRepository.js";
import { createMessageRecords, listMessagesByConversationId } from "../../repositories/messageRepository.js";

export class ChatHistoryServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code ?? message;
  }
}

type CreateConversationResult = {
  conversation_id: string;
  title: string;
  created_at: Date;
};

type ConversationListItem = {
  id: string;
  title: string;
  created_at: Date;
  last_message_at: Date;
  message_count: number;
  self_destruct_date: Date | null;
};

type ConversationListResult = {
  conversations: ConversationListItem[];
  total: number;
  page: number;
  limit: number;
};

type MessageResult = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type ConversationMessagesResult = {
  conversation_id: string;
  messages: MessageResult[];
};

function normalizeTitle(title?: string) {
  const normalized = title?.trim();
  if (!normalized) return "New chat";
  return normalized.slice(0, 160);
}

function generateConversationTitleFromPrompt(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return "New chat";
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 60).trim()}...`;
}

function assertValidConversationId(conversationId: string) {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new ChatHistoryServiceError(400, "Invalid conversation id", "conversation_id_invalid");
  }
}

export async function createConversationForUser(args: {
  userId: string;
  title?: string;
}): Promise<CreateConversationResult> {
  const created = await createConversationRecord({
    userId: args.userId,
    title: normalizeTitle(args.title),
  });
  const createdDoc = created as any;

  return {
    conversation_id: String(createdDoc._id),
    title: String(createdDoc.title),
    created_at: createdDoc.created_at as Date,
  };
}

export async function listConversationsForUser(args: {
  userId: string;
  page: number;
  limit: number;
}): Promise<ConversationListResult> {
  const page = Number.isFinite(args.page) && args.page > 0 ? Math.floor(args.page) : 1;
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 20;
  const safeLimit = Math.min(limit, 100);

  const { rows, total } = await listConversationsByUser({
    userId: args.userId,
    page,
    limit: safeLimit,
  });

  return {
    conversations: rows.map((row) => {
      const rowDoc = row as any;
      return {
        id: String(rowDoc._id),
        title: String(rowDoc.title),
        created_at: rowDoc.created_at as Date,
        last_message_at: rowDoc.last_message_at as Date,
        message_count: Number(rowDoc.message_count ?? 0),
        self_destruct_date: (rowDoc.self_destruct_date as Date | null | undefined) ?? null,
      };
    }),
    total,
    page,
    limit: safeLimit,
  };
}

export async function getConversationMessagesForUser(args: {
  userId: string;
  conversationId: string;
}): Promise<ConversationMessagesResult> {
  assertValidConversationId(args.conversationId);

  const conversation = await findConversationByIdForUser({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!conversation) {
    throw new ChatHistoryServiceError(404, "Conversation not found", "conversation_not_found");
  }

  const messages = await listMessagesByConversationId(args.conversationId);
  return {
    conversation_id: args.conversationId,
    messages: messages.map((message) => {
      const messageDoc = message as any;
      return {
        id: String(messageDoc._id),
        role: messageDoc.role as "user" | "assistant",
        content: String(messageDoc.content),
        timestamp: messageDoc.timestamp as Date,
      };
    }),
  };
}

export async function resolveConversationForChat(args: {
  userId: string;
  conversationId?: string;
}) {
  if (!args.conversationId) {
    const created = await createConversationForUser({ userId: args.userId, title: "New chat" });
    return {
      conversationId: created.conversation_id,
    };
  }

  assertValidConversationId(args.conversationId);

  const existing = await findConversationByIdForUser({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!existing) {
    throw new ChatHistoryServiceError(404, "Conversation not found", "conversation_not_found");
  }

  return {
    conversationId: args.conversationId,
  };
}

export async function persistChatExchange(args: {
  userId: string;
  conversationId: string;
  userPrompt: string;
  assistantReply: string;
}) {
  assertValidConversationId(args.conversationId);

  const conversation = await findConversationByIdForUser({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!conversation) {
    throw new ChatHistoryServiceError(404, "Conversation not found", "conversation_not_found");
  }

  const now = new Date();
  await createMessageRecords([
    {
      conversationId: args.conversationId,
      role: "user",
      content: args.userPrompt,
      timestamp: now,
    },
    {
      conversationId: args.conversationId,
      role: "assistant",
      content: args.assistantReply,
      timestamp: now,
    },
  ]);

  await touchConversationActivity({
    conversationId: args.conversationId,
    userId: args.userId,
    lastMessageAt: now,
    incrementBy: 2,
  });

  const suggestedTitle = generateConversationTitleFromPrompt(args.userPrompt);
  await updateConversationTitleOnFirstMessage({
    conversationId: args.conversationId,
    userId: args.userId,
    title: suggestedTitle,
  });
}
