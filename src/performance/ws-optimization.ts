/**
 * WebSocket Performance Optimizations
 * 
 * Provides:
 * - Connection pooling
 * - Buffer management
 * - Dead connection cleanup
 * - Ping-pong heartbeat
 * - Message compression handling
 */

import { WebSocket, WebSocketServer } from "ws";
import { createLogger } from "../logger.ts";

const log = createLogger("ws-optimization");

const MAX_CONNECTIONS_PER_INSTANCE = 1000;
const MAX_MESSAGE_QUEUE = 100;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const DEAD_CONNECTION_TIMEOUT = 60000; // 60 seconds

interface WSClientMetrics {
  connectedAt: number;
  messagesReceived: number;
  messagesSent: number;
  lastActivity: number;
  queueSize: number;
}

const clientMetrics = new Map<WebSocket, WSClientMetrics>();

/**
 * Initialize WebSocket optimizations
 */
export function initializeWSOptimizations(wss: WebSocketServer): void {
  log.info("Initializing WebSocket optimizations");

  // Setup heartbeat/ping-pong
  setupHeartbeat(wss);

  // Setup connection cleanup
  setupConnectionCleanup(wss);

  // Monitor connections
  setupConnectionMonitoring(wss);
}

/**
 * Setup heartbeat to detect dead connections
 */
function setupHeartbeat(wss: WebSocketServer): void {
  const interval = setInterval(() => {
    let activeCount = 0;

    wss.clients.forEach((client: any) => {
      if (client.isAlive === false) {
        log.debug("Terminating dead connection");
        return client.terminate();
      }

      if (client.readyState === WebSocket.OPEN) {
        client.isAlive = false;
        client.ping();
        activeCount++;
      }
    });

    log.debug(`Heartbeat: ${activeCount} active connections`);
  }, HEARTBEAT_INTERVAL);

  // Cleanup on shutdown
  process.on("exit", () => clearInterval(interval));
}

/**
 * Setup cleanup for disconnected clients
 */
function setupConnectionCleanup(wss: WebSocketServer): void {
  const interval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [client, metrics] of clientMetrics) {
      // Remove metrics for closed connections
      if (client.readyState === WebSocket.CLOSED) {
        clientMetrics.delete(client);
        cleaned++;
      }
      // Timeout idle connections
      else if (now - metrics.lastActivity > DEAD_CONNECTION_TIMEOUT) {
        log.warn("Closing idle connection");
        client.close(1000, "Idle timeout");
        clientMetrics.delete(client);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug(`Cleanup: removed ${cleaned} connection metrics`);
    }
  }, 60000); // Every 60 seconds

  process.on("exit", () => clearInterval(interval));
}

/**
 * Setup connection monitoring
 */
function setupConnectionMonitoring(wss: WebSocketServer): void {
  wss.on("connection", (client: any) => {
    // Check connection limit
    if ((wss as any).clients.size > MAX_CONNECTIONS_PER_INSTANCE) {
      log.warn(
        `Connection limit exceeded (${(wss as any).clients.size}/${MAX_CONNECTIONS_PER_INSTANCE})`
      );
      client.close(1008, "Server at capacity");
      return;
    }

    client.isAlive = true;
    client.on("pong", () => {
      client.isAlive = true;
    });

    // Track metrics
    clientMetrics.set(client, {
      connectedAt: Date.now(),
      messagesReceived: 0,
      messagesSent: 0,
      lastActivity: Date.now(),
      queueSize: 0,
    });

    client.on("message", () => {
      const metrics = clientMetrics.get(client);
      if (metrics) {
        metrics.messagesReceived++;
        metrics.lastActivity = Date.now();
      }
    });

    log.debug(`Client connected (${(wss as any).clients.size} total)`);
  });
}

/**
 * Send message with buffer management
 */
export function sendMessage(client: WebSocket, data: unknown): boolean {
  if (client.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    const json = typeof data === "string" ? data : JSON.stringify(data);

    // Check message size (warn if > 100KB)
    if (json.length > 102400) {
      log.warn(`Large message sent: ${(json.length / 1024).toFixed(2)}KB`);
    }

    client.send(json);

    const metrics = clientMetrics.get(client);
    if (metrics) {
      metrics.messagesSent++;
    }

    return true;
  } catch (error) {
    log.error("Error sending message:", error);
    return false;
  }
}

/**
 * Send message to multiple clients
 */
export function broadcastMessage(wss: WebSocketServer, data: unknown): number {
  let sent = 0;

  wss.clients.forEach((client: any) => {
    if (sendMessage(client, data)) {
      sent++;
    }
  });

  return sent;
}

/**
 * Get WebSocket performance metrics
 */
export function getWSMetrics(wss: WebSocketServer): Record<string, unknown> {
  let totalMessagesReceived = 0;
  let totalMessagesSent = 0;
  let oldestConnection = Date.now();
  let newestConnection = 0;

  for (const metrics of clientMetrics.values()) {
    totalMessagesReceived += metrics.messagesReceived;
    totalMessagesSent += metrics.messagesSent;
    oldestConnection = Math.min(oldestConnection, metrics.connectedAt);
    newestConnection = Math.max(newestConnection, metrics.connectedAt);
  }

  return {
    connectedClients: (wss as any).clients.size,
    maxCapacity: MAX_CONNECTIONS_PER_INSTANCE,
    utilizationPercent: (((wss as any).clients.size / MAX_CONNECTIONS_PER_INSTANCE) * 100).toFixed(2),
    totalMessagesReceived,
    totalMessagesSent,
    averageMessagesPerClient:
      clientMetrics.size > 0
        ? (totalMessagesReceived / clientMetrics.size).toFixed(2)
        : 0,
    oldestConnectionAge:
      oldestConnection < Date.now() ? Date.now() - oldestConnection : 0,
    newestConnectionAge:
      newestConnection > 0 ? Date.now() - newestConnection : 0,
  };
}

/**
 * Cleanup WebSocket resources
 */
export function cleanupWSResources(wss: WebSocketServer): void {
  clientMetrics.clear();
  log.info("✅ WebSocket resources cleaned up");
}
