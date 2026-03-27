import mongoose from "mongoose";

export type DocumentType =
  | "textbook"
  | "hardware_manual"
  | "operational_procedure"
  | "amateur_radio_wiki";

export type DocumentStatus = "processing" | "ready" | "failed";

const DocumentSchema = new mongoose.Schema(
  {
    uploaded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    original_filename: {
      type: String,
      required: true,
      trim: true,
      maxlength: 512,
    },
    storage_key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 256,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    document_type: {
      type: String,
      enum: ["textbook", "hardware_manual", "operational_procedure", "amateur_radio_wiki"],
      required: true,
    },
    mime_type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    size_bytes: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
      required: true,
      index: true,
    },
    chunk_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    processing_error: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

DocumentSchema.index({ uploaded_by: 1, created_at: -1, _id: -1 });

export const Document = mongoose.model("Document", DocumentSchema);
