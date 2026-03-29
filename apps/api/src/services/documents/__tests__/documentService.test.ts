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
import { findUserById } from "../../../repositories/userRepository.js";
import { addDocumentsToChroma } from "../chromaClient.js";
import { extractDocumentText } from "../documentParsingService.js";
import { embedTexts } from "../embeddingService.js";
import { chunkTextForEmbedding } from "../textChunking.js";
import { resetDocumentProcessingQueueForTests } from "../documentProcessingQueue.js";
import { uploadDocumentForManager } from "../documentService.js";

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
