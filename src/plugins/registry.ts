/**
 * Plugin Registry
 * 
 * Manages plugin loading, registration, and lifecycle.
 * Discovers plugins from:
 * 1. Built-in plugins (src/plugins/builtin/)
 * 2. External plugins (plugins/ directory)
 * 3. Programmatically registered plugins
 */

import { readdir, readFile, access } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import { createLogger } from "../logger.ts";
import { safeJsonParse } from "../utils/json.ts";
import type { Plugin, PluginTrait, PluginMetadata } from "./base.ts";

const log = createLogger("plugins");

/**
 * Plugin manifest schema (plugin.json)
 */
export interface PluginManifest {
  /**
   * Plugin identifier (unique name)
   */
  id: string;
  
  /**
   * Plugin display name
   */
  name: string;
  
  /**
   * Plugin version (semver)
   */
  version: string;
  
  /**
   * Main entry file (relative to plugin directory)
   */
  main: string;
  
  /**
   * Traits implemented by this plugin
   */
  traits: Array<"provider" | "channel" | "tool" | "memory" | "workflow">;
  
  /**
   * Plugin description
   */
  description?: string;
  
  /**
   * Plugin author(s)
   */
  author?: string | string[];
  
  /**
   * Plugin license
   */
  license?: string;
  
  /**
   * Dependencies (other plugin IDs)
   */
  dependencies?: string[];
  
  /**
   * Configuration schema (JSON Schema)
   */
  configSchema?: Record<string, unknown>;
}

/**
 * Registered plugin entry
 */
interface RegisteredPlugin {
  manifest: PluginManifest;
  plugin: Plugin;
  loaded: boolean;
}

/**
 * Plugin Registry - Singleton instance
 */
class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>();
  private pluginDirectories: string[] = [];
  private watchers: Map<string, AsyncIterator<any>> = new Map();
  private hotReloadEnabled = false;
  private watchDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 500;
  
  /**
   * Add a plugin directory to scan for plugins
   */
  addPluginDirectory(directory: string): void {
    const resolvedPath = resolve(directory);
    if (!this.pluginDirectories.includes(resolvedPath)) {
      this.pluginDirectories.push(resolvedPath);
      log.info(`Added plugin directory: ${resolvedPath}`);
    }
  }
  
  /**
   * Discover plugins from all registered directories
   */
  async discoverPlugins(): Promise<void> {
    log.info("Discovering plugins...");
    
    for (const directory of this.pluginDirectories) {
      try {
        await access(directory);
        await this.scanDirectory(directory);
      } catch (err) {
        log.debug(`Plugin directory not accessible or does not exist: ${directory}`);
      }
    }
    
    if (this.plugins.size === 0) {
      log.info("No plugins discovered (no plugin directories with plugin.json found)");
    } else {
      log.info(`Discovered ${this.plugins.size} plugins`);
    }
  }
  
  /**
   * Scan a directory for plugins
   */
  private async scanDirectory(directory: string): Promise<void> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = join(directory, entry.name);
          await this.loadPluginFromDirectory(pluginPath);
        }
      }
    } catch (err) {
      log.error(`Error scanning directory ${directory}`, err);
    }
  }
  
  /**
   * Load a plugin from a directory
   */
  private async loadPluginFromDirectory(directory: string): Promise<void> {
    try {
      const manifestPath = join(directory, "plugin.json");
      
      // Check if plugin.json exists
      try {
        await access(manifestPath);
      } catch {
        log.debug(`No plugin.json found in ${directory}`);
        return;
      }
      
      // Read and parse manifest
      const manifestContent = await readFile(manifestPath, "utf-8");
      const parseResult = safeJsonParse<PluginManifest | null>(manifestContent, null, "plugin manifest");
      if (!parseResult.success || parseResult.data === null) {
        log.warn(`Failed to parse plugin manifest in ${directory}`);
        return;
      }
      const manifest = parseResult.data;
      
      // Validate manifest
      if (!manifest.id || !manifest.name || !manifest.version || !manifest.main || !manifest.traits) {
        log.warn(`Invalid plugin manifest in ${directory}: missing required fields`);
        return;
      }
      
      // Check if plugin already registered
      if (this.plugins.has(manifest.id)) {
        log.warn(`Plugin ${manifest.id} already registered, skipping`);
        return;
      }
      
      log.info(`Found plugin: ${manifest.name} v${manifest.version} (${manifest.id})`);
      
      // Load plugin module (not initialized yet)
      let mainPath = join(directory, manifest.main);

      // If the main path lacks an extension, try known defaults
      if (!mainPath.endsWith(".ts") && !mainPath.endsWith(".js")) {
        const tsPath = `${mainPath}.ts`;
        const jsPath = `${mainPath}.js`;

        try {
          await access(tsPath);
          mainPath = tsPath;
        } catch {
          try {
            await access(jsPath);
            mainPath = jsPath;
          } catch {
            // keep original mainPath and let import fail
          }
        }
      }

      const mainUrl = pathToFileURL(mainPath).href;
      const pluginModule = await import(mainUrl);

      // Get default export (should be a Plugin instance or factory)
      const plugin: Plugin = pluginModule.default;
      
      if (!plugin || typeof plugin !== "object") {
        log.error(`Plugin ${manifest.id} does not export a valid Plugin instance`);
        return;
      }
      
      // Register plugin (not loaded yet)
      this.plugins.set(manifest.id, {
        manifest,
        plugin,
        loaded: false,
      });
      
      log.info(`Registered plugin: ${manifest.id}`);
    } catch (err) {
      log.error(`Error loading plugin from ${directory}`, err);
    }
  }
  
  /**
   * Register a plugin programmatically
   */
  registerPlugin(plugin: Plugin): void {
    const { metadata } = plugin;
    
    if (this.plugins.has(metadata.id)) {
      log.warn(`Plugin ${metadata.id} already registered`);
      return;
    }
    
    const manifest: PluginManifest = {
      id: metadata.id,
      name: metadata.name,
      version: metadata.version,
      main: "<programmatic>",
      traits: metadata.traits,
      ...(metadata.description && { description: metadata.description }),
      ...(metadata.author && { author: metadata.author }),
      ...(metadata.license && { license: metadata.license }),
      ...(metadata.dependencies && { dependencies: metadata.dependencies }),
    };
    
    this.plugins.set(metadata.id, {
      manifest,
      plugin,
      loaded: false,
    });
    
    log.info(`Registered plugin programmatically: ${metadata.id}`);
  }
  
  /**
   * Load a specific plugin by ID
   */
  async loadPlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    
    if (!entry) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    if (entry.loaded) {
      log.debug(`Plugin ${pluginId} already loaded`);
      return;
    }
    
    log.info(`Loading plugin: ${pluginId}`);
    
    // Load dependencies first
    if (entry.manifest.dependencies) {
      for (const depId of entry.manifest.dependencies) {
        await this.loadPlugin(depId);
      }
    }
    
    // Call plugin onLoad lifecycle hook
    if (entry.plugin.onLoad) {
      await entry.plugin.onLoad();
    }
    
    entry.loaded = true;
    log.info(`Loaded plugin: ${pluginId}`);
  }
  
  /**
   * Load all discovered plugins
   */
  async loadAllPlugins(): Promise<void> {
    log.info("Loading all plugins...");
    
    for (const pluginId of this.plugins.keys()) {
      try {
        await this.loadPlugin(pluginId);
      } catch (err) {
        log.error(`Failed to load plugin ${pluginId}`, err);
      }
    }
    
    log.info("All plugins loaded");
  }
  
  /**
   * Unload a specific plugin by ID
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    
    if (!entry) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    if (!entry.loaded) {
      log.debug(`Plugin ${pluginId} not loaded`);
      return;
    }
    
    log.info(`Unloading plugin: ${pluginId}`);
    
    // Call plugin onUnload lifecycle hook
    if (entry.plugin.onUnload) {
      await entry.plugin.onUnload();
    }
    
    entry.loaded = false;
    log.info(`Unloaded plugin: ${pluginId}`);
  }
  
  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): Plugin | undefined {
    const entry = this.plugins.get(pluginId);
    return entry?.loaded ? entry.plugin : undefined;
  }
  
  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): Map<string, Plugin> {
    const loaded = new Map<string, Plugin>();
    
    for (const [id, entry] of this.plugins.entries()) {
      if (entry.loaded) {
        loaded.set(id, entry.plugin);
      }
    }
    
    return loaded;
  }
  
  /**
   * Get plugins by trait type
   */
  getPluginsByTrait<T extends PluginTrait>(traitType: T["traitType"]): Map<string, T> {
    const result = new Map<string, T>();
    
    for (const [id, entry] of this.plugins.entries()) {
      if (!entry.loaded) continue;
      
      const trait = entry.plugin.getTrait<T>(traitType);
      if (trait) {
        result.set(id, trait);
      }
    }
    
    return result;
  }
  
  /**
   * List all registered plugins
   */
  listPlugins(): PluginMetadata[] {
    const list: PluginMetadata[] = [];
    
    for (const entry of this.plugins.values()) {
      list.push({
        id: entry.manifest.id,
        name: entry.manifest.name,
        version: entry.manifest.version,
        traits: entry.manifest.traits,
        ...(entry.manifest.description && { description: entry.manifest.description }),
        ...(entry.manifest.author && { author: entry.manifest.author }),
        ...(entry.manifest.license && { license: entry.manifest.license }),
        ...(entry.manifest.dependencies && { dependencies: entry.manifest.dependencies }),
      });
    }
    
    return list;
  }
  
  /**
   * Clear all plugins (for testing)
   */
  clear(): void {
    this.plugins.clear();
    this.pluginDirectories = [];
    log.info("Plugin registry cleared");
  }
  
  /**
   * Enable hot-reload for plugins
   * Uses file system watching to detect changes and reload plugins automatically
   */
  async enableHotReload(): Promise<void> {
    if (this.hotReloadEnabled) {
      log.warn("Hot reload already enabled");
      return;
    }
    
    this.hotReloadEnabled = true;
    log.info("Hot reload enabled");
    
    for (const [pluginId, entry] of this.plugins.entries()) {
      if (entry.loaded) {
        await this.setupFileWatcher(pluginId, entry);
      }
    }
  }
  
  /**
   * Disable hot-reload
   */
  disableHotReload(): void {
    this.hotReloadEnabled = false;
    for (const timer of this.watchDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.watchDebounceTimers.clear();
    log.info("Hot reload disabled");
  }
  
  /**
   * Setup file watcher for a plugin
   */
  private async setupFileWatcher(pluginId: string, entry: RegisteredPlugin): Promise<void> {
    if (entry.manifest.main === "<programmatic>") {
      return;
    }
    
    const directory = resolve(
      this.pluginDirectories.find(d => {
        const pluginPath = join(d, pluginId);
        try {
          return existsSync(pluginPath);
        } catch {
          return false;
        }
      }) || ".",
      pluginId
    );
    
    try {
      const { watch } = await import("fs");
      
      watch(directory, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        
        const ext = filename.split(".").pop();
        if (!["ts", "js", "json"].includes(ext || "")) return;
        
        const existingTimer = this.watchDebounceTimers.get(pluginId);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        const timer = setTimeout(async () => {
          this.watchDebounceTimers.delete(pluginId);
          log.info(`Detected change in plugin ${pluginId}: ${eventType} - ${filename}`);
          await this.reloadPlugin(pluginId);
        }, this.DEBOUNCE_MS);
        
        this.watchDebounceTimers.set(pluginId, timer);
      });
      
      log.debug(`Setup file watcher for plugin: ${pluginId}`);
    } catch (err) {
      log.error(`Failed to setup file watcher for plugin ${pluginId}`, err);
    }
  }
  
  /**
   * Reload a specific plugin (hot-reload)
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    
    if (!entry) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    log.info(`Reloading plugin: ${pluginId}`);
    
    if (entry.loaded) {
      if (entry.plugin.onUnload) {
        await entry.plugin.onUnload();
      }
      
      if (entry.plugin.onReload) {
        await entry.plugin.onReload();
      } else {
        const mainPath = join(
          this.pluginDirectories.find(d => {
            const pluginPath = join(d, pluginId);
            try {
              return existsSync(pluginPath);
            } catch {
              return false;
            }
          }) || ".",
          pluginId,
          entry.manifest.main
        );
        
        const newModule = await import(mainPath + "?t=" + Date.now());
        entry.plugin = newModule.default;
        
        if (entry.plugin.onLoad) {
          await entry.plugin.onLoad();
        }
      }
      
      log.info(`Reloaded plugin: ${pluginId}`);
    }
  }
}

/**
 * Singleton instance
 */
export const pluginRegistry = new PluginRegistry();

/**
 * Initialize plugin system with default directories
 */
export async function initializePlugins(): Promise<void> {
  // Add default plugin directories
  pluginRegistry.addPluginDirectory(resolve("src/plugins/builtin"));
  pluginRegistry.addPluginDirectory(resolve("plugins"));
  
  // Discover and load plugins
  await pluginRegistry.discoverPlugins();
  await pluginRegistry.loadAllPlugins();
}
