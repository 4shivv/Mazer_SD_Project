import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      default: "New chat",
      trim: true,
      maxlength: 160,
    },
    last_message_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    message_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    is_archived: {
      type: Boolean,
      default: false,
    },
    self_destruct_date: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

ConversationSchema.index({ user_id: 1, last_message_at: -1, _id: -1 });

export const Conversation = mongoose.model("Conversation", ConversationSchema);
