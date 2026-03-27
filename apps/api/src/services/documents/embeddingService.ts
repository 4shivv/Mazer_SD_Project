const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

function parseEmbeddingPayload(payload: any) {
  if (Array.isArray(payload?.embeddings)) {
    return payload.embeddings as number[][];
  }
  if (Array.isArray(payload?.embedding)) {
    return [payload.embedding as number[]];
  }
  throw new Error("embedding_response_invalid");
}

export async function embedTexts(texts: string[]) {
  if (texts.length === 0) return [];

  const response = await fetch(`${OLLAMA_HOST}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_EMBED_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`embedding_request_failed_${response.status}:${body}`);
  }

  const payload = await response.json();
  const embeddings = parseEmbeddingPayload(payload);

  if (embeddings.length !== texts.length) {
    throw new Error("embedding_count_mismatch");
  }

  return embeddings;
}
