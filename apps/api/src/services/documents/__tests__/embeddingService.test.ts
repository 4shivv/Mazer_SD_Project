import { beforeEach, describe, expect, it, vi } from "vitest";
import { embedTexts } from "../embeddingService.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("embedTexts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns embedding arrays from Ollama", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      }),
    });

    await expect(embedTexts(["one", "two"])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it("throws when Ollama returns a non-200 response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    });

    await expect(embedTexts(["one"])).rejects.toThrow("embedding_request_failed_500:boom");
  });
});
