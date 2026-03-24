import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import {
  approveInstructorAccount,
  AuthServiceError,
  getUserFromSessionToken,
  listPendingInstructorAccounts,
  loginUser,
  logoutUser,
  registerUser,
} from "../services/auth/authService.js";

export const authRouter = Router();

const RegisterSchema = z.object({
  username: z.string().min(3).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: z.enum(["trainee", "instructor", "admin", "user"]).optional(),
}).refine((data) => Boolean(data.username || data.email), {
  message: "username or email is required",
  path: ["username"],
});

const LoginSchema = z.object({
  identifier: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(1),
}).refine((data) => Boolean(data.identifier || data.email), {
  message: "identifier or email is required",
  path: ["identifier"],
});

const PendingInstructorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const SESSION_MS = 24 * 60 * 60 * 1000;

function setSessionCookie(res: Response, token: string) {
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // set true in prod behind HTTPS
    maxAge: SESSION_MS,
  });
}

// POST /auth/register
authRouter.post("/register", async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await registerUser(parsed.data);
    if (result.pendingApproval) {
      return res.status(202).json({
        pendingApproval: true,
        message: result.message,
        user: result.user,
      });
    }

    setSessionCookie(res, result.token);
    return res.status(201).json({
      pendingApproval: false,
      user: result.user,
    });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "Registration failed" });
  }
});

// POST /auth/login
authRouter.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await loginUser(parsed.data);
    setSessionCookie(res, result.token);
    return res.json({ user: result.user });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "Login failed" });
  }
});

// POST /auth/logout
authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.session;
  if (token) await logoutUser(token);
  res.clearCookie("session");
  res.json({ ok: true });
});

// GET /auth/me
authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const u = await getUserFromSessionToken(token);
    return res.json({ user: u });
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
});

// GET /auth/instructors/pending
authRouter.get("/instructors/pending", async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: "not_logged_in" });

  const parsed = PendingInstructorsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const actor = await getUserFromSessionToken(token);
    const result = await listPendingInstructorAccounts({
      actorId: actor.id,
      limit: parsed.data.limit,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "pending_instructor_list_failed" });
  }
});

// POST /auth/instructors/:id/approve
authRouter.post("/instructors/:id/approve", async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: "not_logged_in" });

  try {
    const actor = await getUserFromSessionToken(token);
    const approved = await approveInstructorAccount({
      actorId: actor.id,
      targetUserId: req.params.id,
    });
    return res.json({ user: approved });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: "approval_failed" });
  }
});
