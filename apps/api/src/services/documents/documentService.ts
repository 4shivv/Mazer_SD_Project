import mongoose from "mongoose";
import { createDocumentRecord, deleteDocumentById, findDocumentById, listAllDocuments, listReadyDocuments, markAllProcessingDocumentsFailed, markDocumentFailed, markDocumentReady, updateDocumentStatus } from "../../repositories/documentRepository.js";
import { getEffectiveInstructorConfigByUserId, getLatestInstructorConfig, INSTRUCTOR_CONFIG_DEFAULTS } from "../../repositories/instructorConfigRepository.js";
import { findUserById } from "../../repositories/userRepository.js";
import type { DocumentType } from "../../models/Document.js";
import { addDocumentsToChroma, deleteDocumentFromChroma, queryChroma, searchChromaByDocumentText, type ChromaQueryResult } from "./chromaClient.js";
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

const QUERY_STOP_WORDS = new Set([
  // articles, conjunctions, prepositions, common particles
  "a", "an", "and", "across", "all", "are", "as", "at", "based", "be",
  "been", "being", "both", "but", "by", "can", "could", "do", "did",
  "for", "from", "had", "has", "have", "in", "into", "is", "it", "its",
  "may", "me", "might", "must", "of", "on", "or", "out", "over", "should",
  "so", "than", "that", "the", "their", "them", "then", "there", "these",
  "this", "those", "to", "up", "was", "we", "were", "what", "when",
  "where", "which", "while", "who", "whom", "why", "will", "with",
  "would",
  // common question / instruction verbs that signal intent without content
  "compare", "define", "describe", "explain", "give", "how", "list",
  "show", "summarize", "tell", "ask", "say",
  // self-references that flag the corpus rather than the topic
  "document", "documents", "uploaded", "using", "sources", "source",
  // contractions (apostrophes get stripped during normalization)
  "whats", "hows", "wheres", "whens", "whys", "whos", "youre", "youd",
  "youll", "im", "ive", "ill", "id", "isnt", "arent", "wasnt", "werent",
  "dont", "doesnt", "didnt", "cant", "couldnt", "shouldnt", "wouldnt",
  // greetings, acknowledgments, casual phrasing — these are not corpus
  // content and must not seed lexical match
  "hi", "hello", "hey", "yo", "sup", "howdy", "greetings",
  "ok", "okay", "yes", "no", "yeah", "nope", "sure", "alright",
  "thanks", "thank", "ty", "thx", "appreciate",
  "cool", "nice", "got", "understood", "gotcha", "awesome", "great",
  "good", "bad", "fine", "well", "test", "ping",
  // pronouns and self / other references
  "i", "you", "your", "yours", "yourself", "my", "mine", "our", "ours",
  "us", "they", "them",
  // common social-context words and short adverbs
  "doing", "going", "things", "stuff", "please", "now", "today",
  "yesterday", "tomorrow", "anyway", "really", "very",
  // morning / evening / time-of-day greetings
  "morning", "afternoon", "evening", "night", "day",
]);

const QUERY_WEAK_TERMS = new Set([
  "configuration",
  "material",
  "materials",
  "reference",
  "references",
  "source",
  "sources",
  "system",
]);

const NAVIGATION_TERMS = new Set([
  "chapter",
  "chapters",
  "contents",
  "heading",
  "headings",
  "page",
  "pages",
  "section",
  "sections",
  "toc",
]);

function normalizeLexicalText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandQueryToken(token: string) {
  if (token === "ew") {
    return ["ew", "electronic", "warfare"];
  }
  if (token === "tls") {
    return ["tls", "terrestrial", "layer", "system"];
  }
  if (token === "chapters") {
    return ["chapters", "chapter"];
  }
  if (token === "sections") {
    return ["sections", "section"];
  }
  if (token === "contents") {
    return ["contents", "content"];
  }
  return [token];
}

function extractContentTerms(query: string) {
  const normalized = normalizeLexicalText(query);
  if (!normalized) return [];

  const terms = normalized
    .split(" ")
    .flatMap((token) => expandQueryToken(token))
    .filter((token) => token.length >= 2)
    .filter((token) => !QUERY_STOP_WORDS.has(token))
    .filter((token) => !QUERY_WEAK_TERMS.has(token));

  return Array.from(new Set(terms));
}

function buildContentPhrase(query: string, contentTerms: string[]) {
  if (contentTerms.length >= 2) {
    return contentTerms.join(" ");
  }

  return "";
}

function hasNavigationIntent(query: string) {
  const normalized = normalizeLexicalText(query);
  if (!normalized) return false;
  const tokens = normalized.split(" ");
  if (tokens.some((token) => NAVIGATION_TERMS.has(token))) {
    return true;
  }
  return normalized.includes("table of contents");
}

function toSearchCase(token: string) {
  if (token.length <= 3) {
    return token.toUpperCase();
  }
  return `${token[0]?.toUpperCase() ?? ""}${token.slice(1)}`;
}

function buildLineLevelLexicalPhrases(query: string) {
  return query
    .split(/\r?\n/)
    .map((line) => normalizeLexicalText(line))
    .filter((line) => line.split(" ").length >= 2)
    .filter((line) => line.length >= 8)
    .slice(-4);
}

function buildLexicalSearchPhrases(contentTerms: string[], contentPhrase: string, rawQuery: string, navigationIntent: boolean) {
  const phrases = new Set<string>();

  if (contentPhrase) {
    phrases.add(contentPhrase);
    phrases.add(contentPhrase.split(" ").map((token) => toSearchCase(token)).join(" "));
  }

  for (const term of contentTerms) {
    phrases.add(term);
    phrases.add(toSearchCase(term));
  }

  for (const linePhrase of buildLineLevelLexicalPhrases(rawQuery)) {
    phrases.add(linePhrase);
    phrases.add(linePhrase.split(" ").map((token) => toSearchCase(token)).join(" "));
  }

  if (navigationIntent) {
    phrases.add("table of contents");
    phrases.add("Table Of Contents");
    phrases.add("contents");
    phrases.add("Contents");
    phrases.add("chapter");
    phrases.add("Chapter");
    phrases.add("section");
    phrases.add("Section");
  }

  return Array.from(phrases)
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .slice(0, 8);
}

type RerankSignals = {
  similarity: number;
  matchedTermCount: number;
  tokenCoverage: number;
  exactPhraseMatch: boolean;
  lexicalMatch: boolean;
  score: number;
};

/**
 * Detect appendix or glossary section headers. Glossary entries embed
 * tightly to definitional queries and tend to dominate results, even when
 * the textbook body has the more useful explanation. We dock these in the
 * rerank so body content wins ties.
 *
 * Patterns covered:
 *   - "Appendix", "Glossary", "Index", "References", "Bibliography"
 *   - Lettered appendix entries like "A-12", "B-4"
 *   - Numbered glossary entries that are short single-term definitions
 *     (e.g. "2. Repeater") — caught by checking for a leading digit-period
 *     prefix on a section header that is otherwise a single capitalized term.
 */
function isAppendixOrGlossaryHeader(sectionHeader: string): boolean {
  if (!sectionHeader) return false;
  const trimmed = sectionHeader.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  if (
    upper.startsWith("APPENDIX")
    || upper.startsWith("GLOSSARY")
    || upper.startsWith("INDEX")
    || upper.startsWith("REFERENCES")
    || upper.startsWith("BIBLIOGRAPHY")
  ) {
    return true;
  }
  // Lettered appendix entries: "A-12", "B-4", "C-1".
  if (/^[A-Z]-\d{1,3}\b/.test(trimmed)) return true;
  // Glossary entries the chunker captured as headers because they begin
  // with "N. Term" but continue with the full definition. Real chapter or
  // section titles are concise; anything past 60 characters is almost
  // certainly a definition that bled into the section_header field.
  if (trimmed.length > 60) return true;
  return false;
}

function computeRerankSignals(
  contentTerms: string[],
  contentPhrase: string,
  result: ChromaQueryResult,
  navigationIntent: boolean
): RerankSignals {
  const similarity = toSimilarityScore(result.distance) ?? 0;
  const title = typeof result.metadata?.title === "string" ? result.metadata.title : "";
  const sectionHeader = typeof result.metadata?.section_header === "string" ? result.metadata.section_header : "";
  const haystack = normalizeLexicalText([
    result.document,
    title,
    sectionHeader,
  ].join(" "));
  const headerHaystack = normalizeLexicalText([title, sectionHeader].join(" "));
  const pageNumber = typeof result.metadata?.page_number === "number" ? result.metadata.page_number : null;

  const matchedTermCount = contentTerms.reduce((count, term) => (
    haystack.includes(term) ? count + 1 : count
  ), 0);
  const tokenCoverage = contentTerms.length > 0 ? matchedTermCount / contentTerms.length : 0;
  const exactPhraseMatch = Boolean(contentPhrase) && haystack.includes(contentPhrase);
  const lexicalMatch = exactPhraseMatch || matchedTermCount > 0;

  let score = similarity;
  if (exactPhraseMatch) score += 1;
  score += tokenCoverage * 0.6;
  if (contentTerms.length > 0 && matchedTermCount === contentTerms.length) {
    score += 0.25;
  }
  if (navigationIntent) {
    if (haystack.includes("table of contents") || headerHaystack.includes("table of contents")) {
      score += 1.2;
    }
    if (haystack.includes("chapter ") || headerHaystack.includes("chapter")) {
      score += 0.45;
    }
    if (headerHaystack && contentTerms.some((term) => headerHaystack.includes(term))) {
      score += 0.35;
    }
    if (pageNumber !== null && pageNumber <= 5) {
      score += 0.15;
    }
  }

  // Penalize appendix / glossary chunks. Glossary entries embed tightly to
  // definitional queries ("what is X") and tend to outrank the body content
  // that explains the concept in context. Detect them by section header
  // patterns (Appendix, Glossary, "A-12" style appendix entries) and dock
  // the score so the body wins on ties.
  if (isAppendixOrGlossaryHeader(sectionHeader)) {
    score -= 0.4;
  }

  return {
    similarity,
    matchedTermCount,
    tokenCoverage,
    exactPhraseMatch,
    lexicalMatch,
    score,
  };
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

function getResultDocumentId(result: ChromaQueryResult) {
  const documentId = result.metadata?.document_id;
  if (typeof documentId === "string" && documentId.trim()) {
    return documentId.trim();
  }
  return null;
}

function selectDiverseResults(results: ChromaQueryResult[], topK: number) {
  if (results.length <= topK) {
    return results;
  }

  const selected: ChromaQueryResult[] = [];
  const seenDocumentIds = new Set<string>();

  for (const result of results) {
    const documentId = getResultDocumentId(result);
    if (documentId && seenDocumentIds.has(documentId)) {
      continue;
    }
    selected.push(result);
    if (documentId) {
      seenDocumentIds.add(documentId);
    }
    if (selected.length >= topK) {
      return selected;
    }
  }

  for (const result of results) {
    if (selected.includes(result)) {
      continue;
    }
    selected.push(result);
    if (selected.length >= topK) {
      return selected;
    }
  }

  return selected;
}

async function searchLexicalFallbackResults(args: {
  rawQuery: string;
  contentTerms: string[];
  contentPhrase: string;
  navigationIntent: boolean;
  documentTypes?: string[];
  requestedTopK: number;
}) {
  const phrases = buildLexicalSearchPhrases(
    args.contentTerms,
    args.contentPhrase,
    args.rawQuery,
    args.navigationIntent
  );
  if (phrases.length === 0) {
    return [];
  }

  const phraseResults = await Promise.all(
    phrases.map((phrase) => searchChromaByDocumentText({
      contains: phrase,
      where: buildWhereFilter(args.documentTypes),
      limit: Math.min(args.requestedTopK * 4, 20),
    }))
  );

  const deduped = new Map<string, ChromaQueryResult>();
  for (const results of phraseResults) {
    for (const result of results) {
      if (!deduped.has(result.id)) {
        deduped.set(result.id, result);
      }
    }
  }

  return Array.from(deduped.values());
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

  const requestedTopK = Math.max(1, Math.min(args.topK ?? 3, 10));
  const retrievalThreshold = await resolveRetrievalThresholdForActor(args.actorUserId);
  const contentTerms = extractContentTerms(normalizedQuery);
  const contentPhrase = buildContentPhrase(normalizedQuery, contentTerms);
  const navigationIntent = hasNavigationIntent(normalizedQuery);
  const [queryEmbedding] = await embedTexts([normalizedQuery]);
  const where = buildWhereFilter(args.documentTypes);
  const [vectorResults, lexicalResults] = await Promise.all([
    queryChroma({
      queryEmbedding,
      topK: Math.max(requestedTopK, Math.min(requestedTopK * 8, 50)),
      where,
    }),
    searchLexicalFallbackResults({
      rawQuery: normalizedQuery,
      contentTerms,
      contentPhrase,
      navigationIntent,
      documentTypes: args.documentTypes,
      requestedTopK,
    }),
  ]);
  const mergedResults = Array.from(new Map(
    [...vectorResults, ...lexicalResults].map((result) => [result.id, result] as const)
  ).values());
  const rescoredResults = mergedResults
    .map((result) => ({ result, signals: computeRerankSignals(contentTerms, contentPhrase, result, navigationIntent) }))
    .filter(({ result, signals }) => {
      if (signals.exactPhraseMatch) return true;
      if (signals.lexicalMatch) {
        // Lexical match alone does not bypass the similarity gate. Allow the
        // bypass only when the query carries multiple substantive terms and
        // the chunk covers a meaningful share of them — this prevents single
        // common tokens (e.g. "up", "is", "hi") from ushering irrelevant
        // chunks past the threshold during casual prompts.
        return (
          meetsThreshold(result, retrievalThreshold)
          || (contentTerms.length >= 2 && signals.tokenCoverage >= 0.5)
        );
      }
      return meetsThreshold(result, retrievalThreshold);
    })
    .sort((left, right) => {
      if (right.signals.score !== left.signals.score) {
        return right.signals.score - left.signals.score;
      }
      return right.signals.similarity - left.signals.similarity;
    });
  const selectedResults = selectDiverseResults(
    rescoredResults.map(({ result }) => result),
    requestedTopK
  );

  return {
    chunks: selectedResults.map((result) => {
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
