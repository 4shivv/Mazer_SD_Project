import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ConversationSchema.index({ userId: 1, updatedAt: -1 });

export const Conversation = mongoose.model("Conversation", ConversationSchema);
