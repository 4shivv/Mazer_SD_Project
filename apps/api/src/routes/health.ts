import { Router } from "express";
import mongoose from "mongoose";
import { getGpuTelemetry } from "../middleware/thermalGate.js";
import { getActiveSessionCount, getConfiguredMaxConcurrentSessions } from "../middleware/capacityGate.js";
import { getInternalTransportSecurityStatus } from "../runtime/internalTransportSecurity.js";

export const healthRouter = Router();

const CHROMA_HOST = process.env.CHROMA_HOST || "http://localhost:8000";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const SERVICE_PING_TIMEOUT_MS = 3000;

/**
 * Ping an HTTP service and return "up" or "down".
 */
async function pingService(url: string): Promise<"up" | "down"> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SERVICE_PING_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

/**
 * GET /api/health — Aggregated system health (FR-038).
 *
 * Reports status of MongoDB, ChromaDB, Ollama, GPU telemetry, and session count.
 * Intentionally unauthenticated (diagnostic/operational endpoint).
 * Individual service failures are reported per-service, not as 500s.
 * No sensitive data (tokens, passwords, user info) is exposed.
 */
healthRouter.get("/", async (_req, res) => {
  const [mongoStatus, chromaStatus, ollamaStatus] = await Promise.all([
    // MongoDB: check Mongoose connection state
    Promise.resolve(
      mongoose.connection.readyState === 1 ? ("up" as const) : ("down" as const)
    ),
    // ChromaDB: HTTP ping
    pingService(`${CHROMA_HOST}/api/v2/healthcheck`),
    // Ollama: HTTP ping
    pingService(`${OLLAMA_HOST}/api/tags`),
  ]);

  const gpu = getGpuTelemetry();
  const activeSessions = getActiveSessionCount();
  const maxConcurrentSessions = getConfiguredMaxConcurrentSessions();
  const transportSecurity = getInternalTransportSecurityStatus();

  const allUp =
    mongoStatus === "up" &&
    chromaStatus === "up" &&
    ollamaStatus === "up" &&
    gpu.available;

  return res.json({
    status: allUp ? "ok" : "degraded",
    mongodb: mongoStatus,
    chromadb: chromaStatus,
    ollama: ollamaStatus,
    transport_security: {
      mode: transportSecurity.mode,
      compliant: transportSecurity.compliant,
      enforcement: transportSecurity.enforcement,
      reason: transportSecurity.reason,
    },
    gpu: {
      available: gpu.available,
      ...(gpu.available
        ? {
            temperature_c: gpu.gpu_temp_c,
            vram_used_mb: gpu.vram_used_mb,
            vram_total_mb: gpu.vram_total_mb,
          }
        : {}),
    },
    active_sessions: activeSessions,
    max_sessions: maxConcurrentSessions,
  });
});
