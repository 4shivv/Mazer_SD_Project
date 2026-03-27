export type TextChunk = {
  index: number;
  text: string;
  token_count: number;
  section_header: string | null;
};

export const CHUNK_TOKEN_SIZE = 512;
export const CHUNK_TOKEN_OVERLAP = 50;

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function tokenize(text: string) {
  return normalizeWhitespace(text).split(/\s+/).filter(Boolean);
}

function inferSectionHeader(chunkText: string) {
  const heading = chunkText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#{1,6}\s+/.test(line));

  if (!heading) return null;
  return heading.replace(/^#{1,6}\s+/, "").trim() || null;
}

export function chunkTextForEmbedding(text: string): TextChunk[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];

  const chunks: TextChunk[] = [];
  const step = CHUNK_TOKEN_SIZE - CHUNK_TOKEN_OVERLAP;

  for (let start = 0; start < tokens.length; start += step) {
    const slice = tokens.slice(start, start + CHUNK_TOKEN_SIZE);
    if (slice.length === 0) break;

    const chunkText = slice.join(" ").trim();
    chunks.push({
      index: chunks.length,
      text: chunkText,
      token_count: slice.length,
      section_header: inferSectionHeader(chunkText),
    });

    if (start + CHUNK_TOKEN_SIZE >= tokens.length) break;
  }

  return chunks;
}
