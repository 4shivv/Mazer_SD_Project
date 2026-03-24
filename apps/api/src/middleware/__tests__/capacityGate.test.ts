import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "events";
import {
  capacityGate,
  initCapacityTracking,
  getActiveSessionCount,
  MAX_CONCURRENT_SESSIONS,
} from "../capacityGate.js";

/** Minimal mock Express request. */
function mockReq(): any {
  return {};
}

/** Minimal mock Express response with event emitter support. */
function mockRes(): any {
  const emitter = new EventEmitter();
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
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
  return res;
}

describe("capacityGate", () => {
  beforeEach(() => {
    initCapacityTracking();
  });

  it("calls next() when active sessions < MAX", () => {
    let called = false;
    const next = () => { called = true; };
    capacityGate(mockReq(), mockRes(), next);
    expect(called).toBe(true);
    expect(getActiveSessionCount()).toBe(1);
  });

  it("returns 503 with server_at_capacity envelope when at MAX", () => {
    // Fill to capacity
    for (let i = 0; i < MAX_CONCURRENT_SESSIONS; i++) {
      capacityGate(mockReq(), mockRes(), () => {});
    }
    expect(getActiveSessionCount()).toBe(MAX_CONCURRENT_SESSIONS);

    // Next request should be rejected
    let nextCalled = false;
    const res = mockRes();
    capacityGate(mockReq(), res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(503);
    expect(res._json).toEqual({
      error: "server_at_capacity",
      message: `Maximum concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached. Queued.`,
      queue_position: 1,
      estimated_wait_seconds: 60,
    });
  });

  it("includes queue_position as positive integer and estimated_wait_seconds as positive number", () => {
    for (let i = 0; i < MAX_CONCURRENT_SESSIONS; i++) {
      capacityGate(mockReq(), mockRes(), () => {});
    }

    const res = mockRes();
    capacityGate(mockReq(), res, () => {});

    expect(res._json.queue_position).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(res._json.queue_position)).toBe(true);
    expect(res._json.estimated_wait_seconds).toBeGreaterThan(0);
  });

  it("increments session count on admission", () => {
    expect(getActiveSessionCount()).toBe(0);
    capacityGate(mockReq(), mockRes(), () => {});
    expect(getActiveSessionCount()).toBe(1);
    capacityGate(mockReq(), mockRes(), () => {});
    expect(getActiveSessionCount()).toBe(2);
  });

  it("decrements session count on res finish event", () => {
    const res = mockRes();
    capacityGate(mockReq(), res, () => {});
    expect(getActiveSessionCount()).toBe(1);

    res.emit("finish");
    expect(getActiveSessionCount()).toBe(0);
  });

  it("decrements session count on res close event", () => {
    const res = mockRes();
    capacityGate(mockReq(), res, () => {});
    expect(getActiveSessionCount()).toBe(1);

    res.emit("close");
    expect(getActiveSessionCount()).toBe(0);
  });

  it("does not double-decrement when both finish and close fire", () => {
    const res = mockRes();
    capacityGate(mockReq(), res, () => {});
    expect(getActiveSessionCount()).toBe(1);

    res.emit("finish");
    res.emit("close");
    expect(getActiveSessionCount()).toBe(0);
  });

  it("does not go below 0 on spurious decrement", () => {
    const res = mockRes();
    capacityGate(mockReq(), res, () => {});
    res.emit("finish");
    expect(getActiveSessionCount()).toBe(0);

    // Simulate another close (should be a no-op due to decremented guard)
    res.emit("close");
    expect(getActiveSessionCount()).toBe(0);
  });

  it("getActiveSessionCount returns accurate count", () => {
    expect(getActiveSessionCount()).toBe(0);

    const responses: any[] = [];
    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      responses.push(res);
      capacityGate(mockReq(), res, () => {});
    }
    expect(getActiveSessionCount()).toBe(5);

    // Release 2
    responses[0].emit("finish");
    responses[1].emit("close");
    expect(getActiveSessionCount()).toBe(3);
  });

  it("MAX_CONCURRENT_SESSIONS is 12", () => {
    expect(MAX_CONCURRENT_SESSIONS).toBe(12);
  });
});
