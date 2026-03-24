import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import type { Role } from "../models/User.js";

export type JwtUser = { id: string; role: Role; email: string; username: string };

export function signUser(u: JwtUser) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET");
  return jwt.sign(u, secret, { expiresIn: "24h", jwtid: randomUUID() });
}

export function verifyToken(token: string): JwtUser {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET");
  return jwt.verify(token, secret) as JwtUser;
}
