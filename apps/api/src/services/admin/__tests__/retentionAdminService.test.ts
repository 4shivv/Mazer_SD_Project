import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../repositories/conversationRepository.js", () => ({
  applyRetentionDaysToAllConversations: vi.fn(),
  deleteConversationsByIds: vi.fn(),
  listAllConversationIds: vi.fn().mockResolvedValue([]),
  listExpiredConversationIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../repositories/messageRepository.js", () => ({
  deleteMessagesByConversationIds: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../../repositories/retentionPolicyRepository.js", () => ({
  computeSelfDestructDate: vi.fn(),
  getEffectiveRetentionDays: vi.fn(),
  normalizeRetentionDays: vi.fn(),
  upsertGlobalRetentionPolicy: vi.fn(),
}));

import { rm } from "node:fs/promises";
import {
  AdminRetentionServiceError,
  wipeStoredData,
} from "../retentionAdminService.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("wipeStoredData", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.ADMIN_WIPE_CONFIRMATION_CODE = "CONFIRM";
    delete process.env.OLLAMA_MODEL_STORAGE_PATHS;
    delete process.env.OLLAMA_CACHE_PATHS;
  });

  it("resets Ollama models and configured cache paths when requested", async () => {
    process.env.OLLAMA_HOST = "http://ollama.local";
    process.env.OLLAMA_MODEL_STORAGE_PATHS = "/models";
    process.env.OLLAMA_CACHE_PATHS = "/cache-a,/cache-b";

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: "llama3.2:3b" }, { name: "nomic-embed-text" }] }),
      })
      .mockResolvedValue({
        ok: true,
        text: async () => "",
      });

    const result = await wipeStoredData({
      confirmationCode: "CONFIRM",
      wipeConversations: false,
      wipeEmbeddings: false,
      wipeModelWeights: true,
    });

    expect(result.status).toBe("completed");
    expect(result.models_deleted).toBe(2);
    expect(result.model_cache_paths_cleared).toBe(3);
    expect(result.deleted_model_names).toEqual(["llama3.2:3b", "nomic-embed-text"]);
    expect(mockFetch).toHaveBeenCalledWith("http://ollama.local/api/tags");
    expect(mockFetch).toHaveBeenCalledWith("http://ollama.local/api/delete", expect.objectContaining({
      method: "DELETE",
    }));
    expect(rm).toHaveBeenCalledTimes(3);
  });

  it("rejects requests with no selected wipe target", async () => {
    await expect(wipeStoredData({
      confirmationCode: "CONFIRM",
      wipeConversations: false,
      wipeEmbeddings: false,
      wipeModelWeights: false,
    })).rejects.toMatchObject({
      status: 400,
      code: "wipe_target_required",
    });
  });

  it("returns partial when model deletion cannot reach Ollama", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"));

    const result = await wipeStoredData({
      confirmationCode: "CONFIRM",
      wipeConversations: false,
      wipeEmbeddings: false,
      wipeModelWeights: true,
    });

    expect(result.status).toBe("partial");
    expect(result.models_deleted).toBe(0);
    expect(result.errors.some((error) => error.includes("ollama_tags_failed"))).toBe(true);
  });
});
