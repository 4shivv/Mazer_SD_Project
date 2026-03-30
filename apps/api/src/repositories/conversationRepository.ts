import { Conversation } from "../models/Conversation.js";

type CreateConversationInput = {
  userId: string;
  title?: string;
  lastMessageAt?: Date;
  selfDestructDate?: Date;
};

type ListConversationsInput = {
  userId: string;
  page: number;
  limit: number;
};

type TouchConversationInput = {
  conversationId: string;
  userId: string;
  lastMessageAt: Date;
  incrementBy: number;
  selfDestructDate?: Date;
};

export async function createConversationRecord(input: CreateConversationInput) {
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    title: input.title?.trim() || "New chat",
    last_message_at: input.lastMessageAt ?? new Date(),
  };
  if (input.selfDestructDate) {
    payload.self_destruct_date = input.selfDestructDate;
  }
  return Conversation.create(payload as any);
}

export async function listConversationsByUser(input: ListConversationsInput) {
  const skip = (input.page - 1) * input.limit;
  const query = {
    user_id: input.userId,
    $or: [
      { self_destruct_date: null },
      { self_destruct_date: { $gt: new Date() } },
    ],
  };

  const [rows, total] = await Promise.all([
    Conversation.find(query)
      .sort({ last_message_at: -1, _id: -1 })
      .skip(skip)
      .limit(input.limit),
    Conversation.countDocuments(query),
  ]);

  return { rows, total };
}

export async function findConversationByIdForUser(args: {
  conversationId: string;
  userId: string;
}) {
  return Conversation.findOne({
    _id: args.conversationId,
    user_id: args.userId,
  });
}

export async function touchConversationActivity(input: TouchConversationInput) {
  const setPayload: Record<string, unknown> = {
    last_message_at: input.lastMessageAt,
  };
  if (input.selfDestructDate) {
    setPayload.self_destruct_date = input.selfDestructDate;
  }

  return Conversation.findOneAndUpdate(
    {
      _id: input.conversationId,
      user_id: input.userId,
    },
    {
      $set: setPayload,
      $inc: {
        message_count: input.incrementBy,
      },
    },
    { new: true }
  );
}

export async function updateConversationTitleOnFirstMessage(args: {
  conversationId: string;
  userId: string;
  title: string;
}) {
  return Conversation.updateOne(
    {
      _id: args.conversationId,
      user_id: args.userId,
      title: "New chat",
      message_count: 0,
    },
    {
      $set: {
        title: args.title,
      },
    }
  );
}

export async function listAllConversationIds() {
  const rows = await Conversation.find({}, { _id: 1 });
  return rows.map((row) => String((row as any)._id));
}

export async function applyRetentionDaysToAllConversations(retentionDays: number) {
  const conversations = await Conversation.find({}, { _id: 1, last_message_at: 1 });
  if (conversations.length === 0) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  const operations = conversations.map((conversation) => {
    const doc = conversation as any;
    const anchor = doc.last_message_at instanceof Date ? doc.last_message_at : new Date();
    const selfDestructDate = new Date(anchor.getTime() + retentionDays * dayMs);

    return {
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { self_destruct_date: selfDestructDate } },
      },
    };
  });

  const result = await Conversation.bulkWrite(operations, { ordered: false });
  return result.modifiedCount ?? conversations.length;
}

export async function listExpiredConversationIds(args: { now: Date; limit: number }) {
  const rows = await Conversation.find(
    {
      self_destruct_date: {
        $ne: null,
        $lte: args.now,
      },
    },
    { _id: 1 }
  )
    .sort({ self_destruct_date: 1, _id: 1 })
    .limit(args.limit);

  return rows.map((row) => String((row as any)._id));
}

export async function overwriteConversationFieldsByIds(args: {
  conversationIds: string[];
  overwriteToken: string;
}) {
  if (args.conversationIds.length === 0) return 0;

  const result = await Conversation.updateMany(
    { _id: { $in: args.conversationIds } },
    {
      $set: {
        title: args.overwriteToken,
        is_archived: true,
      },
    }
  );

  return result.modifiedCount ?? 0;
}

export async function deleteConversationsByIds(conversationIds: string[]) {
  if (conversationIds.length === 0) return 0;
  const result = await Conversation.deleteMany({ _id: { $in: conversationIds } });
  return result.deletedCount ?? 0;
}

export async function setConversationTitleForUser(args: {
  conversationId: string;
  userId: string;
  title: string;
}) {
  return Conversation.updateOne(
    {
      _id: args.conversationId,
      user_id: args.userId,
    },
    { $set: { title: args.title } }
  );
}

export async function deleteConversationRecordForUser(args: {
  conversationId: string;
  userId: string;
}) {
  return Conversation.deleteOne({
    _id: args.conversationId,
    user_id: args.userId,
  });
}
