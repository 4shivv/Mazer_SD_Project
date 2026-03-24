import { randomBytes } from "node:crypto";
import {
  overwriteConversationFieldsByIds,
} from "../../repositories/conversationRepository.js";
import { overwriteMessageContentByConversationIds } from "../../repositories/messageRepository.js";

type WipeReason = "admin_wipe" | "expiry_sweep";

export type SecureWipeInvocation = {
  reason: WipeReason;
  conversationIds: string[];
  confirmationCode?: string;
  expectedConfirmationCode?: string;
};

export type SecureWipeAudit = {
  status: "completed" | "failed";
  wipe_reason: WipeReason;
  overwrite_passes: number;
  conversations_targeted: number;
  conversations_overwritten: number;
  messages_overwritten: number;
  errors: string[];
};

export interface SecureWipeAdapter {
  overwriteBeforeDelete(args: SecureWipeInvocation): Promise<SecureWipeAudit>;
}

function buildOverwriteToken() {
  return `wipe_${randomBytes(24).toString("hex")}`;
}

export class LocalMongoSecureWipeAdapter implements SecureWipeAdapter {
  async overwriteBeforeDelete(args: SecureWipeInvocation): Promise<SecureWipeAudit> {
    if (args.reason === "admin_wipe") {
      const hasCodes =
        typeof args.confirmationCode === "string"
        && typeof args.expectedConfirmationCode === "string";
      if (!hasCodes || args.confirmationCode !== args.expectedConfirmationCode) {
        return {
          status: "failed",
          wipe_reason: args.reason,
          overwrite_passes: 0,
          conversations_targeted: args.conversationIds.length,
          conversations_overwritten: 0,
          messages_overwritten: 0,
          errors: ["confirmation_code_mismatch"],
        };
      }
    }

    if (args.conversationIds.length === 0) {
      return {
        status: "completed",
        wipe_reason: args.reason,
        overwrite_passes: 1,
        conversations_targeted: 0,
        conversations_overwritten: 0,
        messages_overwritten: 0,
        errors: [],
      };
    }

    const overwriteToken = buildOverwriteToken();

    try {
      const [conversationsOverwritten, messagesOverwritten] = await Promise.all([
        overwriteConversationFieldsByIds({
          conversationIds: args.conversationIds,
          overwriteToken,
        }),
        overwriteMessageContentByConversationIds({
          conversationIds: args.conversationIds,
          overwriteToken,
        }),
      ]);

      return {
        status: "completed",
        wipe_reason: args.reason,
        overwrite_passes: 1,
        conversations_targeted: args.conversationIds.length,
        conversations_overwritten: conversationsOverwritten,
        messages_overwritten: messagesOverwritten,
        errors: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "secure_wipe_failed";
      return {
        status: "failed",
        wipe_reason: args.reason,
        overwrite_passes: 0,
        conversations_targeted: args.conversationIds.length,
        conversations_overwritten: 0,
        messages_overwritten: 0,
        errors: [message],
      };
    }
  }
}
