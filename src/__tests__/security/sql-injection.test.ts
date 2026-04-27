import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSecretAccessLog, resetRateLimitForTesting } from '../../secrets';

// Mock db module
const mockAll = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockPrepare = vi.hoisted(() => vi.fn().mockReturnValue({ all: mockAll }));

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
      getSecretAccessLog({ limit: 10 });
      
      const query = mockPrepare.mock.calls[0]?.[0];
      const params = mockAll.mock.calls[0];
      expect(query).toContain('LIMIT ?');
      expect(query).not.toContain('LIMIT 10');
      expect(params).toContain(10);
    });

    it('should use parameterized queries for days', () => {
      getSecretAccessLog({ days: 7 });
      
      const query = mockPrepare.mock.calls[0]?.[0];
      const params = mockAll.mock.calls[0];
      expect(query).toContain('?');
      expect(params).toContain(-7);
    });

    it('should use parameterized queries for secret_name', () => {
      getSecretAccessLog({ secret_name: 'test_secret' });
      
      const query = mockPrepare.mock.calls[0]?.[0];
      const params = mockAll.mock.calls[0];
      expect(query).toContain('secret_name = ?');
      expect(params).toContain('test_secret');
    });

    it('should use parameterized queries for action', () => {
      getSecretAccessLog({ action: 'read' });
      
      const query = mockPrepare.mock.calls[0]?.[0];
      const params = mockAll.mock.calls[0];
      expect(query).toContain('action = ?');
      expect(params).toContain('read');
    });
  });

  describe('Input Validation', () => {
    it('should validate action parameter', () => {
      const result = getSecretAccessLog({ action: 'invalid' as any });
      expect(result).toEqual([]);
      expect(mockPrepare).not.toHaveBeenCalled();
    });

    it('should validate days parameter range', () => {
      expect(getSecretAccessLog({ days: -1 })).toEqual([]);
      expect(getSecretAccessLog({ days: 400 })).toEqual([]);
      expect(mockPrepare).not.toHaveBeenCalled();
    });

    it('should validate limit parameter range', () => {
      expect(getSecretAccessLog({ limit: 0 })).toEqual([]);
      expect(getSecretAccessLog({ limit: 2000 })).toEqual([]);
      expect(mockPrepare).not.toHaveBeenCalled();
    });

    it('should validate secret_name is string', () => {
      expect(getSecretAccessLog({ secret_name: 123 as any })).toEqual([]);
      expect(mockPrepare).not.toHaveBeenCalled();
    });
  });

  describe('Default Values', () => {
    it('should apply default limit of 100', () => {
      getSecretAccessLog();
      
      const params = mockAll.mock.calls[0];
      expect(params).toContain(100);
    });

    it('should not include optional filters when not provided', () => {
      getSecretAccessLog();
      
      const query = mockPrepare.mock.calls[0]?.[0];
      expect(query).toContain('WHERE 1=1');
      expect(query).not.toContain('secret_name =');
      expect(query).not.toContain('action =');
      expect(query).not.toContain('datetime');
    });
  });

  describe('SQL Injection Attempts', () => {
    it('should not allow SQL injection via secret_name', () => {
      const malicious = "'; DROP TABLE secret_access_log; --";
      getSecretAccessLog({ secret_name: malicious });
      
      const query = mockPrepare.mock.calls[0]?.[0];
      const params = mockAll.mock.calls[0];
      expect(query).toContain('secret_name = ?');
      expect(params).toContain(malicious);
      expect(query).not.toContain('DROP TABLE');
    });

    it('should not allow SQL injection via action', () => {
      const malicious = "read' OR '1'='1";
      const result = getSecretAccessLog({ action: malicious });
      expect(result).toEqual([]);
      expect(mockPrepare).not.toHaveBeenCalled();
    });

    it('should reject malformed filter objects', () => {
      expect(getSecretAccessLog({ days: 'abc' as any })).toEqual([]);
      expect(mockPrepare).not.toHaveBeenCalled();
    });

    it('should reject null/undefined filters', () => {
      const result = getSecretAccessLog(undefined);
      expect(result).toBeDefined();
      
      expect(getSecretAccessLog(null as any)).toEqual([]);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limit on queries', () => {
      for (let i = 0; i < 10; i++) {
        getSecretAccessLog();
      }
      expect(mockPrepare).toHaveBeenCalledTimes(10);
      
      const rateLimitedResult = getSecretAccessLog();
      expect(rateLimitedResult).toEqual([]);
      expect(mockPrepare).toHaveBeenCalledTimes(10); // 11th call should not hit db
    });

    it('should reset rate limit after calling resetRateLimitForTesting', () => {
      for (let i = 0; i < 10; i++) {
        getSecretAccessLog();
      }
      
      resetRateLimitForTesting();
      
      expect(getSecretAccessLog()).toBeDefined();
      expect(mockPrepare).toHaveBeenCalledTimes(11);
    });
  });
});

