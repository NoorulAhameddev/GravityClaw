import { createLogger } from "./logger.ts";

const log = createLogger("thinking");

export type ThinkingLevel = "off" | "low" | "medium" | "high";

/**
 * Thinking level configurations and prompt templates
 */
export const THINKING_CONFIGS = {
  off: {
    name: "Off",
    description: "Default behavior - no special thinking prompts",
    systemPromptAddition: "",
    messageTransform: (message: string) => message,
  },
  
  low: {
    name: "Low",
    description: "Basic reasoning prompts in system context",
    systemPromptAddition: `

When approaching tasks, consider the following reasoning steps:
- Break down complex problems into smaller parts
- Identify the key information provided
- Consider what tools or knowledge you need
- Plan your approach before acting

Be concise but thoughtful in your responses.`,
    messageTransform: (message: string) => message,
  },
  
  medium: {
    name: "Medium",
    description: "Step-by-step thinking encouraged",
    systemPromptAddition: `

REASONING APPROACH:
When solving problems or answering questions:
1. State your understanding of the question/task
2. Break it down into logical steps
3. Work through each step methodically
4. Verify your reasoning before concluding
5. Provide a clear, structured answer

Think step-by-step and show your reasoning process when appropriate.`,
    messageTransform: (message: string) => {
      // Prepend thinking prompt to user message
      return `[Think step-by-step before responding]\n\n${message}`;
    },
  },
  
  high: {
    name: "High",
    description: "Extended chain-of-thought with explicit reasoning sections",
    systemPromptAddition: `

EXTENDED REASONING MODE:
You should engage in deeper, more thorough reasoning for complex tasks.

Use the following structured thinking process:

<thinking>
- State the problem clearly
- List relevant facts and constraints
- Consider multiple approaches
- Reason through each approach
- Identify potential issues or edge cases
- Select the best approach and explain why
</thinking>

Then provide your answer based on this reasoning.

For simple queries, brief thinking is sufficient. For complex problems, take time to reason thoroughly.
Include your <thinking> section before your main response when the task warrants it.`,
    messageTransform: (message: string) => {
      // Add explicit thinking instruction
      return `[Use extended chain-of-thought reasoning. Show your <thinking> process before your final answer.]\n\n${message}`;
    },
  },
};

/**
 * Get thinking configuration for a given level
 */
export function getThinkingConfig(level: ThinkingLevel) {
  return THINKING_CONFIGS[level];
}

/**
 * Apply thinking level to system prompt
 * @param basePrompt - The original system prompt
 * @param level - Thinking level to apply
 * @returns Modified system prompt with thinking instructions
 */
export function applyThinkingToSystemPrompt(basePrompt: string, level: ThinkingLevel): string {
  const config = getThinkingConfig(level);
  
  if (level === "off") {
    return basePrompt;
  }
  
  log.debug(`Applying thinking level: ${level}`);
  return basePrompt + config.systemPromptAddition;
}

/**
 * Apply thinking level to user message
 * @param message - The user's message
 * @param level - Thinking level to apply
 * @returns Potentially modified message with thinking prompts
 */
export function applyThinkingToMessage(message: string, level: ThinkingLevel): string {
  const config = getThinkingConfig(level);
  
  if (level === "off" || level === "low") {
    // Low level only affects system prompt
    return message;
  }
  
  log.debug(`Applying thinking transformation to message: ${level}`);
  return config.messageTransform(message);
}

/**
 * Validate thinking level
 */
export function isValidThinkingLevel(level: string): level is ThinkingLevel {
  return ["off", "low", "medium", "high"].includes(level);
}

/**
 * Get all available thinking levels with descriptions
 */
export function getAvailableThinkingLevels(): Array<{level: ThinkingLevel; name: string; description: string}> {
  return Object.entries(THINKING_CONFIGS).map(([level, config]) => ({
    level: level as ThinkingLevel,
    name: config.name,
    description: config.description,
  }));
}

/**
 * Format thinking levels for display
 */
export function formatThinkingLevelsForDisplay(): string {
  const levels = getAvailableThinkingLevels();
  
  let output = "🧠 **Available Thinking Levels**\n\n";
  
  for (const level of levels) {
    output += `**${level.level}** (${level.name})\n`;
    output += `  ${level.description}\n\n`;
  }
  
  output += "Set thinking level with: `/think <level>`\n";
  output += "Example: `/think high`";
  
  return output;
}
