const BASE = import.meta.env.VITE_API_BASE_URL || "";

function getUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const base = BASE || "";
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

function toErrorMessage(value: unknown): string {
  if (!value) return "Unknown error";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) {
    const msgs = value.map((v) => toErrorMessage(v)).filter(Boolean);
    return msgs.length > 0 ? msgs.join(", ") : "Unknown error";
  }
  if (typeof value === "object") {
    const maybeObj = value as Record<string, unknown>;

    // Zod-style flatten output: { formErrors: string[], fieldErrors: Record<string, string[]> }
    if (Array.isArray(maybeObj.formErrors) || typeof maybeObj.fieldErrors === "object") {
      const formErrors = Array.isArray(maybeObj.formErrors)
        ? maybeObj.formErrors.map((e) => toErrorMessage(e)).filter(Boolean)
        : [];
      const fieldErrorsRaw = maybeObj.fieldErrors as Record<string, unknown> | undefined;
      const fieldErrors = fieldErrorsRaw
        ? Object.values(fieldErrorsRaw)
            .flatMap((v) => (Array.isArray(v) ? v : [v]))
            .map((e) => toErrorMessage(e))
            .filter(Boolean)
        : [];
      const all = [...formErrors, ...fieldErrors];
      if (all.length > 0) return all.join(", ");
    }

    if (typeof maybeObj.message === "string") return maybeObj.message;
    if (typeof maybeObj.error === "string") return maybeObj.error;
  }
  return String(value);
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
    const errPayload =
      typeof data === "object" && data !== null && "error" in data
        ? (data as { error: unknown }).error
        : data ?? text ?? `Request failed: ${res.status}`;
    throw new Error(toErrorMessage(errPayload));
  }
  if (data !== null) return data as T;
  return (text ? JSON.parse(text) : null) as T;
}

export async function sendChat(prompt: string) {
  return api<{ reply: string; conversationId: string }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export function listConversations() {
  return api<{ conversations: ConversationSummary[] }>("/api/conversations");
}

export function getConversationMessages(conversationId: string) {
  return api<{
    conversation: ConversationSummary;
    messages: ConversationMessage[];
  }>(`/api/conversations/${conversationId}/messages`);
}

export function sendChatWithConversation(prompt: string, conversationId?: string) {
  return api<{ reply: string; conversationId: string }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ prompt, conversationId }),
  });
}
