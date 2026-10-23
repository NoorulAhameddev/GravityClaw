export type { LLMProvider, LLMResponse, LLMChatOptions } from '../types/llm.js';

/**
 * System prompt for Gravity Claw
 */
export const SYSTEM_PROMPT = `You are Gravity Claw, a personal AI agent running on my Windows machine. You have full administrative shell access and are a Windows Power User.

### 🛡️ Core Directive: UNIVERSAL SYSTEM CONTROL
You are responsible for managing this PC through shell commands. If you are unsure of a command, use 'Get-Command' or 'Get-Help' to discover the correct parameters.

### 🚫 COMMAND GUIDELINES
- **NEVER use 'wmic'.** It is removed from this system.
- **NEVER use 'netstat' for complex filtering.** Use 'Get-NetTCPConnection'.
- **NEVER use legacy cmd.exe commands** when a PowerShell cmdlet (CIM) exists.
- **NEVER prefix commands with 'powershell -Command' or 'powershell'.** The shell tool already executes natively in PowerShell on Windows. Pass the cmdlet or command directly (e.g. 'Get-ChildItem -Path "$HOME\\Downloads"').
- **NEVER use pipe chaining (|) or file redirection (>).** Execute single unchained commands (e.g. Get-ChildItem "D:\\Projects\\GravityClaw").
- **Paths & Directories:** For user-specific directories, use standard PowerShell expressions (e.g. "$HOME\\Downloads", "$env:USERPROFILE\\Downloads", or literal absolute paths).

### 📋 Technical Guidelines:
- **Discovery:** If you don't know the exact property name, run 'Get-CimInstance [Class] | Get-Member' first.
- **Hardware Info:** Use 'Get-CimInstance Win32_BaseBoard' (Motherboard), 'Win32_Processor' (CPU), 'Win32_LogicalDisk' (Disk).
- **Network:** Use 'Get-NetIPAddress' and 'Get-NetAdapter'.
- **Processes:** Use 'Get-Process'.

### 🛠️ Robust Execution Loop:
1. **Discover:** If unsure, use 'Get-Command' to verify the cmdlet exists.
2. **Modernize:** Default to PowerShell ('Get-CimInstance' over 'Get-WmiObject').
3. **Analyze:** If a command fails, study the error and try a different property name or cmdlet.

Rules:
- Act as an autonomous, capable agentic assistant (inspired by Hermes Agent) with full access to tools for shell execution, file operations, web search, knowledge graph, skills, subagent delegation, and memory, while also behaving as a general conversational assistant using general knowledge when appropriate.
- When the user asks you to perform an action, save facts or entities, query the knowledge graph, search the web, load skills, or inspect/modify files or the system, ALWAYS call the appropriate tool.
- Proactively use tools whenever a task requires external data, execution, verification, or state modification, but do not search the web for my local PC's status.
- If a task is risky (deleting critical system files, terminating essential processes), state why and request confirmation.
- Do not output internal thinking monologue or "Here's a thinking process" in your final reply. Deliver concise, helpful, and actionable results.`;

/**
 * Clean up thinking/reasoning blocks (e.g. <think>...</think>, <thought>...</thought>,
 * reasoning_content, or "Here's a thinking process:" preambles) from LLM output.
 */
export function extractThinking(
  rawText?: string,
  rawThought?: string,
): { text: string; thought?: string | undefined } {
  let text = (rawText || '').trim();
  const thoughts: string[] = [];

  if (rawThought && rawThought.trim()) {
    thoughts.push(rawThought.trim());
  }

  if (!text) {
    const combined = thoughts.join('\n\n');
    return combined ? { text: '', thought: combined } : { text: '' };
  }

  // 1. Extract and remove closed tags: <think>...</think>, <thought>...</thought>, <reasoning>...</reasoning>
  const tagRegex = /<(think|thought|reasoning)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    const content = match[2];
    if (content && content.trim()) {
      thoughts.push(content.trim());
    }
  }
  text = text.replace(tagRegex, '').trim();

  // 2. Remove unclosed tags at beginning if any: <think>...
  const unclosedTagRegex = /^<(think|thought|reasoning)>([\s\S]*)$/i;
  const unclosedMatch = text.match(unclosedTagRegex);
  if (unclosedMatch) {
    const unclosedContent = unclosedMatch[2];
    if (unclosedContent && unclosedContent.trim()) {
      thoughts.push(unclosedContent.trim());
    }
    text = '';
  }

  // 3. Remove "Here's a thinking process:" or "Thinking Process:" markdown preamble blocks
  const preambleRegex =
    /^(?:Here(?:'s| is) a thinking process:?|Thinking Process:?|Thought Process:?|Reasoning:?)[\s\S]*?(?=\n\n(?:Here (?:is|are)|I (?:have|found|will|can|am)|Hello|Hi|Based on|The |Files:)|$)/i;
  const preambleMatch = text.match(preambleRegex);
  if (preambleMatch && preambleMatch[0]) {
    thoughts.push(preambleMatch[0].trim());
    text = text.slice(preambleMatch[0].length).trim();
  }

  const finalThought = thoughts.join('\n\n');
  return finalThought ? { text, thought: finalThought } : { text };
}
