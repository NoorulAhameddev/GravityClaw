/**
 * Skill management tools for gravyclaw46
 */

import type { Tool } from "../tools/index.ts";
import { skillsManager } from "./loader.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("skills-tools");

/**
 * Load a skill from file
 */
const loadSkillTool: Tool = {
  name: "load_skill",
  description:
    "Load a skill from a markdown file. Skills contain custom tools defined in markdown with executable code blocks. Provide either a skill name (e.g., 'weather') or a full file path.",
  inputSchema: {
    type: "object",
    properties: {
      name_or_path: {
        type: "string",
        description:
          "Skill name (without .md extension) or full path to skill file",
      },
    },
    required: ["name_or_path"],
  },
  execute: async (args: Record<string, unknown>) => {
    try {
      const nameOrPath = args.name_or_path;
      if (typeof nameOrPath !== "string" || !nameOrPath.trim()) {
        return JSON.stringify({
          success: false,
          error: "name_or_path is required and must be a non-empty string",
        });
      }

      const skill = await skillsManager.loadSkill(nameOrPath);

      return JSON.stringify({
        success: true,
        skill: {
          name: skill.frontmatter.name,
          description: skill.frontmatter.description,
          tools: skill.frontmatter.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters.length,
          })),
          toolCount: skill.frontmatter.tools.length,
          hasCodeBlocks: skill.codeBlocks.size > 0,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`[skills] Error in load_skill: ${message}`);
      return JSON.stringify({
        success: false,
        error: message,
      });
    }
  },
};

/**
 * List all available skills
 */
const listSkillsTool: Tool = {
  name: "list_skills",
  description:
    "List all available skills in the skills directory. Shows skill name, description, enabled status, and available tools.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => {
    try {
      const skills = skillsManager.listSkills();

      return JSON.stringify({
        success: true,
        count: skills.length,
        skills: skills.map((s) => ({
          name: s.name,
          enabled: s.enabled,
          toolCount: s.toolCount,
          tools: s.tools,
          hasCode: s.hasCodeBlocks,
        })),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`[skills] Error in list_skills: ${message}`);
      return JSON.stringify({
        success: false,
        error: message,
      });
    }
  },
};

/**
 * Disable a loaded skill
 */
const disableSkillTool: Tool = {
  name: "disable_skill",
  description:
    "Disable a currently loaded skill. This will remove its tools from availability. The skill can be re-enabled later with load_skill.",
  inputSchema: {
    type: "object",
    properties: {
      skill_name: {
        type: "string",
        description: "Name of the skill to disable",
      },
    },
    required: ["skill_name"],
  },
  execute: async (args: Record<string, unknown>) => {
    try {
      const skillName = args.skill_name;
      if (typeof skillName !== "string" || !skillName.trim()) {
        return JSON.stringify({
          success: false,
          error: "skill_name is required and must be a non-empty string",
        });
      }

      const success = skillsManager.disableSkill(skillName);

      if (success) {
        return JSON.stringify({
          success: true,
          message: `Skill "${skillName}" disabled`,
        });
      } else {
        return JSON.stringify({
          success: false,
          error: `Skill "${skillName}" not found or already disabled`,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`[skills] Error in disable_skill: ${message}`);
      return JSON.stringify({
        success: false,
        error: message,
      });
    }
  },
};

/**
 * Reload all skills from disk
 */
const reloadSkillsTool: Tool = {
  name: "reload_skills",
  description:
    "Reload all skills from the skills directory. This is useful after modifying skill files to apply changes without restarting.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => {
    try {
      await skillsManager.initialize();

      const skills = skillsManager.listSkills();
      const enabledCount = skills.filter((s) => s.enabled).length;

      return JSON.stringify({
        success: true,
        message: `Reloaded ${enabledCount} enabled skills (${skills.length} total)`,
        skills: skills
          .filter((s) => s.enabled)
          .map((s) => ({
            name: s.name,
            toolCount: s.toolCount,
          })),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`[skills] Error in reload_skills: ${message}`);
      return JSON.stringify({
        success: false,
        error: message,
      });
    }
  },
};

/**
 * Export all skill management tools
 */
export const skillManagementTools: Tool[] = [
  loadSkillTool,
  listSkillsTool,
  disableSkillTool,
  reloadSkillsTool,
];

export { skillsManager } from "./loader.ts";
