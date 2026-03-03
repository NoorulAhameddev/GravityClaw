/**
 * Skill system types for gravyclaw46
 */

/**
 * Tool parameter definition in skill frontmatter
 */
export interface SkillToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
  default?: any;
}

/**
 * Tool definition in skill frontmatter
 */
export interface SkillToolDefinition {
  name: string;
  description: string;
  parameters: SkillToolParameter[];
}

/**
 * Skill frontmatter metadata
 */
export interface SkillFrontmatter {
  name: string;
  description: string;
  enabled: boolean;
  tools: SkillToolDefinition[];
  dependencies?: string[];
  env?: Record<string, string>;
}

/**
 * Extracted code block from skill markdown
 */
export interface SkillCodeBlock {
  language: "bash" | "python" | "javascript" | "typescript";
  code: string;
  toolName?: string;
}

/**
 * Parsed skill with frontmatter and code blocks
 */
export interface ParsedSkill {
  filePath: string;
  frontmatter: SkillFrontmatter;
  markdown: string;
  codeBlocks: Map<string, SkillCodeBlock>;
}

/**
 * Skill execution result
 */
export interface SkillExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  duration?: number;
}

/**
 * Skill status information
 */
export interface SkillStatus {
  name: string;
  enabled: boolean;
  filePath: string;
  toolCount: number;
  tools: string[];
  hasCodeBlocks: boolean;
}
