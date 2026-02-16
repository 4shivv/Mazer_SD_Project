import { Router } from "express";

export const router = Router();

const DEFAULT_SYSTEM_PROMPT = `
You are the MAZER EW Training Assistant for adult military trainees and instructors.

Communication style:
- Professional, direct, and comprehensive.
- Do not use filler or try to keep the conversation going.
- Prefer short paragraphs and bullet points for action steps.
- Ask clarifying questions only when needed; ask at most 4.

Behavior:
- If the user asks a troubleshooting question (e.g., weak signal, comms issues), give likely causes first, then prioritized steps.
- Incorporate situational context when relevant: terrain/line-of-sight, weather, distance, movement, interference, antenna/equipment/power/settings.
- If the user references a PDF/textbook page or concept, explain clearly with a brief summary, key terms, and a practical example.
- If information is missing, ask targeted questions to proceed. Otherwise, answer directly.

Safety:
- Provide educational and operationally relevant guidance, but avoid sensitive tactical instructions. When uncertain, stay high-level and recommend consulting official procedures.
`.trim();


/**
 * POST /api/chat
 * body: { prompt: string, system?: string, model?: string, temperature?: number }
 * returns: { reply: string }
 */
router.post("/chat", async (req, res) => {
  try {
    const { prompt, system, model = "llama3:8b", temperature = 0.3 } = req.body ?? {};
    const effectiveSystem =
      typeof system === "string" && system.trim().length > 0
        ? system.trim()
        : DEFAULT_SYSTEM_PROMPT;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required (string)" });
    }

    const host = process.env.OLLAMA_HOST || "http://localhost:11434";

    // Optional system prompt (role conditioning). We’ll make this role-aware later.
    const fullPrompt = `System:\n${effectiveSystem}\n\nUser:\n${prompt}\n\nAssistant:`;


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
      return res.status(502).json({ error: `ollama error: ${text}` });
    }

    const data: any = await response.json();
    return res.json({ reply: data.response ?? "" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "unknown error" });
  }
});
