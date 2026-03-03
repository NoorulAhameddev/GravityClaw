import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.ts";
import { createLogger } from "./logger.ts";
import cors from "cors";
import { getWebhookByName, verifySignature } from "./webhooks/index.ts";
import { registerCanvasClient } from "./canvas/index.ts";
import { parse } from "url";

const log = createLogger("server");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Parse form data
export const server = createServer(app);
export const wss = new WebSocketServer({ server });

// Keep-alive mechanism for WebSocket connections
// Sends a ping every 30 seconds, closes connection if no pong received
setInterval(() => {
  wss.clients.forEach((client: any) => {
    if (client.isAlive === false) {
      return client.terminate();
    }
    client.isAlive = false;
    client.ping();
  });
}, 30000);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "../public")));

/**
 * Health check endpoint - returns server status
 */
app.get("/api/health", (req, res) => {
    const health = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        server: {
            listening: true,
            port: config.PORT || 3000,
            wsClients: (wss as any).clients?.size || 0
        }
    };

    res.json(health);
});

/**
 * WebSocket diagnostic endpoint - returns WebSocket info
 */
app.get("/api/ws-info", (req, res) => {
    const handlers = (wss as any)._events?.connection;
    const isHandlerRegistered = !!handlers;
    
    res.json({
        status: "ok",
        websocket: {
            server_exists: !!wss,
            handlers_registered: isHandlerRegistered,
            connected_clients: (wss as any).clients?.size || 0,
            ready_for_connections: wss && isHandlerRegistered
        }
    });
});

/**
 * Webhook endpoint handler
 * POST /webhook/:session_id/:hook_name
 * Receives webhook payloads and forwards them to the agent
 */
app.post("/webhook/:session_id/:hook_name", async (req, res) => {
  const { session_id, hook_name } = req.params;

  try {
    // Get webhook from database
    const webhook = getWebhookByName(decodeURIComponent(hook_name), session_id);

    if (!webhook) {
      log.warn(`Webhook not found: ${hook_name} for session ${session_id}`);
      return res.status(404).json({
        success: false,
        error: "Webhook not found",
      });
    }

    // Verify HMAC signature if secret exists
    if (webhook.secret) {
      const signature = req.headers["x-webhook-signature"] as string;

      if (!signature) {
        log.warn(`Missing signature for webhook: ${hook_name}`);
        return res.status(401).json({
          success: false,
          error: "Missing X-Webhook-Signature header",
        });
      }

      const payload = JSON.stringify(req.body);
      const isValid = verifySignature(payload, signature, webhook.secret);

      if (!isValid) {
        log.warn(`Invalid signature for webhook: ${hook_name}`);
        return res.status(401).json({
          success: false,
          error: "Invalid webhook signature",
        });
      }
    }

    // Log the webhook event
    log.info(`Webhook received: ${hook_name} (session: ${session_id})`);

    // Store the webhook event for the agent to process
    // The agent can read this via a tool or it will be injected as context
    // For now, we'll just acknowledge receipt
    // In a full implementation, you'd want to:
    // 1. Store the payload in a queue
    // 2. Trigger the agent to process it
    // 3. Send the result back to the webhook caller or the user's channel

    res.status(200).json({
      success: true,
      message: "Webhook received",
      webhook: {
        name: hook_name,
        session_id: session_id,
      },
      payload: req.body,
    });
  } catch (error: any) {
    log.error(`Error processing webhook: ${error}`);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = config.PORT || 3000;
    
    // Add error handler for server startup failures
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        log.error(`❌ Port ${port} is already in use`);
        reject(new Error(`Port ${port} is already in use. Is another instance running?`));
      } else {
        log.error(`❌ Server startup error:`, err);
        reject(err);
      }
    });
    
    server.listen(port, () => {
      log.info(`🚀 Web server listening on http://localhost:${port}`);
      resolve();
    });
  });
}
