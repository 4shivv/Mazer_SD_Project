import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { capacityGate } from "../middleware/capacityGate.js";
import { thermalGate } from "../middleware/thermalGate.js";
import {
  ChatHistoryServiceError,
  createConversationForUser,
  deleteConversationForUser,
  getConversationMessagesForUser,
  getConversationPromptContextForUser,
  listConversationsForUser,
  MAX_CONVERSATION_CONTEXT_TOKENS,
  persistChatExchange,
  renameConversationForUser,
  resolveConversationForChat,
} from "../services/chat/chatHistoryService.js";
import {
  DocumentServiceError,
  queryKnowledgeBase,
  toSourceReference,
  type SourceReference,
} from "../services/documents/documentService.js";
import { resolveInstructorConfigForChatActor } from "../services/instructor/instructorConfigService.js";
import { ModelPolicyError, resolveChatModel } from "../runtime/modelPolicy.js";

export const router = Router();

function isMongoNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return (
    name === "MongoNetworkError"
    || name === "MongoServerSelectionError"
    || name === "MongooseServerSelectionError"
  );
}

function respondDatabaseUnavailable(res: Response) {
  return res.status(503).json({
    error: "database_unavailable",
    message: "Database temporarily unavailable. Please retry shortly.",
    retry_after_seconds: 10,
  });
}

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

const UpdateConversationSchema = z.object({
  title: z.string().trim().min(1).max(160),
});

const ChatSchema = z.object({
  conversation_id: z.string().min(1).optional(),
  prompt: z.string().trim().min(1),
  system: z.string().optional(),
  model: z.string().trim().min(1).optional(),
  temperature: z.coerce.number().min(0).max(1).optional(),
  enable_rag: z.coerce.boolean().optional(),
  max_rag_chunks: z.coerce.number().int().min(1).max(10).optional(),
  stream: z.coerce.boolean().optional(),
});

function buildConfiguredSystemPrompt(personalityPrompt: string) {
  const trimmed = personalityPrompt.trim();
  if (!trimmed) return DEFAULT_SYSTEM_PROMPT;
  return `${DEFAULT_SYSTEM_PROMPT}\n\nInstructor response guidelines:\n${trimmed}`;
}

function inferPreferredDocumentTypes(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (
    normalized.includes("ew101")
    || normalized.includes("ew102")
    || normalized.includes("textbook")
    || normalized.includes("chapter")
    || normalized.includes("page ")
  ) {
    return ["textbook"];
  }
  return undefined;
}

function buildSourceLabel(metadata: Record<string, unknown>) {
  return toSourceReference(metadata).label;
}

function buildRagPromptSection(chunks: Array<{ text: string; metadata: Record<string, unknown> }>) {
  if (chunks.length === 0) return "";
  const serialized = chunks
    .map((chunk, index) => {
      const source = buildSourceLabel(chunk.metadata);
      return `[Source ${index + 1}: ${source}]\n${chunk.text}`;
    })
    .join("\n\n");

  return [
    "",
    "Approved reference material:",
    serialized,
    "",
    "Use the reference material when it is relevant. Cite supporting sources inline and keep claims grounded in the approved material.",
  ].join("\n");
}

function buildConversationContextSection(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  if (messages.length === 0) return "";
  const transcript = messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}:\n${message.content}`)
    .join("\n\n");

  return [
    "",
    "Recent conversation context:",
    transcript,
  ].join("\n");
}

function buildRetrievalQuery(
  contextMessages: Array<{ role: "user" | "assistant"; content: string }>,
  currentPrompt: string
) {
  const relevantHistory = contextMessages
    .filter((message) => message.role === "user")
    .slice(-2)
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n");

  return relevantHistory
    ? `${relevantHistory}\n${currentPrompt}`
    : currentPrompt;
}

function appendCitationFooter(reply: string, ragSources: string[]) {
  if (ragSources.length === 0) return reply;
  if (/^sources:/im.test(reply) || /\(source:/i.test(reply)) return reply;
  return `${reply.trim()}\n\nSources: ${ragSources.join(", ")}`;
}

function writeSseEvent(
  res: Response,
  event: string,
  payload: Record<string, unknown>
) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

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
    if (isMongoNetworkError(error)) return respondDatabaseUnavailable(res);
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
    if (isMongoNetworkError(error)) return respondDatabaseUnavailable(res);
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
    if (isMongoNetworkError(error)) return respondDatabaseUnavailable(res);
    if (error instanceof ChatHistoryServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "conversation_messages_failed" });
  }
});

router.patch("/conversations/:id", requireAuth, async (req, res) => {
  const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!conversationId) return res.status(400).json({ error: "conversation_id_required" });

  const parsed = UpdateConversationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const updated = await renameConversationForUser({
      userId: req.user!.id,
      conversationId,
      title: parsed.data.title,
    });
    return res.json(updated);
  } catch (error) {
    if (isMongoNetworkError(error)) return respondDatabaseUnavailable(res);
    if (error instanceof ChatHistoryServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "conversation_update_failed" });
  }
});

router.delete("/conversations/:id", requireAuth, async (req, res) => {
  const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!conversationId) return res.status(400).json({ error: "conversation_id_required" });

  try {
    await deleteConversationForUser({
      userId: req.user!.id,
      conversationId,
    });
    return res.status(204).send();
  } catch (error) {
    if (isMongoNetworkError(error)) return respondDatabaseUnavailable(res);
    if (error instanceof ChatHistoryServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "conversation_delete_failed" });
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
    const {
      conversation_id,
      prompt,
      system,
      model: requestedModel,
      enable_rag = true,
      max_rag_chunks = 5,
      stream = false,
    } = parsed.data;
    const model = resolveChatModel(requestedModel);
    const chatConfig = await resolveInstructorConfigForChatActor({
      actorUserId: req.user!.id,
    });
    const temperature = parsed.data.temperature ?? chatConfig.config.temperature;
    const maxTokens = chatConfig.config.max_tokens;
    const effectiveSystem =
      typeof system === "string" && system.trim().length > 0
        ? system.trim()
        : buildConfiguredSystemPrompt(chatConfig.config.personality_prompt);
    const conversation = await resolveConversationForChat({
      userId: req.user!.id,
      conversationId: conversation_id,
    });
    const promptContext = await getConversationPromptContextForUser({
      userId: req.user!.id,
      conversationId: conversation.conversationId,
      currentPrompt: prompt,
      maxTokens: MAX_CONVERSATION_CONTEXT_TOKENS,
    });

    const host = process.env.OLLAMA_HOST || "http://localhost:11434";
    const inferenceStartedAt = Date.now();

    let ragChunks: Array<{ text: string; metadata: Record<string, unknown> }> = [];
    let ragWarning: string | null = null;
    if (enable_rag) {
      try {
        const ragResult = await queryKnowledgeBase({
          actorUserId: req.user!.id,
          query: buildRetrievalQuery(promptContext.messages, prompt),
          topK: max_rag_chunks,
          documentTypes: inferPreferredDocumentTypes(prompt),
        });
        ragChunks = ragResult.chunks.map((chunk) => ({
          text: chunk.text,
          metadata: (chunk.metadata ?? {}) as Record<string, unknown>,
        }));
      } catch (error) {
        if (error instanceof DocumentServiceError) {
          const isRecoverableRagFailure =
            error.code === "vector_store_request_failed" || error.code === "embedding_request_failed";
          if (!isRecoverableRagFailure) throw error;
          ragWarning = "rag_unavailable";
        } else {
          throw error;
        }
      }
    }

    const ragPromptSection = buildRagPromptSection(ragChunks);
    const conversationContextSection = buildConversationContextSection(promptContext.messages);
    const fullPrompt = `System:\n${effectiveSystem}${ragPromptSection}${conversationContextSection}\n\nUser:\n${prompt}\n\nAssistant:`;
    const ragSourceDetails = Array.from(new Map(
      ragChunks.map((chunk) => {
        const source = toSourceReference(chunk.metadata);
        return [`${source.document_id ?? "unknown"}:${source.chunk_index ?? "unknown"}`, source];
      })
    ).values()) as SourceReference[];
    const ragSources = Array.from(new Set(ragSourceDetails.map((source) => source.label)));

    if (stream) {
      const generationController = new AbortController();
      let clientDisconnected = false;
      const abortGeneration = () => {
        if (clientDisconnected) return;
        clientDisconnected = true;
        generationController.abort();
      };

      const response = await fetch(`${host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: fullPrompt,
          options: { temperature, num_predict: maxTokens },
          stream: true
        }),
        signal: generationController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        let parsedError: any = text;
        try {
          parsedError = JSON.parse(text);
        } catch {}
        const errMsg = typeof parsedError === "object" && parsedError?.error ? parsedError.error : String(parsedError);
        const hint = /not found|unknown model/i.test(errMsg)
          ? ` Model '${model}' may not be pulled. Run: ollama pull ${model}`
          : "";
        return res.status(502).json({ error: `ollama error: ${errMsg}${hint}` });
      }

      if (!response.body) {
        return res.status(502).json({ error: "ollama_stream_unavailable" });
      }

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      req.on("aborted", abortGeneration);
      res.on("close", abortGeneration);

      writeSseEvent(res, "start", {
        conversation_id: conversation.conversationId,
        rag_sources: ragSources,
        rag_source_details: ragSourceDetails,
        rag_chunks_used: ragChunks.length,
        model_used: model,
        warning: ragWarning,
      });

      // If Ollama is cold-starting the model, the first token can take 10–30 seconds.
      // Emit a single "status" SSE event after 2s so the client can show a warming-up
      // hint instead of staring at an empty stream.
      let sawFirstToken = false;
      const warmingTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (!sawFirstToken && !clientDisconnected) {
          writeSseEvent(res, "status", {
            message: "Model is warming up. First token may take ~20 seconds...",
          });
        }
      }, 2000);
      const clearWarmingTimer = () => {
        if (warmingTimer) clearTimeout(warmingTimer);
      };
      res.on("close", clearWarmingTimer);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let rawReply = "";

      const processOllamaLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return false;

        let parsedLine: any;
        try {
          parsedLine = JSON.parse(trimmed);
        } catch {
          return false;
        }

        const token = typeof parsedLine.response === "string" ? parsedLine.response : "";
        if (token) {
          if (!sawFirstToken) {
            sawFirstToken = true;
            clearWarmingTimer();
          }
          rawReply += token;
          writeSseEvent(res, "token", { text: token });
        }

        return Boolean(parsedLine.done);
      };

      try {
        let finished = false;

        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let lineBreakIndex = buffer.indexOf("\n");
          while (lineBreakIndex >= 0) {
            const line = buffer.slice(0, lineBreakIndex);
            buffer = buffer.slice(lineBreakIndex + 1);
            finished = processOllamaLine(line);
            if (finished) break;
            lineBreakIndex = buffer.indexOf("\n");
          }
        }

        buffer += decoder.decode();
        if (!finished && buffer.trim()) {
          processOllamaLine(buffer);
        }

        if (clientDisconnected) {
          return;
        }

        const reply = appendCitationFooter(rawReply, ragSources);
        const inferenceTimeMs = Date.now() - inferenceStartedAt;
        const tokenCount = reply.trim() ? reply.trim().split(/\s+/).length : 0;

        await persistChatExchange({
          userId: req.user!.id,
          conversationId: conversation.conversationId,
          userPrompt: prompt,
          assistantReply: reply,
          assistantMetadata: {
            model_used: model,
            rag_sources: ragSources,
            rag_source_details: ragSourceDetails,
            rag_chunks_used: ragChunks.length,
            inference_time_ms: inferenceTimeMs,
            token_count: tokenCount,
            context_messages_used: promptContext.messages.length,
            context_token_estimate: promptContext.approx_token_count,
            context_messages_dropped: promptContext.dropped_message_count,
            instructor_config_source: chatConfig.source,
            warning: ragWarning,
          },
        });

        writeSseEvent(res, "complete", {
          reply,
          conversation_id: conversation.conversationId,
          rag_sources: ragSources,
          rag_source_details: ragSourceDetails,
          rag_chunks_used: ragChunks.length,
          model_used: model,
          inference_time_ms: inferenceTimeMs,
          token_count: tokenCount,
          context_messages_used: promptContext.messages.length,
          context_token_estimate: promptContext.approx_token_count,
          context_messages_dropped: promptContext.dropped_message_count,
          warning: ragWarning,
        });

        return res.end();
      } catch (err: any) {
        if (clientDisconnected) {
          return;
        }

        writeSseEvent(res, "error", { error: err?.message ?? "streaming_failed" });
        return res.end();
      } finally {
        req.off("aborted", abortGeneration);
        res.off("close", abortGeneration);
      }
    }

    const response = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        options: { temperature, num_predict: maxTokens },
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
    const rawReply = data.response ?? "";
    const reply = appendCitationFooter(rawReply, ragSources);
    const inferenceTimeMs = Date.now() - inferenceStartedAt;
    const tokenCount = reply.trim() ? reply.trim().split(/\s+/).length : 0;

    await persistChatExchange({
      userId: req.user!.id,
      conversationId: conversation.conversationId,
      userPrompt: prompt,
      assistantReply: reply,
      assistantMetadata: {
        model_used: model,
        rag_sources: ragSources,
        rag_source_details: ragSourceDetails,
        rag_chunks_used: ragChunks.length,
        inference_time_ms: inferenceTimeMs,
        token_count: tokenCount,
        context_messages_used: promptContext.messages.length,
        context_token_estimate: promptContext.approx_token_count,
        context_messages_dropped: promptContext.dropped_message_count,
        instructor_config_source: chatConfig.source,
        warning: ragWarning,
      },
    });

    return res.json({
      reply,
      conversation_id: conversation.conversationId,
      rag_sources: ragSources,
      rag_source_details: ragSourceDetails,
      rag_chunks_used: ragChunks.length,
      model_used: model,
      inference_time_ms: inferenceTimeMs,
      token_count: tokenCount,
      context_messages_used: promptContext.messages.length,
      context_token_estimate: promptContext.approx_token_count,
      context_messages_dropped: promptContext.dropped_message_count,
      warning: ragWarning,
    });
  } catch (err: any) {
    if (err instanceof ModelPolicyError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    if (err instanceof ChatHistoryServiceError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    if (err instanceof DocumentServiceError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    return res.status(500).json({ error: err?.message ?? "unknown error" });
  }
});
