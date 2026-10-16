import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseMemoryContent,
  saveMemoryEntry,
  loadMemoryPrompt,
  scanMemoryFiles,
  isMemoryDirectoryEnabled,
} from '../memory/memdir.ts';
import { UNTRUSTED_MEMORY_BEGIN, UNTRUSTED_MEMORY_END } from '../memory/sanitize.ts';

describe('Memory Directory (memdir)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-memdir-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('reports memory directory enabled state', () => {
    expect(typeof isMemoryDirectoryEnabled()).toBe('boolean');
  });

  it('parses structured memory content with tags and sources', () => {
    const rawContent = `[user]
User prefers TypeScript over JavaScript.
[feedback] # CodingStyle
Always avoid unnecessary comments.
[project]
Working on personal agent framework.`;

    const entries = parseMemoryContent(rawContent);

    expect(entries).toHaveLength(3);
    expect(entries[0]?.type).toBe('user');
    expect(entries[0]?.content).toBe('User prefers TypeScript over JavaScript.');
    expect(entries[1]?.type).toBe('feedback');
    expect(entries[1]?.source).toBe('CodingStyle');
    expect(entries[1]?.content).toBe('Always avoid unnecessary comments.');
    expect(entries[2]?.type).toBe('project');
    expect(entries[2]?.content).toBe('Working on personal agent framework.');
  });

  it('saves memory entry and scans memory files', () => {
    saveMemoryEntry(tempDir, 'user', 'Prefers dark mode', 'UI');

    const files = scanMemoryFiles(tempDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.some((f) => f.endsWith('MEMORY.md'))).toBe(true);
  });

  it('loads memory prompt wrapped in untrusted memory security markers', async () => {
    saveMemoryEntry(tempDir, 'user', 'Key preference fact', 'Pref');

    const prompt = await loadMemoryPrompt(tempDir);

    expect(prompt).toContain(UNTRUSTED_MEMORY_BEGIN);
    expect(prompt).toContain(UNTRUSTED_MEMORY_END);
    expect(prompt).toContain('Key preference fact');
  });

  it('returns empty string when no memory directory or file exists', async () => {
    const emptyDir = path.join(tempDir, 'nonexistent');
    const prompt = await loadMemoryPrompt(emptyDir);
    expect(prompt).toBe('');
  });
});
