import { describe, it, expect } from 'vitest';
import { sandboxTool } from '../../tools/sandbox.ts';

describe('Sandbox Code Execution Tool', () => {
  it('should execute basic JavaScript without ENOENT errors', async () => {
    const result = await sandboxTool.execute({
      language: 'javascript',
      code: 'console.log("HELLO_" + (2 + 2));',
    });

    expect(result).toContain('HELLO_4');
  });

  it('should block process.env in JavaScript code', async () => {
    const result = await sandboxTool.execute({
      language: 'javascript',
      code: 'console.log(process.env);',
    });

    expect(result).not.toContain('API_KEY');
  });
});
