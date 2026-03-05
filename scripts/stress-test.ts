#!/usr/bin/env node
/**
 * Gravity Claw Stress Test
 * 
 * Gradually increases load until failure to identify breaking points:
 * - Connection timeouts
 * - Message loss
 * - Memory leaks
 * - CPU saturation
 * 
 * Usage:
 *   npx tsx scripts/stress-test.ts --increment 10 --max-clients 500
 */

import ws from "ws";
import { performance } from "perf_hooks";
import { memoryUsage } from "process";

interface StressTestConfig {
  initialClients: number;
  maxClients: number;
  increment: number; // clients to add per iteration
  messageDuration: number; // seconds to run messages at each level
  rampUpTime: number; // seconds to ramp up clients
  serverUrl: string;
}

interface StressLevel {
  level: number;
  clients: number;
  connected: number;
  failed: number;
  messagesSent: number;
  messagesReceived: number;
  latencyAvg: number;
  memoryMB: number;
  errors: string[];
  timestamp: string;
}

interface StressTestResults {
  timestamp: string;
  config: StressTestConfig;
  levels: StressLevel[];
  breakingPoint: {
    clients: number;
    reason: string;
  };
  maxSustainableLoad: StressLevel;
  recommendations: string[];
}

class StressTester {
  private config: StressTestConfig;
  private clients: Map<number, ws> = new Map();
  private latencies: number[] = [];
  private messageStats = new Map<number, { sent: number; received: number }>();
  private levels: StressLevel[] = [];
  private breakingPoint: { clients: number; reason: string } | null = null;

  constructor(config: StressTestConfig) {
    this.config = config;
  }

  private parseArgs(): void {
    const args = process.argv.slice(2);
    const increment = args.indexOf("--increment");
    const maxClients = args.indexOf("--max-clients");
    const initial = args.indexOf("--initial");
    const serverUrl = args.indexOf("--url");

    if (increment !== -1) this.config.increment = parseInt(args[increment + 1], 10);
    if (maxClients !== -1) this.config.maxClients = parseInt(args[maxClients + 1], 10);
    if (initial !== -1) this.config.initialClients = parseInt(args[initial + 1], 10);
    if (serverUrl !== -1) this.config.serverUrl = args[serverUrl + 1];
  }

  async run(): Promise<StressTestResults> {
    console.log("🔥 Starting stress test...");
    this.parseArgs();

    let currentClients = this.config.initialClients;
    let level = 0;

    while (currentClients <= this.config.maxClients && !this.breakingPoint) {
      level++;
      console.log(`\n📊 Level ${level}: Testing with ${currentClients} clients...`);

      const result = await this.testLevel(level, currentClients);
      this.levels.push(result);

      if (result.failed > 0 || result.messagesSent === 0) {
        this.breakingPoint = {
          clients: currentClients,
          reason: `Connection failures: ${result.failed}, Messages sent: ${result.messagesSent}`,
        };
        console.log(`⚠️  Breaking point detected at ${currentClients} clients`);
      } else {
        currentClients += this.config.increment;
      }

      // Cool down between levels
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const results = this.generateResults();
    this.printResults(results);
    this.saveResults(results);

    return results;
  }

  private async testLevel(level: number, numClients: number): Promise<StressLevel> {
    const startTime = performance.now();
    this.latencies = [];
    this.messageStats.set(level, { sent: 0, received: 0 });

    // Connect clients
    const rampUpInterval = (this.config.rampUpTime * 1000) / numClients;
    let connected = 0;
    let failed = 0;

    for (let i = 0; i < numClients; i++) {
      setTimeout(() => {
        this.connectClient(level, i, this.config.serverUrl);
      }, i * rampUpInterval);
    }

    // Wait for connections
    await new Promise((resolve) => setTimeout(resolve, this.config.rampUpTime * 1000 + 1000));

    // Count connections
    const levelClients = Array.from(this.clients.values()).filter((c) => c.readyState === ws.OPEN);
    connected = levelClients.length;
    failed = numClients - connected;

    console.log(`  Connected: ${connected}/${numClients} (${failed} failed)`);

    // Send messages for duration
    const messageStartTime = performance.now();
    const messageInterval = setInterval(() => {
      for (const client of levelClients) {
        if (client.readyState === ws.OPEN) {
          try {
            client.send(
              JSON.stringify({
                type: "stress-test",
                timestamp: performance.now(),
              })
            );
            const stats = this.messageStats.get(level);
            if (stats) stats.sent++;
          } catch (e) {
            // Connection may have closed
          }
        }
      }
    }, 50);

    await new Promise((resolve) =>
      setTimeout(resolve, this.config.messageDuration * 1000)
    );
    clearInterval(messageInterval);

    // Close connections for this level
    for (const client of levelClients) {
      try {
        client.close();
      } catch (e) {
        // Already closed
      }
    }

    const stats = this.messageStats.get(level) || { sent: 0, received: 0 };
    const latencyAvg =
      this.latencies.length > 0
        ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
        : 0;

    return {
      level,
      clients: numClients,
      connected,
      failed,
      messagesSent: stats.sent,
      messagesReceived: stats.received,
      latencyAvg,
      memoryMB: memoryUsage().heapUsed / 1024 / 1024,
      errors: [],
      timestamp: new Date().toISOString(),
    };
  }

  private connectClient(level: number, index: number, url: string): void {
    const clientId = level * 10000 + index;
    const client = new ws(url);

    client.on("open", () => {
      this.clients.set(clientId, client);
    });

    client.on("message", (data: ws.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.timestamp) {
          this.latencies.push(performance.now() - msg.timestamp);
          const stats = this.messageStats.get(level);
          if (stats) stats.received++;
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    client.on("error", (error: Error) => {
      this.clients.delete(clientId);
    });

    client.on("close", () => {
      this.clients.delete(clientId);
    });
  }

  private generateResults(): StressTestResults {
    const recommendations: string[] = [];

    if (!this.breakingPoint && this.levels.length > 0) {
      const lastLevel = this.levels[this.levels.length - 1];
      console.log(`✅ Reached max test load: ${lastLevel.clients} clients`);
    }

    const maxLevel =
      this.levels.length > 0
        ? this.levels.reduce((max, level) => (level.memoryMB > max.memoryMB ? level : max))
        : this.levels[0];

    // Generate recommendations
    if (this.breakingPoint) {
      recommendations.push(`Consider limiting to ${this.breakingPoint.clients - this.config.increment} concurrent clients`);
    }

    if (maxLevel && maxLevel.memoryMB > 500) {
      recommendations.push("⚠️  High memory usage detected - consider cache optimization");
    }

    if (this.levels.length > 1) {
      const latencyIncrease =
        ((this.levels[this.levels.length - 1].latencyAvg - this.levels[0].latencyAvg) /
          this.levels[0].latencyAvg) *
        100;
      if (latencyIncrease > 50) {
        recommendations.push(`⚠️  Latency increased ${latencyIncrease.toFixed(0)}% under load`);
      }
    }

    return {
      timestamp: new Date().toISOString(),
      config: this.config,
      levels: this.levels,
      breakingPoint: this.breakingPoint || {
        clients: this.config.maxClients,
        reason: "Test completed without failure",
      },
      maxSustainableLoad: maxLevel || this.levels[0],
      recommendations,
    };
  }

  private printResults(results: StressTestResults): void {
    console.log("\n" + "=".repeat(70));
    console.log("🔥 STRESS TEST RESULTS");
    console.log("=".repeat(70));

    console.log("\n📊 Configuration:");
    console.log(`  Initial clients:     ${results.config.initialClients}`);
    console.log(`  Max clients:         ${results.config.maxClients}`);
    console.log(`  Increment:           ${results.config.increment}`);
    console.log(`  Duration per level:  ${results.config.messageDuration}s`);

    console.log("\n📈 Results by Level:");
    console.log("Level | Clients | Connected | Failed | Sent | Received | Latency | Memory");
    console.log("------|---------|-----------|--------|------|----------|---------|-------");

    results.levels.forEach((level) => {
      const successRate = level.messagesSent > 0 ? ((level.messagesReceived / level.messagesSent) * 100).toFixed(0) : "0";
      console.log(
        `${level.level.toString().padEnd(5)} | ${level.clients.toString().padEnd(7)} | ${level.connected
          .toString()
          .padEnd(9)} | ${level.failed.toString().padEnd(6)} | ${level.messagesSent
          .toString()
          .padEnd(4)} | ${level.messagesReceived.toString().padEnd(8)} | ${level.latencyAvg
          .toFixed(2)
          .padEnd(6)}ms | ${level.memoryMB.toFixed(1)}MB`
      );
    });

    console.log("\n🎯 Breaking Point:");
    console.log(`  Clients:  ${results.breakingPoint.clients}`);
    console.log(`  Reason:   ${results.breakingPoint.reason}`);

    console.log("\n📊 Max Sustainable Load:");
    console.log(`  Clients:   ${results.maxSustainableLoad.clients}`);
    console.log(`  Memory:    ${results.maxSustainableLoad.memoryMB.toFixed(2)}MB`);
    console.log(`  Latency:   ${results.maxSustainableLoad.latencyAvg.toFixed(2)}ms`);

    if (results.recommendations.length > 0) {
      console.log("\n💡 Recommendations:");
      results.recommendations.forEach((rec) => {
        console.log(`  • ${rec}`);
      });
    }

    console.log("\n" + "=".repeat(70));
  }

  private saveResults(results: StressTestResults): void {
    const fs = require("fs");
    const path = require("path");
    const logsDir = path.join(process.cwd(), "logs");

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const filename = path.join(
      logsDir,
      `stress-test-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  }
}

// Main entry point
const config: StressTestConfig = {
  initialClients: 10,
  maxClients: 200,
  increment: 10,
  messageDuration: 10,
  rampUpTime: 5,
  serverUrl: "ws://localhost:3000",
};

const tester = new StressTester(config);
tester.run().catch((error) => {
  console.error("❌ Stress test failed:", error);
  process.exit(1);
});
