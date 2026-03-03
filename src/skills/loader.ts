/**
 * Skill loader for gravyclaw46
 * Parses Markdown-based skill definitions with YAML frontmatter
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import yaml from "yaml";
import type {
  SkillFrontmatter,
  SkillCodeBlock,
  ParsedSkill,
  SkillExecutionResult,
  SkillStatus,
} from "./types.ts";
import { createLogger } from "../logger.ts";
import type { Tool } from "../tools/index.ts";

const execAsync = promisify(exec);
const log = createLogger("skills");

/**
 * Skills manager class
 */
export class SkillsManager {
  private skillsDir: string;
  private loadedSkills: Map<string, ParsedSkill> = new Map();
  private skillsDbPath: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || path.join(process.cwd(), "skills");
    this.skillsDbPath = path.join(this.skillsDir, ".skills-state.json");
  }

  /**
   * Initialize skills system
   */
  async initialize(): Promise<void> {
    // Create skills directory if it doesn't exist
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
      log.info(`[skills] Created skills directory: ${this.skillsDir}`);
    }

    // Load all enabled skills
    await this.loadAllSkills();
    log.info(`[skills] Loaded ${this.loadedSkills.size} skills`);
  }

  /**
   * Load all skill files from the skills directory
   */
  private async loadAllSkills(): Promise<void> {
    const files = fs.readdirSync(this.skillsDir);
    const skillFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of skillFiles) {
      try {
        const filePath = path.join(this.skillsDir, file);
        const skill = await this.parseSkillFile(filePath);

        // Only load if enabled
        if (skill.frontmatter.enabled) {
          this.loadedSkills.set(skill.frontmatter.name, skill);
          log.info(
            `[skills] Loaded skill: ${skill.frontmatter.name} (${skill.frontmatter.tools.length} tools)`
          );
        }
      } catch (error) {
        log.error(`[skills] Failed to load skill ${file}: ${error}`);
      }
    }
  }

  /**
   * Parse a skill markdown file
   */
  private async parseSkillFile(filePath: string): Promise<ParsedSkill> {
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract frontmatter (between --- delimiters)
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      throw new Error("No frontmatter found in skill file");
    }

    const frontmatterYaml = frontmatterMatch[1] ?? "";
    const frontmatter = yaml.parse(frontmatterYaml) as SkillFrontmatter;

    // Extract markdown body (after frontmatter)
    const markdown = content.slice(frontmatterMatch[0].length).trim();

    // Extract code blocks
    const codeBlocks = this.extractCodeBlocks(markdown);

    return {
      filePath,
      frontmatter,
      markdown,
      codeBlocks,
    };
  }

  /**
   * Extract code blocks from markdown and map them to tools
   */
  private extractCodeBlocks(
    markdown: string
  ): Map<string, SkillCodeBlock> {
    const blocks = new Map<string, SkillCodeBlock>();
    const codeBlockRegex = /```(\w+)\n([\s\S]*?)```/g;

    let match: RegExpExecArray | null;

    // Split markdown by headers to associate code blocks with tools
    const sections = markdown.split(/^##\s+Tool:\s+(.+)$/gm);

    for (let i = 1; i < sections.length; i += 2) {
      const toolName = sections[i]?.trim();
      const sectionContent = sections[i + 1];
      if (!toolName || !sectionContent) {
        continue;
      }

      // Find code blocks in this section
      while ((match = codeBlockRegex.exec(sectionContent)) !== null) {
        const language = match[1]?.toLowerCase();
        const code = match[2]?.trim();
        if (!language || !code) {
          continue;
        }

        if (
          language === "bash" ||
          language === "sh" ||
          language === "python" ||
          language === "py" ||
          language === "javascript" ||
          language === "js" ||
          language === "typescript" ||
          language === "ts"
        ) {
          const normalizedLang =
            language === "sh"
              ? "bash"
              : language === "py"
              ? "python"
              : language === "js"
              ? "javascript"
              : language === "ts"
              ? "typescript"
              : language;

          blocks.set(toolName, {
            language: normalizedLang as SkillCodeBlock["language"],
            code,
            toolName,
          });
        }
      }
    }

    return blocks;
  }

  /**
   * Execute a skill tool
   */
  async executeSkillTool(
    skillName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<SkillExecutionResult> {
    const skill = this.loadedSkills.get(skillName);
    if (!skill) {
      return {
        success: false,
        error: `Skill "${skillName}" not found`,
      };
    }

    const codeBlock = skill.codeBlocks.get(toolName);
    if (!codeBlock) {
      return {
        success: false,
        error: `Tool "${toolName}" has no executable code`,
      };
    }

    // Replace template variables in code
    let code = codeBlock.code;
    for (const [key, value] of Object.entries(args)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, "g");
      code = code.replace(regex, String(value));
    }

    const startTime = Date.now();
    const envArgs: Record<string, string> = Object.fromEntries(
      Object.entries(args).map(([key, value]) => [key, String(value)])
    );

    try {
      let result;

      if (codeBlock.language === "bash") {
        result = await execAsync(code, {
          env: {
            ...process.env,
            ...skill.frontmatter.env,
            ...envArgs,
          },
          timeout: 30000,
        });
      } else if (codeBlock.language === "python") {
        // Execute Python code
        const pythonCode = code.replace(/`/g, "\\`");
        result = await execAsync(`python -c "${pythonCode}"`, {
          env: {
            ...process.env,
            ...skill.frontmatter.env,
          },
          timeout: 30000,
        });
      } else if (
        codeBlock.language === "javascript" ||
        codeBlock.language === "typescript"
      ) {
        // Execute Node.js code
        const nodeCode = code.replace(/`/g, "\\`");
        result = await execAsync(`node -e "${nodeCode}"`, {
          env: {
            ...process.env,
            ...skill.frontmatter.env,
          },
          timeout: 30000,
        });
      } else {
        return {
          success: false,
          error: `Unsupported language: ${codeBlock.language}`,
        };
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        output: result.stdout.trim(),
        duration,
      };
    } catch (error: unknown) {
      const e = error as {
        message?: string;
        stdout?: string;
        code?: number;
      };
      const duration = Date.now() - startTime;
      const failureResult: SkillExecutionResult = {
        success: false,
        error: e.message ?? "Skill execution failed",
        duration,
      };

      if (typeof e.stdout === "string") {
        failureResult.output = e.stdout;
      }

      if (typeof e.code === "number") {
        failureResult.exitCode = e.code;
      }

      return {
        ...failureResult,
      };
    }
  }

  /**
   * Load a specific skill by name or path
   */
  async loadSkill(nameOrPath: string): Promise<ParsedSkill> {
    let filePath: string;

    // Check if it's a path or a name
    if (nameOrPath.includes("/") || nameOrPath.includes("\\")) {
      filePath = path.resolve(nameOrPath);
    } else {
      filePath = path.join(this.skillsDir, `${nameOrPath}.md`);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Skill file not found: ${filePath}`);
    }

    const skill = await this.parseSkillFile(filePath);

    // Enable the skill
    skill.frontmatter.enabled = true;
    this.loadedSkills.set(skill.frontmatter.name, skill);

    // Persist state
    this.saveSkillsState();

    log.info(`[skills] Loaded skill: ${skill.frontmatter.name}`);

    return skill;
  }

  /**
   * Disable a skill
   */
  disableSkill(skillName: string): boolean {
    const skill = this.loadedSkills.get(skillName);
    if (!skill) {
      return false;
    }

    skill.frontmatter.enabled = false;
    this.loadedSkills.delete(skillName);
    this.saveSkillsState();

    log.info(`[skills] Disabled skill: ${skillName}`);

    return true;
  }

  /**
   * List all available skills
   */
  listSkills(): SkillStatus[] {
    const statuses: SkillStatus[] = [];

    const files = fs.readdirSync(this.skillsDir);
    const skillFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of skillFiles) {
      try {
        const filePath = path.join(this.skillsDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

        if (frontmatterMatch) {
          const frontmatter = yaml.parse(frontmatterMatch[1] ?? "") as SkillFrontmatter;
          const skill = this.loadedSkills.get(frontmatter.name);

          statuses.push({
            name: frontmatter.name,
            enabled: skill?.frontmatter.enabled ?? false,
            filePath,
            toolCount: frontmatter.tools.length,
            tools: frontmatter.tools.map((t) => t.name),
            hasCodeBlocks: skill?.codeBlocks.size ? skill.codeBlocks.size > 0 : false,
          });
        }
      } catch (error) {
        log.warn(`[skills] Failed to read skill ${file}: ${error}`);
      }
    }

    return statuses;
  }

  /**
   * Get all tools from enabled skills
   */
  getSkillTools(): Tool[] {
    const tools: Tool[] = [];

    for (const [skillName, skill] of this.loadedSkills.entries()) {
      for (const toolDef of skill.frontmatter.tools) {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const param of toolDef.parameters) {
          properties[param.name] = {
            type: param.type,
            description: param.description,
          };

          if (param.required) {
            required.push(param.name);
          }
        }

        tools.push({
          name: toolDef.name,
          description: `[Skill: ${skillName}] ${toolDef.description}`,
          inputSchema: {
            type: "object",
            properties,
            required,
          },
          execute: async (args: Record<string, unknown>) => {
            const result = await this.executeSkillTool(
              skillName,
              toolDef.name,
              args
            );

            if (result.success) {
              return JSON.stringify({
                success: true,
                output: result.output,
                duration: result.duration,
              });
            } else {
              return JSON.stringify({
                success: false,
                error: result.error,
                exitCode: result.exitCode,
              });
            }
          },
        });
      }
    }

    return tools;
  }

  /**
   * Save skills state to JSON file
   */
  private saveSkillsState(): void {
    const state: Record<string, boolean> = {};

    for (const [name, skill] of this.loadedSkills.entries()) {
      state[name] = skill.frontmatter.enabled;
    }

    fs.writeFileSync(this.skillsDbPath, JSON.stringify(state, null, 2));
  }

  /**
   * Shutdown skills manager
   */
  async shutdown(): Promise<void> {
    this.saveSkillsState();
    log.info("[skills] Skills manager shut down");
  }
}

// Export singleton instance
export const skillsManager = new SkillsManager();
