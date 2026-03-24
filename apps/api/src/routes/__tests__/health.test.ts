import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock thermalGate module
vi.mock("../../middleware/thermalGate.js", () => ({
  getGpuTelemetry: vi.fn(),
}));

// Mock capacityGate module
vi.mock("../../middleware/capacityGate.js", () => ({
  getActiveSessionCount: vi.fn(),
  MAX_CONCURRENT_SESSIONS: 12,
}));

// Mock mongoose
vi.mock("mongoose", () => ({
  default: {
    connection: { readyState: 1 },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { healthRouter } from "../health.js";
import { getGpuTelemetry } from "../../middleware/thermalGate.js";
import { getActiveSessionCount } from "../../middleware/capacityGate.js";
import mongoose from "mongoose";

/** Helper: call GET / on healthRouter */
async function callHealthEndpoint() {
  const req: any = {};
  const res: any = {
    statusCode: 200,
    _json: null as any,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      res._json = body;
      return res;
    },
  };

  const layer = (healthRouter as any).stack.find(
    (l: any) => l.route?.path === "/" && l.route?.methods?.get
  );
  if (!layer) throw new Error("GET / route not found in healthRouter");

  const handler = layer.route.stack[0].handle;
  await handler(req, res, () => {});

  return res;
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mongoose.connection as any).readyState = 1;
    mockFetch.mockResolvedValue({ ok: true });
    (getGpuTelemetry as any).mockReturnValue({
      available: true,
      gpu_temp_c: 65,
      vram_used_mb: 7000,
      vram_total_mb: 24576,
    });
    (getActiveSessionCount as any).mockReturnValue(3);
  });

  it("returns 200 with all services up and status ok", async () => {
    const res = await callHealthEndpoint();

    expect(res.statusCode).toBe(200);
    expect(res._json.status).toBe("ok");
    expect(res._json.mongodb).toBe("up");
    expect(res._json.chromadb).toBe("up");
    expect(res._json.ollama).toBe("up");
    expect(res._json.gpu.available).toBe(true);
    expect(res._json.gpu.temperature_c).toBe(65);
    expect(res._json.gpu.vram_used_mb).toBe(7000);
    expect(res._json.gpu.vram_total_mb).toBe(24576);
    expect(res._json.active_sessions).toBe(3);
    expect(res._json.max_sessions).toBe(12);
  });

  it("returns status degraded when MongoDB is down", async () => {
    (mongoose.connection as any).readyState = 0;

    const res = await callHealthEndpoint();

    expect(res._json.status).toBe("degraded");
    expect(res._json.mongodb).toBe("down");
  });

  it("returns status degraded when ChromaDB ping fails", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("8000")) throw new Error("connection refused");
      return { ok: true };
    });

    const res = await callHealthEndpoint();

    expect(res._json.status).toBe("degraded");
    expect(res._json.chromadb).toBe("down");
    expect(res._json.ollama).toBe("up");
  });

  it("reports gpu available: false when telemetry unavailable", async () => {
    (getGpuTelemetry as any).mockReturnValue({ available: false });

    const res = await callHealthEndpoint();

    expect(res._json.status).toBe("degraded");
    expect(res._json.gpu.available).toBe(false);
    expect(res._json.gpu).not.toHaveProperty("temperature_c");
    expect(res._json.gpu).not.toHaveProperty("vram_used_mb");
  });

  it("reports accurate active_sessions count", async () => {
    (getActiveSessionCount as any).mockReturnValue(8);

    const res = await callHealthEndpoint();
    expect(res._json.active_sessions).toBe(8);
  });

  it("does not include sensitive data", async () => {
    const res = await callHealthEndpoint();
    const body = JSON.stringify(res._json);

    expect(body).not.toContain("password");
    expect(body).not.toContain("token");
    expect(body).not.toContain("secret");
    expect(body).not.toContain("jwt");
  });

  it("partial service failure does not crash endpoint", async () => {
    (mongoose.connection as any).readyState = 0;
    mockFetch.mockRejectedValue(new Error("network error"));
    (getGpuTelemetry as any).mockReturnValue({ available: false });

    const res = await callHealthEndpoint();

    expect(res.statusCode).toBe(200);
    expect(res._json.status).toBe("degraded");
    expect(res._json.mongodb).toBe("down");
    expect(res._json.chromadb).toBe("down");
    expect(res._json.ollama).toBe("down");
    expect(res._json.gpu.available).toBe(false);
  });
});
