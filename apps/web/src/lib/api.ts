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

    if (typeof data === "object" && data !== null && "error" in data) {
      const val = (data as any).error;
      if (typeof val === "string") errMsg = val;
      else errMsg = JSON.stringify(val);
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
};

export type ConversationMessagesResponse = {
  conversation_id: string;
  messages: ConversationMessage[];
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

export type AdminWipePayload = {
  wipe_conversations?: boolean;
  wipe_embeddings?: boolean;
  confirmation_code: string;
};

export type AdminWipeResponse = {
  status: "completed" | "partial";
  conversations_deleted: number;
  embeddings_deleted: number;
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
  return api<{ reply: string; conversation_id: string }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ prompt, conversation_id: conversationId }),
  });
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
