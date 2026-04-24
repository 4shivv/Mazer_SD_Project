import { Request, Response, NextFunction } from "express";
import { exec } from "child_process";
import { readdir, readFile } from "node:fs/promises";

/**
 * GPU temperature threshold in Celsius (FR-035, NFR-R5).
 * Sessions rejected when GPU exceeds this temperature to prevent thermal damage.
 */
export const GPU_TEMP_THRESHOLD_C = 83;

/**
 * CPU temperature threshold in Celsius (NFR-R1).
 * Sessions rejected when CPU exceeds this temperature to prevent thermal damage.
 */
export const CPU_TEMP_THRESHOLD_C = 75;

/**
 * Polling interval for nvidia-smi telemetry in milliseconds (FR-035: every 30 seconds).
 */
export const THERMAL_POLL_INTERVAL_MS = 30_000;

/**
 * Retry-after duration sent in 503 thermal capacity responses (seconds).
 */
const THERMAL_RETRY_AFTER_S = 300;

/**
 * Root path for Linux kernel thermal zones. Override via CPU_THERMAL_ZONE_ROOT for testing.
 */
const DEFAULT_THERMAL_ZONE_ROOT = "/sys/class/thermal";

/**
 * Pattern for thermal zone `type` files that represent CPU temp. Ambient/chipset zones
 * (e.g. acpitz) are excluded so we don't reject on room temperature.
 * Override via CPU_THERMAL_ZONE_TYPES env var (pipe-separated regex).
 */
const DEFAULT_CPU_ZONE_TYPES = "k10temp|coretemp|x86_pkg_temp|cpu";

/** GPU telemetry shape returned by getGpuTelemetry(). */
export interface GpuTelemetry {
  available: boolean;
  gpu_temp_c?: number;
  vram_used_mb?: number;
  vram_total_mb?: number;
  last_updated?: string;
}

/** CPU telemetry shape returned by getCpuTelemetry(). */
export interface CpuTelemetry {
  available: boolean;
  cpu_temp_c?: number;
  last_updated?: string;
}

/** Cached GPU telemetry state. Module-scoped, process-local. */
let cachedTelemetry: GpuTelemetry = { available: false };

/** Cached CPU telemetry state. Module-scoped, process-local. */
let cachedCpuTelemetry: CpuTelemetry = { available: false };

/** Timer handle for cleanup. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Guard to prevent concurrent nvidia-smi exec calls. */
let pollInFlight = false;

/** Guard to prevent concurrent CPU thermal zone reads. */
let cpuPollInFlight = false;

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
 * Read the hottest CPU thermal zone on Linux. Returns null when the kernel
 * thermal interface isn't exposed (macOS/Windows Docker, or non-Linux hosts),
 * so the CPU gate falls back to degraded mode identical to a missing nvidia-smi.
 */
export async function readCpuTemperatureCelsius(
  zoneRoot: string = process.env.CPU_THERMAL_ZONE_ROOT || DEFAULT_THERMAL_ZONE_ROOT
): Promise<number | null> {
  let entries: string[];
  try {
    entries = await readdir(zoneRoot);
  } catch {
    return null;
  }

  const zones = entries.filter((entry) => entry.startsWith("thermal_zone"));
  if (zones.length === 0) return null;

  const pattern = new RegExp(
    process.env.CPU_THERMAL_ZONE_TYPES || DEFAULT_CPU_ZONE_TYPES,
    "i"
  );

  let maxTemp = Number.NEGATIVE_INFINITY;
  for (const zone of zones) {
    try {
      const type = (await readFile(`${zoneRoot}/${zone}/type`, "utf-8")).trim();
      if (!pattern.test(type)) continue;
      const rawTemp = (await readFile(`${zoneRoot}/${zone}/temp`, "utf-8")).trim();
      const millideg = Number.parseInt(rawTemp, 10);
      if (Number.isNaN(millideg)) continue;
      const celsius = millideg / 1000;
      if (celsius > maxTemp) maxTemp = celsius;
    } catch {
      // Skip unreadable zones silently; fall through to next candidate.
    }
  }

  return maxTemp === Number.NEGATIVE_INFINITY ? null : maxTemp;
}

/**
 * Poll CPU thermal zones and update cached telemetry.
 * Matches the fire-and-forget pattern of the GPU poller.
 */
async function pollCpuTelemetry(): Promise<void> {
  if (cpuPollInFlight) return;
  cpuPollInFlight = true;

  try {
    const celsius = await readCpuTemperatureCelsius();
    if (celsius === null) {
      cachedCpuTelemetry = { available: false };
    } else {
      cachedCpuTelemetry = {
        available: true,
        cpu_temp_c: celsius,
        last_updated: new Date().toISOString(),
      };
    }
  } catch {
    cachedCpuTelemetry = { available: false };
  } finally {
    cpuPollInFlight = false;
  }
}

/**
 * Initialize thermal monitoring. Starts periodic nvidia-smi polling and
 * CPU thermal-zone polling on the same cadence.
 * Called once at application startup.
 */
export function initThermalMonitor(): void {
  // Immediate first polls
  pollGpuTelemetry();
  void pollCpuTelemetry();
  // Periodic polling every THERMAL_POLL_INTERVAL_MS
  pollTimer = setInterval(() => {
    pollGpuTelemetry();
    void pollCpuTelemetry();
  }, THERMAL_POLL_INTERVAL_MS);
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
 * Returns cached CPU telemetry (consumed by health endpoint, FR-038).
 */
export function getCpuTelemetry(): CpuTelemetry {
  return { ...cachedCpuTelemetry };
}

/**
 * Override cached telemetry for testing purposes only.
 */
export function _setTelemetryForTest(telemetry: GpuTelemetry): void {
  cachedTelemetry = telemetry;
}

/**
 * Override cached CPU telemetry for testing purposes only.
 */
export function _setCpuTelemetryForTest(telemetry: CpuTelemetry): void {
  cachedCpuTelemetry = telemetry;
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
  // GPU check — skipped in degraded mode (nvidia-smi missing).
  if (cachedTelemetry.available) {
    const gpuTemp = cachedTelemetry.gpu_temp_c ?? 0;
    if (gpuTemp > GPU_TEMP_THRESHOLD_C) {
      res.set("Retry-After", String(THERMAL_RETRY_AFTER_S));
      res.status(503).json({
        error: "thermal_capacity",
        message: `GPU temperature too high (${gpuTemp}°C). Retry in 5 min.`,
        retry_after_seconds: THERMAL_RETRY_AFTER_S,
      });
      return;
    }
  }

  // CPU check — skipped in degraded mode (no readable thermal zones).
  if (cachedCpuTelemetry.available) {
    const cpuTemp = cachedCpuTelemetry.cpu_temp_c ?? 0;
    if (cpuTemp > CPU_TEMP_THRESHOLD_C) {
      res.set("Retry-After", String(THERMAL_RETRY_AFTER_S));
      res.status(503).json({
        error: "thermal_capacity",
        message: `CPU temperature too high (${cpuTemp}°C). Retry in 5 min.`,
        retry_after_seconds: THERMAL_RETRY_AFTER_S,
      });
      return;
    }
  }

  next();
}
