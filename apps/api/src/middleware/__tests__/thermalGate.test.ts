import { describe, it, expect, beforeEach } from "vitest";
import {
  thermalGate,
  getGpuTelemetry,
  parseNvidiaSmiOutput,
  GPU_TEMP_THRESHOLD_C,
  THERMAL_POLL_INTERVAL_MS,
  _setTelemetryForTest,
} from "../thermalGate.js";

function mockReq(): any {
  return {};
}

function mockRes(): any {
  const res: any = {
    statusCode: 200,
    _json: null as any,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      res._json = body;
      return res;
    },
    set(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  };
  return res;
}

describe("thermalGate middleware", () => {
  beforeEach(() => {
    // Reset to unavailable (degraded) by default
    _setTelemetryForTest({ available: false });
  });

  it("calls next() when GPU temp <= 83°C", () => {
    _setTelemetryForTest({ available: true, gpu_temp_c: 75, vram_used_mb: 8000, vram_total_mb: 24576 });

    let called = false;
    thermalGate(mockReq(), mockRes(), () => { called = true; });
    expect(called).toBe(true);
  });

  it("calls next() when GPU temp is exactly 83°C (boundary — not exceeded)", () => {
    _setTelemetryForTest({ available: true, gpu_temp_c: 83, vram_used_mb: 8000, vram_total_mb: 24576 });

    let called = false;
    thermalGate(mockReq(), mockRes(), () => { called = true; });
    expect(called).toBe(true);
  });

  it("returns 503 with thermal_capacity envelope when GPU temp > 83°C", () => {
    _setTelemetryForTest({ available: true, gpu_temp_c: 84, vram_used_mb: 8000, vram_total_mb: 24576 });

    let nextCalled = false;
    const res = mockRes();
    thermalGate(mockReq(), res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(503);
    expect(res._json.error).toBe("thermal_capacity");
    expect(res._json.retry_after_seconds).toBe(300);
    expect(res._json.message).toContain("84°C");
  });

  it("calls next() in degraded mode (nvidia-smi unavailable)", () => {
    _setTelemetryForTest({ available: false });

    let called = false;
    thermalGate(mockReq(), mockRes(), () => { called = true; });
    expect(called).toBe(true);
  });
});

describe("getGpuTelemetry", () => {
  beforeEach(() => {
    _setTelemetryForTest({ available: false });
  });

  it("returns { available: false } when nvidia-smi unavailable", () => {
    const t = getGpuTelemetry();
    expect(t.available).toBe(false);
  });

  it("returns correct shape with available: true when data present", () => {
    _setTelemetryForTest({
      available: true,
      gpu_temp_c: 72,
      vram_used_mb: 5000,
      vram_total_mb: 24576,
      last_updated: "2026-03-24T00:00:00.000Z",
    });

    const t = getGpuTelemetry();
    expect(t.available).toBe(true);
    expect(t.gpu_temp_c).toBe(72);
    expect(t.vram_used_mb).toBe(5000);
    expect(t.vram_total_mb).toBe(24576);
    expect(t.last_updated).toBeDefined();
  });

  it("returns a copy, not the internal reference", () => {
    _setTelemetryForTest({ available: true, gpu_temp_c: 50 });
    const t1 = getGpuTelemetry();
    t1.gpu_temp_c = 999;
    const t2 = getGpuTelemetry();
    expect(t2.gpu_temp_c).toBe(50);
  });
});

describe("parseNvidiaSmiOutput", () => {
  it("parses valid CSV output", () => {
    const result = parseNvidiaSmiOutput("72, 5120, 24576\n");
    expect(result).not.toBeNull();
    expect(result!.available).toBe(true);
    expect(result!.gpu_temp_c).toBe(72);
    expect(result!.vram_used_mb).toBe(5120);
    expect(result!.vram_total_mb).toBe(24576);
    expect(result!.last_updated).toBeDefined();
  });

  it("returns null for empty string", () => {
    expect(parseNvidiaSmiOutput("")).toBeNull();
  });

  it("returns null for malformed output (fewer than 3 fields)", () => {
    expect(parseNvidiaSmiOutput("72, 5120")).toBeNull();
  });

  it("returns null for non-numeric values", () => {
    expect(parseNvidiaSmiOutput("abc, def, ghi")).toBeNull();
  });

  it("handles output with extra whitespace", () => {
    const result = parseNvidiaSmiOutput("  72 ,  5120 ,  24576  \n");
    expect(result).not.toBeNull();
    expect(result!.gpu_temp_c).toBe(72);
  });
});

describe("constants", () => {
  it("GPU_TEMP_THRESHOLD_C is 83", () => {
    expect(GPU_TEMP_THRESHOLD_C).toBe(83);
  });

  it("THERMAL_POLL_INTERVAL_MS is 30000", () => {
    expect(THERMAL_POLL_INTERVAL_MS).toBe(30_000);
  });
});
