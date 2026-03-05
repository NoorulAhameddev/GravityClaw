#!/usr/bin/env node
/**
 * Gravity Claw Load Test
 * 
 * Simulates concurrent WebSocket connections and measures:
 * - Connected clients
 * - Messages per second
 * - Response latency (p50, p95, p99)
 * - Peak memory usage
 * - CPU usage
 * 
 * Usage:
 *   npx tsx scripts/load-test.ts --clients 50 --messages 100 --duration 60
 */

import ws from "ws";
import { performance } from "perf_hooks";
import { cpuUsage, memoryUsage } from "process";

interface LoadTestConfig {
  clients: number;
  messages: number;
  duration: number;
  serverUrl: string;
  rampUp: number; // seconds to ramp up to full load
}

interface LatencyMetrics {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

interface TestResults {
  timestamp: string;
  config: LoadTestConfig;
  totalConnected: number;
  totalDisconnected: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  messagesPerSecond: number;
  latency: LatencyMetrics;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    peakHeapUsed: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  testDuration: number;
  successRate: number;
  errors: Record<string, number>;
}

class LoadTester {
  private config: LoadTestConfig;
  private clients: ws[] = [];
  private latencies: number[] = [];
  private messagesSent = 0;
  private messagesReceived = 0;
  private errors: Record<string, number> = {};
  private peakHeapUsed = 0;
  private startTime = 0;
  private cpuBefore: NodeJS.CpuUsage;
  private totalConnected = 0;
  private totalDisconnected = 0;

  constructor(config: LoadTestConfig) {
    this.config = config;
    this.cpuBefore = cpuUsage();
  }

  private parseArgs(): void {
    const args = process.argv.slice(2);
    const numClients = args.indexOf("--clients");
    const numMessages = args.indexOf("--messages");
    const testDuration = args.indexOf("--duration");
    const serverUrl = args.indexOf("--url");

    if (numClients !== -1) this.config.clients = parseInt(args[numClients + 1], 10);
    if (numMessages !== -1) this.config.messages = parseInt(args[numMessages + 1], 10);
    if (testDuration !== -1) this.config.duration = parseInt(args[testDuration + 1], 10);
    if (serverUrl !== -1) this.config.serverUrl = args[serverUrl + 1];
  }

  async run(): Promise<TestResults> {
    console.log("🚀 Starting load test...");
    this.parseArgs();
    this.startTime = performance.now();

    const rampUpInterval = (this.config.rampUp * 1000) / this.config.clients;
    const messageInterval = 100; // Send message every 100ms per client

    // Spawn clients with ramp-up
    for (let i = 0; i < this.config.clients; i++) {
      setTimeout(() => {
        this.spawnClient(i);
      }, i * rampUpInterval);
    }

    // Let clients connect
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Send messages
    const sendInterval = setInterval(() => {
      let sent = 0;
      for (const client of this.clients) {
        if (client.readyState === ws.OPEN && sent < this.config.messages) {
          this.sendMessage(client);
          sent++;
        }
      }
      if (this.messagesSent >= this.config.clients * this.config.messages) {
        clearInterval(sendInterval);
      }
    }, messageInterval);

    // Test duration
    await new Promise((resolve) =>
      setTimeout(resolve, this.config.duration * 1000)
    );

    clearInterval(sendInterval);

    // Close all connections
    await this.cleanup();

    const results = this.generateResults();
    this.printResults(results);
    this.saveResults(results);

    return results;
  }

  private spawnClient(index: number): void {
    const client = new ws(this.config.serverUrl);

    client.on("open", () => {
      this.totalConnected++;
      console.log(`✓ Client ${index} connected (${this.totalConnected}/${this.config.clients})`);
    });

    client.on("message", (data: ws.Data) => {
      this.messagesReceived++;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.timestamp) {
          const latency = performance.now() - msg.timestamp;
          this.latencies.push(latency);
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    client.on("error", (error: Error) => {
      const errorKey = error.message;
      this.errors[errorKey] = (this.errors[errorKey] || 0) + 1;
    });

    client.on("close", () => {
      this.totalDisconnected++;
    });

    this.clients.push(client);
  }

  private sendMessage(client: ws): void {
    try {
      client.send(
        JSON.stringify({
          type: "message",
          content: "Load test message",
          timestamp: performance.now(),
          sessionId: "load-test-" + Math.random().toString(36).substr(2, 9),
        })
      );
      this.messagesSent++;
    } catch (e) {
      const errorKey = e instanceof Error ? e.message : "unknown error";
      this.errors[errorKey] = (this.errors[errorKey] || 0) + 1;
    }
  }

  private async cleanup(): Promise<void> {
    console.log("\n📊 Closing connections...");
    const closePromises = this.clients.map(
      (client) =>
        new Promise<void>((resolve) => {
          client.close();
          setTimeout(resolve, 500);
        })
    );
    await Promise.all(closePromises);
  }

  private calculateLatencyStats(): LatencyMetrics {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      min: sorted[0] || 0,
      max: sorted[len - 1] || 0,
      avg: len > 0 ? sorted.reduce((a, b) => a + b, 0) / len : 0,
      p50: sorted[Math.floor(len * 0.5)] || 0,
      p95: sorted[Math.floor(len * 0.95)] || 0,
      p99: sorted[Math.floor(len * 0.99)] || 0,
    };
  }

  private generateResults(): TestResults {
    const memUsage = memoryUsage();
    this.peakHeapUsed = Math.max(this.peakHeapUsed, memUsage.heapUsed);
    const cpuAfter = cpuUsage(this.cpuBefore);
    const testDuration = (performance.now() - this.startTime) / 1000;

    return {
      timestamp: new Date().toISOString(),
      config: this.config,
      totalConnected: this.totalConnected,
      totalDisconnected: this.totalDisconnected,
      totalMessagesSent: this.messagesSent,
      totalMessagesReceived: this.messagesReceived,
      messagesPerSecond: this.messagesSent / testDuration,
      latency: this.calculateLatencyStats(),
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        peakHeapUsed: this.peakHeapUsed,
      },
      cpu: {
        user: cpuAfter.user / 1000, // convert to ms
        system: cpuAfter.system / 1000,
      },
      testDuration,
      successRate: this.messagesSent > 0 ? (this.messagesReceived / this.messagesSent) * 100 : 0,
      errors: this.errors,
    };
  }

  private printResults(results: TestResults): void {
    console.log("\n" + "=".repeat(60));
    console.log("📈 LOAD TEST RESULTS");
    console.log("=".repeat(60));

    console.log("\n📊 Test Configuration:");
    console.log(`  Clients:           ${results.config.clients}`);
    console.log(`  Messages per client: ${results.config.messages}`);
    console.log(`  Duration:          ${results.config.duration}s`);
    console.log(`  Ramp-up:           ${results.config.rampUp}s`);

    console.log("\n✅ Connection Statistics:");
    console.log(`  Connected:         ${results.totalConnected}/${results.config.clients}`);
    console.log(`  Disconnected:      ${results.totalDisconnected}`);

    console.log("\n📤 Message Statistics:");
    console.log(`  Sent:              ${results.totalMessagesSent}`);
    console.log(`  Received:          ${results.totalMessagesReceived}`);
    console.log(`  Messages/sec:      ${results.messagesPerSecond.toFixed(2)}`);
    console.log(`  Success rate:      ${results.successRate.toFixed(2)}%`);

    console.log("\n⏱️  Latency (ms):");
    console.log(`  Min:               ${results.latency.min.toFixed(2)}ms`);
    console.log(`  P50 (Median):      ${results.latency.p50.toFixed(2)}ms`);
    console.log(`  P95:               ${results.latency.p95.toFixed(2)}ms`);
    console.log(`  P99:               ${results.latency.p99.toFixed(2)}ms`);
    console.log(`  Max:               ${results.latency.max.toFixed(2)}ms`);
    console.log(`  Avg:               ${results.latency.avg.toFixed(2)}ms`);

    console.log("\n💾 Memory Usage:");
    console.log(`  Heap Used:         ${(results.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Heap Total:        ${(results.memory.heapTotal / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Peak Heap:         ${(results.memory.peakHeapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  RSS:               ${(results.memory.rss / 1024 / 1024).toFixed(2)}MB`);

    console.log("\n⚙️  CPU Usage:");
    console.log(`  User:              ${(results.cpu.user / 1000).toFixed(2)}s`);
    console.log(`  System:            ${(results.cpu.system / 1000).toFixed(2)}s`);

    console.log("\n⏱️  Test Duration:      ${results.testDuration.toFixed(2)}s");

    if (Object.keys(results.errors).length > 0) {
      console.log("\n❌ Errors:");
      Object.entries(results.errors).forEach(([error, count]) => {
        console.log(`  ${error}: ${count}`);
      });
    }

    console.log("\n" + "=".repeat(60));
  }

  private saveResults(results: TestResults): void {
    const fs = require("fs");
    const path = require("path");
    const logsDir = path.join(process.cwd(), "logs");

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const filename = path.join(
      logsDir,
      `load-test-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  }
}

// Main entry point
const config: LoadTestConfig = {
  clients: 50,
  messages: 100,
  duration: 60,
  serverUrl: "ws://localhost:3000",
  rampUp: 10,
};

const tester = new LoadTester(config);
tester.run().catch((error) => {
  console.error("❌ Load test failed:", error);
  process.exit(1);
});
