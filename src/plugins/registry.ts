import { createLogger } from "../logger.ts";
import type { Plugin, PluginTrait } from "./base.ts";

const log = createLogger("plugin-registry");

export interface PluginManifest {
    name: string;
    version: string;
    description: string;
    author: string;
    license: string;
    entry: string;
    tools: string[];
    permissions: string[];
    configSchema: Record<string, any>;
}

export interface PluginContext {
    registerTool(tool: { name: string; description: string; handler: (args: any) => Promise<any> }): void;
    getConfig(key: string): any;
    logger: ReturnType<typeof createLogger>;
}

export async function initializePlugins(): Promise<void> {
    log.info("Plugin system initialized");
}

export class PluginRegistry {
    private plugins = new Map<string, Plugin>();
    private loaded = new Map<string, Plugin>();
    private directories = new Set<string>();

    clear(): void {
        this.plugins.clear();
        this.loaded.clear();
        log.info("Plugin registry cleared");
    }

    registerPlugin(plugin: Plugin): void {
        const id = plugin.metadata.id;
        this.plugins.set(id, plugin);
        log.info(`Plugin registered: ${id}`);
    }

    listPlugins(): Plugin[] {
        return Array.from(this.plugins.values()).map(p => ({
            ...p,
            get id() { return p.metadata.id; },
            get metadata() { return p.metadata; },
        } as any));
    }

    async loadPlugin(name: string): Promise<void> {
        const plugin = this.plugins.get(name);
        if (!plugin) throw new Error(`Plugin not found: ${name}`);

        if (plugin.metadata.dependencies) {
            for (const dep of plugin.metadata.dependencies) {
                if (!this.loaded.has(dep)) {
                    await this.loadPlugin(dep);
                }
            }
        }

        if (plugin.onLoad) {
            await plugin.onLoad();
        }
        this.loaded.set(name, plugin);
        log.info(`Plugin loaded: ${name}`);
    }

    async unloadPlugin(name: string): Promise<void> {
        const plugin = this.plugins.get(name);
        if (plugin?.onUnload) {
            await plugin.onUnload();
        }
        this.plugins.delete(name);
        this.loaded.delete(name);
        log.info(`Plugin unloaded: ${name}`);
    }

    getPlugin(name: string): Plugin | undefined {
        return this.plugins.get(name);
    }

    getLoadedPlugins(): Map<string, Plugin> {
        return this.loaded;
    }

    async loadAllPlugins(): Promise<void> {
        for (const [name] of this.plugins) {
            if (!this.loaded.has(name)) {
                await this.loadPlugin(name);
            }
        }
    }

    getPluginsByTrait<T extends PluginTrait = PluginTrait>(traitType: T["traitType"]): Map<string, Plugin> {
        const result = new Map<string, Plugin>();
        for (const [name, plugin] of this.loaded) {
            const trait = plugin.getTrait(traitType);
            if (trait !== null) {
                result.set(name, plugin);
            }
        }
        return result;
    }

    addPluginDirectory(dir: string): void {
        this.directories.add(dir);
    }

    discoverPlugins(): string[] {
        return Array.from(this.plugins.keys());
    }

    async install(source: string): Promise<PluginManifest> {
        const manifest: PluginManifest = {
            name: source,
            version: "0.0.1",
            description: `Plugin from ${source}`,
            author: "unknown",
            license: "MIT",
            entry: source,
            tools: [],
            permissions: [],
            configSchema: {},
        };
        log.info(`Plugin installed: ${source}`);
        return manifest;
    }

    uninstall(name: string): void {
        this.plugins.delete(name);
        this.loaded.delete(name);
    }

    list(): PluginManifest[] {
        return Array.from(this.plugins.values()).map(p => ({
            name: p.metadata.id,
            version: p.metadata.version,
            description: p.metadata.name,
            author: "",
            license: "MIT",
            entry: "",
            tools: [],
            permissions: [],
            configSchema: {},
        }));
    }

    getToolHandler(_toolName: string): ((args: any) => Promise<any>) | undefined {
        return undefined;
    }
}

export const pluginRegistry = new PluginRegistry();
