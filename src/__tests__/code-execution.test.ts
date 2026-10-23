import { describe, it, expect } from 'vitest';
import { executeCodeTool } from '../tools/system/code-execution.ts';

describe('Unified Code Execution Tool (Hermes Parity)', () => {
  it('should have standard Tool definition', () => {
    expect(executeCodeTool.name).toBe('execute_code');
    expect(executeCodeTool.description).toBeDefined();
    expect(executeCodeTool.inputSchema).toBeDefined();
    expect(executeCodeTool.requiresApproval).toBe(true);
  });

  it('should reject empty code', async () => {
    const res = await executeCodeTool.execute({
      language: 'javascript',
      code: '   ',
    });
    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('No code provided');
  });

  it('should reject unsupported language', async () => {
    const res = await executeCodeTool.execute({
      language: 'brainfuck',
      code: '++++++++++[>+++++++>++++++++++>+++>+<<<<-]',
    });
    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Unsupported language');
  });

  it('should execute JavaScript/Node.js code and return output', async () => {
    const res = await executeCodeTool.execute({
      language: 'javascript',
      code: 'console.log("HERMES_PARITY_VERIFIED_" + (100 * 2));',
    });
    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(true);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.stdout).toContain('HERMES_PARITY_VERIFIED_200');
  });

  it('should capture errors and exit codes accurately', async () => {
    const res = await executeCodeTool.execute({
      language: 'javascript',
      code: 'console.error("FATAL_TEST_ERROR"); process.exit(42);',
    });
    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(false);
    expect(parsed.exitCode).toBe(42);
    expect(parsed.stderr).toContain('FATAL_TEST_ERROR');
  });
});
