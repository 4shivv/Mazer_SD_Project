import { Conversation } from "../models/Conversation.js";

type CreateConversationInput = {
  userId: string;
  title?: string;
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
};

export async function createConversationRecord(input: CreateConversationInput) {
  return Conversation.create({
    user_id: input.userId,
    title: input.title?.trim() || "New chat",
  });
}

export async function listConversationsByUser(input: ListConversationsInput) {
  const skip = (input.page - 1) * input.limit;
  const query = { user_id: input.userId };

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
  return Conversation.findOneAndUpdate(
    {
      _id: input.conversationId,
      user_id: input.userId,
    },
    {
      $set: {
        last_message_at: input.lastMessageAt,
      },
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
