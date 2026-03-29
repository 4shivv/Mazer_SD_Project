import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import {
  AdminRetentionServiceError,
  updateRetentionPolicy,
  wipeStoredData,
} from "../services/admin/retentionAdminService.js";
import { User } from "../models/User.js";

export const adminRouter = Router();

/**
 * GET /api/admin/users — Admin user oversight listing (FR-037, NFR-S4).
 * Returns all users with safe field projection (excludes passwordHash).
 */
adminRouter.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const users = await User.find(
      {},
      { passwordHash: 0 } // Exclude sensitive field
    )
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ users });
  } catch {
    return res.status(500).json({ error: "user_list_failed" });
  }
});

const UpdateRetentionPolicySchema = z.object({
  default_retention_days: z.coerce.number().int().min(1).max(3650),
  apply_to_existing: z.coerce.boolean().optional().default(false),
});

const WipeRequestSchema = z.object({
  wipe_conversations: z.coerce.boolean().optional().default(false),
  wipe_embeddings: z.coerce.boolean().optional().default(false),
  wipe_model_weights: z.coerce.boolean().optional().default(false),
  confirmation_code: z.string().min(1),
}).refine(
  (payload) => payload.wipe_conversations || payload.wipe_embeddings || payload.wipe_model_weights,
  {
    message: "At least one wipe target is required",
    path: ["wipe_conversations"],
  }
);

adminRouter.put("/retention-policy", requireAuth, requireAdmin, async (req, res) => {
  const parsed = UpdateRetentionPolicySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await updateRetentionPolicy({
      actorUserId: req.user!.id,
      defaultRetentionDays: parsed.data.default_retention_days,
      applyToExisting: parsed.data.apply_to_existing,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof AdminRetentionServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "retention_policy_update_failed" });
  }
});

adminRouter.post("/wipe", requireAuth, requireAdmin, async (req, res) => {
  const parsed = WipeRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await wipeStoredData({
      confirmationCode: parsed.data.confirmation_code,
      wipeConversations: parsed.data.wipe_conversations,
      wipeEmbeddings: parsed.data.wipe_embeddings,
      wipeModelWeights: parsed.data.wipe_model_weights,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof AdminRetentionServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "admin_wipe_failed" });
  }
});
