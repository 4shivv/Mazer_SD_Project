import { Request, Response, NextFunction } from "express";
import { exec } from "child_process";

/**
 * GPU temperature threshold in Celsius (FR-035, NFR-R5).
 * Sessions rejected when GPU exceeds this temperature to prevent thermal damage.
 */
export const GPU_TEMP_THRESHOLD_C = 83;

/**
 * Polling interval for nvidia-smi telemetry in milliseconds (FR-035: every 30 seconds).
 */
export const THERMAL_POLL_INTERVAL_MS = 30_000;

/**
 * Retry-after duration sent in 503 thermal capacity responses (seconds).
 */
const THERMAL_RETRY_AFTER_S = 300;

/** GPU telemetry shape returned by getGpuTelemetry(). */
export interface GpuTelemetry {
  available: boolean;
  gpu_temp_c?: number;
  vram_used_mb?: number;
  vram_total_mb?: number;
  last_updated?: string;
}

/** Cached GPU telemetry state. Module-scoped, process-local. */
let cachedTelemetry: GpuTelemetry = { available: false };

/** Timer handle for cleanup. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Guard to prevent concurrent nvidia-smi exec calls. */
let pollInFlight = false;

/**
 * Parse nvidia-smi CSV output into telemetry values.
 * Expected format: "temperature, memory_used, memory_total\n"
 */
export function parseNvidiaSmiOutput(stdout: string): GpuTelemetry | null {
  const line = stdout.trim().split("\n")[0];
  if (!line) return null;

  const parts = line.split(",").map((s) => s.trim());
  if (parts.length < 3) return null;

  const temp = parseFloat(parts[0]);
  const used = parseFloat(parts[1]);
  const total = parseFloat(parts[2]);

  if (isNaN(temp) || isNaN(used) || isNaN(total)) return null;

  return {
    available: true,
    gpu_temp_c: temp,
    vram_used_mb: used,
    vram_total_mb: total,
    last_updated: new Date().toISOString(),
  };
}

/**
 * Poll nvidia-smi and update cached telemetry.
 * On failure, sets telemetry to unavailable (degraded mode).
 */
function pollGpuTelemetry(): void {
  if (pollInFlight) return;
  pollInFlight = true;

  exec(
    "nvidia-smi --query-gpu=temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits",
    { timeout: 5000 },
    (error, stdout) => {
      pollInFlight = false;

      if (error) {
        cachedTelemetry = { available: false };
        return;
      }

      const parsed = parseNvidiaSmiOutput(stdout);
      if (parsed) {
        cachedTelemetry = parsed;
      } else {
        cachedTelemetry = { available: false };
      }
    }
  );
}

/**
 * Initialize thermal monitoring. Starts periodic nvidia-smi polling.
 * Called once at application startup.
 */
export function initThermalMonitor(): void {
  // Immediate first poll
  pollGpuTelemetry();
  // Periodic polling every THERMAL_POLL_INTERVAL_MS
  pollTimer = setInterval(pollGpuTelemetry, THERMAL_POLL_INTERVAL_MS);
}

/**
 * Stop thermal monitoring. Used for cleanup in tests.
 */
export function stopThermalMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Returns cached GPU telemetry (consumed by health endpoint, FR-038).
 */
export function getGpuTelemetry(): GpuTelemetry {
  return { ...cachedTelemetry };
}

/**
 * Override cached telemetry for testing purposes only.
 */
export function _setTelemetryForTest(telemetry: GpuTelemetry): void {
  cachedTelemetry = telemetry;
}

/**
 * Express middleware enforcing GPU thermal limits (FR-035, FR-036, NFR-R5).
 *
 * When GPU temperature > GPU_TEMP_THRESHOLD_C (83°C):
 *   - Returns 503 with thermal_capacity envelope.
 *   - Includes retry_after_seconds (FR-035).
 *   - Message contains temperature reading.
 *
 * When nvidia-smi is unavailable (degraded mode):
 *   - Passes request through (fail-open for capacity).
 *   - Health endpoint separately surfaces degraded GPU status.
 */
export function thermalGate(req: Request, res: Response, next: NextFunction): void {
  // Degraded mode: if telemetry unavailable, pass through
  if (!cachedTelemetry.available) {
    next();
    return;
  }

  const temp = cachedTelemetry.gpu_temp_c ?? 0;

  if (temp > GPU_TEMP_THRESHOLD_C) {
    res.set("Retry-After", String(THERMAL_RETRY_AFTER_S));
    res.status(503).json({
      error: "thermal_capacity",
      message: `GPU temperature too high (${temp}°C). Retry in 5 min.`,
      retry_after_seconds: THERMAL_RETRY_AFTER_S,
    });
    return;
  }

  next();
}
