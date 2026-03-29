import { findUserById } from "../../repositories/userRepository.js";
import {
  getEffectiveInstructorConfigByUserId,
  getLatestInstructorConfig,
  upsertInstructorConfigByUserId,
} from "../../repositories/instructorConfigRepository.js";

type InstructorConfigResult = {
  personality_prompt: string;
  temperature: number;
  max_tokens: number;
  retrieval_threshold: number;
  updated_at: Date | null;
};

export class InstructorConfigServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code ?? message;
  }
}

async function assertApprovedInstructor(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new InstructorConfigServiceError(401, "Invalid session", "invalid_session");
  }
  if ((user as any).role !== "instructor") {
    throw new InstructorConfigServiceError(403, "Instructor only", "instructor_only");
  }
  if ((user as any).instructorApprovalStatus !== "approved") {
    throw new InstructorConfigServiceError(
      403,
      "Instructor account pending admin approval",
      "instructor_pending_approval"
    );
  }
}

function toInstructorConfigResult(config: {
  personality_prompt: string;
  temperature: number;
  max_tokens: number;
  retrieval_threshold: number;
  updated_at: Date | null;
}): InstructorConfigResult {
  return {
    personality_prompt: config.personality_prompt,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
    retrieval_threshold: config.retrieval_threshold,
    updated_at: config.updated_at,
  };
}

function mapRepositoryError(error: unknown): never {
  const message = error instanceof Error ? error.message : "invalid_instructor_config";

  if (message === "personality_prompt_too_long") {
    throw new InstructorConfigServiceError(400, "personality_prompt_too_long", message);
  }
  if (message === "temperature_out_of_bounds") {
    throw new InstructorConfigServiceError(400, "temperature_out_of_bounds", message);
  }
  if (message === "max_tokens_out_of_bounds") {
    throw new InstructorConfigServiceError(400, "max_tokens_out_of_bounds", message);
  }
  if (message === "retrieval_threshold_out_of_bounds") {
    throw new InstructorConfigServiceError(400, "retrieval_threshold_out_of_bounds", message);
  }

  throw new InstructorConfigServiceError(500, "instructor_config_persist_failed");
}

export async function getInstructorConfigForActor(args: { actorUserId: string }) {
  await assertApprovedInstructor(args.actorUserId);
  const config = await getEffectiveInstructorConfigByUserId(args.actorUserId);

  return {
    config: toInstructorConfigResult(config),
  };
}

export async function resolveInstructorConfigForChatActor(args: { actorUserId?: string }) {
  const actorUserId = args.actorUserId;
  if (actorUserId) {
    const user = await findUserById(actorUserId);
    if (
      user
      && (user as any).role === "instructor"
      && (user as any).instructorApprovalStatus === "approved"
    ) {
      return {
        source: "actor" as const,
        config: toInstructorConfigResult(await getEffectiveInstructorConfigByUserId(actorUserId)),
      };
    }
  }

  const config = await getLatestInstructorConfig();
  return {
    source: config.updated_at ? ("latest_approved_instructor" as const) : ("defaults" as const),
    config: toInstructorConfigResult(config),
  };
}

export async function updateInstructorConfigForActor(args: {
  actorUserId: string;
  personalityPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  retrievalThreshold?: number;
}) {
  await assertApprovedInstructor(args.actorUserId);

  const currentConfig = await getEffectiveInstructorConfigByUserId(args.actorUserId);

  try {
    await upsertInstructorConfigByUserId({
      userId: args.actorUserId,
      personalityPrompt: args.personalityPrompt ?? currentConfig.personality_prompt,
      temperature: args.temperature ?? currentConfig.temperature,
      maxTokens: args.maxTokens ?? currentConfig.max_tokens,
      retrievalThreshold: args.retrievalThreshold ?? currentConfig.retrieval_threshold,
    });

    // Re-read through the canonical read path to guarantee deterministic response shape.
    const data = await getEffectiveInstructorConfigByUserId(args.actorUserId);
    return {
      config_updated: true,
      config: toInstructorConfigResult({
        personality_prompt: data.personality_prompt,
        temperature: data.temperature,
        max_tokens: data.max_tokens,
        retrieval_threshold: data.retrieval_threshold,
        updated_at: data.updated_at,
      }),
    };
  } catch (error) {
    mapRepositoryError(error);
  }
}
