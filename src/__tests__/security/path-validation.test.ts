import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';

// Mock config FIRST to override UNRESTRICTED_ACCESS before the path-validator loads it
vi.mock('../../config.ts', () => ({
  UNRESTRICTED_ACCESS: false,
  config: { UNRESTRICTED_ACCESS: false },
}));

// Mock the fs module
vi.mock('fs', () => ({
  lstatSync: vi.fn(),
  realpathSync: vi.fn(),
}));

// Mock path with simple implementations for testing
vi.mock('path', () => ({
  resolve: (...args: string[]) => args.filter(arg => arg).join('/'),
  normalize: (p: string) => p,
  relative: (from: string, to: string) => {
    if (to.startsWith(from)) {
      return to.substring(from.length + (from.endsWith('/') ? 0 : 1));
    }
    return '../' + to;
  },
  basename: (p: string) => {
    const parts = p.split(/[/\\]/);
    return parts[parts.length - 1] ?? '';
  },
}));

// Now import the module under test
import { validatePathAccess, clearValidationCache } from '../../security/path-validator';

describe('Path Validation Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearValidationCache();
  });

  describe('Symlink Validation', () => {
    it('should reject symlinks pointing outside allowed directories', () => {
      vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as any);
      vi.mocked(fs.realpathSync).mockReturnValue('/etc/passwd' as any);

      const result = validatePathAccess('/workspace/test_symlink', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Symlink');
    });

    it('should accept symlinks pointing inside allowed directories', () => {
      vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as any);
      vi.mocked(fs.realpathSync).mockReturnValue('/workspace/file.txt' as any);

      const result = validatePathAccess('/workspace/test_symlink', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });

      expect(result.allowed).toBe(true);
    });

    it('should reject broken symlinks', () => {
      vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as any);
      vi.mocked(fs.realpathSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = validatePathAccess('/workspace/broken_link', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should block path traversal with ../', () => {
      const result = validatePathAccess('../../etc/passwd', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('traversal');
    });

    it('should block null byte injection', () => {
      const result = validatePathAccess('file.txt\0.png', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe('Allowed Path Enforcement', () => {
    it('should only allow paths within allowed directories', () => {
      const result = validatePathAccess('/etc/passwd', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });

      expect(result.allowed).toBe(false);
    });

    it('should allow paths within allowed directories', () => {
      vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => false } as any);

      const result = validatePathAccess('/workspace/file.txt', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Blocked Patterns', () => {
    it('should block system directories like /etc/', () => {
      const result = validatePathAccess('/etc/passwd', {
        allowedPaths: ['/'],
        action: 'read',
      });
      expect(result.allowed).toBe(false);
    });

    it('should block sensitive file patterns', () => {
      const result = validatePathAccess('/workspace/.env', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });
      expect(result.allowed).toBe(false);
    });

    it('should block credential files', () => {
      const result = validatePathAccess('/workspace/credentials.json', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should reject empty path', () => {
      const result = validatePathAccess('', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Path is empty');
    });

    it('should reject whitespace-only path', () => {
      const result = validatePathAccess('   ', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });
      expect(result.allowed).toBe(false);
    });

    it('should handle multiple allowed paths', () => {
      vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => false } as any);

      const result = validatePathAccess('/home/user/project/file.txt', {
        allowedPaths: ['/workspace', '/home/user/project'],
        action: 'read',
      });
      expect(result.allowed).toBe(true);
    });

    it('should block when path is outside all allowed directories', () => {
      const result = validatePathAccess('/tmp/malicious.txt', {
        allowedPaths: ['/workspace', '/home'],
        action: 'write',
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe('Caching', () => {
    it('should cache validation results', () => {
      vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => false } as any);

      const result1 = validatePathAccess('/workspace/file.txt', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });

      const result2 = validatePathAccess('/workspace/file.txt', {
        allowedPaths: ['/workspace'],
        action: 'read',
      });

      expect(result1).toEqual(result2);
      expect(vi.mocked(fs.lstatSync)).toHaveBeenCalledTimes(1);
    });
  });
});