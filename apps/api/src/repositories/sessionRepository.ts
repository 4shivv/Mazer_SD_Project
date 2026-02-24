import { Session } from "../models/Session.js";

export async function createSessionRecord(args: {
  userId: string;
  sessionToken: string;
  expiresAt: Date;
}) {
  return Session.create({
    user_id: args.userId,
    session_token: args.sessionToken,
    expires_at: args.expiresAt,
  });
}

export async function findValidSessionByToken(sessionToken: string) {
  return Session.findOne({
    session_token: sessionToken,
    expires_at: { $gt: new Date() },
  });
}

export async function deleteSessionByToken(sessionToken: string) {
  return Session.deleteOne({ session_token: sessionToken });
}
