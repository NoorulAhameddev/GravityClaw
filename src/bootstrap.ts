import { config } from "./config.ts";
import { db } from "./db.ts";
import { registry, registerBuiltInTools, toolExecutor } from "./tools/index.ts";
import { createProvider, getProvider } from "./llm/index.ts";

export interface BootstrapContainer {
    config: typeof config;
    db: typeof db;
    toolRegistry: typeof registry;
    toolExecutor: typeof toolExecutor;
    llmProvider: ReturnType<typeof getProvider>;
}

export interface BootstrapOptions {
    providerOverride?: string;
    modelOverride?: string;
}

/**
 * Composition Root - Initialize all core dependencies
 * 
 * This is the single place where dependencies are wired together.
 * Returns a container object that can be passed to consumers.
 */
export function bootstrap(options?: BootstrapOptions): BootstrapContainer {
    // Register all built-in tools
    registerBuiltInTools();

    // Create LLM provider (with optional overrides)
    const llmProvider = options?.providerOverride || options?.modelOverride
        ? createProvider({
            provider: options.providerOverride,
            model: options.modelOverride,
        })
        : getProvider();

    return {
        config,
        db,
        toolRegistry: registry,
        toolExecutor,
        llmProvider,
    };
}

// Export a default instance for backward compatibility
export const container = bootstrap();
