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

export async function overwriteMessageContentByConversationIds(args: {
  conversationIds: string[];
  overwriteToken: string;
}) {
  if (args.conversationIds.length === 0) return 0;

  const result = await Message.updateMany(
    {
      conversation_id: { $in: args.conversationIds },
    },
    {
      $set: {
        content: args.overwriteToken,
        metadata: { wiped: true },
      },
    }
  );

  return result.modifiedCount ?? 0;
}

export async function deleteMessagesByConversationIds(conversationIds: string[]) {
  if (conversationIds.length === 0) return 0;
  const result = await Message.deleteMany({ conversation_id: { $in: conversationIds } });
  return result.deletedCount ?? 0;
}
