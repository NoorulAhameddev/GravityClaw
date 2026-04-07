/**
 * Integration Test Utilities and Fixtures
 * Provides helpers for database management, session creation, and test cleanup
 */

import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";
import type { SessionSettings } from "../../session.ts";

const log = createLogger("test-utils");

/**
 * Create a unique test session ID with optional prefix
 */
export function createTestSessionId(prefix: string = "test"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}:${timestamp}:${random}`;
}

/**
 * Create a test session with optional settings
 */
export function createTestSession(
  sessionId: string,
  settings?: Partial<SessionSettings>
): {
  sessionId: string;
  settings: SessionSettings;
} {
  const defaultSettings: SessionSettings = {
    provider: "openrouter",
    model: "test-model",
    thinkingLevel: "off",
    voiceMode: "off",
    heartbeatEnabled: false,
    recommendationsEnabled: false,
    ...settings,
  };

  try {
    // Insert session record
    db.prepare(
      `INSERT OR IGNORE INTO sessions (id, allow_messages) VALUES (?, ?)`
    ).run(sessionId, 0);

    // Store settings
    db.prepare(
      `INSERT INTO memory (session_id, message_json, settings) VALUES (?, ?, ?)`
    ).run(sessionId, JSON.stringify({ role: "system", content: "init" }), JSON.stringify(defaultSettings));
  } catch (err) {
    log.warn(`Failed to create test session: ${err}`);
  }

  return { sessionId, settings: defaultSettings };
}

/**
 * Clean up a test session and all its data
 */
export function cleanupTestSession(sessionId: string): void {
  try {
    db.prepare(`DELETE FROM memory WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM fact_stats WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM entities WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM relationships WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
    db.prepare(`DELETE FROM agent_swarms WHERE parent_session_id = ? OR child_session_id = ?`).run(
      sessionId,
      sessionId
    );
    db.prepare(`DELETE FROM usage WHERE session_id = ?`).run(sessionId);
  } catch (err) {
    log.warn(`Failed to cleanup test session ${sessionId}: ${err}`);
  }
}

/**
 * Clean up multiple test sessions
 */
export function cleanupTestSessions(sessionIds: string[]): void {
  sessionIds.forEach((id) => cleanupTestSession(id));
}

/**
 * Get session message history
 */
export function getSessionHistory(sessionId: string): Array<Record<string, unknown>> {
  try {
    const rows = db
      .prepare(`SELECT message_json FROM memory WHERE session_id = ? ORDER BY id ASC`)
      .all(sessionId) as Array<{ message_json: string }>;

    return rows.map((row) => {
      try {
        return JSON.parse(row.message_json);
      } catch {
        return { error: "Failed to parse message" };
      }
    });
  } catch (err) {
    log.error(`Failed to get session history: ${err}`);
    return [];
  }
}

/**
 * Insert a test message to session history
 */
export function insertTestMessage(
  sessionId: string,
  role: "user" | "assistant" | "tool" | "system" | "tool-error" | "state" | "agent-iteration",
  content: string
): void {
  try {
    db.prepare(
      `INSERT INTO memory (session_id, message_json, settings) VALUES (?, ?, ?)`
    ).run(sessionId, JSON.stringify({ role, content }), JSON.stringify({}));
  } catch (err) {
    log.error(`Failed to insert test message: ${err}`);
  }
}

/**
 * Get session settings from database
 */
export function getSessionSettingsFromDb(sessionId: string): SessionSettings | null {
  try {
    const row = db
      .prepare(
        `SELECT settings FROM memory WHERE session_id = ? AND settings != '{}' LIMIT 1`
      )
      .get(sessionId) as { settings: string } | undefined;

    if (!row?.settings) {
      return null;
    }
    
    const parsed = JSON.parse(row.settings);
    return parsed || null;
  } catch (err) {
    log.error(`Failed to get session settings: ${err}`);
    return null;
  }
}

/**
 * Update session settings in database
 */
export function updateSessionSettingsInDb(
  sessionId: string,
  settings: Partial<SessionSettings>
): void {
  try {
    const current = getSessionSettingsFromDb(sessionId) || {};
    const updated = { ...current, ...settings };

    db.prepare(
      `UPDATE memory SET settings = ?, timestamp = CURRENT_TIMESTAMP WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1`
    ).run(JSON.stringify(updated), sessionId);
  } catch (err) {
    log.error(`Failed to update session settings: ${err}`);
  }
}

/**
 * Create test fact in memory system
 */
export function createTestFact(
  sessionId: string,
  category: string,
  fact: string
): void {
  try {
    const { touchFactAccess } = require("../../memory/markdown.ts");
    touchFactAccess(sessionId, category, fact, {
      incrementCount: true,
      importanceDelta: 1,
    });
  } catch (err) {
    log.warn(`Failed to create test fact: ${err}`);
  }
}

/**
 * Create test entity in knowledge graph
 */
export function createTestEntity(
  sessionId: string,
  name: string,
  type: string,
  properties?: Record<string, unknown>
): number {
  try {
    const result = db
      .prepare(
        `INSERT INTO entities (session_id, name, type, properties) 
         VALUES (?, ?, ?, ?)
         ON CONFLICT (session_id, name) DO UPDATE SET 
         type = excluded.type, properties = excluded.properties`
      )
      .run(sessionId, name, type, JSON.stringify(properties || {}));

    return Number(result.lastInsertRowid);
  } catch (err) {
    log.error(`Failed to create test entity: ${err}`);
    return -1;
  }
}

/**
 * Create test relationship in knowledge graph
 */
export function createTestRelationship(
  sessionId: string,
  fromEntityName: string,
  toEntityName: string,
  relationType: string,
  metadata?: Record<string, unknown>
): void {
  try {
    // Get entity IDs
    const fromEntity = db
      .prepare(`SELECT id FROM entities WHERE session_id = ? AND name = ? LIMIT 1`)
      .get(sessionId, fromEntityName) as { id: number } | undefined;

    const toEntity = db
      .prepare(`SELECT id FROM entities WHERE session_id = ? AND name = ? LIMIT 1`)
      .get(sessionId, toEntityName) as { id: number } | undefined;

    if (fromEntity && toEntity) {
      db.prepare(
        `INSERT INTO relationships (session_id, from_id, to_id, relation_type, metadata)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        sessionId,
        fromEntity.id,
        toEntity.id,
        relationType,
        JSON.stringify(metadata || {})
      );
    }
  } catch (err) {
    log.warn(`Failed to create test relationship: ${err}`);
  }
}

/**
 * Insert test usage record
 */
export function insertUsageRecord(
  sessionId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number
): void {
  try {
    db.prepare(
      `INSERT INTO usage (session_id, model, input_tokens, output_tokens, cost_usd)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, model, inputTokens, outputTokens, costUsd);
  } catch (err) {
    log.warn(`Failed to insert usage record: ${err}`);
  }
}

/**
 * Mock tool execution for testing
 */
export function createMockToolExecutor(
  toolName: string,
  result: string
): (input: Record<string, unknown>) => Promise<string> {
  return async (input: Record<string, unknown>) => {
    log.info(`Mock tool execution: ${toolName} with input:`, input);
    return result;
  };
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean,
  timeoutMs: number = 5000,
  pollIntervalMs: number = 100
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

/**
 * Test fixture: Mock conversation messages
 */
export const mockConversationMessages = [
  { role: "user" as const, content: "Hello, what can you do?" },
  { role: "assistant" as const, content: "I can help you with various tasks. What would you like?" },
  { role: "user" as const, content: "Can you help me with a file operation?" },
  { role: "assistant" as const, content: "Yes, I can help with file operations. What do you need?" },
];

/**
 * Test fixture: Mock usage records
 */
export const mockUsageRecords = [
  { model: "gpt-3.5-turbo", inputTokens: 100, outputTokens: 200, costUsd: 0.003 },
  { model: "gpt-4", inputTokens: 500, outputTokens: 1000, costUsd: 0.03 },
  { model: "claude-3-opus", inputTokens: 300, outputTokens: 700, costUsd: 0.02 },
];

/**
 * Test fixture: Mock memory facts
 */
export const mockMemoryFacts = [
  { category: "user-preferences", fact: "User prefers concise responses" },
  { category: "user-info", fact: "User is a software engineer" },
  { category: "conversation-context", fact: "Previously discussed API design" },
];

/**
 * Test fixture: Mock entities for knowledge graph
 */
export const mockEntities = [
  { name: "Alice", type: "person", properties: { email: "alice@example.com" } },
  { name: "PostgreSQL", type: "database", properties: { version: "14" } },
  { name: "GitHub", type: "platform", properties: { language: "TypeScript" } },
];

/**
 * Test fixture: Mock relationships for knowledge graph
 */
export const mockRelationships = [
  { from: "Alice", to: "GitHub", type: "uses" },
  { from: "GitHub", to: "PostgreSQL", type: "integrates-with" },
  { from: "Alice", to: "PostgreSQL", type: "manages" },
];

/**
 * Test fixture: Mock session settings
 */
export const mockSessionSettings: SessionSettings = {
  provider: "openrouter",
  model: "gpt-4",
  thinkingLevel: "medium",
  voiceMode: "off",
  ttsProvider: "openai",
  heartbeatEnabled: true,
  heartbeatInterval: 30,
  recommendationsEnabled: true,
  customSystemPrompt: "You are a helpful assistant",
  temperature: 0.7,
  maxTokens: 4000,
};
