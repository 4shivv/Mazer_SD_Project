import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { capacityGate } from "../middleware/capacityGate.js";
import { thermalGate } from "../middleware/thermalGate.js";
import {
  ChatHistoryServiceError,
  createConversationForUser,
  getConversationMessagesForUser,
  listConversationsForUser,
  persistChatExchange,
  resolveConversationForChat,
} from "../services/chat/chatHistoryService.js";

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

const CreateConversationSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
});

const ListConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const ChatSchema = z.object({
  conversation_id: z.string().min(1).optional(),
  prompt: z.string().trim().min(1),
  system: z.string().optional(),
  model: z.string().trim().min(1).optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
});

router.post("/conversations", requireAuth, async (req, res) => {
  const parsed = CreateConversationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const created = await createConversationForUser({
      userId: req.user!.id,
      title: parsed.data.title,
    });
    return res.status(201).json(created);
  } catch (error) {
    if (error instanceof ChatHistoryServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "conversation_create_failed" });
  }
});

router.get("/conversations", requireAuth, async (req, res) => {
  const parsed = ListConversationsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const list = await listConversationsForUser({
      userId: req.user!.id,
      page: parsed.data.page ?? 1,
      limit: parsed.data.limit ?? 20,
    });
    return res.json(list);
  } catch (error) {
    if (error instanceof ChatHistoryServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "conversation_list_failed" });
  }
});

router.get("/conversations/:id/messages", requireAuth, async (req, res) => {
  const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!conversationId) return res.status(400).json({ error: "conversation_id_required" });

  try {
    const messages = await getConversationMessagesForUser({
      userId: req.user!.id,
      conversationId,
    });
    return res.json(messages);
  } catch (error) {
    if (error instanceof ChatHistoryServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "conversation_messages_failed" });
  }
});

/**
 * POST /api/chat
 * body: { conversation_id?: string, prompt: string, system?: string, model?: string, temperature?: number }
 * returns: { reply: string, conversation_id: string }
 */
router.post("/chat", requireAuth, capacityGate, thermalGate, async (req, res) => {
  const parsed = ChatSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { conversation_id, prompt, system, model = "llama3:8b", temperature = 0.3 } = parsed.data;
    const effectiveSystem =
      typeof system === "string" && system.trim().length > 0
        ? system.trim()
        : DEFAULT_SYSTEM_PROMPT;
    const conversation = await resolveConversationForChat({
      userId: req.user!.id,
      conversationId: conversation_id,
    });

    const host = process.env.OLLAMA_HOST || "http://localhost:11434";

    const fullPrompt = `System:\n${effectiveSystem}\n\nUser:\n${prompt}\n\nAssistant:`;

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
    const reply = data.response ?? "";

    await persistChatExchange({
      userId: req.user!.id,
      conversationId: conversation.conversationId,
      userPrompt: prompt,
      assistantReply: reply,
    });

    return res.json({
      reply,
      conversation_id: conversation.conversationId,
    });
  } catch (err: any) {
    if (err instanceof ChatHistoryServiceError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    return res.status(500).json({ error: err?.message ?? "unknown error" });
  }
});
