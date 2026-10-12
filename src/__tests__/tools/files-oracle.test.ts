import { describe, it, expect } from 'vitest';
import { searchFilesTool } from '../../tools/system/files.ts';
import fs from 'fs';
import path from 'path';

describe('Search Files Security Boundary', () => {
  it('should not return content from sensitive files like .env', async () => {
    const tempDir = path.join(process.cwd(), 'temp-test-oracle-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET_API_KEY=supersecret', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'normal.txt'), 'NORMAL_CONTENT', 'utf-8');

    try {
      const result = await searchFilesTool.execute({
        directory: tempDir,
        pattern: '*',
        content_search: 'SECRET_API_KEY',
      });

      const parsed = JSON.parse(result);
      expect(parsed.matches || []).toHaveLength(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
