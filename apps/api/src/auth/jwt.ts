import jwt from "jsonwebtoken";

export type JwtUser = { id: string; role: "user" | "admin"; email: string };

export function signUser(u: JwtUser) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET");
  return jwt.sign(u, secret, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtUser {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET");
  return jwt.verify(token, secret) as JwtUser;
}
