import { describe, it, expect, vi } from 'vitest';
import { verifyBackup } from '../backup/verify.ts';
import { BackupManager } from '../backup/backup.ts';
import { writeFileSync, readFileSync, mkdtempSync, symlinkSync } from 'fs';
import { join, basename, dirname } from 'path';
import { tmpdir } from 'os';

describe('Backup verification', () => {
  it('refuses to create an encrypted backup without a persistent key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'backup-key-test-'));
    const manager = new BackupManager(dir);
    await expect(manager.createBackup({} as any, '/tmp/gravity.db')).rejects.toThrow(
      /MASTER_KEY|ephemeral/i,
    );
  });

  it('rejects traversal filenames in restore, delete, and verify operations', async () => {
    const backupDir = mkdtempSync(join(tmpdir(), 'backup-guard-'));
    const outsideDir = mkdtempSync(join(tmpdir(), 'backup-outside-'));
    const outsideFile = join(outsideDir, 'sentinel.txt');
    writeFileSync(outsideFile, 'do-not-change');
    const manager = new BackupManager(backupDir, 'persistent-test-key');
    const traversalName = '../' + basename(outsideDir) + '/sentinel.txt';

    expect(() => manager.deleteBackup(traversalName)).toThrow(/filename|path/i);
    expect(manager.verifyBackup(traversalName).valid).toBe(false);
    await expect(
      manager.restoreFromBackup({ close: vi.fn() } as any, traversalName, join(backupDir, 'live.db')),
    ).rejects.toThrow(/filename|path/i);
    expect(readFileSync(outsideFile, 'utf8')).toBe('do-not-change');
    expect(dirname(outsideFile)).toBe(outsideDir);
  });

  it('refuses to operate on backup symlinks pointing outside the backup directory', () => {
    const backupDir = mkdtempSync(join(tmpdir(), 'backup-symlink-'));
    const outsideDir = mkdtempSync(join(tmpdir(), 'backup-symlink-outside-'));
    const outsideFile = join(outsideDir, 'sentinel.backup');
    writeFileSync(outsideFile, 'do-not-change');
    symlinkSync(outsideFile, join(backupDir, 'backup-link.enc'));
    const manager = new BackupManager(backupDir, 'persistent-test-key');

    expect(() => manager.deleteBackup('backup-link.enc')).toThrow(/regular file/i);
    expect(manager.verifyBackup('backup-link.enc').valid).toBe(false);
    expect(readFileSync(outsideFile, 'utf8')).toBe('do-not-change');
  });

  it('detects missing files', () => {
    const result = verifyBackup('/nonexistent/path.tar.gz');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('File does not exist');
  });

  it('validates existing files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'backup-test-'));
    const file = join(dir, 'test.txt');
    writeFileSync(file, 'hello world');

    const result = verifyBackup(file);
    expect(result.valid).toBe(true);
    expect(result.size).toBe(11);
    expect(result.errors).toEqual([]);
  });

  it('detects size mismatch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'backup-test-'));
    const file = join(dir, 'test.txt');
    writeFileSync(file, 'hello world');

    const result = verifyBackup(file, { expectedSize: 999, expectedHash: '' });
    expect(result.sizeMatch).toBe(false);
    expect(result.valid).toBe(false);
  });

  it('detects hash mismatch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'backup-test-'));
    const file = join(dir, 'test.txt');
    writeFileSync(file, 'hello world');

    const result = verifyBackup(file, { expectedSize: 11, expectedHash: '0000' });
    expect(result.hashMatch).toBe(false);
    expect(result.valid).toBe(false);
  });
});
