const BASE = import.meta.env.VITE_API_BASE_URL || "";

function getUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const base = BASE || "";
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

/** Shared API client: JSON, credentials, safe error handling. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(getUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> || {}),
    },
    credentials: "include",
  });

  const text = await res.text();
  let data: unknown = null;
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  if (text && isJson) {
    try {
      data = JSON.parse(text);
    } catch {
      // use fallback below
    }
  }

  if (!res.ok) {
    let errMsg = text || `Request failed: ${res.status}`;

    if (typeof data === "object" && data !== null) {
      const message = "message" in data ? (data as any).message : undefined;
      const error = "error" in data ? (data as any).error : undefined;

      if (typeof message === "string" && message.trim()) {
        errMsg = message;
      } else if (typeof error === "string") {
        errMsg = error;
      } else if (typeof error !== "undefined") {
        errMsg = JSON.stringify(error);
      }
    }

    throw new Error(errMsg);
  }
  if (data !== null) return data as T;
  return (text ? JSON.parse(text) : null) as T;
}

export type ConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  last_message_at: string;
  message_count: number;
  self_destruct_date: string | null;
};

export type ConversationListResponse = {
  conversations: ConversationSummary[];
  total: number;
  page: number;
  limit: number;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  metadata?: unknown;
};

export type ConversationMessagesResponse = {
  conversation_id: string;
  messages: ConversationMessage[];
};

export type SourceReference = {
  label: string;
  document_id: string | null;
  title: string | null;
  source_file: string | null;
  page_number: number | null;
  section_header: string | null;
  document_type: string | null;
  similarity_score: number | null;
  chunk_index: number | null;
};

export type ChatResponse = {
  reply: string;
  conversation_id: string;
  rag_sources?: string[];
  rag_source_details?: SourceReference[];
  rag_chunks_used?: number;
  model_used?: string;
  inference_time_ms?: number;
  token_count?: number;
  context_messages_used?: number;
  context_token_estimate?: number;
  context_messages_dropped?: number;
  warning?: string | null;
};

export type CreateConversationResponse = {
  conversation_id: string;
  title: string;
  created_at: string;
};

export type InstructorConfig = {
  personality_prompt: string;
  temperature: number;
  max_tokens: number;
  retrieval_threshold: number;
  updated_at: string | null;
};

export type InstructorConfigResponse = {
  config: InstructorConfig;
};

export type InstructorConfigUpdateResponse = {
  config_updated: true;
  config: InstructorConfig;
};

export type UpdateInstructorConfigPayload = Partial<Pick<
  InstructorConfig,
  "personality_prompt" | "temperature" | "max_tokens" | "retrieval_threshold"
>>;

export type RetentionPolicyUpdatePayload = {
  default_retention_days: number;
  apply_to_existing?: boolean;
};

export type RetentionPolicyUpdateResponse = {
  policy_updated: true;
  conversations_affected: number;
  default_retention_days: number;
};

export type KnowledgeBaseDocument = {
  id: string;
  title: string;
  original_filename: string;
  document_type: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
  processing_error: string | null;
};

export type ListDocumentsResponse = {
  documents: KnowledgeBaseDocument[];
};

export type UploadDocumentResponse = {
  document_id: string;
  status: string;
  chunks_created: number;
  estimated_completion_seconds: number;
};

export type DeleteDocumentResponse = {
  document_id: string;
  chunks_deleted: number;
  status: "deleted";
};

export type QueryDocumentChunk = {
  text: string;
  metadata: Record<string, unknown>;
  source?: SourceReference;
};

export type QueryDocumentsResponse = {
  chunks: QueryDocumentChunk[];
};

export type AdminWipePayload = {
  wipe_conversations?: boolean;
  wipe_embeddings?: boolean;
  wipe_model_weights?: boolean;
  confirmation_code: string;
};

export type AdminWipeResponse = {
  status: "completed" | "partial";
  conversations_deleted: number;
  embeddings_deleted: number;
  models_deleted: number;
  model_cache_paths_cleared: number;
  deleted_model_names: string[];
  storage_freed_gb: number;
  wipe_audit: unknown;
  errors: string[];
};

export async function createConversation(title = "New chat") {
  return api<CreateConversationResponse>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function listConversations(page = 1, limit = 20) {
  const q = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return api<ConversationListResponse>(`/api/conversations?${q.toString()}`);
}

export async function getConversationMessages(conversationId: string) {
  return api<ConversationMessagesResponse>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
}

export async function sendChat(prompt: string, conversationId: string) {
  return api<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ prompt, conversation_id: conversationId }),
  });
}

type ChatStreamHandlers = {
  onStart?: (payload: Partial<ChatResponse>) => void;
  onToken?: (token: string) => void;
  onComplete?: (payload: ChatResponse) => void;
  onError?: (message: string) => void;
};

export async function sendChatStream(
  prompt: string,
  conversationId: string,
  handlers: ChatStreamHandlers = {}
): Promise<ChatResponse> {
  const res = await fetch(getUrl("/api/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ prompt, conversation_id: conversationId, stream: true }),
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {}

    let errMsg = text || `Request failed: ${res.status}`;
    if (typeof data === "object" && data !== null) {
      const message = "message" in data ? (data as any).message : undefined;
      const error = "error" in data ? (data as any).error : undefined;
      if (typeof message === "string" && message.trim()) {
        errMsg = message;
      } else if (typeof error === "string") {
        errMsg = error;
      } else if (typeof error !== "undefined") {
        errMsg = JSON.stringify(error);
      }
    }

    throw new Error(errMsg);
  }

  if (!res.body) {
    throw new Error("Streaming not supported by this browser");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let eventData: string[] = [];
  let finalPayload: ChatResponse | null = null;

  const dispatchEvent = () => {
    if (eventData.length === 0) {
      eventName = "message";
      return;
    }

    const raw = eventData.join("\n");
    eventData = [];

    let payload: any = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    if (eventName === "start") {
      handlers.onStart?.(payload);
    } else if (eventName === "token" && typeof payload.text === "string") {
      handlers.onToken?.(payload.text);
    } else if (eventName === "complete") {
      finalPayload = payload as ChatResponse;
      handlers.onComplete?.(finalPayload);
    } else if (eventName === "error") {
      const message = typeof payload.error === "string" ? payload.error : "Streaming failed";
      handlers.onError?.(message);
      throw new Error(message);
    }

    eventName = "message";
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const line = rawLine.replace(/\r$/, "");

      if (!line) {
        dispatchEvent();
      } else if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim() || "message";
      } else if (line.startsWith("data:")) {
        eventData.push(line.slice("data:".length).trimStart());
      }

      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      if (buffer.trim()) {
        const trailingLine = buffer.replace(/\r$/, "");
        if (trailingLine.startsWith("data:")) {
          eventData.push(trailingLine.slice("data:".length).trimStart());
        }
      }
      dispatchEvent();
      break;
    }
  }

  if (!finalPayload) {
    throw new Error("Stream ended without completion");
  }

  return finalPayload as ChatResponse;
}

export async function getInstructorConfig() {
  return api<InstructorConfigResponse>("/api/instructor/config");
}

export async function updateInstructorConfig(payload: UpdateInstructorConfigPayload) {
  return api<InstructorConfigUpdateResponse>("/api/instructor/config", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateRetentionPolicy(payload: RetentionPolicyUpdatePayload) {
  return api<RetentionPolicyUpdateResponse>("/api/admin/retention-policy", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function runAdminWipe(payload: AdminWipePayload) {
  return api<AdminWipeResponse>("/api/admin/wipe", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listDocuments() {
  return api<ListDocumentsResponse>("/api/documents");
}

export async function listAvailableDocuments() {
  return api<ListDocumentsResponse>("/api/documents/library");
}

export async function deleteDocument(documentId: string) {
  return api<DeleteDocumentResponse>(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
}

export async function queryDocuments(query: string, topK = 3, documentType?: string | string[]) {
  const params = new URLSearchParams({
    query,
    top_k: String(topK),
  });

  if (Array.isArray(documentType)) {
    for (const value of documentType) {
      params.append("document_type", value);
    }
  } else if (documentType) {
    params.append("document_type", documentType);
  }

  return api<QueryDocumentsResponse>(`/api/documents/query?${params.toString()}`);
}

export async function uploadDocument(args: {
  file: File;
  documentType: string;
  title?: string;
  metadata?: Record<string, unknown>;
}) {
  const form = new FormData();
  form.append("file", args.file);
  form.append("document_type", args.documentType);
  if (args.title?.trim()) form.append("title", args.title.trim());
  if (args.metadata && Object.keys(args.metadata).length > 0) {
    form.append("metadata", JSON.stringify(args.metadata));
  }

  const res = await fetch(getUrl("/api/documents/upload"), {
    method: "POST",
    body: form,
    credentials: "include",
  });

  const text = await res.text();
  let data: unknown = null;
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  if (text && isJson) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    let errMsg = text || `Request failed: ${res.status}`;
    if (typeof data === "object" && data !== null && "error" in data) {
      const value = (data as any).error;
      errMsg = typeof value === "string" ? value : JSON.stringify(value);
    }
    throw new Error(errMsg);
  }

  return (data ?? null) as UploadDocumentResponse;
}
