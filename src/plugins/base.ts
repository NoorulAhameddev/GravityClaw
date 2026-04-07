/**
 * Plugin System - Base Traits
 * 
 * Defines the core traits that plugins can implement:
 * - Provider: LLM providers (e.g., OpenRouter, OpenAI, Custom API)
 * - Channel: Communication channels (e.g., Telegram, WhatsApp, Discord, IRC)
 * - Tool: Agent tools (e.g., Web search, calculator, database queries)
 * - Memory: Memory backends (e.g., SQLite, Redis, PostgreSQL, Vector DB)
 */

import type { LLMProvider } from "../llm/base.ts";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

/**
 * Provider Trait - Implements an LLM provider
 */
export interface ProviderTrait extends LLMProvider {
  /**
   * Provider trait marker
   */
  readonly traitType: "provider";
  
  /**
   * Provider-specific configuration schema
   * Returns a JSON schema describing required configuration fields
   */
  getConfigSchema(): Record<string, unknown>;
}

/**
 * Channel Trait - Implements a communication channel
 */
export interface ChannelTrait {
  /**
   * Channel trait marker
   */
  readonly traitType: "channel";
  
  /**
   * Channel identifier (e.g., "telegram", "discord", "slack")
   */
  readonly channelId: string;
  
  /**
   * Human-readable channel name
   */
  readonly channelName: string;
  
  /**
   * Initialize the channel with configuration
   */
  initialize(config: Record<string, unknown>): Promise<void>;
  
  /**
   * Start listening for messages
   */
  start(): Promise<void>;
  
  /**
   * Stop the channel gracefully
   */
  stop(): Promise<void>;
  
  /**
   * Send a message to a user
   * @param userId - Channel-specific user identifier
   * @param message - Message to send
   * @returns Message ID if supported
   */
  sendMessage(userId: string, message: string): Promise<string | void>;
  
  /**
   * Get channel configuration schema
   */
  getConfigSchema(): Record<string, unknown>;
}

/**
 * Tool Trait - Implements an agent tool
 */
export interface ToolTrait {
  /**
   * Tool trait marker
   */
  readonly traitType: "tool";
  
  /**
   * Tool identifier (e.g., "web_search", "calculator", "database_query")
   */
  readonly toolId: string;
  
  /**
   * Human-readable tool name
   */
  readonly toolName: string;
  
  /**
   * Tool description for the LLM
   */
  readonly description: string;
  
  /**
   * Initialize the tool with configuration
   */
  initialize(config: Record<string, unknown>): Promise<void>;
  
  /**
   * Get the OpenAI function definition for this tool
   */
  getDefinition(): ChatCompletionTool;
  
  /**
   * Execute the tool with given parameters
   * @param parameters - Tool-specific parameters
   * @returns Tool execution result as a string
   */
  execute(parameters: Record<string, unknown>): Promise<string>;
  
  /**
   * Get tool configuration schema
   */
  getConfigSchema(): Record<string, unknown>;
}

/**
 * Memory Trait - Implements a memory backend
 */
export interface MemoryTrait {
  /**
   * Memory trait marker
   */
  readonly traitType: "memory";
  
  /**
   * Memory backend identifier (e.g., "sqlite", "redis", "postgres")
   */
  readonly memoryId: string;
  
  /**
   * Human-readable memory backend name
   */
  readonly memoryName: string;
  
  /**
   * Initialize the memory backend with configuration
   */
  initialize(config: Record<string, unknown>): Promise<void>;
  
  /**
   * Store a conversation message
   */
  storeMessage(userId: string, message: {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
  }): Promise<void>;
  
  /**
   * Retrieve conversation history for a user
   * @param userId - User identifier
   * @param limit - Maximum number of messages to retrieve
   * @returns Array of messages in chronological order
   */
  getHistory(userId: string, limit?: number): Promise<Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
  }>>;
  
  /**
   * Clear conversation history for a user
   */
  clearHistory(userId: string): Promise<void>;
  
  /**
   * Store arbitrary key-value data
   */
  set(key: string, value: unknown): Promise<void>;
  
  /**
   * Retrieve stored data by key
   */
  get<T>(key: string): Promise<T | null>;
  
  /**
   * Delete stored data by key
   */
  delete(key: string): Promise<void>;
  
  /**
   * Close the memory backend connection
   */
  close(): Promise<void>;
  
  /**
   * Get memory backend configuration schema
   */
  getConfigSchema(): Record<string, unknown>;
}

/**
 * Workflow Trait - Implements automation/workflow plugins
 */
export interface WorkflowTrait {
  /**
   * Workflow trait marker
   */
  readonly traitType: "workflow";
  
  /**
   * Workflow identifier (e.g., "automation", "cron", "pipeline")
   */
  readonly workflowId: string;
  
  /**
   * Human-readable workflow name
   */
  readonly workflowName: string;
  
  /**
   * Initialize the workflow plugin with configuration
   */
  initialize(config: Record<string, unknown>): Promise<void>;
  
  /**
   * Execute a workflow with given parameters
   * @param params - Workflow-specific parameters
   * @returns Workflow execution result
   */
  executeWorkflow(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  
  /**
   * Get the current status of a running or completed workflow
   * @param executionId - The execution identifier
   * @returns Status information
   */
  getWorkflowStatus(executionId: string): Promise<{
    status: "pending" | "running" | "completed" | "failed" | "stopped";
    progress?: number;
    result?: Record<string, unknown>;
    error?: string;
  }>;
  
  /**
   * Stop a running workflow
   * @param executionId - The execution identifier to stop
   * @returns Whether the stop was successful
   */
  stopWorkflow(executionId: string): Promise<boolean>;
  
  /**
   * Get workflow configuration schema
   */
  getConfigSchema(): Record<string, unknown>;
}

/**
 * Union type for all plugin traits
 */
export type PluginTrait = ProviderTrait | ChannelTrait | ToolTrait | MemoryTrait | WorkflowTrait;

/**
 * Plugin metadata
 */
export interface PluginMetadata {
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
   * Traits implemented by this plugin
   */
  traits: Array<"provider" | "channel" | "tool" | "memory" | "workflow">;
  
  /**
   * Dependencies (other plugin IDs)
   */
  dependencies?: string[];
}

/**
 * Plugin interface - implements one or more traits
 */
export interface Plugin {
  /**
   * Plugin metadata
   */
  readonly metadata: PluginMetadata;
  
  /**
   * Get trait implementation by type
   */
  getTrait<T extends PluginTrait>(traitType: T["traitType"]): T | null;
  
  /**
   * Plugin lifecycle: Initialize the plugin
   */
  onLoad?(): Promise<void>;
  
  /**
   * Plugin lifecycle: Clean up before unloading
   */
  onUnload?(): Promise<void>;
  
  /**
   * Plugin lifecycle: Called when plugin is reloaded (hot-reload)
   */
  onReload?(): Promise<void>;
}
