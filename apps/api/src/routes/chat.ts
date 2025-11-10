import { Router } from "express";

export const router = Router();

router.post("/chat", async (req, res) => {
  const prompt = req.body?.prompt;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt is required (string)" });
  }
  return res.json({ reply: `✅ placeholder: you said "${prompt}"` });
});
