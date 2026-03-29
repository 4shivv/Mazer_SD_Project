export type TextChunk = {
  index: number;
  text: string;
  token_count: number;
  section_header: string | null;
  page_number: number | null;
};

type ChunkInputPage = {
  page_number: number;
  text: string;
};

type TokenWithContext = {
  text: string;
  page_number: number | null;
  section_header: string | null;
};

export const CHUNK_TOKEN_SIZE = 180;
export const CHUNK_TOKEN_OVERLAP = 30;
export const CHUNK_MAX_CHAR_LENGTH = 2400;

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractHeadingFromLine(line: string) {
  const normalized = line.trim().replace(/\s+/g, " ");
  if (!normalized) return null;

  const markdownHeading = normalized.match(/^#{1,6}\s+(.+)$/);
  if (markdownHeading) {
    return markdownHeading[1]?.trim() || null;
  }

  if (/^\d+(?:\.\d+)*[:.)-]?\s+\S+/.test(normalized)) {
    return normalized;
  }

  if (
    normalized.split(/\s+/).length <= 12
    && /^[A-Z][A-Z0-9\s\-,:()/.]+$/.test(normalized)
  ) {
    return normalized;
  }

  return null;
}

function buildTokenStream(text: string, pages?: ChunkInputPage[]) {
  const segments = pages && pages.length > 0
    ? pages
    : [{ page_number: null as number | null, text }];

  const tokens: TokenWithContext[] = [];
  let activeSectionHeader: string | null = null;

  for (const segment of segments) {
    const normalizedSegment = normalizeWhitespace(segment.text);
    if (!normalizedSegment) continue;

    for (const line of normalizedSegment.split("\n")) {
      const normalizedLine = line.trim();
      if (!normalizedLine) continue;

      const heading = extractHeadingFromLine(normalizedLine);
      if (heading) {
        activeSectionHeader = heading;
      }

      for (const token of normalizedLine.split(/\s+/).filter(Boolean)) {
        tokens.push({
          text: token,
          page_number: segment.page_number,
          section_header: activeSectionHeader,
        });
      }
    }
  }

  return tokens;
}

export function chunkTextForEmbedding(input: string | { text: string; pages?: ChunkInputPage[] }): TextChunk[] {
  const text = typeof input === "string" ? input : input.text;
  const pages = typeof input === "string" ? undefined : input.pages;
  const tokens = buildTokenStream(text, pages);
  if (tokens.length === 0) return [];

  const chunks: TextChunk[] = [];
  const step = CHUNK_TOKEN_SIZE - CHUNK_TOKEN_OVERLAP;

  for (let start = 0; start < tokens.length; start += step) {
    const slice: TokenWithContext[] = [];
    let charLength = 0;

    for (let index = start; index < tokens.length && slice.length < CHUNK_TOKEN_SIZE; index += 1) {
      const nextToken = tokens[index];
      const nextLength = charLength === 0 ? nextToken.text.length : charLength + 1 + nextToken.text.length;

      if (slice.length > 0 && nextLength > CHUNK_MAX_CHAR_LENGTH) {
        break;
      }

      slice.push(nextToken);
      charLength = nextLength;
    }

    if (slice.length === 0) break;

    const chunkText = slice.map((token) => token.text).join(" ").trim();
    chunks.push({
      index: chunks.length,
      text: chunkText,
      token_count: slice.length,
      section_header: slice.find((token) => token.section_header)?.section_header ?? null,
      page_number: slice.find((token) => token.page_number !== null)?.page_number ?? null,
    });

    if (start + CHUNK_TOKEN_SIZE >= tokens.length) break;
  }

  return chunks;
}
