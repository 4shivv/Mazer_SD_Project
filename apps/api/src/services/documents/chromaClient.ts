const CHROMA_HOST = process.env.CHROMA_HOST || "http://localhost:8000";
const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION || "ew_training_materials";
const CHROMA_TENANT = process.env.CHROMA_TENANT || "default_tenant";
const CHROMA_DATABASE = process.env.CHROMA_DATABASE || "default_database";
const CHROMA_HEADERS = { "Content-Type": "application/json" };
const CHROMA_BASE_PATH = `${CHROMA_HOST}/api/v2/tenants/${encodeURIComponent(CHROMA_TENANT)}/databases/${encodeURIComponent(CHROMA_DATABASE)}`;

type ChromaCollection = {
  id: string;
  name: string;
};

export type ChromaDocumentRecord = {
  id: string;
  document: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

export type ChromaQueryResult = {
  id: string;
  document: string;
  metadata: Record<string, unknown>;
  distance: number | null;
};

let cachedCollectionId: string | null = null;

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`chroma_request_failed_${response.status}:${body}`);
  }
  return response.json() as Promise<T>;
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value === null || typeof value === "undefined") return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map((item) => sanitizeMetadataValue(item))
      .filter((item): item is string | number | boolean => typeof item !== "undefined");
    return sanitizedItems;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, sanitizeMetadataValue(item)] as const)
      .filter((entry): entry is readonly [string, unknown] => typeof entry[1] !== "undefined");
    return Object.fromEntries(entries);
  }
  return String(value);
}

function sanitizeMetadataRecord(metadata: Record<string, unknown>) {
  return sanitizeMetadataValue(metadata) as Record<string, unknown>;
}

async function ensureCollection(): Promise<ChromaCollection> {
  if (cachedCollectionId) {
    return {
      id: cachedCollectionId,
      name: CHROMA_COLLECTION,
    };
  }

  const response = await fetch(`${CHROMA_BASE_PATH}/collections`, {
    method: "POST",
    headers: CHROMA_HEADERS,
    body: JSON.stringify({
      name: CHROMA_COLLECTION,
      get_or_create: true,
    }),
  });

  const collection = await parseJsonResponse<ChromaCollection>(response);
  cachedCollectionId = collection.id;
  return collection;
}

export async function addDocumentsToChroma(records: ChromaDocumentRecord[]) {
  if (records.length === 0) return;
  const collection = await ensureCollection();

  const response = await fetch(`${CHROMA_BASE_PATH}/collections/${collection.id}/add`, {
    method: "POST",
    headers: CHROMA_HEADERS,
    body: JSON.stringify({
      ids: records.map((record) => record.id),
      documents: records.map((record) => record.document),
      embeddings: records.map((record) => record.embedding),
      metadatas: records.map((record) => sanitizeMetadataRecord(record.metadata)),
    }),
  });

  await parseJsonResponse<unknown>(response);
}

export async function deleteDocumentFromChroma(args: { documentId: string }) {
  const collection = await ensureCollection();
  const response = await fetch(`${CHROMA_BASE_PATH}/collections/${collection.id}/delete`, {
    method: "POST",
    headers: CHROMA_HEADERS,
    body: JSON.stringify({
      where: {
        document_id: args.documentId,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`chroma_delete_failed_${response.status}:${body}`);
  }
}

export async function queryChroma(args: {
  queryEmbedding: number[];
  topK: number;
  where?: Record<string, unknown>;
}): Promise<ChromaQueryResult[]> {
  const collection = await ensureCollection();
  const response = await fetch(`${CHROMA_BASE_PATH}/collections/${collection.id}/query`, {
    method: "POST",
    headers: CHROMA_HEADERS,
    body: JSON.stringify({
      query_embeddings: [args.queryEmbedding],
      n_results: args.topK,
      where: args.where,
      include: ["documents", "metadatas", "distances"],
    }),
  });

  const payload = await parseJsonResponse<{
    ids?: string[][];
    documents?: string[][];
    metadatas?: Record<string, unknown>[][];
    distances?: number[][];
  }>(response);

  const ids = payload.ids?.[0] ?? [];
  const documents = payload.documents?.[0] ?? [];
  const metadatas = payload.metadatas?.[0] ?? [];
  const distances = payload.distances?.[0] ?? [];

  return ids.map((id, index) => ({
    id,
    document: documents[index] ?? "",
    metadata: metadatas[index] ?? {},
    distance: typeof distances[index] === "number" ? distances[index] : null,
  }));
}
