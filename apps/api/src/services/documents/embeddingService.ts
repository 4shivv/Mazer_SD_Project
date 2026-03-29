const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const EMBED_BATCH_SIZE = 8;

function parseEmbeddingPayload(payload: any) {
  if (Array.isArray(payload?.embeddings)) {
    return payload.embeddings as number[][];
  }
  if (Array.isArray(payload?.embedding)) {
    return [payload.embedding as number[]];
  }
  throw new Error("embedding_response_invalid");
}

async function requestEmbeddings(texts: string[]) {
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
  return parseEmbeddingPayload(payload);
}

export async function embedTexts(texts: string[]) {
  if (texts.length === 0) return [];

  const allEmbeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    const embeddings = await requestEmbeddings(batch);

    if (embeddings.length !== batch.length) {
      throw new Error("embedding_count_mismatch");
    }

    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}
