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
    const err =
      typeof data === "object" && data !== null && "error" in data
        ? (data as { error: string }).error
        : text || `Request failed: ${res.status}`;
    throw new Error(err);
  }
  if (data !== null) return data as T;
  return (text ? JSON.parse(text) : null) as T;
}

export async function sendChat(prompt: string) {
  return api<{ reply: string }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}
