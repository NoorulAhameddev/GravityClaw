import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPaths = vi.hoisted(() => ({
  PATH_ALLOWLIST: undefined as string | undefined,
  SAFE_DIRECTORIES: undefined as string | undefined,
}));

vi.mock('../config.ts', () => {
  function getAllowedPaths(): string[] {
    if (!mockPaths.PATH_ALLOWLIST || mockPaths.PATH_ALLOWLIST.trim() === '') {
      return [process.cwd()];
    }
    return mockPaths.PATH_ALLOWLIST.split(',').map(p => p.trim()).filter(p => p.length > 0);
  }

  function getSafeDirectories(): string[] {
    if (!mockPaths.SAFE_DIRECTORIES || mockPaths.SAFE_DIRECTORIES.trim() === '') {
      return [process.cwd()];
    }
    return mockPaths.SAFE_DIRECTORIES.split(',').map(p => p.trim()).filter(p => p.length > 0);
  }

  return {
    config: {},
    getAllowedPaths,
    getSafeDirectories,
  };
});

import { getAllowedPaths, getSafeDirectories } from '../config.ts';

describe('getAllowedPaths()', () => {
  beforeEach(() => {
    mockPaths.PATH_ALLOWLIST = undefined;
  });

  describe('fallback behavior', () => {
    it('returns [process.cwd()] when PATH_ALLOWLIST is undefined', () => {
      expect(getAllowedPaths()).toEqual([process.cwd()]);
    });

    it('returns [process.cwd()] when PATH_ALLOWLIST is empty string', () => {
      mockPaths.PATH_ALLOWLIST = '';
      expect(getAllowedPaths()).toEqual([process.cwd()]);
    });

    it('returns [process.cwd()] when PATH_ALLOWLIST is only whitespace', () => {
      mockPaths.PATH_ALLOWLIST = '   ';
      expect(getAllowedPaths()).toEqual([process.cwd()]);
    });

    it('returns [process.cwd()] when PATH_ALLOWLIST is whitespace with tabs/newlines', () => {
      mockPaths.PATH_ALLOWLIST = ' \t\n  ';
      expect(getAllowedPaths()).toEqual([process.cwd()]);
    });
  });

  describe('single path', () => {
    it('parses a single path without trailing slash', () => {
      mockPaths.PATH_ALLOWLIST = '/tmp';
      expect(getAllowedPaths()).toEqual(['/tmp']);
    });

    it('trims whitespace from a single path', () => {
      mockPaths.PATH_ALLOWLIST = '  /tmp  ';
      expect(getAllowedPaths()).toEqual(['/tmp']);
    });
  });

  describe('comma-separated paths', () => {
    it('parses multiple comma-separated paths', () => {
      mockPaths.PATH_ALLOWLIST = '/tmp,/var/log,/home/user';
      expect(getAllowedPaths()).toEqual(['/tmp', '/var/log', '/home/user']);
    });

    it('trims whitespace around each path entry', () => {
      mockPaths.PATH_ALLOWLIST = ' /tmp , /var/log , /home/user ';
      expect(getAllowedPaths()).toEqual(['/tmp', '/var/log', '/home/user']);
    });

    it('handles trailing comma by filtering empty entries', () => {
      mockPaths.PATH_ALLOWLIST = '/tmp,/var/log,';
      expect(getAllowedPaths()).toEqual(['/tmp', '/var/log']);
    });

    it('handles leading comma by filtering empty entries', () => {
      mockPaths.PATH_ALLOWLIST = ',/tmp,/var/log';
      expect(getAllowedPaths()).toEqual(['/tmp', '/var/log']);
    });

    it('handles consecutive commas by filtering empty entries', () => {
      mockPaths.PATH_ALLOWLIST = '/tmp,,/var/log';
      expect(getAllowedPaths()).toEqual(['/tmp', '/var/log']);
    });

    it('handles only commas as empty entries', () => {
      mockPaths.PATH_ALLOWLIST = ',,,';
      expect(getAllowedPaths()).toEqual([]);
    });
  });

  describe('Windows paths', () => {
    it('handles Windows drive-letter paths', () => {
      mockPaths.PATH_ALLOWLIST = 'C:\\Users\\test,D:\\Projects';
      expect(getAllowedPaths()).toEqual(['C:\\Users\\test', 'D:\\Projects']);
    });

    it('handles Windows paths with spaces', () => {
      mockPaths.PATH_ALLOWLIST = 'C:\\Program Files\\App,D:\\My Documents';
      expect(getAllowedPaths()).toEqual(['C:\\Program Files\\App', 'D:\\My Documents']);
    });
  });

  describe('mixed edge cases', () => {
    it('handles paths with special characters', () => {
      mockPaths.PATH_ALLOWLIST = '/path/with-dashes,/path/with_underscores';
      expect(getAllowedPaths()).toEqual(['/path/with-dashes', '/path/with_underscores']);
    });

    it('handles a single dot as current directory', () => {
      mockPaths.PATH_ALLOWLIST = '.';
      expect(getAllowedPaths()).toEqual(['.']);
    });
  });
});

describe('getSafeDirectories()', () => {
  beforeEach(() => {
    mockPaths.SAFE_DIRECTORIES = undefined;
  });

  describe('fallback behavior', () => {
    it('returns [process.cwd()] when SAFE_DIRECTORIES is undefined', () => {
      expect(getSafeDirectories()).toEqual([process.cwd()]);
    });

    it('returns [process.cwd()] when SAFE_DIRECTORIES is empty string', () => {
      mockPaths.SAFE_DIRECTORIES = '';
      expect(getSafeDirectories()).toEqual([process.cwd()]);
    });

    it('returns [process.cwd()] when SAFE_DIRECTORIES is only whitespace', () => {
      mockPaths.SAFE_DIRECTORIES = '     ';
      expect(getSafeDirectories()).toEqual([process.cwd()]);
    });
  });

  describe('single directory', () => {
    it('parses a single directory', () => {
      mockPaths.SAFE_DIRECTORIES = '/data';
      expect(getSafeDirectories()).toEqual(['/data']);
    });

    it('trims whitespace', () => {
      mockPaths.SAFE_DIRECTORIES = '  /data  ';
      expect(getSafeDirectories()).toEqual(['/data']);
    });
  });

  describe('comma-separated directories', () => {
    it('parses multiple comma-separated directories', () => {
      mockPaths.SAFE_DIRECTORIES = '/tmp,/var/log,/home/user';
      expect(getSafeDirectories()).toEqual(['/tmp', '/var/log', '/home/user']);
    });

    it('trims whitespace around entries', () => {
      mockPaths.SAFE_DIRECTORIES = ' /tmp , /var/log ';
      expect(getSafeDirectories()).toEqual(['/tmp', '/var/log']);
    });

    it('filters empty entries from trailing comma', () => {
      mockPaths.SAFE_DIRECTORIES = '/tmp,/var/log,';
      expect(getSafeDirectories()).toEqual(['/tmp', '/var/log']);
    });

    it('filters empty entries from consecutive commas', () => {
      mockPaths.SAFE_DIRECTORIES = '/tmp,,/var/log';
      expect(getSafeDirectories()).toEqual(['/tmp', '/var/log']);
    });

    it('returns empty array when only empty entries', () => {
      mockPaths.SAFE_DIRECTORIES = ',,';
      expect(getSafeDirectories()).toEqual([]);
    });
  });

  describe('independence from PATH_ALLOWLIST', () => {
    it('respects SAFE_DIRECTORIES regardless of PATH_ALLOWLIST value', () => {
      mockPaths.PATH_ALLOWLIST = '/restricted';
      mockPaths.SAFE_DIRECTORIES = '/safe';
      expect(getSafeDirectories()).toEqual(['/safe']);
    });
  });
});
