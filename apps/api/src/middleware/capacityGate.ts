import { Request, Response, NextFunction } from "express";

/**
 * Maximum concurrent chat sessions allowed (FR-033, NFR-P4).
 * Derived from VRAM budget: (24GB - 5GB model - 2GB overhead) / 1.5GB per session ≈ 11.3 → 12 practical max.
 */
export const MAX_CONCURRENT_SESSIONS = 12;

/**
 * Estimated seconds per queued session for wait-time calculation (FR-034).
 */
const ESTIMATED_WAIT_PER_SESSION_S = 60;

/** Current count of active sessions. Module-scoped, process-local. */
let activeSessionCount = 0;

/**
 * Initialize capacity tracking. Called once at application startup.
 */
export function initCapacityTracking(): void {
  activeSessionCount = 0;
}

/**
 * Returns the current active session count (consumed by health endpoint, FR-038).
 */
export function getActiveSessionCount(): number {
  return activeSessionCount;
}

/**
 * Express middleware enforcing session capacity limits (FR-033, FR-034, FR-036, NFR-P4, NFR-R6).
 *
 * When active sessions >= MAX_CONCURRENT_SESSIONS:
 *   - Returns 503 with queue envelope instead of degrading performance (NFR-R6).
 *   - Includes queue_position and estimated_wait_seconds (FR-034).
 *   - Message contains "Server at capacity" (FR-036).
 *
 * On admission:
 *   - Increments active count.
 *   - Decrements on response close/finish (whichever fires first).
 */
export function capacityGate(req: Request, res: Response, next: NextFunction): void {
  if (activeSessionCount >= MAX_CONCURRENT_SESSIONS) {
    // Queue position is 1-indexed: how many are waiting ahead + this one
    const queuePosition = activeSessionCount - MAX_CONCURRENT_SESSIONS + 1;
    const waitSeconds = queuePosition * ESTIMATED_WAIT_PER_SESSION_S;
    res.set("Retry-After", String(waitSeconds));
    res.status(503).json({
      error: "server_at_capacity",
      message: `Maximum concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached. Queued.`,
      queue_position: queuePosition,
      estimated_wait_seconds: waitSeconds,
    });
    return;
  }

  activeSessionCount++;

  let decremented = false;
  const release = () => {
    if (!decremented) {
      decremented = true;
      // Guard against going below 0
      if (activeSessionCount > 0) {
        activeSessionCount--;
      }
    }
  };

  // Decrement when response completes or client disconnects
  res.on("finish", release);
  res.on("close", release);

  next();
}
