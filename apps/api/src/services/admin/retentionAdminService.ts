import {
  applyRetentionDaysToAllConversations,
  deleteConversationsByIds,
  listAllConversationIds,
  listExpiredConversationIds,
} from "../../repositories/conversationRepository.js";
import { deleteMessagesByConversationIds } from "../../repositories/messageRepository.js";
import {
  computeSelfDestructDate,
  getEffectiveRetentionDays,
  normalizeRetentionDays,
  upsertGlobalRetentionPolicy,
} from "../../repositories/retentionPolicyRepository.js";
import { rm } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  LocalMongoSecureWipeAdapter,
  type SecureWipeAdapter,
  type SecureWipeAudit,
} from "./secureWipeAdapter.js";

const DEFAULT_CONFIRMATION_CODE = "MAZER_CONFIRM_WIPE";
const DEFAULT_SWEEP_LIMIT = 250;

export class AdminRetentionServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code ?? message;
  }
}

type EmbeddingWipeResult = {
  status: "completed" | "skipped" | "failed";
  embeddingsDeleted: number;
  error?: string;
};

type ModelResetResult = {
  status: "completed" | "skipped" | "failed";
  modelsDeleted: number;
  cachePathsCleared: number;
  deletedModelNames: string[];
  errors: string[];
};

let secureWipeAdapter: SecureWipeAdapter = new LocalMongoSecureWipeAdapter();

export function setSecureWipeAdapter(adapter: SecureWipeAdapter) {
  secureWipeAdapter = adapter;
}

function getExpectedConfirmationCode() {
  return process.env.ADMIN_WIPE_CONFIRMATION_CODE ?? DEFAULT_CONFIRMATION_CODE;
}

async function wipeEmbeddingsIfRequested(shouldWipe: boolean): Promise<EmbeddingWipeResult> {
  if (!shouldWipe) {
    return {
      status: "skipped",
      embeddingsDeleted: 0,
    };
  }

  const wipeEndpoint = process.env.CHROMA_WIPE_ENDPOINT;
  // Offline/local mode can intentionally skip embedding wipe until an internal endpoint is available.
  if (!wipeEndpoint) {
    return {
      status: "skipped",
      embeddingsDeleted: 0,
    };
  }

  try {
    const response = await fetch(wipeEndpoint, { method: "POST" });
    if (!response.ok) {
      const body = await response.text();
      return {
        status: "failed",
        embeddingsDeleted: 0,
        error: `chroma_wipe_failed_${response.status}:${body}`,
      };
    }

    let embeddingsDeleted = 0;
    try {
      const payload = (await response.json()) as Record<string, unknown>;
      const rawValue = payload.embeddings_deleted ?? payload.deleted ?? 0;
      embeddingsDeleted = Number(rawValue) || 0;
    } catch {
      embeddingsDeleted = 0;
    }

    return {
      status: "completed",
      embeddingsDeleted,
    };
  } catch (error) {
    return {
      status: "failed",
      embeddingsDeleted: 0,
      error: error instanceof Error ? error.message : "chroma_wipe_request_failed",
    };
  }
}

function parseConfiguredPaths(value?: string) {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const rawItem of (value ?? "").split(",")) {
    const item = rawItem.trim();
    if (!item || !isAbsolute(item) || item === "/") continue;
    if (seen.has(item)) continue;
    seen.add(item);
    paths.push(item);
  }

  return paths;
}

async function removeConfiguredPath(targetPath: string) {
  await rm(targetPath, { recursive: true, force: true });
}

async function wipeModelWeightsIfRequested(shouldWipe: boolean): Promise<ModelResetResult> {
  if (!shouldWipe) {
    return {
      status: "skipped",
      modelsDeleted: 0,
      cachePathsCleared: 0,
      deletedModelNames: [],
      errors: [],
    };
  }

  const ollamaHost = process.env.OLLAMA_HOST || "http://localhost:11434";
  const modelPaths = parseConfiguredPaths(process.env.OLLAMA_MODEL_STORAGE_PATHS);
  const cachePaths = parseConfiguredPaths(process.env.OLLAMA_CACHE_PATHS);
  const errors: string[] = [];
  const deletedModelNames: string[] = [];

  try {
    const tagsResponse = await fetch(`${ollamaHost}/api/tags`);
    if (!tagsResponse.ok) {
      errors.push(`ollama_tags_failed_${tagsResponse.status}`);
    } else {
      const payload = await tagsResponse.json() as {
        models?: Array<{ name?: string }>;
      };
      const names = (payload.models ?? [])
        .map((model) => model.name?.trim())
        .filter((name): name is string => Boolean(name));

      for (const name of names) {
        try {
          const deleteResponse = await fetch(`${ollamaHost}/api/delete`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (!deleteResponse.ok) {
            errors.push(`ollama_delete_failed_${name}_${deleteResponse.status}`);
            continue;
          }
          deletedModelNames.push(name);
        } catch (error) {
          errors.push(error instanceof Error ? `ollama_delete_failed_${name}_${error.message}` : `ollama_delete_failed_${name}`);
        }
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? `ollama_tags_failed_${error.message}` : "ollama_tags_failed");
  }

  let cachePathsCleared = 0;
  for (const targetPath of [...modelPaths, ...cachePaths]) {
    try {
      await removeConfiguredPath(targetPath);
      cachePathsCleared += 1;
    } catch (error) {
      errors.push(error instanceof Error ? `model_path_reset_failed_${targetPath}_${error.message}` : `model_path_reset_failed_${targetPath}`);
    }
  }

  return {
    status: errors.length > 0 ? "failed" : "completed",
    modelsDeleted: deletedModelNames.length,
    cachePathsCleared,
    deletedModelNames,
    errors,
  };
}

function assertConfirmationCode(confirmationCode: string) {
  const expected = getExpectedConfirmationCode();
  // Fail closed so destructive operations only run with explicit, correct admin intent.
  if (!confirmationCode || confirmationCode !== expected) {
    throw new AdminRetentionServiceError(
      400,
      "Invalid confirmation code",
      "confirmation_code_invalid"
    );
  }
}

export async function resolveSelfDestructDateForAnchor(anchorDate: Date) {
  const retentionDays = await getEffectiveRetentionDays();
  return computeSelfDestructDate(anchorDate, retentionDays);
}

export async function updateRetentionPolicy(args: {
  actorUserId: string;
  defaultRetentionDays: number;
  applyToExisting: boolean;
}) {
  let retentionDays: number;
  try {
    retentionDays = normalizeRetentionDays(args.defaultRetentionDays);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_retention_days";
    throw new AdminRetentionServiceError(400, message, "invalid_retention_days");
  }

  const policy = await upsertGlobalRetentionPolicy({
    defaultRetentionDays: retentionDays,
    updatedBy: args.actorUserId,
  });

  let conversationsAffected = 0;
  if (args.applyToExisting) {
    conversationsAffected = await applyRetentionDaysToAllConversations(retentionDays);
  }

  return {
    policy_updated: true,
    conversations_affected: conversationsAffected,
    default_retention_days: Number((policy as any).default_retention_days ?? retentionDays),
  };
}

function assertSuccessfulSecureWipe(audit: SecureWipeAudit) {
  if (audit.status === "completed") return;
  if (audit.errors.includes("confirmation_code_mismatch")) {
    throw new AdminRetentionServiceError(
      400,
      "Invalid confirmation code",
      "confirmation_code_invalid"
    );
  }
  throw new AdminRetentionServiceError(500, "Secure wipe failed", "secure_wipe_failed");
}

export async function wipeStoredData(args: {
  confirmationCode: string;
  wipeConversations: boolean;
  wipeEmbeddings: boolean;
  wipeModelWeights?: boolean;
}) {
  if (!args.wipeConversations && !args.wipeEmbeddings && !args.wipeModelWeights) {
    throw new AdminRetentionServiceError(400, "No wipe target selected", "wipe_target_required");
  }

  assertConfirmationCode(args.confirmationCode);

  let conversationsDeleted = 0;
  let conversationWipeAudit: SecureWipeAudit | null = null;
  let partialErrors: string[] = [];

  if (args.wipeConversations) {
    const conversationIds = await listAllConversationIds();
    conversationWipeAudit = await secureWipeAdapter.overwriteBeforeDelete({
      reason: "admin_wipe",
      conversationIds,
      confirmationCode: args.confirmationCode,
      expectedConfirmationCode: getExpectedConfirmationCode(),
    });

    assertSuccessfulSecureWipe(conversationWipeAudit);

    await deleteMessagesByConversationIds(conversationIds);
    conversationsDeleted = await deleteConversationsByIds(conversationIds);
  }

  const embeddingWipe = await wipeEmbeddingsIfRequested(args.wipeEmbeddings);
  if (embeddingWipe.status === "failed" && embeddingWipe.error) {
    partialErrors = [embeddingWipe.error];
  }
  const modelReset = await wipeModelWeightsIfRequested(Boolean(args.wipeModelWeights));
  if (modelReset.errors.length > 0) {
    partialErrors = [...partialErrors, ...modelReset.errors];
  }

  return {
    status: partialErrors.length > 0 ? "partial" : "completed",
    conversations_deleted: conversationsDeleted,
    embeddings_deleted: embeddingWipe.embeddingsDeleted,
    models_deleted: modelReset.modelsDeleted,
    model_cache_paths_cleared: modelReset.cachePathsCleared,
    deleted_model_names: modelReset.deletedModelNames,
    storage_freed_gb: 0,
    wipe_audit: conversationWipeAudit,
    errors: partialErrors,
  };
}

export async function runExpiredConversationSweep(args?: { limit?: number }) {
  const limit = Math.max(1, args?.limit ?? DEFAULT_SWEEP_LIMIT);
  const expiredConversationIds = await listExpiredConversationIds({
    now: new Date(),
    limit,
  });

  if (expiredConversationIds.length === 0) {
    return {
      status: "completed" as const,
      expired_conversations_found: 0,
      conversations_deleted: 0,
      messages_deleted: 0,
      secure_wipe: null as SecureWipeAudit | null,
      errors: [] as string[],
    };
  }

  const secureWipe = await secureWipeAdapter.overwriteBeforeDelete({
    reason: "expiry_sweep",
    conversationIds: expiredConversationIds,
  });

  if (secureWipe.status !== "completed") {
    return {
      status: "failed" as const,
      expired_conversations_found: expiredConversationIds.length,
      conversations_deleted: 0,
      messages_deleted: 0,
      secure_wipe: secureWipe,
      errors: secureWipe.errors,
    };
  }

  const messagesDeleted = await deleteMessagesByConversationIds(expiredConversationIds);
  const conversationsDeleted = await deleteConversationsByIds(expiredConversationIds);

  return {
    status: "completed" as const,
    expired_conversations_found: expiredConversationIds.length,
    conversations_deleted: conversationsDeleted,
    messages_deleted: messagesDeleted,
    secure_wipe: secureWipe,
    errors: [] as string[],
  };
}
