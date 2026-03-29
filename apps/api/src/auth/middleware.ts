import { Request, Response, NextFunction } from "express";
import { JwtUser } from "./jwt.js";
import { getUserFromSessionToken } from "../services/auth/authService.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    req.user = await getUserFromSessionToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  return next();
}

export function requireInstructor(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "instructor") return res.status(403).json({ error: "Instructor only" });
  return next();
}

export function requireDocumentManager(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === "admin" || req.user?.role === "instructor") return next();
  return res.status(403).json({ error: "Document managers only" });
}
