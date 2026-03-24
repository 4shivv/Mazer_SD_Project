import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock User model before importing the router
vi.mock("../../models/User.js", () => {
  const mockFind = vi.fn();
  return {
    User: {
      find: mockFind,
    },
    __mockFind: mockFind,
  };
});

// Mock auth middleware to allow controlling auth state per test
vi.mock("../../auth/middleware.js", () => ({
  requireAuth: vi.fn((req: any, _res: any, next: any) => {
    if (req._mockUser) {
      req.user = req._mockUser;
      return next();
    }
    return _res.status(401).json({ error: "Not logged in" });
  }),
  requireAdmin: vi.fn((req: any, res: any, next: any) => {
    if (req.user?.role === "admin") return next();
    return res.status(403).json({ error: "Admin only" });
  }),
}));

// Mock retention service to prevent import errors
vi.mock("../../services/admin/retentionAdminService.js", () => ({
  AdminRetentionServiceError: class extends Error {},
  updateRetentionPolicy: vi.fn(),
  wipeStoredData: vi.fn(),
}));

import { adminRouter } from "../admin.js";
import { User } from "../../models/User.js";

/** Helper: simulate Express route matching for GET /users */
async function callGetUsers(mockUser?: { id: string; role: string }) {
  const req: any = { _mockUser: mockUser, cookies: {} };
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

  // Find the GET /users handler in the router stack
  const layer = (adminRouter as any).stack.find(
    (l: any) => l.route?.path === "/users" && l.route?.methods?.get
  );

  if (!layer) throw new Error("GET /users route not found in adminRouter");

  // Execute the middleware chain
  const handlers = layer.route.stack.map((s: any) => s.handle);
  let idx = 0;
  const next = async () => {
    if (idx < handlers.length) {
      const handler = handlers[idx++];
      await handler(req, res, next);
    }
  };
  await next();

  return res;
}

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with array of users when admin authenticated", async () => {
    const mockUsers = [
      { _id: "1", username: "admin1", role: "admin", createdAt: new Date() },
      { _id: "2", username: "trainee1", role: "trainee", createdAt: new Date() },
    ];

    const mockQuery = { sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUsers) }) };
    (User.find as any).mockReturnValue(mockQuery);

    const res = await callGetUsers({ id: "1", role: "admin" });

    expect(res.statusCode).toBe(200);
    expect(res._json.users).toEqual(mockUsers);
    expect(res._json.users).toHaveLength(2);
  });

  it("excludes passwordHash from projection", async () => {
    const mockQuery = { sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) };
    (User.find as any).mockReturnValue(mockQuery);

    await callGetUsers({ id: "1", role: "admin" });

    // Verify User.find was called with passwordHash exclusion
    expect(User.find).toHaveBeenCalledWith({}, { passwordHash: 0 });
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await callGetUsers(undefined);
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when authenticated as non-admin", async () => {
    const res = await callGetUsers({ id: "2", role: "trainee" });
    expect(res.statusCode).toBe(403);
  });

  it("returns 500 on database error", async () => {
    (User.find as any).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const res = await callGetUsers({ id: "1", role: "admin" });
    expect(res.statusCode).toBe(500);
    expect(res._json.error).toBe("user_list_failed");
  });

  it("returns empty array when no users exist", async () => {
    const mockQuery = { sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) };
    (User.find as any).mockReturnValue(mockQuery);

    const res = await callGetUsers({ id: "1", role: "admin" });
    expect(res.statusCode).toBe(200);
    expect(res._json.users).toEqual([]);
  });
});
