import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireInstructor } from "../auth/middleware.js";
import {
  getInstructorConfigForActor,
  InstructorConfigServiceError,
  updateInstructorConfigForActor,
} from "../services/instructor/instructorConfigService.js";

export const instructorRouter = Router();

const UpdateInstructorConfigSchema = z.object({
  personality_prompt: z.string().max(8000).optional(),
  temperature: z.coerce.number().min(0).max(1).optional(),
  max_tokens: z.coerce.number().int().min(64).max(4096).optional(),
  retrieval_threshold: z.coerce.number().min(0).max(1).optional(),
}).refine(
  (payload) =>
    payload.personality_prompt !== undefined
    || payload.temperature !== undefined
    || payload.max_tokens !== undefined
    || payload.retrieval_threshold !== undefined,
  {
    message: "At least one configuration field is required",
    path: ["personality_prompt"],
  }
);

instructorRouter.get("/config", requireAuth, requireInstructor, async (req, res) => {
  try {
    const result = await getInstructorConfigForActor({
      actorUserId: req.user!.id,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof InstructorConfigServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "instructor_config_fetch_failed" });
  }
});

instructorRouter.put("/config", requireAuth, requireInstructor, async (req, res) => {
  const parsed = UpdateInstructorConfigSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await updateInstructorConfigForActor({
      actorUserId: req.user!.id,
      personalityPrompt: parsed.data.personality_prompt,
      temperature: parsed.data.temperature,
      maxTokens: parsed.data.max_tokens,
      retrievalThreshold: parsed.data.retrieval_threshold,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof InstructorConfigServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "instructor_config_update_failed" });
  }
});
