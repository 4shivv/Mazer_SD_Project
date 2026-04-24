import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("mongoose", () => ({
  default: {
    Types: {
      ObjectId: class {
        toString() {
          return "doc-123";
        }
      },
    },
    isValidObjectId: () => true,
  },
}));

vi.mock("../../../repositories/documentRepository.js", () => ({
  createDocumentRecord: vi.fn(),
  deleteDocumentById: vi.fn(),
  deleteDocumentByIdForInstructor: vi.fn(),
  findDocumentById: vi.fn(),
  findDocumentByIdForInstructor: vi.fn(),
  listAllDocuments: vi.fn(),
  listDocumentsByInstructor: vi.fn(),
  markDocumentFailed: vi.fn(),
  markDocumentReady: vi.fn(),
  updateDocumentStatus: vi.fn(),
}));

vi.mock("../../../repositories/instructorConfigRepository.js", () => ({
  getEffectiveInstructorConfigByUserId: vi.fn(),
  getLatestInstructorConfig: vi.fn().mockResolvedValue({ retrieval_threshold: 0.35 }),
  INSTRUCTOR_CONFIG_DEFAULTS: { retrievalThreshold: 0.35 },
}));

vi.mock("../../../repositories/userRepository.js", () => ({
  findUserById: vi.fn(),
}));

vi.mock("../chromaClient.js", () => ({
  addDocumentsToChroma: vi.fn(),
  deleteDocumentFromChroma: vi.fn(),
  queryChroma: vi.fn(),
  searchChromaByDocumentText: vi.fn().mockResolvedValue([]),
}));

vi.mock("../documentParsingService.js", () => ({
  extractDocumentText: vi.fn(),
}));

vi.mock("../embeddingService.js", () => ({
  embedTexts: vi.fn(),
}));

vi.mock("../textChunking.js", () => ({
  chunkTextForEmbedding: vi.fn(),
}));

import {
  createDocumentRecord,
  findDocumentById,
  markDocumentFailed,
  markDocumentReady,
} from "../../../repositories/documentRepository.js";
import { getLatestInstructorConfig } from "../../../repositories/instructorConfigRepository.js";
import { findUserById } from "../../../repositories/userRepository.js";
import { addDocumentsToChroma, queryChroma, searchChromaByDocumentText } from "../chromaClient.js";
import { extractDocumentText } from "../documentParsingService.js";
import { embedTexts } from "../embeddingService.js";
import { chunkTextForEmbedding } from "../textChunking.js";
import { resetDocumentProcessingQueueForTests } from "../documentProcessingQueue.js";
import { queryKnowledgeBase, uploadDocumentForManager } from "../documentService.js";

describe("uploadDocumentForManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDocumentProcessingQueueForTests();

    vi.mocked(findUserById).mockResolvedValue({
      _id: "instr-1",
      role: "instructor",
      instructorApprovalStatus: "approved",
    } as any);

    vi.mocked(createDocumentRecord).mockResolvedValue({
      _id: "doc-123",
      status: "processing",
      chunk_count: 0,
      storage_key: "doc-123.pdf",
      created_at: new Date().toISOString(),
      title: "EW Fundamentals",
    } as any);

    vi.mocked(findDocumentById).mockResolvedValue({
      _id: "doc-123",
      status: "processing",
    } as any);

    vi.mocked(extractDocumentText).mockResolvedValue({
      text: "sample text",
      pages: null,
    } as any);

    vi.mocked(chunkTextForEmbedding).mockReturnValue([
      { index: 0, text: "chunk 1", token_count: 10, page_number: 1, section_header: "Intro" },
    ] as any);

    vi.mocked(embedTexts).mockResolvedValue([[0.1, 0.2]]);
    vi.mocked(addDocumentsToChroma).mockResolvedValue(undefined as any);
    vi.mocked(markDocumentReady).mockResolvedValue({
      _id: "doc-123",
      status: "ready",
      chunk_count: 1,
    } as any);
  });

  it("returns immediately with processing status and completes work in the background", async () => {
    const response = await uploadDocumentForManager({
      actorUserId: "instr-1",
      filename: "ew.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("file"),
      documentType: "textbook",
    });

    expect(response.status).toBe("processing");
    expect(response.chunks_created).toBe(0);
    expect(markDocumentReady).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(markDocumentReady).toHaveBeenCalledWith({
        documentId: "doc-123",
        chunkCount: 1,
      });
    });
  });

  it("marks the document failed when background processing throws", async () => {
    vi.mocked(embedTexts).mockRejectedValue(new Error("embedding_request_failed_500:boom"));

    await uploadDocumentForManager({
      actorUserId: "instr-1",
      filename: "ew.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("file"),
      documentType: "textbook",
    });

    await vi.waitFor(() => {
      expect(markDocumentFailed).toHaveBeenCalledWith({
        documentId: "doc-123",
        errorMessage: "embedding_request_failed_500:boom",
      });
    });
  });

  it("allows admins to queue uploads as document managers", async () => {
    vi.mocked(findUserById).mockResolvedValueOnce({
      _id: "admin-1",
      role: "admin",
    } as any);

    const response = await uploadDocumentForManager({
      actorUserId: "admin-1",
      filename: "ew.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("file"),
      documentType: "textbook",
    });

    expect(response.status).toBe("processing");
    expect(createDocumentRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadedBy: "admin-1",
      })
    );
  });
});

describe("queryKnowledgeBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestInstructorConfig).mockResolvedValue({ retrieval_threshold: 0.35 } as any);
    vi.mocked(embedTexts).mockResolvedValue([[0.1, 0.2]]);
    vi.mocked(searchChromaByDocumentText).mockResolvedValue([]);
  });

  it("prefers distinct documents when enough relevant results exist", async () => {
    vi.mocked(queryChroma).mockResolvedValue([
      {
        id: "doc-1:0",
        document: "doc 1 first chunk",
        metadata: { document_id: "doc-1", title: "Doc 1", chunk_index: 0 },
        distance: 0.8,
      },
      {
        id: "doc-1:1",
        document: "doc 1 second chunk",
        metadata: { document_id: "doc-1", title: "Doc 1", chunk_index: 1 },
        distance: 0.82,
      },
      {
        id: "doc-2:0",
        document: "doc 2 first chunk",
        metadata: { document_id: "doc-2", title: "Doc 2", chunk_index: 0 },
        distance: 0.84,
      },
    ] as any);

    const result = await queryKnowledgeBase({
      query: "electronic warfare sensors",
      topK: 2,
    });

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks.map((chunk) => (chunk.metadata as any).document_id)).toEqual(["doc-1", "doc-2"]);
  });

  it("prefers exact phrase matches over generic semantic neighbors", async () => {
    vi.mocked(queryChroma).mockResolvedValue([
      {
        id: "doc-generic:0",
        document: "general radar receiver overview and aircraft survival discussion",
        metadata: { document_id: "doc-generic", title: "Generic EW", chunk_index: 0 },
        distance: 0.83,
      },
      {
        id: "doc-northrop:0",
        document: "The Army is also working on a pair of systems called the Terrestrial Layer System.",
        metadata: { document_id: "doc-northrop", title: "Northrop", chunk_index: 0 },
        distance: 0.95,
      },
    ] as any);
    vi.mocked(searchChromaByDocumentText).mockResolvedValue([
      {
        id: "doc-northrop:0",
        document: "The Army is also working on a pair of systems called the Terrestrial Layer System.",
        metadata: { document_id: "doc-northrop", title: "Northrop", chunk_index: 0 },
        distance: null,
      },
    ] as any);

    const result = await queryKnowledgeBase({
      query: "what is the terrestrial layer system",
      topK: 1,
    });

    expect(result.chunks).toHaveLength(1);
    expect((result.chunks[0].metadata as any).document_id).toBe("doc-northrop");
  });

  it("keeps keyword hits when only one document contains the named platform", async () => {
    vi.mocked(queryChroma).mockResolvedValue([
      {
        id: "doc-generic:0",
        document: "general radar equation and emitter identification overview",
        metadata: { document_id: "doc-generic", title: "Generic EW", chunk_index: 0 },
        distance: 0.85,
      },
      {
        id: "doc-northrop:0",
        document: "The program is looking to integrate the platform onto Strykers and AMPVs.",
        metadata: { document_id: "doc-northrop", title: "Northrop", chunk_index: 0 },
        distance: 1.05,
      },
    ] as any);
    vi.mocked(searchChromaByDocumentText).mockResolvedValue([
      {
        id: "doc-northrop:0",
        document: "The program is looking to integrate the platform onto Strykers and AMPVs.",
        metadata: { document_id: "doc-northrop", title: "Northrop", chunk_index: 0 },
        distance: null,
      },
    ] as any);

    const result = await queryKnowledgeBase({
      query: "what is Stryker configuration",
      topK: 1,
    });

    expect(result.chunks).toHaveLength(1);
    expect((result.chunks[0].metadata as any).document_id).toBe("doc-northrop");
  });

  it("prefers table-of-contents chunks for navigation-style chapter queries", async () => {
    vi.mocked(queryChroma).mockResolvedValue([
      {
        id: "doc-generic:7",
        document: "Electronic warfare fundamentals introduces core concepts, threat emitters, and spectrum operations.",
        metadata: { document_id: "doc-generic", title: "Electronic Warfare Fundamentals", chunk_index: 7, page_number: 12 },
        distance: 0.82,
      },
      {
        id: "doc-toc:0",
        document: "Table of Contents\nChapter 1 Introduction\nChapter 2 Electronic Support\nChapter 3 Electronic Attack",
        metadata: {
          document_id: "doc-toc",
          title: "Electronic Warfare Fundamentals",
          section_header: "Table of Contents",
          chunk_index: 0,
          page_number: 1,
        },
        distance: 1.1,
      },
    ] as any);
    vi.mocked(searchChromaByDocumentText).mockResolvedValue([
      {
        id: "doc-toc:0",
        document: "Table of Contents\nChapter 1 Introduction\nChapter 2 Electronic Support\nChapter 3 Electronic Attack",
        metadata: {
          document_id: "doc-toc",
          title: "Electronic Warfare Fundamentals",
          section_header: "Table of Contents",
          chunk_index: 0,
          page_number: 1,
        },
        distance: null,
      },
    ] as any);

    const result = await queryKnowledgeBase({
      query: "ELECTRONIC WARFARE FUNDAMENTALS\nwhats the chapters form table of contents",
      topK: 1,
    });

    expect(result.chunks).toHaveLength(1);
    expect((result.chunks[0].metadata as any).document_id).toBe("doc-toc");
    expect((result.chunks[0].metadata as any).section_header).toBe("Table of Contents");
  });
});
