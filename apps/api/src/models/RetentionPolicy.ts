import mongoose from "mongoose";

const RetentionPolicySchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      required: true,
      unique: true,
      default: "global",
      enum: ["global"],
    },
    default_retention_days: {
      type: Number,
      required: true,
      default: 90,
      min: 1,
      max: 3650,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

export const RetentionPolicy = mongoose.model("RetentionPolicy", RetentionPolicySchema);
