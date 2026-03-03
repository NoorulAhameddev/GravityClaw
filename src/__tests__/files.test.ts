/**
 * Tests for File Operations Tools
 * 
 * Tests all 5 file operation tools:
 * - read_file
 * - write_file
 * - list_files
 * - delete_file
 * - search_files
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readFileTool,
  writeFileTool,
  listFilesTool,
  deleteFileTool,
  searchFilesTool,
} from '../tools/files.js';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);

// Test directory in workspace
const TEST_DIR = path.join(process.cwd(), 'test-files-temp');

describe('File Operations Tools', () => {
  beforeEach(async () => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      await mkdir(TEST_DIR, { recursive: true });
    }
  });

  afterEach(async () => {
    // Clean up test files recursively
    if (fs.existsSync(TEST_DIR)) {
      const removeRecursive = async (dir: string): Promise<void> => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await removeRecursive(fullPath);
            await rmdir(fullPath);
          } else {
            await unlink(fullPath);
          }
        }
      };
      
      await removeRecursive(TEST_DIR);
      await rmdir(TEST_DIR);
    }
  });

  describe('Tool Metadata', () => {
    it('should have correct metadata for read_file', () => {
      expect(readFileTool.name).toBe('read_file');
      expect(readFileTool.description).toContain('Read the contents');
      expect(readFileTool.description).toContain('10MB');
      expect(readFileTool.inputSchema.required).toContain('path');
    });

    it('should have correct metadata for write_file', () => {
      expect(writeFileTool.name).toBe('write_file');
      expect(writeFileTool.description).toContain('Write content');
      expect(writeFileTool.description).toContain('5MB');
      expect(writeFileTool.inputSchema.required).toContain('path');
      expect(writeFileTool.inputSchema.required).toContain('content');
    });

    it('should have correct metadata for list_files', () => {
      expect(listFilesTool.name).toBe('list_files');
      expect(listFilesTool.description).toContain('List files');
      expect(listFilesTool.inputSchema.required).toContain('directory');
    });

    it('should have correct metadata for delete_file', () => {
      expect(deleteFileTool.name).toBe('delete_file');
      expect(deleteFileTool.description).toContain('Delete a file');
      expect(deleteFileTool.description).toContain('WARNING');
      expect(deleteFileTool.inputSchema.required).toContain('path');
      expect(deleteFileTool.inputSchema.required).toContain('confirm');
    });

    it('should have correct metadata for search_files', () => {
      expect(searchFilesTool.name).toBe('search_files');
      expect(searchFilesTool.description).toContain('Search for files');
      expect(searchFilesTool.inputSchema.required).toContain('directory');
      expect(searchFilesTool.inputSchema.required).toContain('pattern');
    });
  });

  describe('read_file', () => {
    it('should read a text file successfully', async () => {
      const testFile = path.join(TEST_DIR, 'test.txt');
      const testContent = 'Hello World';
      await writeFile(testFile, testContent, 'utf8');

      const result = await readFileTool.execute({ path: testFile });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.content).toBe(testContent);
      expect(parsed.encoding).toBe('utf8');
    });

    it('should read file with base64 encoding', async () => {
      const testFile = path.join(TEST_DIR, 'binary.dat');
      const testContent = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      await writeFile(testFile, testContent);

      const result = await readFileTool.execute({ path: testFile, encoding: 'base64' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.encoding).toBe('base64');
      expect(parsed.content).toBe(testContent.toString('base64'));
    });

    it('should reject reading file outside allowlist', async () => {
      // Try to read /etc/passwd (blocked system directory)
      const result = await readFileTool.execute({ path: '/etc/passwd' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Access denied');
    });

    it('should reject reading .env file', async () => {
      const testFile = path.join(TEST_DIR, '.env');
      await writeFile(testFile, 'SECRET=123', 'utf8');

      const result = await readFileTool.execute({ path: testFile });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Access denied');
    });

    it('should reject reading non-existent file', async () => {
      const result = await readFileTool.execute({ path: path.join(TEST_DIR, 'nonexistent.txt') });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });

    it('should reject reading oversized file', async () => {
      const testFile = path.join(TEST_DIR, 'large.txt');
      // Create 11MB file (over 10MB limit)
      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      await writeFile(testFile, largeContent, 'utf8');

      const result = await readFileTool.execute({ path: testFile });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('too large');
    });
  });

  describe('write_file', () => {
    it('should write a text file successfully', async () => {
      const testFile = path.join(TEST_DIR, 'output.txt');
      const testContent = 'Test Output';

      const result = await writeFileTool.execute({ path: testFile, content: testContent });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);
      
      const written = fs.readFileSync(testFile, 'utf8');
      expect(written).toBe(testContent);
    });

    it('should create parent directories', async () => {
      const testFile = path.join(TEST_DIR, 'subdir', 'nested', 'file.txt');
      const testContent = 'Nested content';

      const result = await writeFileTool.execute({ path: testFile, content: testContent });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);
    });

    it('should write base64-encoded content', async () => {
      const testFile = path.join(TEST_DIR, 'binary2.dat');
      const testBuffer = Buffer.from('Binary data');
      const base64Content = testBuffer.toString('base64');

      const result = await writeFileTool.execute({
        path: testFile,
        content: base64Content,
        encoding: 'base64',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      const written = fs.readFileSync(testFile);
      expect(written.toString()).toBe('Binary data');
    });

    it('should reject writing to path outside allowlist', async () => {
      const result = await writeFileTool.execute({
        path: '/etc/test.txt',
        content: 'Bad content',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Access denied');
    });

    it('should reject writing .env file', async () => {
      const result = await writeFileTool.execute({
        path: path.join(TEST_DIR, '.env'),
        content: 'SECRET=123',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Access denied');
    });

    it('should reject writing oversized content', async () => {
      const largeContent = 'x'.repeat(6 * 1024 * 1024); // 6MB (over 5MB limit)

      const result = await writeFileTool.execute({
        path: path.join(TEST_DIR, 'large.txt'),
        content: largeContent,
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('too large');
    });
  });

  describe('list_files', () => {
    it('should list files in directory', async () => {
      // Create test files
      await writeFile(path.join(TEST_DIR, 'file1.txt'), 'Content 1');
      await writeFile(path.join(TEST_DIR, 'file2.txt'), 'Content 2');
      await mkdir(path.join(TEST_DIR, 'subdir'));
      await writeFile(path.join(TEST_DIR, 'subdir', 'file3.txt'), 'Content 3');

      const result = await listFilesTool.execute({ directory: TEST_DIR });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(3); // file1, file2, subdir
      expect(parsed.files).toHaveLength(3);

      const fileNames = parsed.files.map((f: any) => f.name);
      expect(fileNames).toContain('file1.txt');
      expect(fileNames).toContain('file2.txt');
      expect(fileNames).toContain('subdir');
    });

    it('should list files recursively', async () => {
      await writeFile(path.join(TEST_DIR, 'root.txt'), 'Root');
      await mkdir(path.join(TEST_DIR, 'subdir'));
      await writeFile(path.join(TEST_DIR, 'subdir', 'nested.txt'), 'Nested');

      const result = await listFilesTool.execute({ directory: TEST_DIR, recursive: true });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.recursive).toBe(true);
      expect(parsed.count).toBeGreaterThanOrEqual(3); // root.txt, subdir, nested.txt
      
      const paths = parsed.files.map((f: any) => f.path);
      expect(paths).toContain('root.txt');
      expect(paths.some((p: string) => p.includes('nested.txt'))).toBe(true);
    });

    it('should include file metadata', async () => {
      await writeFile(path.join(TEST_DIR, 'meta.txt'), 'Metadata test');

      const result = await listFilesTool.execute({ directory: TEST_DIR });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      const file = parsed.files.find((f: any) => f.name === 'meta.txt');
      
      expect(file).toBeDefined();
      expect(file.type).toBe('file');
      expect(file.size).toBeGreaterThan(0);
      expect(file.modified).toBeDefined();
    });

    it('should reject listing directory outside allowlist', async () => {
      const result = await listFilesTool.execute({ directory: '/etc' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Access denied');
    });

    it('should reject listing non-existent directory', async () => {
      const result = await listFilesTool.execute({ directory: path.join(TEST_DIR, 'nonexistent') });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });
  });

  describe('delete_file', () => {
    it('should delete file with confirmation', async () => {
      const testFile = path.join(TEST_DIR, 'delete-me.txt');
      await writeFile(testFile, 'To be deleted');

      const result = await deleteFileTool.execute({ path: testFile, confirm: true });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should reject deletion without confirmation', async () => {
      const testFile = path.join(TEST_DIR, 'keep-me.txt');
      await writeFile(testFile, 'Should stay');

      const result = await deleteFileTool.execute({ path: testFile, confirm: false });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('confirmation');
      expect(fs.existsSync(testFile)).toBe(true);
    });

    it('should reject deleting non-existent file', async () => {
      const result = await deleteFileTool.execute({
        path: path.join(TEST_DIR, 'nonexistent.txt'),
        confirm: true,
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });

    it('should reject deleting directories', async () => {
      const testDir = path.join(TEST_DIR, 'subdir2');
      await mkdir(testDir);

      const result = await deleteFileTool.execute({ path: testDir, confirm: true });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('directories');
    });

    it('should reject deleting file outside allowlist', async () => {
      const result = await deleteFileTool.execute({ path: '/etc/test.txt', confirm: true });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Access denied');
    });

    it('should reject deleting .env file', async () => {
      const testFile = path.join(TEST_DIR, '.env.local');
      await writeFile(testFile, 'SECRET=123');

      const result = await deleteFileTool.execute({ path: testFile, confirm: true });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Access denied');
    });
  });

  describe('search_files', () => {
    it('should search files by pattern', async () => {
      await writeFile(path.join(TEST_DIR, 'test1.ts'), 'TypeScript 1');
      await writeFile(path.join(TEST_DIR, 'test2.ts'), 'TypeScript 2');
      await writeFile(path.join(TEST_DIR, 'test3.js'), 'JavaScript');

      const result = await searchFilesTool.execute({ directory: TEST_DIR, pattern: '*.ts' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2);
      
      const names = parsed.matches.map((m: any) => m.name);
      expect(names).toContain('test1.ts');
      expect(names).toContain('test2.ts');
      expect(names).not.toContain('test3.js');
    });

    it('should search files with wildcard pattern', async () => {
      await writeFile(path.join(TEST_DIR, 'component.tsx'), 'React');
      await writeFile(path.join(TEST_DIR, 'utils.ts'), 'Utils');
      await writeFile(path.join(TEST_DIR, 'styles.css'), 'CSS');

      const result = await searchFilesTool.execute({ directory: TEST_DIR, pattern: '*.t*' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2); // component.tsx, utils.ts
    });

    it('should search recursively through subdirectories', async () => {
      await writeFile(path.join(TEST_DIR, 'root.md'), 'Root');
      await mkdir(path.join(TEST_DIR, 'docs'));
      await writeFile(path.join(TEST_DIR, 'docs', 'guide.md'), 'Guide');
      await mkdir(path.join(TEST_DIR, 'docs', 'api'));
      await writeFile(path.join(TEST_DIR, 'docs', 'api', 'reference.md'), 'Reference');

      const result = await searchFilesTool.execute({ directory: TEST_DIR, pattern: '*.md' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(3); // root.md, guide.md, reference.md
    });

    it('should search file contents when specified', async () => {
      await writeFile(path.join(TEST_DIR, 'hasKeyword.txt'), 'This file contains SEARCHME keyword');
      await writeFile(path.join(TEST_DIR, 'noKeyword.txt'), 'This file does not contain it');

      const result = await searchFilesTool.execute({
        directory: TEST_DIR,
        pattern: '*.txt',
        content_search: 'SEARCHME',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
      expect(parsed.matches[0].name).toBe('hasKeyword.txt');
    });

    it('should be case-insensitive for content search', async () => {
      await writeFile(path.join(TEST_DIR, 'mixed.txt'), 'MixedCase Content');

      const result = await searchFilesTool.execute({
        directory: TEST_DIR,
        pattern: '*.txt',
        content_search: 'mixedcase',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
    });

    it('should reject searching directory outside allowlist', async () => {
      const result = await searchFilesTool.execute({ directory: '/etc', pattern: '*' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Access denied');
    });

    it('should return empty results when no matches', async () => {
      await writeFile(path.join(TEST_DIR, 'test.txt'), 'Text');

      const result = await searchFilesTool.execute({ directory: TEST_DIR, pattern: '*.xyz' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(0);
      expect(parsed.matches).toHaveLength(0);
    });
  });

  describe('Security', () => {
    it('should block all system directories', async () => {
      const blockedPaths = ['/etc/passwd', '/sys/kernel', '/proc/cpuinfo', '/dev/null'];

      for (const blockedPath of blockedPaths) {
        const result = await readFileTool.execute({ path: blockedPath });
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain('Access denied');
      }
    });

    it('should block sensitive file patterns', async () => {
      const sensitiveFiles = [
        '.env',
        '.env.production',
        'credentials.json',
        'password.txt',
        'secret-key.json',
        'private-key.pem',
        'id_rsa',
        '.npmrc',
      ];

      for (const fileName of sensitiveFiles) {
        const testPath = path.join(TEST_DIR, fileName);
        await writeFile(testPath, 'Sensitive data');

        const result = await readFileTool.execute({ path: testPath });
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain('Access denied');
      }
    });

    it('should allow files in workspace by default', async () => {
      // Files in test directory (which is in workspace) should be allowed
      const testFile = path.join(TEST_DIR, 'allowed.txt');
      await writeFile(testFile, 'Allowed content');

      const result = await readFileTool.execute({ path: testFile });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.content).toBe('Allowed content');
    });
  });

  describe('Cross-platform paths', () => {
    it('should handle relative paths', async () => {
      const testFile = path.join(TEST_DIR, 'relative.txt');
      await writeFile(testFile, 'Relative path test');

      // Use relative path from current directory
      const relativePath = path.relative(process.cwd(), testFile);
      const result = await readFileTool.execute({ path: relativePath });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.content).toBe('Relative path test');
    });

    it('should handle absolute paths', async () => {
      const testFile = path.join(TEST_DIR, 'absolute.txt');
      await writeFile(testFile, 'Absolute path test');

      const result = await readFileTool.execute({ path: testFile });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.content).toBe('Absolute path test');
    });

    it('should normalize path separators', async () => {
      const testFile = path.join(TEST_DIR, 'normalize.txt');
      await writeFile(testFile, 'Path separator test');

      // Use forward slashes even on Windows
      const forwardSlashPath = testFile.replace(/\\/g, '/');
      const result = await readFileTool.execute({ path: forwardSlashPath });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.content).toBe('Path separator test');
    });
  });
});
