import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../auth/middleware.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";

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


function buildConversationTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "New Conversation";
  return normalized.slice(0, 72);
}

/**
 * POST /api/chat
 * body: { prompt: string, conversationId?: string, system?: string, model?: string, temperature?: number }
 * returns: { reply: string, conversationId: string }
 */
router.post("/chat", requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Not logged in" });

    const {
      prompt,
      conversationId,
      system,
      model = "llama3:8b",
      temperature = 0.3,
    } = req.body ?? {};
    const effectiveSystem =
      typeof system === "string" && system.trim().length > 0
        ? system.trim()
        : DEFAULT_SYSTEM_PROMPT;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "prompt is required (string)" });
    }

    const cleanPrompt = prompt.trim();
    const userId = req.user.id;
    let conversationDoc;

    if (conversationId !== undefined) {
      if (typeof conversationId !== "string" || !mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ error: "Invalid conversation id" });
      }

      conversationDoc = await Conversation.findOne({
        _id: conversationId,
        userId,
        isArchived: false,
      });

      if (!conversationDoc) {
        return res.status(404).json({ error: "Conversation not found" });
      }
    } else {
      conversationDoc = await Conversation.create({
        userId,
        title: buildConversationTitle(cleanPrompt),
      });
    }

    await Message.create({
      conversationId: conversationDoc._id,
      userId,
      role: "user",
      content: cleanPrompt,
    });

    const host = process.env.OLLAMA_HOST || "http://localhost:11434";

    // Optional system prompt (role conditioning). We’ll make this role-aware later.
    const fullPrompt = `System:\n${effectiveSystem}\n\nUser:\n${cleanPrompt}\n\nAssistant:`;


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
    const reply = typeof data?.response === "string" ? data.response : "";

    await Message.create({
      conversationId: conversationDoc._id,
      userId,
      role: "assistant",
      content: reply,
    });

    await Conversation.updateOne(
      { _id: conversationDoc._id },
      { $set: { updatedAt: new Date() } }
    );

    return res.json({
      reply,
      conversationId: String(conversationDoc._id),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "unknown error" });
  }
});
