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
}) {
  if (!args.wipeConversations && !args.wipeEmbeddings) {
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

  return {
    status: partialErrors.length > 0 ? "partial" : "completed",
    conversations_deleted: conversationsDeleted,
    embeddings_deleted: embeddingWipe.embeddingsDeleted,
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
