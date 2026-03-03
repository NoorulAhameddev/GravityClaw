/**
 * Live Canvas - A2UI Protocol Implementation
 * 
 * Enables agents to push interactive HTML/JS widgets to web clients.
 * Supports the A2UI pattern: Agent generates UI → User interacts → Agent updates
 */

import { WebSocket } from "ws";
import { createLogger } from "../logger.ts";
import type { Tool } from "../tools/index.ts";
import { z } from "zod";

const log = createLogger("canvas");

// Canvas client management
interface CanvasClient {
  ws: WebSocket;
  sessionId: string;
  connectedAt: Date;
}

const canvasClients = new Map<string, CanvasClient>();

/**
 * Register a canvas WebSocket client
 */
export function registerCanvasClient(sessionId: string, ws: WebSocket): void {
  log.info(`Canvas client connected for session: ${sessionId}`);
  
  canvasClients.set(sessionId, {
    ws,
    sessionId,
    connectedAt: new Date(),
  });
  
  // Clean up on disconnect
  ws.on("close", () => {
    log.info(`Canvas client disconnected for session: ${sessionId}`);
    canvasClients.delete(sessionId);
  });
  
  // Handle incoming messages from canvas client (user interactions)
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleCanvasMessage(sessionId, message);
    } catch (err) {
      log.error(`Error parsing canvas message: ${err}`);
    }
  });
  
  // Send a welcome message
  ws.send(JSON.stringify({
    type: "connected",
    sessionId,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Handle incoming messages from canvas clients (user interactions)
 */
function handleCanvasMessage(sessionId: string, message: any): void {
  log.info(`Canvas message from ${sessionId}: ${JSON.stringify(message)}`);
  
  // Handle different message types
  switch (message.type) {
    case "interaction":
      // User interacted with a widget (button click, form submit, etc.)
      // Store this for the agent to process
      log.info(`Widget interaction: ${JSON.stringify(message.data)}`);
      break;
    
    case "error":
      // Canvas client reported an error
      log.error(`Canvas client error: ${message.error}`);
      break;
    
    case "ping":
      // Heartbeat
      const client = canvasClients.get(sessionId);
      if (client) {
        client.ws.send(JSON.stringify({ type: "pong" }));
      }
      break;
    
    default:
      log.warn(`Unknown canvas message type: ${message.type}`);
  }
}

/**
 * Validate HTML/JS content for security
 * Checks for dangerous patterns and scripts
 */
function validateContent(html: string, js?: string): { valid: boolean; reason?: string } {
  // Check for dangerous patterns in HTML
  const dangerousPatterns = [
    /<script[^>]*src=/i, // External scripts
    /javascript:/i, // JavaScript protocol
    /on\w+\s*=/i, // Inline event handlers (onclick, onerror, etc.)
    /<iframe[^>]*src=["'](?!about:blank|data:)/i, // External iframes (except about:blank and data URLs)
    /<object/i, // Object tags
    /<embed/i, // Embed tags
    /<link[^>]*href=/i, // External stylesheets
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(html)) {
      return { valid: false, reason: `Dangerous pattern detected in HTML: ${pattern}` };
    }
  }
  
  // Check JavaScript if provided
  if (js) {
    const dangerousJsPatterns = [
      /eval\s*\(/i,
      /Function\s*\(/i,
      /XMLHttpRequest/i,
      /fetch\s*\(/i,
      /\.innerHTML\s*=/i, // Prevent innerHTML assignments (use textContent instead)
      /document\.write/i,
    ];
    
    for (const pattern of dangerousJsPatterns) {
      if (pattern.test(js)) {
        return { valid: false, reason: `Dangerous pattern detected in JavaScript: ${pattern}` };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Push an interactive widget to a canvas client
 */
export async function pushCanvas(sessionId: string, html: string, js?: string): Promise<string> {
  const client = canvasClients.get(sessionId);
  
  if (!client) {
    throw new Error(`No canvas client connected for session: ${sessionId}`);
  }
  
  // Validate content
  const validation = validateContent(html, js);
  if (!validation.valid) {
    throw new Error(`Content validation failed: ${validation.reason}`);
  }
  
  // Prepare the canvas push message
  const message = {
    type: "canvas_push",
    html,
    js: js || "",
    timestamp: new Date().toISOString(),
  };
  
  // Send to client
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
    log.info(`Canvas pushed to session ${sessionId}`);
    return "Canvas widget sent successfully";
  } else {
    throw new Error(`WebSocket not ready for session: ${sessionId}`);
  }
}

/**
 * Get list of connected canvas clients
 */
export function getConnectedCanvasClients(): string[] {
  return Array.from(canvasClients.keys());
}

/**
 * Check if a session has a connected canvas client
 */
export function hasCanvasClient(sessionId: string): boolean {
  return canvasClients.has(sessionId);
}

// Input schema for canvas_push tool
const canvasPushInputSchema = {
  type: "object" as const,
  properties: {
    session_id: {
      type: "string",
      description: "Session ID of the canvas client to push to",
    },
    html: {
      type: "string",
      description: "HTML content to render in the canvas (validated for security)",
    },
    js: {
      type: "string",
      description: "Optional JavaScript code to execute in the canvas sandbox",
    },
  },
  required: ["session_id", "html"],
};

/**
 * Tool: canvas_push
 * Push an interactive HTML/JS widget to a canvas client
 */
export const canvasPushTool: Tool = {
  name: "canvas_push",
  description: `Push an interactive HTML/JS widget to a canvas client. 
    Use this to create rich, interactive visualizations, forms, charts, or custom UI components.
    The HTML will be rendered in a sandboxed iframe with strict CSP.
    
    Examples:
    - Interactive forms for collecting user input
    - Data visualizations (charts, graphs, tables)
    - Custom UI widgets
    - Real-time dashboards
    - Interactive tutorials
    
    Security: Content is validated to prevent XSS and other attacks.
    Do NOT include: external scripts, inline event handlers, eval(), fetch(), XMLHttpRequest.
    Use data attributes and the provided JS to handle interactions safely.`,
  inputSchema: canvasPushInputSchema,
  async execute(input) {
    // Validate input using Zod
    const schema = z.object({
      session_id: z.string(),
      html: z.string(),
      js: z.string().optional(),
    });
    
    const parsed = schema.parse(input);
    
    try {
      const result = await pushCanvas(parsed.session_id, parsed.html, parsed.js);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Error pushing canvas: ${errMsg}`);
      throw new Error(`Failed to push canvas: ${errMsg}`);
    }
  },
};
