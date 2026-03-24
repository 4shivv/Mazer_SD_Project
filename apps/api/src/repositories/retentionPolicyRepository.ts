import { RetentionPolicy } from "../models/RetentionPolicy.js";

const GLOBAL_SCOPE = "global";

export const DEFAULT_RETENTION_DAYS = 90;

export function normalizeRetentionDays(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error("default_retention_days_must_be_between_1_and_3650");
  }
  return value;
}

export function computeSelfDestructDate(anchorDate: Date, retentionDays: number) {
  const dayMs = 24 * 60 * 60 * 1000;
  return new Date(anchorDate.getTime() + retentionDays * dayMs);
}

export async function getGlobalRetentionPolicy() {
  return RetentionPolicy.findOne({ scope: GLOBAL_SCOPE });
}

export async function getEffectiveRetentionDays() {
  const policy = await getGlobalRetentionPolicy();
  const rawDays = Number((policy as any)?.default_retention_days ?? DEFAULT_RETENTION_DAYS);
  return normalizeRetentionDays(rawDays);
}

export async function upsertGlobalRetentionPolicy(args: {
  defaultRetentionDays: number;
  updatedBy: string;
}) {
  const safeDays = normalizeRetentionDays(args.defaultRetentionDays);

  return RetentionPolicy.findOneAndUpdate(
    { scope: GLOBAL_SCOPE },
    {
      $set: {
        default_retention_days: safeDays,
        updated_by: args.updatedBy,
      },
      $setOnInsert: {
        scope: GLOBAL_SCOPE,
      },
    },
    {
      upsert: true,
      new: true,
    }
  );
}
