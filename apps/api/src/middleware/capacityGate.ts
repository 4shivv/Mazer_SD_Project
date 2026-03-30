import { Request, Response, NextFunction } from "express";
import { getMaxConcurrentSessions } from "../runtime/modelPolicy.js";

/**
 * Maximum concurrent chat sessions allowed (FR-033, NFR-P4).
 * Derived from the approved q4 model lineup and associated VRAM budgets.
 */
export function getConfiguredMaxConcurrentSessions(): number {
  return getMaxConcurrentSessions();
}

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
  const maxConcurrentSessions = getConfiguredMaxConcurrentSessions();

  if (activeSessionCount >= maxConcurrentSessions) {
    // Queue position is 1-indexed: how many are waiting ahead + this one
    const queuePosition = activeSessionCount - maxConcurrentSessions + 1;
    const waitSeconds = queuePosition * ESTIMATED_WAIT_PER_SESSION_S;
    res.set("Retry-After", String(waitSeconds));
    res.status(503).json({
      error: "server_at_capacity",
      message: `Maximum concurrent sessions (${maxConcurrentSessions}) reached. Queued.`,
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
