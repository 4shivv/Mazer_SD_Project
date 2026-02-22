import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../auth/middleware.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";

export const conversationsRouter = Router();

conversationsRouter.get("/conversations", requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Not logged in" });

    const conversations = await Conversation.find({
      userId: req.user.id,
      isArchived: false,
    })
      .sort({ updatedAt: -1 })
      .select("_id title createdAt updatedAt")
      .lean();

    return res.json({
      conversations: conversations.map((c) => ({
        id: String(c._id),
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "unknown error" });
  }
});

conversationsRouter.get("/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Not logged in" });

    const rawId = req.params.id;
    if (typeof rawId !== "string") {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    if (!mongoose.Types.ObjectId.isValid(rawId)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    const conversation = await Conversation.findOne({
      _id: rawId,
      userId: req.user.id,
      isArchived: false,
    })
      .select("_id title createdAt updatedAt")
      .lean();

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const messages = await Message.find({
      conversationId: rawId,
      userId: req.user.id,
    })
      .sort({ createdAt: 1 })
      .select("_id role content createdAt")
      .lean();

    return res.json({
      conversation: {
        id: String(conversation._id),
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
      messages: messages.map((m) => ({
        id: String(m._id),
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "unknown error" });
  }
});
