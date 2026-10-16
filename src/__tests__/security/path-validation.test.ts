import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

vi.mock('../../config.ts', () => ({
  config: { UNRESTRICTED_ACCESS: false },
  UNRESTRICTED_ACCESS: false,
}));
vi.mock('../../logger.ts', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  clearValidationCache,
  isPathSafe,
  validatePathAccess,
} from '../../security/path-validator.ts';

let root: string;
let outside: string;

function validate(filePath: string, allowedPaths: string[] = [root]) {
  return validatePathAccess(filePath, { allowedPaths, action: 'read' });
}

function symlinkDirectory(target: string, link: string): void {
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

describe('Path validation security', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(tmpdir(), 'gravity-path-root-'));
    outside = fs.mkdtempSync(path.join(tmpdir(), 'gravity-path-outside-'));
    clearValidationCache();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
    clearValidationCache();
  });

  it('allows a normal file inside an allowed directory', () => {
    const target = path.join(root, 'file.txt');
    fs.writeFileSync(target, 'safe');
    expect(validate(target).allowed).toBe(true);
  });

  it('rejects paths that only share an allowed directory prefix', () => {
    const sibling = root + '-evil';
    fs.mkdirSync(sibling, { recursive: true });
    try {
      const target = path.join(sibling, 'secret.txt');
      fs.writeFileSync(target, 'outside');
      expect(validate(target).allowed).toBe(false);
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('rejects traversal components', () => {
    expect(validatePathAccess('../etc/passwd', { allowedPaths: [root] }).allowed).toBe(false);
  });

  it('blocks sensitive filenames', () => {
    const target = path.join(root, '.env');
    fs.writeFileSync(target, 'secret=value');
    expect(validate(target).allowed).toBe(false);
  });

  it('rejects a symlink whose final target is outside the allowlist', () => {
    const secret = path.join(outside, 'secret.txt');
    const alias = path.join(root, 'secret-link.txt');
    fs.writeFileSync(secret, 'safe');
    fs.symlinkSync(secret, alias);
    expect(validate(alias).allowed).toBe(false);
  });

  it('rejects an existing file reached through a symlinked parent directory', () => {
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'safe');
    symlinkDirectory(outside, path.join(root, 'outside-link'));
    expect(validate(path.join(root, 'outside-link', 'secret.txt')).allowed).toBe(false);
  });

  it('rejects a not-yet-created file beneath a symlinked parent directory', () => {
    symlinkDirectory(outside, path.join(root, 'outside-link'));
    expect(validate(path.join(root, 'outside-link', 'new.txt')).allowed).toBe(false);
  });

  it('allows a symlink when its resolved target stays inside the allowlist', () => {
    const actual = path.join(root, 'actual.txt');
    fs.writeFileSync(actual, 'safe');
    fs.symlinkSync(actual, path.join(root, 'safe-link.txt'));
    expect(validate(path.join(root, 'safe-link.txt')).allowed).toBe(true);
  });

  it('rejects a broken symlink instead of treating it as a missing file', () => {
    fs.symlinkSync(path.join(outside, 'missing.txt'), path.join(root, 'broken-link.txt'));
    expect(validate(path.join(root, 'broken-link.txt')).allowed).toBe(false);
  });

  it('revalidates a path after an allowed file is replaced by an escaping symlink', () => {
    const target = path.join(root, 'replace-me.txt');
    const secret = path.join(outside, 'secret.txt');
    fs.writeFileSync(target, 'safe');
    fs.writeFileSync(secret, 'outside');

    expect(validate(target).allowed).toBe(true);
    fs.unlinkSync(target);
    fs.symlinkSync(secret, target);
    expect(validate(target).allowed).toBe(false);
  });

  it('isPathSafe accepts contained paths and rejects traversal and symlink escapes', () => {
    fs.writeFileSync(path.join(root, 'safe.txt'), 'safe');
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    symlinkDirectory(outside, path.join(root, 'outside-link'));

    expect(isPathSafe(root, 'safe.txt')).toBe(true);
    expect(isPathSafe(root, '../../../../../../etc/passwd')).toBe(false);
    expect(isPathSafe(root, root + '-evil/secret.txt')).toBe(false);
    expect(isPathSafe(root, 'outside-link/secret.txt')).toBe(false);
  });
});
