/**
 * Plugin CLI command - manage GravityClaw plugins.
 * 
 * Plugins are extensions that can add:
 * - Custom commands
 * - Custom tools
 * - Custom skills
 * - MCP server configurations
 */

import fs from "fs";
import path from "path";
import { success, error, info, title, section, printTable, dim, bold } from "../utils.ts";

interface PluginManifest {
    name: string;
    version?: string;
    description?: string;
    author?: string;
    commands?: string[];
    tools?: string[];
    skills?: string[];
    mcpServers?: string[];
    dependencies?: string[];
}

const PLUGIN_TEMPLATE = {
    name: "my-plugin",
    version: "1.0.0",
    description: "A GravityClaw plugin",
    author: "Your Name",
    commands: [],
    tools: [],
    skills: [],
    mcpServers: [],
    dependencies: [],
};

function getPluginsDir(): string {
    const homeDir = process.env.GRAVITYCLAW_HOME || path.join(process.env.HOME || process.env.USERPROFILE || ".", ".gravityclaw");
    return path.join(homeDir, "plugins");
}

function getPluginPath(name: string): string {
    return path.join(getPluginsDir(), name);
}

function readPluginManifest(pluginPath: string): PluginManifest | null {
    const manifestPath = path.join(pluginPath, "plugin.json");
    if (!fs.existsSync(manifestPath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch (e) {
        return null;
    }
}

function listPlugins(): Array<{ name: string; manifest: PluginManifest; path: string }> {
    const pluginsDir = getPluginsDir();
    const plugins: Array<{ name: string; manifest: PluginManifest; path: string }> = [];

    if (!fs.existsSync(pluginsDir)) {
        return plugins;
    }

    const entries = fs.readdirSync(pluginsDir);
    for (const entry of entries) {
        const pluginPath = path.join(pluginsDir, entry);
        const stat = fs.statSync(pluginPath);
        if (stat.isDirectory()) {
            const manifest = readPluginManifest(pluginPath);
            if (manifest) {
                plugins.push({ name: entry, manifest, path: pluginPath });
            }
        }
    }

    return plugins;
}

export async function pluginCommand(
    action?: string,
    args: string[] = []
): Promise<void> {
    const subcommand = action?.toLowerCase();

    switch (subcommand) {
        case "list":
        case undefined:
            await listAllPlugins();
            break;
        case "add":
            await addPlugin(args[0]);
            break;
        case "remove":
        case "delete":
            await removePlugin(args[0]);
            break;
        case "info":
            await infoPlugin(args[0]);
            break;
        default:
            printHelp();
            break;
    }
}

async function listAllPlugins(): Promise<void> {
    title("🔌 GravityClaw Plugins");

    const plugins = listPlugins();

    if (plugins.length === 0) {
        info("No plugins installed.");
        info(`Plugins directory: ${getPluginsDir()}`);
        console.log();
        info("Run 'gravityclaw plugin add <name>' to create a plugin");
        return;
    }

    section("Installed Plugins");

    const rows = plugins.map(p => [
        p.manifest.name || p.name,
        p.manifest.version || "1.0.0",
        p.manifest.description || "",
        (p.manifest.commands?.length || 0) + (p.manifest.tools?.length || 0) + (p.manifest.skills?.length || 0) + " items",
    ]);

    printTable(rows, [
        { header: "Name", width: 20 },
        { header: "Version", width: 10 },
        { header: "Description", width: 30 },
        { header: "Items", width: 10, align: "right" },
    ]);

    console.log();
    info(`${plugins.length} plugin(s) installed`);
    console.log();
    section("Commands");
    info("gravityclaw plugin add <name>   - Create new plugin");
    info("gravityclaw plugin remove <name> - Remove plugin");
    info("gravityclaw plugin info <name>   - Show plugin details");
}

async function addPlugin(name?: string): Promise<void> {
    if (!name) {
        error("Please provide a plugin name");
        info("Usage: gravityclaw plugin add <name>");
        process.exitCode = 1;
        return;
    }

    // Validate name
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        error("Plugin name can only contain letters, numbers, hyphens, and underscores");
        process.exitCode = 1;
        return;
    }

    const pluginPath = getPluginPath(name);

    if (fs.existsSync(pluginPath)) {
        error(`Plugin '${name}' already exists`);
        process.exitCode = 1;
        return;
    }

    // Create plugin directory
    fs.mkdirSync(pluginPath, { recursive: true });

    // Create plugin.json
    const manifest = { ...PLUGIN_TEMPLATE, name };
    fs.writeFileSync(
        path.join(pluginPath, "plugin.json"),
        JSON.stringify(manifest, null, 2)
    );

    // Create directories
    fs.mkdirSync(path.join(pluginPath, "commands"), { recursive: true });
    fs.mkdirSync(path.join(pluginPath, "tools"), { recursive: true });
    fs.mkdirSync(path.join(pluginPath, "skills"), { recursive: true });

    // Create README
    fs.writeFileSync(
        path.join(pluginPath, "README.md"),
        `# ${name}\n\nA GravityClaw plugin.\n\n## Commands\n\nAdd custom commands here.\n\n## Tools\n\nAdd custom tools here.\n\n## Skills\n\nAdd custom skills here.\n`
    );

    success(`Created plugin '${name}' at ${pluginPath}`);
    info(`Edit ${path.join(pluginPath, "plugin.json")} to configure`);
}

async function removePlugin(name?: string): Promise<void> {
    if (!name) {
        error("Please provide a plugin name");
        info("Usage: gravityclaw plugin remove <name>");
        process.exitCode = 1;
        return;
    }

    const pluginPath = getPluginPath(name);

    if (!fs.existsSync(pluginPath)) {
        error(`Plugin '${name}' not found`);
        process.exitCode = 1;
        return;
    }

    // Check for manifest
    const manifest = readPluginManifest(pluginPath);
    if (!manifest) {
        error(`Plugin '${name}' has no valid manifest`);
        process.exitCode = 1;
        return;
    }

    // Delete directory
    fs.rmSync(pluginPath, { recursive: true });

    success(`Removed plugin '${name}'`);
}

async function infoPlugin(name?: string): Promise<void> {
    if (!name) {
        error("Please provide a plugin name");
        info("Usage: gravityclaw plugin info <name>");
        process.exitCode = 1;
        return;
    }

    const plugins = listPlugins();
    const plugin = plugins.find(p => p.name === name);

    if (!plugin) {
        error(`Plugin '${name}' not found`);
        process.exitCode = 1;
        return;
    }

    title(`🔌 Plugin: ${plugin.manifest.name}`);

    section("Details");
    printTable([
        ["Name", plugin.manifest.name],
        ["Version", plugin.manifest.version || "1.0.0"],
        ["Description", plugin.manifest.description || "N/A"],
        ["Author", plugin.manifest.author || "N/A"],
        ["Path", plugin.path],
    ], [
        { header: "Property", width: 15 },
        { header: "Value", width: 40 },
    ]);

    console.log();

    section("Contents");
    
    const rows = [
        ["Commands", (plugin.manifest.commands?.length || 0).toString()],
        ["Tools", (plugin.manifest.tools?.length || 0).toString()],
        ["Skills", (plugin.manifest.skills?.length || 0).toString()],
        ["MCP Servers", (plugin.manifest.mcpServers?.length || 0).toString()],
    ];
    
    printTable(rows, [
        { header: "Type", width: 15 },
        { header: "Count", width: 10, align: "right" },
    ]);

    if (plugin.manifest.dependencies?.length) {
        console.log();
        section("Dependencies");
        plugin.manifest.dependencies.forEach(dep => info(`  • ${dep}`));
    }
}

function printHelp(): void {
    title("🔌 GravityClaw Plugins");

    section("Usage");
    printTable([
        ["gravityclaw plugin", "List all plugins"],
        ["gravityclaw plugin list", "List all plugins"],
        ["gravityclaw plugin add <name>", "Create new plugin"],
        ["gravityclaw plugin remove <name>", "Remove plugin"],
        ["gravityclaw plugin info <name>", "Show plugin details"],
    ], [
        { header: "Command", width: 35 },
        { header: "Description", width: 40 },
    ]);

    console.log();
    section("What's a Plugin?");
    info("Plugins extend GravityClaw with:");
    info("  • Custom slash commands");
    info("  • Custom tools");
    info("  • Custom skills");
    info("  • MCP server configurations");
    console.log();
    info(`Plugins directory: ${getPluginsDir()}`);
}