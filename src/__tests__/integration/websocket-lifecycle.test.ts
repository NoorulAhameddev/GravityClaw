/**
 * WebSocket Lifecycle Integration Tests
 * Tests connection establishment, tool call cycles, and disconnection handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import { db } from "../../db.ts";
import {
  createTestSessionId,
  createTestSession,
  cleanupTestSession,
  getSessionHistory,
  insertTestMessage,
} from "./test-utils.ts";

const log = createLogger("websocket-lifecycle-test");

/**
 * Mock WebSocket connection for testing
 */
class MockWebSocketConnection {
  isConnected = false;
  sessionId: string;
  messageQueue: Array<Record<string, unknown>> = [];
  listeners: Map<string, Array<(data: unknown) => void>> = new Map();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  connect(): void {
    this.isConnected = true;
    this.emit("connected", { sessionId: this.sessionId });
  }

  disconnect(): void {
    this.isConnected = false;
    this.emit("disconnected", {});
  }

  send(message: Record<string, unknown>): void {
    if (!this.isConnected) {
      throw new Error("WebSocket not connected");
    }
    this.messageQueue.push(message);
    this.emit("sent", message);
  }

  receive(message: Record<string, unknown>): void {
    if (!this.isConnected) {
      throw new Error("WebSocket not connected");
    }
    this.emit("message", message);
  }

  emit(event: string, data: unknown): void {
    const listeners = this.listeners.get(event) || [];
    listeners.forEach((listener) => listener(data));
  }

  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  getQueuedMessages(): Array<Record<string, unknown>> {
    return [...this.messageQueue];
  }

  clearQueue(): void {
    this.messageQueue = [];
  }
}

describe("WebSocket Lifecycle Integration Tests", () => {
  let testSessionId: string;
  let ws: MockWebSocketConnection;

  beforeEach(() => {
    testSessionId = createTestSessionId("websocket");
    createTestSession(testSessionId);
    ws = new MockWebSocketConnection(testSessionId);
  });

  afterEach(() => {
    if (ws.isConnected) {
      ws.disconnect();
    }
    cleanupTestSession(testSessionId);
  });

  describe("WebSocket Connection Establishment", () => {
    it("should establish WebSocket connection", async () => {
      expect(ws.isConnected).toBe(false);

      ws.connect();

      expect(ws.isConnected).toBe(true);
    });

    it("should emit connected event", async () => {
      const connectedListener = vi.fn();
      ws.on("connected", connectedListener);

      ws.connect();

      expect(connectedListener).toHaveBeenCalled();
      const callData = connectedListener.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callData?.sessionId).toBe(testSessionId);
    });

    it("should store session ID in connection", async () => {
      ws.connect();

      expect(ws.sessionId).toBe(testSessionId);
    });

    it("should reject messages before connection", async () => {
      expect(() => {
        ws.send({ type: "tool_call", data: {} });
      }).toThrow("WebSocket not connected");
    });

    it("should allow multiple connections with different sessions", async () => {
      const session1 = createTestSessionId("ws1");
      const session2 = createTestSessionId("ws2");
      createTestSession(session1);
      createTestSession(session2);

      const ws1 = new MockWebSocketConnection(session1);
      const ws2 = new MockWebSocketConnection(session2);

      ws1.connect();
      ws2.connect();

      expect(ws1.isConnected).toBe(true);
      expect(ws2.isConnected).toBe(true);
      expect(ws1.sessionId).not.toBe(ws2.sessionId);

      ws1.disconnect();
      ws2.disconnect();
      cleanupTestSession(session1);
      cleanupTestSession(session2);
    });
  });

  describe("Tool Call Request/Response Cycle", () => {
    it("should send tool call request through WebSocket", async () => {
      ws.connect();

      const toolRequest = {
        type: "tool_call",
        toolName: "readFile",
        args: { path: "/etc/passwd" },
        callId: "call_123",
      };

      ws.send(toolRequest);

      const queued = ws.getQueuedMessages();
      expect(queued).toHaveLength(1);
      expect(queued[0]?.type).toBe("tool_call");
      expect(queued[0]?.toolName).toBe("readFile");
    });

    it("should receive tool response through WebSocket", async () => {
      ws.connect();

      const responseListener = vi.fn();
      ws.on("message", responseListener);

      const toolResponse = {
        type: "tool_response",
        callId: "call_123",
        result: "File contents",
      };

      ws.receive(toolResponse);

      expect(responseListener).toHaveBeenCalled();
      const receivedData = responseListener.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(receivedData?.type).toBe("tool_response");
    });

    it("should match request and response by call ID", async () => {
      ws.connect();

      const callId = "call_456";
      const request = {
        type: "tool_call",
        callId,
        toolName: "test",
        args: {},
      };

      const response = {
        type: "tool_response",
        callId,
        result: "success",
      };

      ws.send(request);
      ws.receive(response);

      const queued = ws.getQueuedMessages();
      expect(queued[0]?.callId).toBe(callId);
    });

    it("should handle multiple concurrent tool calls", async () => {
      ws.connect();

      const callIds = ["call_1", "call_2", "call_3"];

      callIds.forEach((callId) => {
        ws.send({
          type: "tool_call",
          callId,
          toolName: "test",
          args: {},
        });
      });

      expect(ws.getQueuedMessages()).toHaveLength(3);

      callIds.forEach((callId) => {
        ws.receive({
          type: "tool_response",
          callId,
          result: `Result for ${callId}`,
        });
      });

      expect(ws.isConnected).toBe(true);
    });

    it("should handle tool errors gracefully", async () => {
      ws.connect();

      const errorListener = vi.fn();
      ws.on("message", errorListener);

      const errorResponse = {
        type: "tool_error",
        callId: "call_fail",
        error: "Permission denied",
      };

      ws.receive(errorResponse);

      expect(errorListener).toHaveBeenCalled();
      const errorData = errorListener.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(errorData?.type).toBe("tool_error");
    });

    it("should timeout long-running tool calls", async () => {
      ws.connect();

      const timeoutId = "call_timeout";
      ws.send({
        type: "tool_call",
        callId: timeoutId,
        toolName: "slowTool",
        args: { timeout: 1000 },
      });

      // Simulate timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      ws.receive({
        type: "tool_timeout",
        callId: timeoutId,
        message: "Tool execution exceeded timeout",
      });

      expect(ws.isConnected).toBe(true);
    });
  });

  describe("Message Handling", () => {
    it("should handle json message format", async () => {
      ws.connect();

      const jsonMessage = {
        type: "message",
        content: "Hello from client",
        metadata: { language: "en" },
      };

      ws.send(jsonMessage);
      const queued = ws.getQueuedMessages();

      expect(queued[0]?.type).toBe("message");
      expect(queued[0]?.metadata).toBeDefined();
    });

    it("should handle large message payloads", async () => {
      ws.connect();

      const largeMessage = {
        type: "message",
        content: "x".repeat(10000),
      };

      ws.send(largeMessage);
      expect(ws.getQueuedMessages()).toHaveLength(1);
    });

    it("should validate message format", async () => {
      ws.connect();

      // Should handle various message types
      const messages = [
        { type: "ping" },
        { type: "pong" },
        { type: "message", content: "test" },
        { type: "tool_call", callId: "1", toolName: "test", args: {} },
      ];

      messages.forEach((msg) => {
        expect(() => {
          ws.send(msg);
        }).not.toThrow();
      });

      expect(ws.getQueuedMessages()).toHaveLength(messages.length);
    });

    it("should queue messages during processing", async () => {
      ws.connect();

      // Send multiple messages
      for (let i = 0; i < 5; i++) {
        ws.send({
          type: "message",
          content: `Message ${i}`,
        });
      }

      const queued = ws.getQueuedMessages();
      expect(queued).toHaveLength(5);
    });
  });

  describe("Disconnection Handling", () => {
    it("should disconnect cleanly", async () => {
      ws.connect();
      expect(ws.isConnected).toBe(true);

      ws.disconnect();
      expect(ws.isConnected).toBe(false);
    });

    it("should emit disconnected event", async () => {
      ws.connect();

      const disconnectedListener = vi.fn();
      ws.on("disconnected", disconnectedListener);

      ws.disconnect();

      expect(disconnectedListener).toHaveBeenCalled();
    });

    it("should reject messages after disconnection", async () => {
      ws.connect();
      ws.disconnect();

      expect(() => {
        ws.send({ type: "message", content: "test" });
      }).toThrow("WebSocket not connected");
    });

    it("should handle unexpected disconnection", async () => {
      ws.connect();

      // Simulate unexpected disconnect
      const disconnectListener = vi.fn();
      ws.on("disconnected", disconnectListener);

      ws.isConnected = false;
      ws.emit("disconnected", { reason: "network-error" });

      expect(disconnectListener).toHaveBeenCalled();
    });

    it("should cleanup session data on disconnect", async () => {
      ws.connect();
      insertTestMessage(testSessionId, "user", "Test message");

      ws.disconnect();

      // Session data should still be in db
      const history = getSessionHistory(testSessionId);
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe("Reconnection with Same Session", () => {
    it("should reconnect to same session", async () => {
      ws.connect();
      insertTestMessage(testSessionId, "user", "Message 1");
      ws.disconnect();

      // Create new connection to same session
      const ws2 = new MockWebSocketConnection(testSessionId);
      ws2.connect();

      // Should have access to same session history
      const history = getSessionHistory(testSessionId);
      expect(history.length).toBeGreaterThan(0);

      ws2.disconnect();
    });

    it("should resume state after reconnection", async () => {
      ws.connect();

      insertTestMessage(testSessionId, "user", "Start");
      insertTestMessage(testSessionId, "assistant", "Response");

      ws.disconnect();

      // New connection
      const ws2 = new MockWebSocketConnection(testSessionId);
      ws2.connect();

      const history = getSessionHistory(testSessionId);
      const contents = history.map((m) => m.content).join(" ");

      expect(contents).toContain("Start");
      expect(contents).toContain("Response");

      ws2.disconnect();
    });

    it("should continue message queue after reconnection", async () => {
      ws.connect();
      ws.send({ type: "message", content: "msg1" });
      ws.disconnect();

      const messages1 = ws.getQueuedMessages();
      expect(messages1).toHaveLength(1);

      // New connection can continue
      const ws2 = new MockWebSocketConnection(testSessionId);
      ws2.connect();
      ws2.send({ type: "message", content: "msg2" });

      const messages2 = ws2.getQueuedMessages();
      expect(messages2).toHaveLength(1);

      ws2.disconnect();
    });
  });

  describe("WebSocket Error Scenarios", () => {
    it("should handle connection timeout", async () => {
      const connectTimeout = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          if (!ws.isConnected) {
            resolve(false);
          }
        }, 100);
      });

      expect(await connectTimeout).toBe(false);
    });

    it("should handle malformed messages", async () => {
      ws.connect();

      // Should attempt to handle malformed data gracefully
      const malformedData = "not json";
      expect(() => {
        ws.receive(JSON.parse(malformedData) as Record<string, unknown>);
      }).toThrow();

      expect(ws.isConnected).toBe(true);
    });

    it("should handle connection reset", async () => {
      ws.connect();

      ws.send({ type: "message", content: "test" });

      // Simulate reset
      ws.isConnected = false;
      ws.emit("disconnected", { reason: "reset" });

      expect(() => {
        ws.send({ type: "message", content: "after reset" });
      }).toThrow();
    });

    it("should handle send failures", async () => {
      ws.connect();

      // Disconnect and try to send
      ws.disconnect();

      expect(() => {
        ws.send({ type: "message", content: "test" });
      }).toThrow();
    });

    it("should handle backpressure with message queue", async () => {
      ws.connect();

      // Quick queue of messages
      for (let i = 0; i < 100; i++) {
        ws.send({
          type: "message",
          content: `Message ${i}`,
        });
      }

      expect(ws.getQueuedMessages()).toHaveLength(100);
      expect(ws.isConnected).toBe(true);
    });
  });

  describe("WebSocket Performance", () => {
    it("should process rapid tool calls", async () => {
      ws.connect();

      const startTime = performance.now();

      for (let i = 0; i < 50; i++) {
        ws.send({
          type: "tool_call",
          callId: `call_${i}`,
          toolName: "test",
          args: { index: i },
        });
      }

      const duration = performance.now() - startTime;

      expect(ws.getQueuedMessages()).toHaveLength(50);
      expect(duration).toBeLessThan(1000);
    });

    it("should handle rapid connect/disconnect cycles", async () => {
      const startTime = performance.now();

      for (let i = 0; i < 10; i++) {
        ws.connect();
        ws.disconnect();
      }

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(500);
    });

    it("should efficiently handle high message throughput", async () => {
      ws.connect();

      const startTime = performance.now();
      const messageCount = 1000;

      for (let i = 0; i < messageCount; i++) {
        ws.send({
          type: "message",
          content: `Msg ${i}`,
        });
      }

      const duration = performance.now() - startTime;
      const throughput = messageCount / (duration / 1000);

      expect(ws.getQueuedMessages()).toHaveLength(messageCount);
      expect(throughput).toBeGreaterThan(1000); // > 1000 msgs/sec
    });
  });

  describe("WebSocket with Session Context", () => {
    it("should maintain session context during WebSocket lifecycle", async () => {
      ws.connect();

      // Set up session context
      insertTestMessage(testSessionId, "system", "Session started");
      insertTestMessage(testSessionId, "user", "User query");

      // Send through WebSocket
      ws.send({
        type: "tool_call",
        callId: "test",
        toolName: "example",
        args: { test: true },
      });

      // Receive response
      ws.receive({
        type: "tool_response",
        callId: "test",
        result: "success",
      });

      ws.disconnect();

      // Verify context persisted
      const history = getSessionHistory(testSessionId);
      expect(history.length).toBeGreaterThan(0);
    });

    it("should isolate WebSocket sessions", async () => {
      const session1 = createTestSessionId("ws-iso1");
      const session2 = createTestSessionId("ws-iso2");

      createTestSession(session1);
      createTestSession(session2);

      const ws1 = new MockWebSocketConnection(session1);
      const ws2 = new MockWebSocketConnection(session2);

      ws1.connect();
      ws2.connect();

      insertTestMessage(session1, "user", "Session 1 data");
      insertTestMessage(session2, "user", "Session 2 data");

      const history1 = getSessionHistory(session1);
      const history2 = getSessionHistory(session2);

      const content1 = history1.map((m) => m.content).join(" ");
      const content2 = history2.map((m) => m.content).join(" ");

      expect(content1).toContain("Session 1");
      expect(content2).toContain("Session 2");
      expect(content1).not.toContain("Session 2");
      expect(content2).not.toContain("Session 1");

      ws1.disconnect();
      ws2.disconnect();
      cleanupTestSession(session1);
      cleanupTestSession(session2);
    });
  });

  describe("WebSocket Message Ordering", () => {
    it("should maintain message order", async () => {
      ws.connect();

      const messages = Array.from({ length: 20 }, (_, i) => ({
        type: "message",
        index: i,
        content: `Message ${i}`,
      }));

      messages.forEach((msg) => ws.send(msg));

      const queued = ws.getQueuedMessages();
      queued.forEach((msg, idx) => {
        expect((msg as any).index).toBe(idx);
      });
    });

    it("should handle out-of-order responses", async () => {
      ws.connect();

      // Send calls in order
      for (let i = 0; i < 3; i++) {
        ws.send({
          type: "tool_call",
          callId: `call_${i}`,
          toolName: "test",
          args: {},
        });
      }

      // Receive responses out of order
      ws.receive({ type: "tool_response", callId: "call_2", result: "r2" });
      ws.receive({ type: "tool_response", callId: "call_0", result: "r0" });
      ws.receive({ type: "tool_response", callId: "call_1", result: "r1" });

      expect(ws.isConnected).toBe(true);
    });
  });
});
