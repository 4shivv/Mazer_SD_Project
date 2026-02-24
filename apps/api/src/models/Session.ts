import mongoose from "mongoose";

const DAY_MS = 24 * 60 * 60 * 1000;

const SessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    session_token: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    // 24-hour expiry contract for session lifecycle (FR-006).
    expires_at: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + DAY_MS),
    },
  },
  { timestamps: true }
);

// MongoDB auto-removes expired sessions at/after expires_at.
SessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model("Session", SessionSchema);
