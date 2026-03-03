import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import { config } from "../config.ts";
import type { Tool } from "../tools/index.js";
import crypto from "crypto";

const log = createLogger("webhooks");

/**
 * Initialize webhooks table
 */
export function initWebhooks(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      session_id TEXT NOT NULL,
      secret TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_webhooks_session ON webhooks(session_id);
    CREATE INDEX IF NOT EXISTS idx_webhooks_name ON webhooks(name, session_id);
  `);
  
  log.info("Webhooks initialized");
}

// Initialize on module load
initWebhooks();

/**
 * Webhook data structure
 */
export interface Webhook {
  id: number;
  name: string;
  sessionId: string;
  secret: string | null;
  createdAt: string;
  createdBy: string | null;
}

/**
 * Generate HMAC signature for webhook payload
 */
export function generateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

/**
 * Verify HMAC signature
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = generateSignature(payload, secret);
  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Generate secure random secret
 */
function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Get webhook URL
 */
export function getWebhookUrl(sessionId: string, name: string): string {
  const baseUrl = config.WEBHOOK_BASE_URL || `http://localhost:${config.PORT || 3000}`;
  return `${baseUrl}/webhook/${encodeURIComponent(sessionId)}/${encodeURIComponent(name)}`;
}

/**
 * Create a new webhook
 */
export function createWebhook(params: {
  name: string;
  sessionId: string;
  generateSecret?: boolean;
  createdBy?: string;
}): { id: number; url: string; secret: string | null } {
  try {
    // Check if webhook with same name already exists for this session
    const existing = db
      .prepare("SELECT id FROM webhooks WHERE name = ? AND session_id = ?")
      .get(params.name, params.sessionId) as { id: number } | undefined;

    if (existing) {
      throw new Error(`Webhook with name "${params.name}" already exists for this session`);
    }

    const secret = params.generateSecret !== false ? generateSecret() : null;

    const result = db
      .prepare(
        "INSERT INTO webhooks (name, session_id, secret, created_by) VALUES (?, ?, ?, ?)"
      )
      .run(params.name, params.sessionId, secret, params.createdBy || null);

    const webhookId = result.lastInsertRowid as number;
    const url = getWebhookUrl(params.sessionId, params.name);

    log.info(`Webhook created: ${params.name} (id: ${webhookId}, session: ${params.sessionId})`);

    return { id: webhookId, url, secret };
  } catch (error) {
    log.error(`Error creating webhook: ${error}`);
    throw error;
  }
}

/**
 * List webhooks for a session
 */
export function listWebhooks(sessionId: string, allSessions: boolean = false): Webhook[] {
  try {
    let query: string;
    let params: any[];

    if (allSessions) {
      query = "SELECT * FROM webhooks ORDER BY created_at DESC";
      params = [];
    } else {
      query = "SELECT * FROM webhooks WHERE session_id = ? ORDER BY created_at DESC";
      params = [sessionId];
    }

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sessionId: row.session_id,
      secret: row.secret,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  } catch (error) {
    log.error(`Error listing webhooks: ${error}`);
    throw error;
  }
}

/**
 * Get webhook by ID
 */
export function getWebhook(webhookId: number): Webhook | null {
  try {
    const row = db
      .prepare("SELECT * FROM webhooks WHERE id = ?")
      .get(webhookId) as any;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      sessionId: row.session_id,
      secret: row.secret,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  } catch (error) {
    log.error(`Error getting webhook - webhookId: ${webhookId}, error: ${error}`);
    return null;
  }
}

/**
 * Get webhook by name and session
 */
export function getWebhookByName(name: string, sessionId: string): Webhook | null {
  try {
    const row = db
      .prepare("SELECT * FROM webhooks WHERE name = ? AND session_id = ?")
      .get(name, sessionId) as any;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      sessionId: row.session_id,
      secret: row.secret,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  } catch (error) {
    log.error(`Error getting webhook by name - name: ${name}, sessionId: ${sessionId}, error: ${error}`);
    return null;
  }
}

/**
 * Delete a webhook
 */
export function deleteWebhook(webhookId: number): boolean {
  try {
    const webhook = getWebhook(webhookId);
    if (!webhook) {
      throw new Error(`Webhook with ID ${webhookId} not found`);
    }

    const result = db.prepare("DELETE FROM webhooks WHERE id = ?").run(webhookId);

    if (result.changes === 0) {
      return false;
    }

    log.info(`Webhook deleted: ${webhook.name} (id: ${webhookId})`);
    return true;
  } catch (error) {
    log.error(`Error deleting webhook - webhookId: ${webhookId}, error: ${error}`);
    throw error;
  }
}

/**
 * Tool: create_webhook
 * Creates a new webhook endpoint for the current session
 */
const createWebhookTool: Tool = {
  name: "create_webhook",
  description:
    "Create a new webhook endpoint that can receive external HTTP POST requests. Returns a URL that external services can call to trigger actions in this session. Automatically generates a secure secret for HMAC signature verification.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Unique name for this webhook (e.g., 'github_push', 'stripe_payment'). Must be unique within the session.",
      },
      session_id: {
        type: "string",
        description: "Session ID to associate this webhook with (usually current session)",
      },
    },
    required: ["name", "session_id"],
  },
  execute: async (params: any): Promise<string> => {
    try {
      if (!params.name || typeof params.name !== "string") {
        return JSON.stringify({
          success: false,
          error: "Missing or invalid 'name' parameter",
        });
      }

      if (!params.session_id || typeof params.session_id !== "string") {
        return JSON.stringify({
          success: false,
          error: "Missing or invalid 'session_id' parameter",
        });
      }

      const result = createWebhook({
        name: params.name,
        sessionId: params.session_id,
        generateSecret: true,
        createdBy: params.created_by,
      });

      return JSON.stringify({
        success: true,
        webhook: {
          id: result.id,
          name: params.name,
          url: result.url,
          secret: result.secret,
        },
        message: `Webhook created successfully. Send POST requests to: ${result.url}`,
        instructions:
          "Include 'X-Webhook-Signature' header with HMAC-SHA256 signature of request body using the secret.",
      });
    } catch (error: any) {
      log.error(`Error in create_webhook tool: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to create webhook",
      });
    }
  },
};

/**
 * Tool: list_webhooks
 * Lists all webhooks for the current session
 */
const listWebhooksTool: Tool = {
  name: "list_webhooks",
  description:
    "List all webhook endpoints for the current session or all sessions. Shows webhook URLs and metadata.",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "Session ID to list webhooks for (usually current session)",
      },
      all_sessions: {
        type: "boolean",
        description: "If true, list webhooks from all sessions (default: false)",
      },
    },
    required: ["session_id"],
  },
  execute: async (params: any): Promise<string> => {
    try {
      if (!params.session_id && !params.all_sessions) {
        return JSON.stringify({
          success: false,
          error: "Missing 'session_id' parameter",
        });
      }

      const webhooks = listWebhooks(params.session_id, params.all_sessions === true);

      const webhooksWithUrls = webhooks.map((wh) => ({
        id: wh.id,
        name: wh.name,
        url: getWebhookUrl(wh.sessionId, wh.name),
        sessionId: wh.sessionId,
        hasSecret: !!wh.secret,
        createdAt: wh.createdAt,
      }));

      return JSON.stringify({
        success: true,
        count: webhooksWithUrls.length,
        webhooks: webhooksWithUrls,
      });
    } catch (error: any) {
      log.error(`Error in list_webhooks tool: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to list webhooks",
      });
    }
  },
};

/**
 * Tool: delete_webhook
 * Deletes a webhook by ID
 */
const deleteWebhookTool: Tool = {
  name: "delete_webhook",
  description:
    "Permanently delete a webhook endpoint by its ID. The webhook URL will no longer accept requests.",
  inputSchema: {
    type: "object",
    properties: {
      webhook_id: {
        type: "number",
        description: "The ID of the webhook to delete",
      },
    },
    required: ["webhook_id"],
  },
  execute: async (params: any): Promise<string> => {
    try {
      if (!params.webhook_id || typeof params.webhook_id !== "number") {
        return JSON.stringify({
          success: false,
          error: "Missing or invalid 'webhook_id' parameter",
        });
      }

      const webhook = getWebhook(params.webhook_id);
      if (!webhook) {
        return JSON.stringify({
          success: false,
          error: `Webhook with ID ${params.webhook_id} not found`,
        });
      }

      deleteWebhook(params.webhook_id);

      return JSON.stringify({
        success: true,
        message: `Webhook "${webhook.name}" deleted successfully`,
      });
    } catch (error: any) {
      log.error(`Error in delete_webhook tool: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to delete webhook",
      });
    }
  },
};

// Export tools array
export const webhookTools: Tool[] = [
  createWebhookTool,
  listWebhooksTool,
  deleteWebhookTool,
];
