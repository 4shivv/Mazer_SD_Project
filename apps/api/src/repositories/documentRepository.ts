import { Document } from "../models/Document.js";
import type { DocumentStatus, DocumentType } from "../models/Document.js";

export async function createDocumentRecord(args: {
  documentId: string;
  uploadedBy: string;
  originalFilename: string;
  storageKey: string;
  title: string;
  documentType: DocumentType;
  mimeType: string;
  sizeBytes: number;
  metadata?: Record<string, unknown> | null;
}) {
  return Document.create({
    _id: args.documentId,
    uploaded_by: args.uploadedBy,
    original_filename: args.originalFilename,
    storage_key: args.storageKey,
    title: args.title,
    document_type: args.documentType,
    mime_type: args.mimeType,
    size_bytes: args.sizeBytes,
    status: "processing",
    chunk_count: 0,
    metadata: args.metadata ?? null,
  } as any);
}

export async function markDocumentReady(args: {
  documentId: string;
  chunkCount: number;
}) {
  return Document.findByIdAndUpdate(
    args.documentId,
    {
      $set: {
        status: "ready",
        chunk_count: args.chunkCount,
        processing_error: null,
      },
    },
    { new: true }
  );
}

export async function markDocumentFailed(args: {
  documentId: string;
  errorMessage: string;
}) {
  return Document.findByIdAndUpdate(
    args.documentId,
    {
      $set: {
        status: "failed",
        processing_error: args.errorMessage,
      },
    },
    { new: true }
  );
}

export async function findDocumentByIdForInstructor(args: {
  documentId: string;
  instructorId: string;
}) {
  return Document.findOne({
    _id: args.documentId,
    uploaded_by: args.instructorId,
  });
}

export async function findDocumentById(documentId: string) {
  return Document.findById(documentId);
}

export async function listDocumentsByInstructor(args: {
  instructorId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
  return Document.find({ uploaded_by: args.instructorId })
    .sort({ created_at: -1, _id: -1 })
    .limit(limit);
}

export async function listAllDocuments(args?: {
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(args?.limit ?? 200, 500));
  return Document.find({})
    .sort({ created_at: -1, _id: -1 })
    .limit(limit);
}

export async function listReadyDocuments(args?: {
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(args?.limit ?? 200, 500));
  return Document.find({ status: "ready" })
    .sort({ created_at: -1, _id: -1 })
    .limit(limit);
}

export async function deleteDocumentByIdForInstructor(args: {
  documentId: string;
  instructorId: string;
}) {
  return Document.findOneAndDelete({
    _id: args.documentId,
    uploaded_by: args.instructorId,
  });
}

export async function deleteDocumentById(documentId: string) {
  return Document.findByIdAndDelete(documentId);
}

export async function updateDocumentStatus(args: {
  documentId: string;
  status: DocumentStatus;
}) {
  return Document.findByIdAndUpdate(
    args.documentId,
    {
      $set: { status: args.status },
    },
    { new: true }
  );
}

export async function markAllProcessingDocumentsFailed(errorMessage: string) {
  return Document.updateMany(
    { status: "processing" },
    {
      $set: {
        status: "failed",
        processing_error: errorMessage,
      },
    }
  );
}
