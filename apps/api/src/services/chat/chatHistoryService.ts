import mongoose from "mongoose";
import {
  createConversationRecord,
  deleteConversationRecordForUser,
  findConversationByIdForUser,
  listConversationsByUser,
  setConversationTitleForUser,
  touchConversationActivity,
  updateConversationTitleOnFirstMessage,
} from "../../repositories/conversationRepository.js";
import {
  createMessageRecords,
  deleteMessagesByConversationIds,
  listMessagesByConversationId,
} from "../../repositories/messageRepository.js";
import { resolveSelfDestructDateForAnchor } from "../admin/retentionAdminService.js";

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
  metadata?: unknown;
};

type ConversationMessagesResult = {
  conversation_id: string;
  messages: MessageResult[];
};

export type PromptContextMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type ConversationPromptContextResult = {
  conversation_id: string;
  messages: PromptContextMessage[];
  approx_token_count: number;
  dropped_message_count: number;
};

export const MAX_CONVERSATION_CONTEXT_TOKENS = 2048;

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

function assertConversationNotExpired(conversation: unknown) {
  const conversationDoc = conversation as { self_destruct_date?: Date | null };
  const selfDestructDate = conversationDoc.self_destruct_date;
  if (selfDestructDate instanceof Date && selfDestructDate.getTime() <= Date.now()) {
    throw new ChatHistoryServiceError(
      404,
      "Auto-deleted per retention policy",
      "conversation_expired"
    );
  }
}

function estimateTokenCount(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).length;
}

export async function createConversationForUser(args: {
  userId: string;
  title?: string;
}): Promise<CreateConversationResult> {
  const now = new Date();
  const selfDestructDate = await resolveSelfDestructDateForAnchor(now);
  const created = await createConversationRecord({
    userId: args.userId,
    title: normalizeTitle(args.title),
    lastMessageAt: now,
    selfDestructDate,
  });
  const createdDoc = created as any;

  return {
    conversation_id: String(createdDoc._id),
    title: String(createdDoc.title),
    created_at: createdDoc.created_at as Date,
  };
}

export async function renameConversationForUser(args: {
  userId: string;
  conversationId: string;
  title: string;
}): Promise<{ conversation_id: string; title: string }> {
  assertValidConversationId(args.conversationId);

  const conversation = await findConversationByIdForUser({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!conversation) {
    throw new ChatHistoryServiceError(404, "Conversation not found", "conversation_not_found");
  }
  assertConversationNotExpired(conversation);

  const title = normalizeTitle(args.title);
  const result = await setConversationTitleForUser({
    conversationId: args.conversationId,
    userId: args.userId,
    title,
  });
  if ((result.matchedCount ?? 0) === 0) {
    throw new ChatHistoryServiceError(404, "Conversation not found", "conversation_not_found");
  }

  return { conversation_id: args.conversationId, title };
}

export async function deleteConversationForUser(args: { userId: string; conversationId: string }): Promise<void> {
  assertValidConversationId(args.conversationId);

  const conversation = await findConversationByIdForUser({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!conversation) {
    throw new ChatHistoryServiceError(404, "Conversation not found", "conversation_not_found");
  }
  assertConversationNotExpired(conversation);

  await deleteMessagesByConversationIds([args.conversationId]);
  const del = await deleteConversationRecordForUser({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if ((del.deletedCount ?? 0) === 0) {
    throw new ChatHistoryServiceError(404, "Conversation not found", "conversation_not_found");
  }
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
  assertConversationNotExpired(conversation);

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
        metadata: messageDoc.metadata ?? null,
      };
    }),
  };
}

export async function getConversationPromptContextForUser(args: {
  userId: string;
  conversationId: string;
  currentPrompt: string;
  maxTokens?: number;
}): Promise<ConversationPromptContextResult> {
  assertValidConversationId(args.conversationId);

  const conversation = await findConversationByIdForUser({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!conversation) {
    throw new ChatHistoryServiceError(404, "Conversation not found", "conversation_not_found");
  }
  assertConversationNotExpired(conversation);

  const maxTokens = Math.max(256, args.maxTokens ?? MAX_CONVERSATION_CONTEXT_TOKENS);
  const reservedForCurrentPrompt = estimateTokenCount(args.currentPrompt) + 16;
  const availableForHistory = Math.max(0, maxTokens - reservedForCurrentPrompt);
  const messages = await listMessagesByConversationId(args.conversationId);

  const selected: PromptContextMessage[] = [];
  let usedTokens = 0;
  let droppedMessageCount = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const rawMessage = messages[index] as any;
    const content = String(rawMessage.content ?? "");
    const estimatedCost = estimateTokenCount(content) + 8;

    if (selected.length > 0 && usedTokens + estimatedCost > availableForHistory) {
      droppedMessageCount = index + 1;
      break;
    }

    if (selected.length === 0 && estimatedCost > availableForHistory) {
      selected.unshift({
        role: rawMessage.role as "user" | "assistant",
        content,
        timestamp: rawMessage.timestamp as Date,
      });
      usedTokens = Math.min(estimatedCost, availableForHistory);
      droppedMessageCount = index;
      break;
    }

    selected.unshift({
      role: rawMessage.role as "user" | "assistant",
      content,
      timestamp: rawMessage.timestamp as Date,
    });
    usedTokens += estimatedCost;
  }

  return {
    conversation_id: args.conversationId,
    messages: selected,
    approx_token_count: usedTokens + reservedForCurrentPrompt,
    dropped_message_count: droppedMessageCount,
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
  assertConversationNotExpired(existing);

  return {
    conversationId: args.conversationId,
  };
}

export async function persistChatExchange(args: {
  userId: string;
  conversationId: string;
  userPrompt: string;
  assistantReply: string;
  userMetadata?: unknown;
  assistantMetadata?: unknown;
}) {
  assertValidConversationId(args.conversationId);

  const conversation = await findConversationByIdForUser({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!conversation) {
    throw new ChatHistoryServiceError(404, "Conversation not found", "conversation_not_found");
  }
  assertConversationNotExpired(conversation);

  const now = new Date();
  await createMessageRecords([
    {
      conversationId: args.conversationId,
      role: "user",
      content: args.userPrompt,
      timestamp: now,
      metadata: args.userMetadata ?? null,
    },
    {
      conversationId: args.conversationId,
      role: "assistant",
      content: args.assistantReply,
      timestamp: now,
      metadata: args.assistantMetadata ?? null,
    },
  ]);

  const suggestedTitle = generateConversationTitleFromPrompt(args.userPrompt);
  await updateConversationTitleOnFirstMessage({
    conversationId: args.conversationId,
    userId: args.userId,
    title: suggestedTitle,
  });

  const selfDestructDate = await resolveSelfDestructDateForAnchor(now);
  await touchConversationActivity({
    conversationId: args.conversationId,
    userId: args.userId,
    lastMessageAt: now,
    incrementBy: 2,
    selfDestructDate,
  });
}
