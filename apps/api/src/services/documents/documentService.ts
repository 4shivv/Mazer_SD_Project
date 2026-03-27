import mongoose from "mongoose";
import { deleteDocumentByIdForInstructor, findDocumentByIdForInstructor, listDocumentsByInstructor, markDocumentFailed, markDocumentReady, updateDocumentStatus, createDocumentRecord } from "../../repositories/documentRepository.js";
import { getEffectiveInstructorConfigByUserId, INSTRUCTOR_CONFIG_DEFAULTS } from "../../repositories/instructorConfigRepository.js";
import { findUserById } from "../../repositories/userRepository.js";
import type { DocumentType } from "../../models/Document.js";
import { addDocumentsToChroma, deleteDocumentFromChroma, queryChroma, type ChromaQueryResult } from "./chromaClient.js";
import { extractDocumentText } from "./documentParsingService.js";
import { embedTexts } from "./embeddingService.js";
import { chunkTextForEmbedding } from "./textChunking.js";

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

async function assertApprovedInstructor(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new DocumentServiceError(401, "invalid_session");
  }
  if ((user as any).role !== "instructor") {
    throw new DocumentServiceError(403, "instructor_only");
  }
  if ((user as any).instructorApprovalStatus !== "approved") {
    throw new DocumentServiceError(403, "instructor_pending_approval");
  }
}

async function resolveRetrievalThresholdForActor(userId?: string) {
  if (!userId) return INSTRUCTOR_CONFIG_DEFAULTS.retrievalThreshold;

  const user = await findUserById(userId);
  if (!user) return INSTRUCTOR_CONFIG_DEFAULTS.retrievalThreshold;
  if ((user as any).role !== "instructor") return INSTRUCTOR_CONFIG_DEFAULTS.retrievalThreshold;
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
    throw new DocumentServiceError(502, message, "embedding_request_failed");
  }
  if (message.startsWith("chroma_request_failed_") || message.startsWith("chroma_delete_failed_")) {
    throw new DocumentServiceError(502, message, "vector_store_request_failed");
  }
  throw new DocumentServiceError(500, message, "document_processing_failed");
}

export async function uploadDocumentForInstructor(args: {
  instructorId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  documentType: string;
  title?: string;
  metadata?: Record<string, unknown> | null;
}) {
  await assertApprovedInstructor(args.instructorId);

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
    uploadedBy: args.instructorId,
    originalFilename: args.filename,
    storageKey: buildStorageKey(draftId, args.filename),
    title: normalizeTitle(args.filename, args.title),
    documentType,
    mimeType: args.mimeType || "application/octet-stream",
    sizeBytes: args.buffer.length,
    metadata: args.metadata ?? null,
  });

  try {
    const parsed = await extractDocumentText({
      filename: args.filename,
      buffer: args.buffer,
    });

    const chunks = chunkTextForEmbedding(parsed.text);
    if (chunks.length === 0) {
      throw new DocumentServiceError(400, "document_contains_no_text");
    }

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.text));
    await addDocumentsToChroma(
      chunks.map((chunk, index) => ({
        id: `${created._id}:${chunk.index}`,
        document: chunk.text,
        embedding: embeddings[index],
        metadata: {
          document_id: String(created._id),
          source_file: created.storage_key,
          page_number: null,
          section_header: chunk.section_header,
          document_type: documentType,
          upload_date: created.created_at,
          instructor_id: args.instructorId,
          chunk_index: chunk.index,
          token_count: chunk.token_count,
          title: created.title,
        },
      }))
    );

    const ready = await markDocumentReady({
      documentId: String(created._id),
      chunkCount: chunks.length,
    });

    return toUploadResponse(ready ?? created);
  } catch (error) {
    await markDocumentFailed({
      documentId: String(created._id),
      errorMessage: error instanceof Error ? error.message : "document_processing_failed",
    });
    mapUnsupportedError(error);
  }
}

export async function listDocumentsForInstructor(args: {
  instructorId: string;
  limit?: number;
}) {
  await assertApprovedInstructor(args.instructorId);
  const rows = await listDocumentsByInstructor(args);
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

export async function deleteDocumentForInstructor(args: {
  instructorId: string;
  documentId: string;
}) {
  await assertApprovedInstructor(args.instructorId);
  if (!mongoose.isValidObjectId(args.documentId)) {
    throw new DocumentServiceError(400, "invalid_document_id");
  }

  const document = await findDocumentByIdForInstructor({
    instructorId: args.instructorId,
    documentId: args.documentId,
  });
  if (!document) {
    throw new DocumentServiceError(404, "document_not_found");
  }

  await updateDocumentStatus({
    documentId: args.documentId,
    status: "processing",
  });

  try {
    await deleteDocumentFromChroma({ documentId: args.documentId });
  } catch (error) {
    mapUnsupportedError(error);
  }

  await deleteDocumentByIdForInstructor({
    documentId: args.documentId,
    instructorId: args.instructorId,
  });

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
  instructorId: string;
  query: string;
  topK?: number;
  documentTypes?: string[];
}) {
  await assertApprovedInstructor(args.instructorId);
  return queryKnowledgeBase({
    actorUserId: args.instructorId,
    query: args.query,
    topK: args.topK,
    documentTypes: args.documentTypes,
  });
}
