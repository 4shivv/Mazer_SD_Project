import { InstructorConfig } from "../models/InstructorConfig.js";

export const INSTRUCTOR_CONFIG_DEFAULTS = {
  personalityPrompt: "",
  temperature: 0.3,
  maxTokens: 512,
  retrievalThreshold: 0.75,
} as const;

export function normalizePersonalityPrompt(value: string) {
  const trimmed = value.trim();
  if (trimmed.length > 8000) {
    throw new Error("personality_prompt_too_long");
  }
  return trimmed;
}

export function normalizeTemperature(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("temperature_out_of_bounds");
  }
  return value;
}

export function normalizeMaxTokens(value: number) {
  if (!Number.isInteger(value) || value < 64 || value > 4096) {
    throw new Error("max_tokens_out_of_bounds");
  }
  return value;
}

export function normalizeRetrievalThreshold(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("retrieval_threshold_out_of_bounds");
  }
  return value;
}

export async function getInstructorConfigByUserId(userId: string) {
  return InstructorConfig.findOne({ user_id: userId });
}

export async function getEffectiveInstructorConfigByUserId(userId: string) {
  const doc = await getInstructorConfigByUserId(userId);
  if (!doc) {
    return {
      user_id: userId,
      personality_prompt: INSTRUCTOR_CONFIG_DEFAULTS.personalityPrompt,
      temperature: INSTRUCTOR_CONFIG_DEFAULTS.temperature,
      max_tokens: INSTRUCTOR_CONFIG_DEFAULTS.maxTokens,
      retrieval_threshold: INSTRUCTOR_CONFIG_DEFAULTS.retrievalThreshold,
      updated_at: null as Date | null,
    };
  }

  const data = doc as any;
  return {
    user_id: String(data.user_id),
    personality_prompt: String(data.personality_prompt),
    temperature: Number(data.temperature),
    max_tokens: Number(data.max_tokens),
    retrieval_threshold: Number(data.retrieval_threshold),
    updated_at: (data.updated_at as Date | null | undefined) ?? null,
  };
}

export async function upsertInstructorConfigByUserId(args: {
  userId: string;
  personalityPrompt: string;
  temperature: number;
  maxTokens: number;
  retrievalThreshold: number;
}) {
  const personalityPrompt = normalizePersonalityPrompt(args.personalityPrompt);
  const temperature = normalizeTemperature(args.temperature);
  const maxTokens = normalizeMaxTokens(args.maxTokens);
  const retrievalThreshold = normalizeRetrievalThreshold(args.retrievalThreshold);

  return InstructorConfig.findOneAndUpdate(
    { user_id: args.userId },
    {
      $set: {
        personality_prompt: personalityPrompt,
        temperature,
        max_tokens: maxTokens,
        retrieval_threshold: retrievalThreshold,
      },
      $setOnInsert: {
        user_id: args.userId,
      },
    },
    {
      upsert: true,
      new: true,
    }
  );
}
