const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function sendChat(prompt: string) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error ?? "Chat failed");
  return data as { reply: string };
}
