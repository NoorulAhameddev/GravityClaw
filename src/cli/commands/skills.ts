/**
 * Skills CLI command - manage custom skills.
 */

import fs from "fs";
import path from "path";
import { skillsManager } from "../../skills/loader.ts";
import { success, error, info, title, section, printTable, dim, bold } from "../utils.ts";

const SKILL_TEMPLATE = `---
name: my-skill
description: "A description of what this skill does"
enabled: true
tools:
  - name: run-task
    description: "Description of what this tool does"
    parameters:
      - name: input
        type: string
        required: true
        description: "Input parameter description"
---

# My Skill

Describe what this skill does and how the agent should use it.

## Tool: run-task

Execute the main task.

\\\`\\\`\\\`bash
echo "Hello, this is my skill!"
\\\`\\\`\\\`
`;

export async function skillsCommand(
    action?: string,
    args: string[] = []
): Promise<void> {
    const subcommand = action?.toLowerCase();

    switch (subcommand) {
        case "list":
        case undefined:
            await listSkills();
            break;
        case "add":
            await addSkill(args[0]);
            break;
        case "remove":
        case "delete":
            await removeSkill(args[0]);
            break;
        case "enable":
            await enableSkill(args[0], true);
            break;
        case "disable":
            await enableSkill(args[0], false);
            break;
        case "reload":
            await reloadSkills();
            break;
        case "info":
            await infoSkill(args[0]);
            break;
        default:
            printHelp();
            break;
    }
}

async function listSkills(): Promise<void> {
    title("🎯 GravityClaw Skills");

    await skillsManager.initialize();
    const skills = skillsManager.listSkills();

    if (skills.length === 0) {
        info("No skills found. Create one with 'gravityclaw skills add <name>'");
        return;
    }

    section("Available Skills");
    
    const rows = skills.map(s => [
        s.enabled ? "✓" : "✗",
        s.name,
        `${s.toolCount} tool${s.toolCount !== 1 ? "s" : ""}`,
        s.hasCodeBlocks ? "Yes" : "No",
        s.tools.slice(0, 2).join(", ") + (s.tools.length > 2 ? "..." : "")
    ]);

    printTable(rows, [
        { header: "", width: 3 },
        { header: "Name", width: 20 },
        { header: "Tools", width: 10, align: "right" },
        { header: "Code", width: 6 },
        { header: "Tool Names", width: 30 },
    ]);

    console.log();
    const enabled = skills.filter(s => s.enabled).length;
    info(`${enabled} of ${skills.length} skills enabled`);

    console.log();
    section("Tips");
    info("gravityclaw skills add <name>   - Create a new skill");
    info("gravityclaw skills enable <name> - Enable a skill");
    info("gravityclaw skills disable <name> - Disable a skill");
    info("gravityclaw skills remove <name> - Delete a skill");
}

async function addSkill(name?: string): Promise<void> {
    if (!name) {
        error("Please provide a skill name");
        info("Usage: gravityclaw skills add <name>");
        process.exitCode = 1;
        return;
    }

    // Validate name
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        error("Skill name can only contain letters, numbers, hyphens, and underscores");
        process.exitCode = 1;
        return;
    }

    const skillsDir = path.join(process.cwd(), "skills");
    const filePath = path.join(skillsDir, `${name}.md`);

    if (fs.existsSync(filePath)) {
        error(`Skill '${name}' already exists`);
        process.exitCode = 1;
        return;
    }

    // Create skills directory if needed
    if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
    }

    // Create skill file from template
    const skillContent = SKILL_TEMPLATE.replace(/my-skill/g, name);
    fs.writeFileSync(filePath, skillContent);

    success(`Created skill '${name}' at ${filePath}`);

    // Auto-enable
    await skillsManager.loadSkill(name);
    success(`Enabled skill '${name}'`);
}

async function removeSkill(name?: string): Promise<void> {
    if (!name) {
        error("Please provide a skill name");
        info("Usage: gravityclaw skills remove <name>");
        process.exitCode = 1;
        return;
    }

    const skillsDir = path.join(process.cwd(), "skills");
    const filePath = path.join(skillsDir, `${name}.md`);

    if (!fs.existsSync(filePath)) {
        error(`Skill '${name}' not found`);
        process.exitCode = 1;
        return;
    }

    // Disable first
    skillsManager.disableSkill(name);

    // Delete file
    fs.unlinkSync(filePath);

    success(`Removed skill '${name}'`);
}

async function enableSkill(name?: string, enabled = true): Promise<void> {
    if (!name) {
        error("Please provide a skill name");
        info(`Usage: gravityclaw skills ${enabled ? "enable" : "disable"} <name>`);
        process.exitCode = 1;
        return;
    }

    const skills = skillsManager.listSkills();
    const skill = skills.find(s => s.name === name);

    if (!skill) {
        error(`Skill '${name}' not found`);
        process.exitCode = 1;
        return;
    }

    if (enabled) {
        await skillsManager.loadSkill(name);
        success(`Enabled skill '${name}'`);
    } else {
        skillsManager.disableSkill(name);
        success(`Disabled skill '${name}'`);
    }
}

async function reloadSkills(): Promise<void> {
    title("🔄 Reloading Skills");

    await skillsManager.initialize();

    const skills = skillsManager.listSkills();
    const enabled = skills.filter(s => s.enabled);

    success(`Reloaded ${enabled.length} skills (${skills.length} total)`);

    if (enabled.length > 0) {
        console.log();
        section("Enabled Skills");
        enabled.forEach(s => {
            info(`  • ${s.name} (${s.toolCount} tools)`);
        });
    }
}

async function infoSkill(name?: string): Promise<void> {
    if (!name) {
        error("Please provide a skill name");
        info("Usage: gravityclaw skills info <name>");
        process.exitCode = 1;
        return;
    }

    const skills = skillsManager.listSkills();
    const skill = skills.find(s => s.name === name);

    if (!skill) {
        error(`Skill '${name}' not found`);
        process.exitCode = 1;
        return;
    }

    title(`🎯 Skill: ${name}`);

    section("Details");
    printTable([
        ["Status", skill.enabled ? "Enabled" : "Disabled"],
        ["File", skill.filePath],
        ["Tools", `${skill.toolCount}`],
        ["Has Code", skill.hasCodeBlocks ? "Yes" : "No"],
    ], [
        { header: "Property", width: 15 },
        { header: "Value", width: 40 },
    ]);

    if (skill.tools.length > 0) {
        console.log();
        section("Tools");
        skill.tools.forEach(t => {
            info(`  • ${t}`);
        });
    }
}

function printHelp(): void {
    title("🎯 GravityClaw Skills");

    section("Usage");
    printTable([
        ["gravityclaw skills", "List all skills"],
        ["gravityclaw skills list", "List all skills"],
        ["gravityclaw skills add <name>", "Create a new skill"],
        ["gravityclaw skills remove <name>", "Delete a skill"],
        ["gravityclaw skills enable <name>", "Enable a skill"],
        ["gravityclaw skills disable <name>", "Disable a skill"],
        ["gravityclaw skills info <name>", "Show skill details"],
        ["gravityclaw skills reload", "Reload all skills"],
    ], [
        { header: "Command", width: 35 },
        { header: "Description", width: 40 },
    ]);
}
