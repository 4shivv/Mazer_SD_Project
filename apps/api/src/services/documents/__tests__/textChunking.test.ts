import { describe, expect, it } from "vitest";
import { CHUNK_TOKEN_OVERLAP, CHUNK_TOKEN_SIZE, chunkTextForEmbedding } from "../textChunking.js";

describe("chunkTextForEmbedding", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkTextForEmbedding("")).toEqual([]);
  });

  it("creates overlapping chunks with the configured window", () => {
    const source = Array.from({ length: CHUNK_TOKEN_SIZE + 100 }, (_, index) => `tok${index}`).join(" ");
    const chunks = chunkTextForEmbedding(source);

    expect(chunks.length).toBe(2);
    expect(chunks[0]?.token_count).toBe(CHUNK_TOKEN_SIZE);
    expect(chunks[1]?.text.split(" ").slice(0, CHUNK_TOKEN_OVERLAP)).toEqual(
      chunks[0]?.text.split(" ").slice(CHUNK_TOKEN_SIZE - CHUNK_TOKEN_OVERLAP)
    );
  });
});
