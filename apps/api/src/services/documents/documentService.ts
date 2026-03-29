import mongoose from "mongoose";
import { createDocumentRecord, deleteDocumentById, findDocumentById, listAllDocuments, listReadyDocuments, markAllProcessingDocumentsFailed, markDocumentFailed, markDocumentReady, updateDocumentStatus } from "../../repositories/documentRepository.js";
import { getEffectiveInstructorConfigByUserId, getLatestInstructorConfig, INSTRUCTOR_CONFIG_DEFAULTS } from "../../repositories/instructorConfigRepository.js";
import { findUserById } from "../../repositories/userRepository.js";
import type { DocumentType } from "../../models/Document.js";
import { addDocumentsToChroma, deleteDocumentFromChroma, queryChroma, type ChromaQueryResult } from "./chromaClient.js";
import { extractDocumentText } from "./documentParsingService.js";
import { embedTexts } from "./embeddingService.js";
import { chunkTextForEmbedding } from "./textChunking.js";
import { cancelDocumentProcessing, isDocumentProcessingCancelled, queueDocumentProcessing } from "./documentProcessingQueue.js";

const DOCUMENT_TYPES = new Set<DocumentType>([
  "textbook",
  "hardware_manual",
  "operational_procedure",
  "amateur_radio_wiki",
]);

export class DocumentServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code ?? message;
  }
}

export type SourceReference = {
  label: string;
  document_id: string | null;
  title: string | null;
  source_file: string | null;
  page_number: number | null;
  section_header: string | null;
  document_type: string | null;
  similarity_score: number | null;
  chunk_index: number | null;
};

function assertValidDocumentType(value: string): DocumentType {
  if (!DOCUMENT_TYPES.has(value as DocumentType)) {
    throw new DocumentServiceError(400, "invalid_document_type");
  }
  return value as DocumentType;
}

async function assertDocumentManager(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new DocumentServiceError(401, "invalid_session");
  }
  if ((user as any).role === "admin") {
    return;
  }
  if ((user as any).role !== "instructor") {
    throw new DocumentServiceError(403, "document_manager_only");
  }
  if ((user as any).instructorApprovalStatus !== "approved") {
    throw new DocumentServiceError(403, "instructor_pending_approval");
  }
}

async function resolveRetrievalThresholdForActor(userId?: string) {
  if (!userId) {
    const latestConfig = await getLatestInstructorConfig();
    return latestConfig.retrieval_threshold;
  }

  const user = await findUserById(userId);
  if (!user) {
    const latestConfig = await getLatestInstructorConfig();
    return latestConfig.retrieval_threshold;
  }
  if ((user as any).role !== "instructor") {
    const latestConfig = await getLatestInstructorConfig();
    return latestConfig.retrieval_threshold;
  }
  if ((user as any).instructorApprovalStatus !== "approved") {
    return INSTRUCTOR_CONFIG_DEFAULTS.retrievalThreshold;
  }

  const config = await getEffectiveInstructorConfigByUserId(userId);
  return config.retrieval_threshold;
}

function normalizeTitle(filename: string, title?: string) {
  const candidate = (title ?? "").trim();
  if (candidate) return candidate;
  return filename.trim();
}

function buildStorageKey(documentId: string, filename: string) {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
  return `${documentId}${ext}`;
}

function toUploadResponse(document: any) {
  return {
    document_id: String(document._id),
    status: String(document.status),
    chunks_created: Number(document.chunk_count ?? 0),
    estimated_completion_seconds: 20,
  };
}

function mapUnsupportedError(error: unknown): never {
  if (error instanceof DocumentServiceError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : "document_processing_failed";
  if (message === "unsupported_format") {
    throw new DocumentServiceError(400, "unsupported_format");
  }
  if (message === "pdf_text_extraction_unavailable") {
    throw new DocumentServiceError(501, "pdf_text_extraction_unavailable");
  }
  if (message.startsWith("embedding_request_failed_")) {
    if (message.includes("input length exceeds the context length")) {
      throw new DocumentServiceError(
        400,
        "Document contains chunks too large for the current embedding model. Try a smaller document or adjust chunk sizing.",
        "document_chunk_too_large_for_embedding"
      );
    }
    throw new DocumentServiceError(502, message, "embedding_request_failed");
  }
  if (message.startsWith("chroma_request_failed_") || message.startsWith("chroma_delete_failed_")) {
    throw new DocumentServiceError(502, message, "vector_store_request_failed");
  }
  throw new DocumentServiceError(500, message, "document_processing_failed");
}

function describeProcessingError(error: unknown) {
  if (error instanceof DocumentServiceError) {
    return error.message;
  }
  const message = error instanceof Error ? error.message : "document_processing_failed";
  if (message === "unsupported_format") {
    return "unsupported_format";
  }
  if (message === "pdf_text_extraction_unavailable") {
    return "pdf_text_extraction_unavailable";
  }
  if (message.startsWith("embedding_request_failed_")) {
    if (message.includes("input length exceeds the context length")) {
      return "Document contains chunks too large for the current embedding model. Try a smaller document or adjust chunk sizing.";
    }
    return message;
  }
  if (message.startsWith("chroma_request_failed_") || message.startsWith("chroma_delete_failed_")) {
    return "vector_store_request_failed";
  }
  return message;
}

class DocumentProcessingAbortedError extends Error {
  constructor() {
    super("document_processing_cancelled");
  }
}

async function assertDocumentStillProcessable(documentId: string) {
  if (isDocumentProcessingCancelled(documentId)) {
    throw new DocumentProcessingAbortedError();
  }
  const document = await findDocumentById(documentId);
  if (!document) {
    throw new DocumentProcessingAbortedError();
  }
}

async function processDocumentUpload(args: {
  documentId: string;
  instructorId: string;
  filename: string;
  buffer: Buffer;
  documentType: DocumentType;
  title: string;
  storageKey: string;
  uploadedAt: string | Date;
}) {
  let chunkCount = 0;
  let addedToChroma = false;

  try {
    const parsed = await extractDocumentText({
      filename: args.filename,
      buffer: args.buffer,
    });

    const chunks = chunkTextForEmbedding({
      text: parsed.text,
      pages: parsed.pages ?? undefined,
    });
    if (chunks.length === 0) {
      throw new DocumentServiceError(400, "document_contains_no_text");
    }

    await assertDocumentStillProcessable(args.documentId);
    const embeddings = await embedTexts(chunks.map((chunk) => chunk.text));
    await assertDocumentStillProcessable(args.documentId);

    await addDocumentsToChroma(
      chunks.map((chunk, index) => ({
        id: `${args.documentId}:${chunk.index}`,
        document: chunk.text,
        embedding: embeddings[index],
        metadata: {
          document_id: args.documentId,
          source_file: args.storageKey,
          page_number: chunk.page_number,
          section_header: chunk.section_header,
          document_type: args.documentType,
          upload_date: args.uploadedAt,
          instructor_id: args.instructorId,
          chunk_index: chunk.index,
          token_count: chunk.token_count,
          title: args.title,
        },
      }))
    );
    addedToChroma = true;
    chunkCount = chunks.length;

    await assertDocumentStillProcessable(args.documentId);
    const ready = await markDocumentReady({
      documentId: args.documentId,
      chunkCount,
    });

    if (!ready && addedToChroma) {
      await deleteDocumentFromChroma({ documentId: args.documentId }).catch(() => {});
    }
  } catch (error) {
    if (error instanceof DocumentProcessingAbortedError) {
      if (addedToChroma) {
        await deleteDocumentFromChroma({ documentId: args.documentId }).catch(() => {});
      }
      return;
    }

    const document = await findDocumentById(args.documentId);
    if (document) {
      await markDocumentFailed({
        documentId: args.documentId,
        errorMessage: describeProcessingError(error),
      });
    }

    if (addedToChroma) {
      await deleteDocumentFromChroma({ documentId: args.documentId }).catch(() => {});
    }
  }
}

export async function uploadDocumentForManager(args: {
  actorUserId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  documentType: string;
  title?: string;
  metadata?: Record<string, unknown> | null;
}) {
  await assertDocumentManager(args.actorUserId);

  if (!args.filename.trim()) {
    throw new DocumentServiceError(400, "filename_required");
  }
  if (!Buffer.isBuffer(args.buffer) || args.buffer.length === 0) {
    throw new DocumentServiceError(400, "file_required");
  }

  const documentType = assertValidDocumentType(args.documentType);

  const draftId = new mongoose.Types.ObjectId().toString();
  const created: any = await createDocumentRecord({
    documentId: draftId,
    uploadedBy: args.actorUserId,
    originalFilename: args.filename,
    storageKey: buildStorageKey(draftId, args.filename),
    title: normalizeTitle(args.filename, args.title),
    documentType,
    mimeType: args.mimeType || "application/octet-stream",
    sizeBytes: args.buffer.length,
    metadata: args.metadata ?? null,
  });

  queueDocumentProcessing(String(created._id), async () => {
    await processDocumentUpload({
      documentId: String(created._id),
      instructorId: args.actorUserId,
      filename: args.filename,
      buffer: args.buffer,
      documentType,
      title: String(created.title),
      storageKey: String(created.storage_key),
      uploadedAt: created.created_at,
    });
  });

  return toUploadResponse(created);
}

export async function recoverInterruptedDocumentProcessing() {
  const result = await markAllProcessingDocumentsFailed(
    "document_processing_interrupted_by_server_restart"
  );
  return Number(result.modifiedCount ?? 0);
}

export async function listDocumentsForInstructor(args: {
  actorUserId: string;
  limit?: number;
}) {
  await assertDocumentManager(args.actorUserId);
  const rows = await listAllDocuments({ limit: args.limit });
  return {
    documents: rows.map((row: any) => ({
      id: String(row._id),
      title: String(row.title),
      original_filename: String(row.original_filename),
      document_type: String(row.document_type),
      mime_type: String(row.mime_type),
      size_bytes: Number(row.size_bytes),
      status: String(row.status),
      chunk_count: Number(row.chunk_count ?? 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      processing_error: row.processing_error ?? null,
    })),
  };
}

export async function listAvailableDocuments(args?: {
  limit?: number;
}) {
  const rows = await listReadyDocuments(args);
  return {
    documents: rows.map((row: any) => ({
      id: String(row._id),
      title: String(row.title),
      original_filename: String(row.original_filename),
      document_type: String(row.document_type),
      mime_type: String(row.mime_type),
      size_bytes: Number(row.size_bytes),
      status: String(row.status),
      chunk_count: Number(row.chunk_count ?? 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      processing_error: null,
    })),
  };
}

export async function deleteDocumentForManager(args: {
  actorUserId: string;
  documentId: string;
}) {
  await assertDocumentManager(args.actorUserId);
  if (!mongoose.isValidObjectId(args.documentId)) {
    throw new DocumentServiceError(400, "invalid_document_id");
  }

  const document = await findDocumentById(args.documentId);
  if (!document) {
    throw new DocumentServiceError(404, "document_not_found");
  }

  cancelDocumentProcessing(args.documentId);
  await updateDocumentStatus({
    documentId: args.documentId,
    status: "processing",
  });

  try {
    await deleteDocumentFromChroma({ documentId: args.documentId });
  } catch (error) {
    mapUnsupportedError(error);
  }

  await deleteDocumentById(args.documentId);

  return {
    document_id: args.documentId,
    chunks_deleted: Number((document as any).chunk_count ?? 0),
    status: "deleted" as const,
  };
}

function buildWhereFilter(documentTypes?: string[]) {
  if (!documentTypes || documentTypes.length === 0) return undefined;
  return {
    document_type: { $in: documentTypes },
  };
}

function toSimilarityScore(distance: number | null) {
  if (distance === null || !Number.isFinite(distance)) return null;
  // Chroma is currently using l2 distance for this collection. For normalized
  // embedding vectors, cosine similarity can be approximated as 1 - d^2 / 2.
  const similarity = 1 - ((distance * distance) / 2);
  return Math.max(0, Math.min(1, similarity));
}

export function toSourceReference(metadata: Record<string, unknown>): SourceReference {
  const title = typeof metadata.title === "string" && metadata.title.trim() ? metadata.title.trim() : null;
  const sourceFile = typeof metadata.source_file === "string" && metadata.source_file.trim()
    ? metadata.source_file.trim()
    : null;
  const pageNumber = typeof metadata.page_number === "number" ? metadata.page_number : null;
  const sectionHeader = typeof metadata.section_header === "string" && metadata.section_header.trim()
    ? metadata.section_header.trim()
    : null;
  const documentType = typeof metadata.document_type === "string" && metadata.document_type.trim()
    ? metadata.document_type.trim()
    : null;
  const similarityScore = typeof metadata.similarity_score === "number" ? metadata.similarity_score : null;
  const chunkIndex = typeof metadata.chunk_index === "number" ? metadata.chunk_index : null;
  const documentId = typeof metadata.document_id === "string" && metadata.document_id.trim()
    ? metadata.document_id.trim()
    : null;

  const base = title ?? sourceFile ?? "uploaded_document";
  const withPage = pageNumber ? `${base} p.${pageNumber}` : base;
  const label = sectionHeader ? `${withPage} - ${sectionHeader}` : withPage;

  return {
    label,
    document_id: documentId,
    title,
    source_file: sourceFile,
    page_number: pageNumber,
    section_header: sectionHeader,
    document_type: documentType,
    similarity_score: similarityScore,
    chunk_index: chunkIndex,
  };
}

function meetsThreshold(result: ChromaQueryResult, threshold: number) {
  const similarity = toSimilarityScore(result.distance);
  return similarity === null || similarity >= threshold;
}

type KnowledgeBaseQueryArgs = {
  query: string;
  actorUserId?: string;
  topK?: number;
  documentTypes?: string[];
};

export async function queryKnowledgeBase(args: KnowledgeBaseQueryArgs) {
  const normalizedQuery = args.query.trim();
  if (!normalizedQuery) {
    throw new DocumentServiceError(400, "query_required");
  }

  const retrievalThreshold = await resolveRetrievalThresholdForActor(args.actorUserId);
  const [queryEmbedding] = await embedTexts([normalizedQuery]);
  const results = await queryChroma({
    queryEmbedding,
    topK: Math.max(1, Math.min(args.topK ?? 3, 10)),
    where: buildWhereFilter(args.documentTypes),
  });

  return {
    chunks: results
      .filter((result) => meetsThreshold(result, retrievalThreshold))
      .map((result) => {
        const metadata = {
          ...(result.metadata ?? {}),
          similarity_score: toSimilarityScore(result.distance),
        };
        return {
          text: result.document,
          metadata,
          source: toSourceReference(metadata),
        };
      }),
  };
}

export async function retrieveRelevantChunks(args: {
  actorUserId: string;
  query: string;
  topK?: number;
  documentTypes?: string[];
}) {
  await assertDocumentManager(args.actorUserId);
  return queryKnowledgeBase({
    actorUserId: args.actorUserId,
    query: args.query,
    topK: args.topK,
    documentTypes: args.documentTypes,
  });
}
