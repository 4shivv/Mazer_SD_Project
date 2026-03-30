import bcrypt from "bcrypt";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectMongo } from "../db.js";
import { User } from "../models/User.js";

dotenv.config();

type BootstrapConfig = {
  username: string;
  email: string;
  password: string;
};

function normalizeRequiredEnv(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readConfig(): BootstrapConfig {
  const username = normalizeRequiredEnv("ADMIN_BOOTSTRAP_USERNAME");
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() || `${username}@local.invalid`);
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "";

  if (password.length < 8) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD must be at least 8 characters");
  }

  return { username, email, password };
}

async function bootstrapAdmin() {
  const { username, email, password } = readConfig();

  await connectMongo();

  try {
    const existingUsers = await User.find({
      $or: [{ username }, { email }],
    }).limit(2);

    if (existingUsers.length > 1) {
      throw new Error(
        `Bootstrap identity conflict: username "${username}" and email "${email}" belong to different users`
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const existing = existingUsers[0] ?? null;

    if (existing) {
      const sameIdentity = existing.username === username && existing.email === email;
      if (!sameIdentity) {
        throw new Error(
          `Bootstrap identity conflict: existing user "${existing.username}" already uses username or email`
        );
      }

      existing.passwordHash = passwordHash;
      existing.role = "admin";
      existing.instructorApprovalStatus = "approved";
      await existing.save();

      console.log(`Admin account updated: ${username}`);
      return;
    }

    await User.create({
      username,
      email,
      passwordHash,
      role: "admin",
      instructorApprovalStatus: "approved",
    });

    console.log(`Admin account created: ${username}`);
  } finally {
    await mongoose.disconnect();
  }
}

bootstrapAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
