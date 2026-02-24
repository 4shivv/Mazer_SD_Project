import { Message } from "../models/Message.js";
import type { MessageRole } from "../models/Message.js";

type MessageRecordInput = {
  conversationId: string;
  role: MessageRole;
  content: string;
  timestamp?: Date;
  metadata?: unknown;
};

export async function createMessageRecords(records: MessageRecordInput[]) {
  if (records.length === 0) return [];
  return Message.insertMany(
    records.map((record) => ({
      conversation_id: record.conversationId,
      role: record.role,
      content: record.content,
      timestamp: record.timestamp ?? new Date(),
      metadata: record.metadata ?? null,
    }))
  );
}

export async function listMessagesByConversationId(conversationId: string) {
  return Message.find({ conversation_id: conversationId }).sort({ timestamp: 1, _id: 1 });
}
