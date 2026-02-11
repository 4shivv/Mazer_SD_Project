import { Router } from "express";

export const router = Router();

/**
 * POST /api/chat
 * body: { prompt: string, system?: string, model?: string, temperature?: number }
 * returns: { reply: string }
 */
router.post("/chat", async (req, res) => {
  try {
    const { prompt, system, model: requestedModel, temperature = 0.3 } = req.body ?? {};
    // Default to a small, common model; set OLLAMA_MODEL or pull first: ollama pull <model>
    const model = requestedModel || process.env.OLLAMA_MODEL || "llama3.2:3b";
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required (string)" });
    }

    const host = process.env.OLLAMA_HOST || "http://localhost:11434";

    // Optional system prompt (role conditioning). We’ll make this role-aware later.
    const fullPrompt = system
      ? `System:\n${system}\n\nUser:\n${prompt}\n\nAssistant:`
      : prompt;

    // Non-streaming call for now. We'll add SSE streaming in the next step.
    const response = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        options: { temperature },
        stream: false
      })
    });

    if (!response.ok) {
      const text = await response.text();
      let parsed: any = text;
      try {
        parsed = JSON.parse(text);
      } catch {}
      const errMsg = typeof parsed === "object" && parsed?.error ? parsed.error : String(parsed);
      const hint = /not found|unknown model/i.test(errMsg)
        ? ` Model '${model}' may not be pulled. Run: ollama pull ${model}`
        : "";
      return res.status(502).json({ error: `ollama error: ${errMsg}${hint}` });
    }

    const data: any = await response.json();
    return res.json({ reply: data.response ?? "" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "unknown error" });
  }
});
