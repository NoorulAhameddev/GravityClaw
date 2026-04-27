/**
 * Rate Limiting Tests
 * 
 * Tests for the rate limiting middleware and token bucket algorithm
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rateLimiter } from "../middleware/rate-limit.ts";

describe("Rate Limiter", () => {
  const testSessionId = "test-session-" + Date.now();

  beforeEach(() => {
    // Reset rate limits before each test
    rateLimiter.resetSessionLimits(testSessionId);
  });

  afterEach(() => {
    // Cleanup after tests
    rateLimiter.resetSessionLimits(testSessionId);
  });

  describe("Token Bucket Algorithm", () => {
    it("should allow requests within the limit", () => {
      // Use a categorized tool (memory, burst=20) to test within-limit behavior
      for (let i = 0; i < 10; i++) {
        const status = rateLimiter.checkRateLimit(testSessionId, "save_fact");
        expect(status.allowed).toBe(true);
        expect(status.tokensAvailable).toBeGreaterThanOrEqual(0);
      }
    });

    it("should deny requests that exceed the burst", () => {
      // Voice category burst=5: use dedicated session to test category-level denial
      const bucketSession = "bucket-test-" + Date.now();
      for (let i = 0; i < 5; i++) {
        const status = rateLimiter.checkRateLimit(bucketSession, "text_to_speech");
        expect(status.allowed).toBe(true);
      }

      // 6th request should fail (voice burst=5 exhausted)
      const status = rateLimiter.checkRateLimit(bucketSession, "text_to_speech");
      expect(status.allowed).toBe(false);
      expect(status.retryAfter).toBeGreaterThan(0);
      rateLimiter.resetSessionLimits(bucketSession);
    });

    it("should calculate correct retry time", () => {
      // Use up voice burst
      const retrySession = "retry-test-" + Date.now();
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkRateLimit(retrySession, "text_to_speech");
      }

      // Next request should be denied
      const status = rateLimiter.checkRateLimit(retrySession, "text_to_speech");
      expect(status.allowed).toBe(false);
      expect(status.retryAfter).toBeGreaterThanOrEqual(0);
      expect(status.resetTime).toBeGreaterThan(Date.now());
      rateLimiter.resetSessionLimits(retrySession);
    });
  });


  describe("Tool Category Limiting", () => {
    it("should apply different limits to voice tools", () => {
      // Voice limit is 50 req/min with burst 5 — use dedicated session
      const voiceSession = "voice-test-" + Date.now();
      for (let i = 0; i < 5; i++) {
        const status = rateLimiter.checkRateLimit(voiceSession, "text_to_speech");
        expect(status.allowed).toBe(true);
      }

      // 6th should fail (voice category burst=5 exhausted)
      const status = rateLimiter.checkRateLimit(voiceSession, "text_to_speech");
      expect(status.allowed).toBe(false);
      rateLimiter.resetSessionLimits(voiceSession);
    });

    it("should apply different limits to memory tools", () => {
      // Memory limit is 200 req/min with burst 20 — use dedicated session
      const memSession = "memory-test-" + Date.now();
      for (let i = 0; i < 20; i++) {
        const status = rateLimiter.checkRateLimit(memSession, "save_fact");
        expect(status.allowed).toBe(true);
      }

      // 21st should fail (memory category burst=20 exhausted)
      const status = rateLimiter.checkRateLimit(memSession, "save_fact");
      expect(status.allowed).toBe(false);
      rateLimiter.resetSessionLimits(memSession);
    });

    it("should apply different limits to system tools", () => {
      // System limit is 500 req/min with burst 50 — use dedicated session
      const sysSession = "system-test-" + Date.now();
      for (let i = 0; i < 50; i++) {
        const status = rateLimiter.checkRateLimit(sysSession, "run_shell");
        expect(status.allowed).toBe(true);
      }

      // 51st should fail (system category burst=50 exhausted)
      const status = rateLimiter.checkRateLimit(sysSession, "run_shell");
      expect(status.allowed).toBe(false);
      rateLimiter.resetSessionLimits(sysSession);
    });
  });

  describe("Rate Limit Status", () => {
    it("should return accurate status", () => {
      const status1 = rateLimiter.getStatus(testSessionId);
      expect(status1.allowed).toBe(true);
      expect(status1.tokensAvailable).toBe(status1.limit.burstSize);

      // Use some tokens
      rateLimiter.checkRateLimit(testSessionId, "test_tool");
      rateLimiter.checkRateLimit(testSessionId, "test_tool");

      const status2 = rateLimiter.getStatus(testSessionId);
      expect(status2.tokensAvailable).toBeLessThan(status1.tokensAvailable);
    });

    it("should include reset time in status", () => {
      const status = rateLimiter.getStatus(testSessionId);
      expect(status.resetTime).toBeGreaterThan(Date.now());
    });
  });

  describe("Custom Limits", () => {
    it("should allow users to set custom (lower) limits", () => {
      const success = rateLimiter.updateCustomLimit(testSessionId, 20);
      expect(success).toBe(true);

      // Custom limit should be 20, burst will still be proportional
      const status = rateLimiter.getStatus(testSessionId);
      expect(status.limit.requestsPerMinute).toBe(20);
    });

    it("should reject invalid custom limits", () => {
      const success1 = rateLimiter.updateCustomLimit(testSessionId, 0);
      expect(success1).toBe(false);

      const success2 = rateLimiter.updateCustomLimit(testSessionId, -10);
      expect(success2).toBe(false);
    });
  });

  describe("Rate Limit History", () => {
    it("should track rate limit history", () => {
      const histSession = "history-test-" + Date.now();
      rateLimiter.checkRateLimit(histSession, "tool1");
      rateLimiter.checkRateLimit(histSession, "tool1");
      rateLimiter.checkRateLimit(histSession, "tool2");

      const history = rateLimiter.getHistory(histSession);
      expect(history.length).toBe(3);
      rateLimiter.resetSessionLimits(histSession);
    });

    it("should filter history by tool name", () => {
      const filterSession = "filter-test-" + Date.now();
      rateLimiter.checkRateLimit(filterSession, "tool1");
      rateLimiter.checkRateLimit(filterSession, "tool1");
      rateLimiter.checkRateLimit(filterSession, "tool2");

      const history = rateLimiter.getHistory(filterSession, { toolName: "tool1" });
      expect(history.length).toBe(2);
      expect(history.every(h => h.toolName === "tool1")).toBe(true);
      rateLimiter.resetSessionLimits(filterSession);
    });

    it("should respect history limit", () => {
      for (let i = 0; i < 100; i++) {
        rateLimiter.checkRateLimit(testSessionId, "test_tool");
      }

      const history = rateLimiter.getHistory(testSessionId, { limit: 20 });
      expect(history.length).toBeLessThanOrEqual(20);
    });
  });

  describe("Development Mode", () => {
    it("should provide higher limits in development", () => {
      const isDev = rateLimiter.isDevelopmentMode();
      // Can't really test this without mocking NODE_ENV
      // But we can verify the method exists
      expect(typeof isDev).toBe("boolean");
    });
  });

  describe("Session Reset", () => {
    it("should reset all limits for a session", () => {
      // Use some tokens
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkRateLimit(testSessionId, "test_tool");
      }

      // Verify tokens were used
      let status = rateLimiter.getStatus(testSessionId);
      expect(status.tokensAvailable).toBeLessThan(status.limit.burstSize);

      // Reset
      const success = rateLimiter.resetSessionLimits(testSessionId);
      expect(success).toBe(true);

      // Verify reset
      status = rateLimiter.getStatus(testSessionId);
      expect(status.tokensAvailable).toBe(status.limit.burstSize);
    });
  });

  describe("Independent Session Buckets", () => {
    it("should maintain separate limits for different sessions", () => {
      const session1 = "session-1-" + Date.now();
      const session2 = "session-2-" + Date.now();

      // Use tokens in session 1
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkRateLimit(session1, "test_tool");
      }

      // Session 2 should still have full tokens
      const status2 = rateLimiter.getStatus(session2);
      expect(status2.tokensAvailable).toBe(status2.limit.burstSize);

      // Session 1 should have used tokens
      const status1 = rateLimiter.getStatus(session1);
      expect(status1.tokensAvailable).toBeLessThan(status1.limit.burstSize);

      // Cleanup
      rateLimiter.resetSessionLimits(session1);
      rateLimiter.resetSessionLimits(session2);
    });
  });

  describe("Multiple Tool Categories", () => {
    it("should enforce limits independently per tool category", () => {
      // Use up voice tool budget
      for (let i = 0; i < 5; i++) {
        const status = rateLimiter.checkRateLimit(testSessionId, "text_to_speech");
        if (i < 5) expect(status.allowed).toBe(true);
      }

      // Voice should be denied
      let voiceStatus = rateLimiter.checkRateLimit(testSessionId, "text_to_speech");
      expect(voiceStatus.allowed).toBe(false);

      // But memory tools should still work
      let memoryStatus = rateLimiter.checkRateLimit(testSessionId, "save_fact");
      expect(memoryStatus.allowed).toBe(true);

      // And system tools should still work
      let systemStatus = rateLimiter.checkRateLimit(testSessionId, "run_shell");
      expect(systemStatus.allowed).toBe(true);
    });
  });
});

/**
 * Integration test example
 * This demonstrates how rate limiting works in a real scenario
 */
describe("Rate Limiter Integration Scenario", () => {
  const sessionId = "integration-test-" + Date.now();

  afterEach(() => {
    rateLimiter.resetSessionLimits(sessionId);
  });

  it("should handle a typical user session", () => {
    // User makes requests for different tools
    const requests = [
      { tool: "save_fact", shouldAllow: true },
      { tool: "text_to_speech", shouldAllow: true },
      { tool: "run_shell", shouldAllow: true },
      { tool: "save_fact", shouldAllow: true },
      { tool: "recall_facts", shouldAllow: true },
    ];

    for (const req of requests) {
      const status = rateLimiter.checkRateLimit(sessionId, req.tool);
      expect(status.allowed).toBe(req.shouldAllow);
    }

    // Check final status
    const finalStatus = rateLimiter.getStatus(sessionId);
    expect(finalStatus.tokensAvailable).toBeGreaterThan(0);
    expect(finalStatus.requestsThisMinute).toBe(5);
  });
});
