/**
 * Unified Subprocess Code Execution Tool
 * Modeled directly on Hermes Agent (code_execution_tool.py)
 * 
 * Supports executing JavaScript/Node.js, Python, and PowerShell in an isolated
 * subprocess with stdout/stderr capture, timeout enforcement, and output truncation.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { Tool } from '../index.js';
import { createLogger } from '../../logger.ts';

const log = createLogger('code-execution');

const MAX_STDOUT_BYTES = 50 * 1024; // 50 KB
const MAX_STDERR_BYTES = 10 * 1024; // 10 KB
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;

function truncateOutput(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, 'utf-8');
  if (buf.length <= maxBytes) {
    return { text, truncated: false };
  }
  const headBytes = Math.floor(maxBytes * 0.4);
  const tailBytes = Math.floor(maxBytes * 0.6);
  const head = buf.subarray(0, headBytes).toString('utf-8');
  const tail = buf.subarray(buf.length - tailBytes).toString('utf-8');
  return {
    text: `${head}\n\n[... Truncated ${buf.length - maxBytes} bytes ...]\n\n${tail}`,
    truncated: true,
  };
}

export const executeCodeTool: Tool = {
  name: 'execute_code',
  description:
    'Execute code in a managed subprocess. Supports "javascript" (or "node"), "python", and "powershell". Captures stdout/stderr, enforces timeouts, and returns structured execution telemetry.',
  inputSchema: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['javascript', 'node', 'python', 'powershell'],
        description: 'Programming language / runtime to execute.',
      },
      code: {
        type: 'string',
        description: 'Source code content to execute.',
      },
      timeout_seconds: {
        type: 'number',
        description: 'Maximum execution time in seconds (default 30, max 120).',
      },
    },
    required: ['language', 'code'],
  },
  requiresApproval: true,
  async execute(input: Record<string, unknown>): Promise<string> {
    const rawLanguage = String(input.language || '').toLowerCase().trim();
    const code = String(input.code || '');
    const requestedTimeout = Number(input.timeout_seconds || DEFAULT_TIMEOUT_SECONDS);
    const timeoutSeconds = Math.max(1, Math.min(requestedTimeout, MAX_TIMEOUT_SECONDS));

    if (!code.trim()) {
      return JSON.stringify({
        success: false,
        error: 'No code provided to execute.',
      });
    }

    const tempDir = os.tmpdir();
    const randomId = crypto.randomBytes(6).toString('hex');
    let tempFile = '';
    let command = '';
    let args: string[] = [];

    try {
      if (rawLanguage === 'javascript' || rawLanguage === 'node' || rawLanguage === 'js') {
        tempFile = path.join(tempDir, `gravity_exec_${randomId}.mjs`);
        await fs.writeFile(tempFile, code, 'utf-8');
        command = 'node';
        args = [tempFile];
      } else if (rawLanguage === 'python' || rawLanguage === 'py') {
        tempFile = path.join(tempDir, `gravity_exec_${randomId}.py`);
        await fs.writeFile(tempFile, code, 'utf-8');
        command = 'python';
        args = [tempFile];
      } else if (rawLanguage === 'powershell' || rawLanguage === 'pwsh' || rawLanguage === 'ps1') {
        tempFile = path.join(tempDir, `gravity_exec_${randomId}.ps1`);
        await fs.writeFile(tempFile, code, 'utf-8');
        command = 'powershell';
        args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tempFile];
      } else {
        return JSON.stringify({
          success: false,
          error: `Unsupported language: ${rawLanguage}. Supported: javascript, node, python, powershell`,
        });
      }

      const startMs = Date.now();
      const result = await new Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
        timedOut: boolean;
      }>((resolve) => {
        let stdoutData = '';
        let stderrData = '';
        let timedOut = false;

        const child = spawn(command, args, {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            NODE_ENV: 'development',
          },
        });

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) child.kill('SIGKILL');
          }, 2000);
        }, timeoutSeconds * 1000);

        child.stdout.on('data', (chunk) => {
          stdoutData += chunk.toString('utf-8');
        });

        child.stderr.on('data', (chunk) => {
          stderrData += chunk.toString('utf-8');
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({
            exitCode: code ?? (timedOut ? -1 : 0),
            stdout: stdoutData,
            stderr: stderrData,
            timedOut,
          });
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          resolve({
            exitCode: 1,
            stdout: stdoutData,
            stderr: `Spawn error: ${err.message}`,
            timedOut: false,
          });
        });
      });

      const durationMs = Date.now() - startMs;
      const { text: cleanStdout, truncated: stdoutTruncated } = truncateOutput(
        result.stdout,
        MAX_STDOUT_BYTES,
      );
      const { text: cleanStderr, truncated: stderrTruncated } = truncateOutput(
        result.stderr,
        MAX_STDERR_BYTES,
      );

      return JSON.stringify({
        success: result.exitCode === 0 && !result.timedOut,
        exitCode: result.exitCode,
        durationMs,
        timedOut: result.timedOut,
        stdout: cleanStdout,
        stderr: cleanStderr,
        stdoutTruncated,
        stderrTruncated,
      });
    } catch (err) {
      log.error('Code execution failed', err);
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (tempFile) {
        fs.unlink(tempFile).catch(() => {});
      }
    }
  },
};
