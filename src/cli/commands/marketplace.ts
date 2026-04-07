import { title, section, printBox, info, error, success, warn, dim, c } from "../rich-utils.ts";
import { pluginRegistry } from "../../plugins/registry.ts";
import { readFile, writeFile, access, constants } from "fs/promises";
import { join, resolve } from "path";

const MARKETPLACE_FILE = resolve("marketplace.json");

/**
 * Marketplace command - manage plugin marketplace
 */
export async function marketplaceCommand(subcommand: string | undefined, args: string[]): Promise<void> {
    if (!subcommand) {
        await showMarketplaceHelp();
        return;
    }

    switch (subcommand.toLowerCase()) {
        case "add":
            await marketplaceAdd(args[0]);
            break;
        case "list":
            await marketplaceList();
            break;
        case "remove":
        case "rm":
            await marketplaceRemove(args[0]);
            break;
        case "help":
            await showMarketplaceHelp();
            break;
        default:
            error(`Unknown marketplace subcommand: ${subcommand}\n`);
            await showMarketplaceHelp();
    }
}

async function showMarketplaceHelp(): Promise<void> {
    title("🏪 Plugin Marketplace");
    
    const helpText = `
${c.cyan("marketplace add <plugin-spec>")}    Add a plugin from marketplace or git
${c.cyan("marketplace list")}           List installed plugins
${c.cyan("marketplace remove <plugin-id>")}  Remove an installed plugin
${c.cyan("marketplace help")}          Show this help

Examples:
  ${c.dim("$")} gravityclaw marketplace add affaan-m/everything-claude-code
  ${c.dim("$")} gravityclaw marketplace list
  ${c.dim("$")} gravityclaw marketplace remove example-hello
`;

    printBox(helpText.trim(), {
        title: "Usage",
        borderColor: "cyan"
    });
}

async function marketplaceAdd(pluginSpec: string | undefined): Promise<void> {
    if (!pluginSpec) {
        error("Please specify a plugin to add\n");
        error("Usage: marketplace add <plugin-spec>\n");
        return;
    }

    info(`Adding plugin: ${pluginSpec}`);

    try {
        // Parse plugin spec (could be owner/repo or direct URL)
        let repoUrl: string;
        let pluginId: string;

        if (pluginSpec.includes("/") && !pluginSpec.startsWith("http")) {
            // Assume format: owner/repo
            const parts = pluginSpec.split("/");
            const owner = parts[0];
            const repo = parts[1];
            if (!repo) {
                error(`Invalid plugin specification: ${pluginSpec}\n`);
                return;
            }
            repoUrl = `https://github.com/${owner}/${repo}`;
            pluginId = repo.toLowerCase();
        } else if (pluginSpec.startsWith("http")) {
            // Direct URL
            repoUrl = pluginSpec;
            // Extract repo name from URL
            const urlObj = new URL(pluginSpec);
            const pathParts = urlObj.pathname.split("/").filter(Boolean);
            const lastPart = pathParts[pathParts.length - 1];
            pluginId = lastPart ? lastPart.replace(/\.git$/, "") : "unknown";
        } else {
            error(`Invalid plugin specification: ${pluginSpec}\n`);
            error("Expected format: owner/repo or full git URL\n");
            return;
        }

        // Check if already installed
        const marketplace = await loadMarketplace();
        if (marketplace.installedPlugins.some(p => p.id === pluginId)) {
            warn(`Plugin ${pluginId} is already installed`);
            return;
        }

        // Clone/download the plugin
        const pluginDir = join("plugins", pluginId);
        
        // Check if directory already exists
        try {
            await access(pluginDir, constants.F_OK);
            warn(`Directory ${pluginDir} already exists. Remove it first or use a different name.`);
            return;
        } catch {
            // Directory doesn't exist, proceed
        }

        info(`Cloning from ${repoUrl}...`);
        
        // Use git to clone the repository
        const { exec } = await import("child_process");
        exec(`git clone "${repoUrl}" "${pluginDir}"`, (execError, stdout, execStderr) => {
            if (execError) {
                error(`Failed to clone repository: ${execError.message}\n`);
                if (execStderr) error(`stderr: ${execStderr}\n`);
                return;
            }

            info(`Successfully cloned ${pluginSpec}`);

            // Try to discover and load the newly added plugin
            discoverAndLoadNewPlugin(pluginId, pluginDir)
                .then(() => {
                    success(`Plugin ${pluginId} installed successfully!`);
                    // Add to marketplace registry
                    return addToMarketplaceRegistry(pluginId, {
                        name: pluginId, // We'll update this after reading manifest
                        version: "unknown",
                        description: "Plugin added from marketplace",
                        author: "Unknown",
                        repoUrl: repoUrl,
                        installedAt: new Date().toISOString()
                    });
                })
                .then(() => {
                    info(`Use '${c.cyan("gravityclaw plugins")}' to see available plugins`);
                })
                .catch(err => {
                    error(`Failed to initialize plugin: ${err.message}\n`);
                });
        });
    } catch (err) {
        error(`Error adding plugin: ${err instanceof Error ? err.message : String(err)}\n`);
    }
}

async function marketplaceList(): Promise<void> {
    title("📦 Installed Plugins");
    
    try {
        const marketplace = await loadMarketplace();
        const installed = marketplace.installedPlugins;

        if (installed.length === 0) {
            info("No plugins installed from marketplace");
            info(`Use '${c.cyan("gravityclaw marketplace add <plugin-spec>")}' to add plugins`);
            return;
        }

        const rows = installed.map(plugin => [
            plugin.id,
            plugin.name || "Unknown",
            plugin.version || "unknown",
            plugin.author || "Unknown"
        ]);

        const tableContent = rows.map(row => {
            const cell0 = row[0] || "";
            const cell1 = row[1] || "";
            const cell2 = row[2] || "";
            const cell3 = row[3] || "";
            return `${c.cyan(cell0.padEnd(20))}  ${cell1.padEnd(20)}  ${cell2.padEnd(10)}  ${cell3}`;
        }).join("\n");

        printBox(tableContent, {
            title: `Total: ${installed.length} plugin(s)`,
            borderColor: "cyan"
        });

    } catch (err) {
        error(`Error listing plugins: ${err instanceof Error ? err.message : String(err)}\n`);
    }
}

async function marketplaceRemove(pluginId: string | undefined): Promise<void> {
    if (!pluginId) {
        error("Please specify a plugin to remove\n");
        error("Usage: marketplace remove <plugin-id>\n");
        return;
    }

    try {
        const marketplace = await loadMarketplace();
        const pluginIndex = marketplace.installedPlugins.findIndex(p => p.id === pluginId);

        if (pluginIndex === -1) {
            warn(`Plugin ${pluginId} not found in marketplace`);
            return;
        }

        const pluginToRemove = marketplace.installedPlugins[pluginIndex];

        // Remove from marketplace registry
        marketplace.installedPlugins.splice(pluginIndex, 1);
        await saveMarketplace(marketplace);

        // Remove plugin directory
        const pluginDir = join("plugins", pluginId);
        const { rm } = await import("fs/promises");
        await rm(pluginDir, { recursive: true, force: true });

        success(`Removed plugin ${pluginId}`);
        
        // Unload if currently loaded
        if (pluginRegistry.getPlugin(pluginId)) {
            await pluginRegistry.unloadPlugin(pluginId);
            info(`Plugin ${pluginId} unloaded`);
        }

    } catch (err) {
        error(`Error removing plugin: ${err instanceof Error ? err.message : String(err)}\n`);
    }
}

async function loadMarketplace(): Promise<{ installedPlugins: MarketplacePlugin[] }> {
    try {
        await access(MARKETPLACE_FILE, constants.F_OK);
        const content = await readFile(MARKETPLACE_FILE, "utf-8");
        const parsed = JSON.parse(content);
        return {
            installedPlugins: parsed.installedPlugins || []
        };
    } catch {
        // File doesn't exist or invalid JSON, return empty
        return { installedPlugins: [] };
    }
}

async function saveMarketplace(marketplace: { installedPlugins: MarketplacePlugin[] }): Promise<void> {
    const content = JSON.stringify(marketplace, null, 2);
    await writeFile(MARKETPLACE_FILE, content, "utf-8");
}

interface MarketplacePlugin {
    id: string;
    name?: string;
    version?: string;
    description?: string;
    author?: string;
    repoUrl: string;
    installedAt: string;
}

async function discoverAndLoadNewPlugin(pluginId: string, pluginDir: string): Promise<void> {
    // Add the plugin directory to registry
    pluginRegistry.addPluginDirectory(pluginDir);
    
    // Discover plugins in the directory
    await pluginRegistry.discoverPlugins();
    
    // Load the newly discovered plugin
    await pluginRegistry.loadAllPlugins();
}

async function addToMarketplaceRegistry(pluginId: string, pluginInfo: Omit<MarketplacePlugin, "id">): Promise<void> {
    const marketplace = await loadMarketplace();
    
    // Check if already exists and update, otherwise add
    const existingIndex = marketplace.installedPlugins.findIndex(p => p.id === pluginId);
    if (existingIndex >= 0) {
        marketplace.installedPlugins[existingIndex] = { id: pluginId, ...pluginInfo };
    } else {
        marketplace.installedPlugins.push({ id: pluginId, ...pluginInfo });
    }
    
    await saveMarketplace(marketplace);
}