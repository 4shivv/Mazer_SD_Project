import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { User } from "../models/User.js";
import { signUser, verifyToken } from "../auth/jwt.js";

export const authRouter = Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /auth/register
authRouter.post("/register", async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  // Instructor = admin: read role directly from request body (student = user, instructor = admin)
  const role = req.body?.role === "admin" ? "admin" : "user";
  const userDoc = await User.create({ email, passwordHash, role });

  const token = signUser({ id: userDoc._id.toString(), email: userDoc.email, role: userDoc.role });
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // set true in prod behind HTTPS
  });

  return res.json({ user: { id: userDoc._id, email: userDoc.email, role: userDoc.role } });
});

// POST /auth/login
authRouter.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase();
  const userDoc = await User.findOne({ email });
  if (!userDoc) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(parsed.data.password, userDoc.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signUser({ id: userDoc._id.toString(), email: userDoc.email, role: userDoc.role });
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });

  return res.json({ user: { id: userDoc._id, email: userDoc.email, role: userDoc.role } });
});

// POST /auth/logout
authRouter.post("/logout", (_req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

// GET /auth/me
authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const u = verifyToken(token);
    return res.json({ user: u });
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
});
