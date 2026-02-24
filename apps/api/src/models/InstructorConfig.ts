import mongoose from "mongoose";

const InstructorConfigSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    personality_prompt: {
      type: String,
      required: true,
      default: "",
      trim: true,
      maxlength: 8000,
    },
    temperature: {
      type: Number,
      required: true,
      default: 0.3,
      min: 0,
      max: 1,
    },
    max_tokens: {
      type: Number,
      required: true,
      default: 512,
      min: 64,
      max: 4096,
    },
    retrieval_threshold: {
      type: Number,
      required: true,
      default: 0.75,
      min: 0,
      max: 1,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export const InstructorConfig = mongoose.model("InstructorConfig", InstructorConfigSchema);
