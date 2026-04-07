import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSecretAccessLog, resetRateLimitForTesting } from '../../secrets';

// Mock db module
const mockPrepare = vi.fn();
vi.mock('../../db', () => ({
  db: { prepare: mockPrepare },
}));

// Mock logger to suppress output
vi.mock('../../logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('SQL Injection Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitForTesting();
  });

  describe('Parameterized Queries', () => {
    it('should use parameterized queries for limit', () => {
      // Mock db.prepare to capture the query
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      getSecretAccessLog({ limit: 10 });
      
      // Should use ? placeholder, not string interpolation
      const firstCall = mockPrepare.mock.calls[0];
      const query = firstCall?.[0];
      expect(query).toContain('LIMIT ?');
      expect(query).not.toContain('LIMIT 10');
    });

    it('should use parameterized queries for days', () => {
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      getSecretAccessLog({ days: 7 });
      
      const firstCall = mockPrepare.mock.calls[0];
      const query = firstCall?.[0];
      expect(query).toContain('?');
      // The days parameter is used as a negative number
      const params = firstCall?.slice(1) as unknown[] | undefined;
      expect(params).toContain(-7);
    });

    it('should use parameterized queries for secret_name', () => {
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      getSecretAccessLog({ secret_name: 'test_secret' });
      
      const firstCall = mockPrepare.mock.calls[0];
      const query = firstCall?.[0];
      expect(query).toContain('secret_name = ?');
      const params = firstCall?.slice(1) as unknown[] | undefined;
      expect(params).toContain('test_secret');
    });

    it('should use parameterized queries for action', () => {
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      getSecretAccessLog({ action: 'read' });
      
      const firstCall = mockPrepare.mock.calls[0];
      const query = firstCall?.[0];
      expect(query).toContain('action = ?');
      const params = firstCall?.slice(1) as unknown[] | undefined;
      expect(params).toContain('read');
    });
  });

  describe('Input Validation', () => {
    it('should validate action parameter', () => {
      // Invalid action should throw
      expect(() => {
        getSecretAccessLog({ action: 'invalid' as any });
      }).toThrow('Invalid action');
    });

    it('should validate days parameter range', () => {
      expect(() => {
        getSecretAccessLog({ days: -1 });
      }).toThrow('Invalid days');
      
      expect(() => {
        getSecretAccessLog({ days: 400 });
      }).toThrow('Invalid days');
    });

    it('should validate limit parameter range', () => {
      expect(() => {
        getSecretAccessLog({ limit: 0 });
      }).toThrow('Invalid limit');
      
      expect(() => {
        getSecretAccessLog({ limit: 2000 });
      }).toThrow('Invalid limit');
    });

    it('should validate secret_name is string', () => {
      // secret_name must be string, but the validation function only checks type
      // Since the filter interface expects string | undefined, passing number will cause
      // the validation to fail (returns false) and throws error
      expect(() => {
        getSecretAccessLog({ secret_name: 123 as any });
      }).toThrow('Invalid filter parameters');
    });
  });

  describe('Default Values', () => {
    it('should apply default limit of 100', () => {
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      getSecretAccessLog();
      
      // Should have default limit of 100
      const firstCall = mockPrepare.mock.calls[0];
      const query = firstCall?.[0];
      const params = firstCall?.slice(1) as unknown[] | undefined;
      expect(params).toContain(100);
    });

    it('should not include optional filters when not provided', () => {
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      getSecretAccessLog();
      
      const firstCall = mockPrepare.mock.calls[0];
      const query = firstCall?.[0];
      expect(query).toContain('WHERE 1=1');
      expect(query).not.toContain('secret_name =');
      expect(query).not.toContain('action =');
      expect(query).not.toContain('datetime');
    });
  });

  describe('SQL Injection Attempts', () => {
    it('should not allow SQL injection via secret_name', () => {
      // The validation will reject non-string secret_name, but we also need to ensure
      // that even if a string passes, the parameterized query prevents injection
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      // This is a string, so passes type validation
      const malicious = "'; DROP TABLE secret_access_log; --";
      getSecretAccessLog({ secret_name: malicious });
      
      const firstCall = mockPrepare.mock.calls[0];
      const query = firstCall?.[0];
      // Query should still have placeholder
      expect(query).toContain('secret_name = ?');
      const params = firstCall?.slice(1) as unknown[] | undefined;
      // The malicious string should be passed as parameter, not concatenated
      expect(params).toContain(malicious);
      // Ensure the malicious SQL is not part of the query string
      expect(query).not.toContain('DROP TABLE');
    });

    it('should not allow SQL injection via action', () => {
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      // Action validation will reject invalid action, but we test the parameterized query
      // We need to pass a valid action to reach the query building
      const malicious = "read' OR '1'='1";
      // This will be rejected by action validation because not in allowedActions
      expect(() => {
        getSecretAccessLog({ action: malicious });
      }).toThrow('Invalid action');
    });

    it('should reject malformed filter objects', () => {
      expect(() => {
        getSecretAccessLog({ days: 'abc' as any });
      }).toThrow('Invalid filter parameters');
    });

    it('should reject null/undefined filters', () => {
      // undefined is allowed (no filters)
      const result = getSecretAccessLog(undefined);
      expect(result).toBeDefined();
      
      // null should be rejected
      expect(() => {
        getSecretAccessLog(null as any);
      }).toThrow('Invalid filter parameters');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limit on queries', () => {
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      // Simulate many queries (rate limit is 10 per minute)
      for (let i = 0; i < 10; i++) {
        getSecretAccessLog();
      }
      
      // 11th query should throw rate limit error
      expect(() => {
        getSecretAccessLog();
      }).toThrow('Rate limit exceeded for audit log queries');
    });

    it('should reset rate limit after calling resetRateLimitForTesting', () => {
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      for (let i = 0; i < 10; i++) {
        getSecretAccessLog();
      }
      
      resetRateLimitForTesting();
      
      // Should allow more queries after reset
      expect(() => {
        getSecretAccessLog();
      }).not.toThrow();
    });
  });
});