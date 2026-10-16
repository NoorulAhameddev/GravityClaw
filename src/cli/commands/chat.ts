/**
 * Interactive chat command - REPL mode for direct agent interaction.
 * Features Hermes-style real-time streaming, tool execution cards, and slash commands.
 */

import { createInterface } from 'readline';
import { runAgent } from '../../agent.ts';
import { runWithConcurrencyLimit } from '../../concurrency.ts';
import { container } from '../../bootstrap.ts';
import { colors, success, error, info, warn, dim, highlight } from '../utils.ts';
import { getSessionSettings, updateSessionSetting } from '../../session.ts';
import { skillsManager } from '../../skills/index.ts';
import { loadFactsForPrompt } from '../../memory/markdown.ts';
import { db } from '../../db.ts';

export interface ChatOptions {
  sessionId?: string | undefined;
  verbose?: boolean;
}

function printBanner(sessionId: string, provider: string, model: string): void {
  console.log(`\n${colors.cyan}╭─────────────────────────────────────────────────────────────╮${colors.reset}`);
  console.log(`${colors.cyan}│${colors.reset}  ${colors.bright}${colors.white}☤ Gravity Claw Interactive Shell${colors.reset}                        ${colors.cyan}│${colors.reset}`);
  console.log(`${colors.cyan}│${colors.reset}  ${dim(`Session:  ${sessionId}`.padEnd(59))}${colors.cyan}│${colors.reset}`);
  console.log(`${colors.cyan}│${colors.reset}  ${dim(`Provider: ${provider}`.padEnd(28))} ${dim(`Model: ${model}`.padEnd(30))}${colors.cyan}│${colors.reset}`);
  console.log(`${colors.cyan}│${colors.reset}  ${dim('Type /help for slash commands, /clear to reset, exit to quit'.padEnd(59))}${colors.cyan}│${colors.reset}`);
  console.log(`${colors.cyan}╰─────────────────────────────────────────────────────────────╯${colors.reset}\n`);
}

function printHelp(): void {
  console.log(`\n${colors.bright}Available Slash Commands:${colors.reset}`);
  console.log(`  ${highlight('/help')}                  ${dim('Show this help message')}`);
  console.log(`  ${highlight('/status')}                ${dim('Display session status, model, and tool stats')}`);
  console.log(`  ${highlight('/model')} [name]          ${dim('View or switch active LLM model')}`);
  console.log(`  ${highlight('/provider')} [name]       ${dim('View or switch LLM provider (openrouter, anthropic, openai...)')}`);
  console.log(`  ${highlight('/thinking')} [level]      ${dim('View or set thinking level (off, low, medium, high)')}`);
  console.log(`  ${highlight('/tools')}                 ${dim('List all registered agent tools')}`);
  console.log(`  ${highlight('/skills')}                ${dim('List all loaded skill bundles')}`);
  console.log(`  ${highlight('/memory')}                ${dim('Inspect persistent facts and memory for this session')}`);
  console.log(`  ${highlight('/clear')}                 ${dim('Reset session conversation and memory')}`);
  console.log(`  ${highlight('exit')} / ${highlight('quit')}           ${dim('Exit the interactive shell')}\n`);
}

function summarizeToolInput(input: Record<string, unknown>): string {
  if (typeof input.command === 'string') {
    const cmd = input.command.replace(/\r?\n/g, ' ').trim();
    return dim(`command: "${cmd.length > 70 ? cmd.slice(0, 67) + '...' : cmd}"`);
  }
  if (typeof input.path === 'string') {
    return dim(`path: "${input.path}"`);
  }
  if (typeof input.query === 'string') {
    return dim(`query: "${input.query}"`);
  }
  if (typeof input.name === 'string') {
    return dim(`name: "${input.name}"`);
  }
  const keys = Object.keys(input);
  if (keys.length === 0) return dim('()');
  const serialized = JSON.stringify(input);
  return dim(serialized.length > 70 ? serialized.slice(0, 67) + '...' : serialized);
}

export async function chatCommand(options: ChatOptions): Promise<void> {
  const sessionId = options.sessionId || `cli-${Date.now()}`;
  const initialSettings = getSessionSettings(sessionId);
  const activeProvider = initialSettings.provider || container.config.LLM_PROVIDER;
  const activeModel = initialSettings.model || container.config.LLM_MODEL;

  printBanner(sessionId, activeProvider, activeModel);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.green}You${colors.reset} > `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const rawLine = line.trim();

    if (!rawLine) {
      rl.prompt();
      return;
    }

    // Direct exit
    if (rawLine === 'exit' || rawLine === 'quit' || rawLine === '/exit' || rawLine === '/quit') {
      success('Goodbye!');
      rl.close();
      return;
    }

    // Slash command handling
    if (rawLine.startsWith('/')) {
      const parts = rawLine.slice(1).split(/\s+/);
      const cmd = (parts[0] || '').toLowerCase();
      const arg = parts.slice(1).join(' ').trim();

      if (cmd === 'help') {
        printHelp();
        rl.prompt();
        return;
      }

      if (cmd === 'status') {
        const settings = getSessionSettings(sessionId);
        const prov = settings.provider || container.config.LLM_PROVIDER;
        const mod = settings.model || container.config.LLM_MODEL;
        const thinking = settings.thinkingLevel || 'off';
        const toolsCount = container.toolRegistry.getAll().length;
        const skillsCount = skillsManager.listSkills().length;

        const memoryRows = db
          .prepare('SELECT COUNT(*) as count FROM memory WHERE session_id = ?')
          .get(sessionId) as { count: number } | undefined;

        console.log(`\n${colors.bright}Session Status:${colors.reset}`);
        console.log(`  ${dim('Session ID:')}     ${sessionId}`);
        console.log(`  ${dim('Provider:')}       ${highlight(prov)}`);
        console.log(`  ${dim('Model:')}          ${highlight(mod)}`);
        console.log(`  ${dim('Thinking:')}       ${highlight(thinking)}`);
        console.log(`  ${dim('Messages:')}       ${memoryRows?.count ?? 0} in session memory`);
        console.log(`  ${dim('Tools:')}          ${toolsCount} registered`);
        console.log(`  ${dim('Skills:')}         ${skillsCount} available\n`);
        rl.prompt();
        return;
      }

      if (cmd === 'model') {
        if (!arg) {
          const settings = getSessionSettings(sessionId);
          const current = settings.model || container.config.LLM_MODEL;
          info(`Current model: ${highlight(current)}`);
          console.log(dim('Usage: /model <model-name> to switch for this session.'));
        } else {
          updateSessionSetting(sessionId, 'model', arg);
          success(`Model switched to: ${highlight(arg)}`);
        }
        rl.prompt();
        return;
      }

      if (cmd === 'provider') {
        if (!arg) {
          const settings = getSessionSettings(sessionId);
          const current = settings.provider || container.config.LLM_PROVIDER;
          info(`Current provider: ${highlight(current)}`);
          console.log(dim('Usage: /provider <openrouter|anthropic|openai|deepseek|groq>'));
        } else {
          updateSessionSetting(sessionId, 'provider', arg);
          success(`Provider switched to: ${highlight(arg)}`);
        }
        rl.prompt();
        return;
      }

      if (cmd === 'thinking') {
        const validLevels = ['off', 'low', 'medium', 'high'] as const;
        if (!arg) {
          const settings = getSessionSettings(sessionId);
          const current = settings.thinkingLevel || 'off';
          info(`Current thinking level: ${highlight(current)}`);
          console.log(dim('Usage: /thinking <off|low|medium|high>'));
        } else if (validLevels.includes(arg as (typeof validLevels)[number])) {
          updateSessionSetting(sessionId, 'thinkingLevel', arg as (typeof validLevels)[number]);
          success(`Thinking level set to: ${highlight(arg)}`);
        } else {
          warn(`Invalid thinking level "${arg}". Choose from: off, low, medium, high.`);
        }
        rl.prompt();
        return;
      }

      if (cmd === 'tools') {
        const tools = container.toolRegistry.getAll();
        console.log(`\n${colors.bright}Registered Tools (${tools.length}):${colors.reset}`);
        for (const t of tools) {
          const desc = t.description ? t.description.slice(0, 75) : 'No description';
          console.log(`  ${colors.yellow}⚡${colors.reset} ${highlight(t.name.padEnd(26))} ${dim(desc)}`);
        }
        console.log('');
        rl.prompt();
        return;
      }

      if (cmd === 'skills') {
        const skills = skillsManager.listSkills();
        console.log(`\n${colors.bright}Available Skills (${skills.length}):${colors.reset}`);
        if (skills.length === 0) {
          console.log(dim('  No skills loaded. Place skill markdown files in the skills/ directory.\n'));
        } else {
          for (const s of skills) {
            console.log(
              `  ${colors.cyan}●${colors.reset} ${highlight(s.name.padEnd(20))} ${dim(`${s.toolCount} tools, enabled: ${s.enabled}`)}`,
            );
          }
          console.log('');
        }
        rl.prompt();
        return;
      }

      if (cmd === 'memory') {
        const facts = loadFactsForPrompt(sessionId);
        const rows = db
          .prepare(
            'SELECT message_json, timestamp FROM memory WHERE session_id = ? ORDER BY id DESC LIMIT 5',
          )
          .all(sessionId) as Array<{ message_json: string; timestamp: string }>;

        const recentMessages = rows.map((r) => {
          try {
            const parsed = JSON.parse(r.message_json) as { role?: string; content?: unknown };
            return {
              role: parsed.role || 'unknown',
              content: parsed.content,
              timestamp: r.timestamp,
            };
          } catch {
            return { role: 'unknown', content: '', timestamp: r.timestamp };
          }
        });

        console.log(`\n${colors.bright}Session Memory & Facts:${colors.reset}`);
        if (facts) {
          console.log(`${colors.cyan}Verified Facts:${colors.reset}\n${facts}\n`);
        } else {
          console.log(dim('  No persistent facts recorded for this session yet.'));
        }

        if (recentMessages.length > 0) {
          console.log(`${colors.cyan}Recent History (${recentMessages.length} turns):${colors.reset}`);
          for (const m of recentMessages.reverse()) {
            const preview =
              typeof m.content === 'string'
                ? m.content.slice(0, 80).replace(/\r?\n/g, ' ')
                : '[complex content]';
            console.log(`  ${dim(m.role.padEnd(10))} ${preview}`);
          }
          console.log('');
        }
        rl.prompt();
        return;
      }

      if (cmd === 'clear') {
        db.prepare('DELETE FROM memory WHERE session_id = ?').run(sessionId);
        db.prepare('DELETE FROM session_settings WHERE session_id = ?').run(sessionId);
        success('Session conversation and settings cleared.');
        rl.prompt();
        return;
      }

      warn(`Unknown command: /${cmd}. Type /help for available commands.`);
      rl.prompt();
      return;
    }

    // Process regular user message through agentic loop with real-time streaming
    try {
      let streamStarted = false;
      let lastPrintedNewline = true;

      const result = await runWithConcurrencyLimit(sessionId, () =>
        runAgent({
          message: rawLine,
          sessionId,
          userId: 'cli-user',
          platform: 'cli',
          requestConfirmation: async (command: string): Promise<boolean> => {
            return new Promise((resolve) => {
              if (!lastPrintedNewline) {
                process.stdout.write('\n');
                lastPrintedNewline = true;
              }
              console.log(
                `\n${colors.yellow}⚠️ Dangerous command approval required:${colors.reset}\n${command}\n`,
              );
              const confirmRl = createInterface({
                input: process.stdin,
                output: process.stdout,
              });
              confirmRl.question(`${colors.bright}Approve execution? (y/n): ${colors.reset}`, (answer) => {
                confirmRl.close();
                const trimmed = answer.trim().toLowerCase();
                resolve(trimmed === 'y' || trimmed === 'yes');
              });
            });
          },
          onToken: (token: string, done: boolean) => {
            if (done || !token) return;
            if (!streamStarted) {
              streamStarted = true;
              process.stdout.write(`\n${colors.cyan}Gravity Claw${colors.reset} > `);
            }
            process.stdout.write(token);
            lastPrintedNewline = token.endsWith('\n');
          },
          onToolStart: (toolName: string, input: Record<string, unknown>) => {
            if (!lastPrintedNewline) {
              process.stdout.write('\n');
              lastPrintedNewline = true;
            }
            const summary = summarizeToolInput(input);
            process.stdout.write(`\n${colors.yellow}⚡ [Tool: ${toolName}]${colors.reset} ${summary}\n`);
            streamStarted = false;
          },
          onToolEnd: (toolName: string, execSuccess: boolean, res: string, durationMs?: number) => {
            const timeStr = typeof durationMs === 'number' ? ` in ${durationMs}ms` : '';
            if (execSuccess) {
              process.stdout.write(`  ${colors.green}✓${colors.reset} [${toolName}] completed${timeStr}\n`);
            } else {
              process.stdout.write(`  ${colors.red}✗${colors.reset} [${toolName}] failed${timeStr}\n`);
            }

            if (options.verbose || !execSuccess) {
              const snippet = res.slice(0, 140).replace(/\r?\n/g, ' ').trim();
              if (snippet) {
                process.stdout.write(`  ${dim(snippet)}\n`);
              }
            }
            lastPrintedNewline = true;
          },
          onProgress: async (text: string) => {
            if (options.verbose && text) {
              if (!lastPrintedNewline) {
                process.stdout.write('\n');
                lastPrintedNewline = true;
              }
              console.log(dim(`  [progress] ${text}`));
            }
          },
          dependencies: {
            config: container.config,
            toolRegistry: container.toolRegistry,
            db: container.db,
          },
        }),
      );

      // If streaming didn't output the final answer text (e.g. non-streaming fallback), print it
      if (!streamStarted && result.text) {
        console.log(`\n${colors.cyan}Gravity Claw${colors.reset} > ${result.text}\n`);
      } else {
        process.stdout.write('\n\n');
      }

      if (options.verbose) {
        console.log(dim(`[stats] Tools executed: ${result.toolCallCount}, Hit limits: ${result.hitLimit}`));
      }
    } catch (err) {
      process.stdout.write('\n');
      error(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
