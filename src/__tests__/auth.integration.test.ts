import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../logger.ts", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    headers: {},
    ip: "192.168.1.100",
    path: "/api/test",
    method: "GET",
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("Auth Middleware", () => {
  afterEach(() => {
    vi.doUnmock("../config.ts");
  });

  describe("when API_KEY is not configured", () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.doMock("../config.ts", () => ({
        config: {
          API_KEY: undefined,
          AUTH_TRUSTED_CIDRS: undefined,
          AUTH_ALLOW_LOCALHOST: false,
        },
        getAllowedPaths: () => ["."],
        getSafeDirectories: () => ["."],
      }));
    });

    it("should return 503 when no API key is configured", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: { "x-api-key": "any-key" } });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("when API_KEY is configured", () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.doMock("../config.ts", () => ({
        config: {
          API_KEY: "test-api-key-123",
          AUTH_TRUSTED_CIDRS: undefined,
          AUTH_ALLOW_LOCALHOST: false,
        },
        getAllowedPaths: () => ["."],
        getSafeDirectories: () => ["."],
      }));
    });

    it("should reject requests without x-api-key header (401)", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq();
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Unauthorized" })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject requests with invalid API key (401)", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: { "x-api-key": "wrong-key" } });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Unauthorized" })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should accept requests with valid API key (calls next)", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: { "x-api-key": "test-api-key-123" } });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should set req.apiKey when valid key is provided", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: { "x-api-key": "test-api-key-123" } });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(req.apiKey).toBe("test-api-key-123");
    });

    it("should reject empty x-api-key header (401)", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: { "x-api-key": "" } });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject missing x-api-key header (401)", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: {} });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("X-Api-Key") })
      );
    });
  });

  describe("localhost bypass behavior", () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.doMock("../config.ts", () => ({
        config: {
          API_KEY: "test-api-key-123",
          AUTH_TRUSTED_CIDRS: undefined,
          AUTH_ALLOW_LOCALHOST: false,
        },
        getAllowedPaths: () => ["."],
        getSafeDirectories: () => ["."],
      }));
    });

    it("should allow localhost requests without API key in dev mode", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: {}, ip: "127.0.0.1" });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it("should allow ::1 localhost bypass in dev mode", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: {}, ip: "::1" });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it("should allow IPv6 localhost mapped IPv4 bypass in dev mode", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: {}, ip: "::ffff:127.0.0.1" });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it("should require API key from non-localhost even in dev mode", async () => {
      const { authMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: {}, ip: "10.0.0.1" });
      const res = createRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("constant-time comparison", () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.doMock("../config.ts", () => ({
        config: {
          API_KEY: "test-api-key-123",
          AUTH_TRUSTED_CIDRS: undefined,
          AUTH_ALLOW_LOCALHOST: false,
        },
        getAllowedPaths: () => ["."],
        getSafeDirectories: () => ["."],
      }));
    });

    it("should use constant-time comparison for API key", async () => {
      const { constantTimeEquals } = await import("../middleware/auth.ts");

      expect(constantTimeEquals("abc", "abc")).toBe(true);
      expect(constantTimeEquals("abc", "xyz")).toBe(false);
      expect(constantTimeEquals("abc", "abcd")).toBe(false);
      expect(constantTimeEquals("", "")).toBe(true);
    });
  });

  describe("optional auth middleware", () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.doMock("../config.ts", () => ({
        config: {
          API_KEY: "test-api-key-123",
          AUTH_TRUSTED_CIDRS: undefined,
          AUTH_ALLOW_LOCALHOST: false,
        },
        getAllowedPaths: () => ["."],
        getSafeDirectories: () => ["."],
      }));
    });

    it("should call next without error when no API key header", async () => {
      const { optionalAuthMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: {} });
      const res = createRes();
      const next = vi.fn();

      optionalAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.apiKey).toBeUndefined();
    });

    it("should set req.apiKey when valid key is provided", async () => {
      const { optionalAuthMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: { "x-api-key": "test-api-key-123" } });
      const res = createRes();
      const next = vi.fn();

      optionalAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.apiKey).toBe("test-api-key-123");
    });

    it("should not set req.apiKey when invalid key is provided", async () => {
      const { optionalAuthMiddleware } = await import("../middleware/auth.ts");
      const req = createReq({ headers: { "x-api-key": "wrong-key" } });
      const res = createRes();
      const next = vi.fn();

      optionalAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.apiKey).toBeUndefined();
    });
  });
});
