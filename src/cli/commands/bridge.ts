/**
 * Bridge command - manage remote bridge connections.
 */

import { createLogger } from "../../logger.ts";
import { BridgeServer, BridgeClient, createBridgeServer, createBridgeClient } from "../../bridge/index.js";
import { success, error, info, title, section, printTable, dim } from "../utils.ts";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const log = createLogger("bridge-cli");

const CONFIG_PATH = "config/bridge.json";

interface BridgeConfig {
  port: number;
  host: string;
  authToken: string;
  maxSessions: number;
  sessionTimeoutMs: number;
  debug: boolean;
}

function loadConfig(): BridgeConfig | null {
  try {
    const path = resolve(CONFIG_PATH);
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch (e) {
    log.error(`Failed to load bridge config: ${e}`);
  }
  return null;
}

function saveConfig(config: BridgeConfig): void {
  const path = resolve(CONFIG_PATH);
  const dir = resolve("config");
  
  if (!existsSync(dir)) {
    const { mkdirSync } = require("fs");
    mkdirSync(dir, { recursive: true });
  }
  
  writeFileSync(path, JSON.stringify(config, null, 2));
  success(`Bridge configuration saved to ${CONFIG_PATH}`);
}

export async function bridgeCommand(args: string[]): Promise<void> {
  const subcommand = args[0] || "status";
  
  switch (subcommand) {
    case "start":
      await startBridge();
      break;
    case "stop":
      await stopBridge();
      break;
    case "status":
      await statusBridge();
      break;
    case "connect":
      await connectToBridge(args[1] || "");
      break;
    case "disconnect":
      await disconnectBridge();
      break;
    case "config":
      await configBridge(args.slice(1));
      break;
    default:
      printBridgeHelp();
  }
}

async function startBridge(): Promise<void> {
  title("🚀 Starting Bridge Server");
  
  let config = loadConfig();
  
  if (!config) {
    config = {
      port: 8765,
      host: "0.0.0.0",
      authToken: generateToken(),
      maxSessions: 10,
      sessionTimeoutMs: 3600000,
      debug: false,
    };
    saveConfig(config);
    info("Generated new bridge configuration");
  }
  
  try {
    const server = createBridgeServer(config);
    await server.start();
    success(`Bridge server started on ${config.host}:${config.port}`);
    info(`Auth token: ${config.authToken}`);
    info("Use 'gravityclaw bridge stop' to stop the server");
  } catch (e) {
    error(`Failed to start bridge: ${e}`);
  }
}

async function stopBridge(): Promise<void> {
  info("Stop bridge - use Ctrl+C to stop the server");
}

async function statusBridge(): Promise<void> {
  title("🌉 Bridge Status");
  
  const config = loadConfig();
  
  if (!config) {
    info("Bridge is not configured");
    info("Run 'gravityclaw bridge start' to start the bridge server");
    return;
  }
  
  section("Configuration");
  printTable([
    ["Port", config.port.toString()],
    ["Host", config.host],
    ["Max Sessions", config.maxSessions.toString()],
    ["Session Timeout", `${config.sessionTimeoutMs / 1000}s`],
    ["Debug", config.debug ? "Enabled" : "Disabled"],
  ], [
    { header: "Setting", width: 20 },
    { header: "Value", width: 25 },
  ]);
  
  console.log();
  info("To connect: gravityclaw bridge connect <url> --token <token>");
}

async function connectToBridge(url: string): Promise<void> {
  if (!url) {
    error("Bridge URL is required");
    info("Usage: gravityclaw bridge connect <url> --token <token>");
    return;
  }
  
  info(`Connecting to bridge at ${url}...`);
  
  const client = createBridgeClient({
    url,
    authToken: "placeholder-token",
    reconnect: true,
  });
  
  try {
    await client.connect();
    success("Connected to bridge");
    
    const sessions = await client.listSessions();
    info(`Found ${sessions.length} active sessions`);
  } catch (e) {
    error(`Failed to connect: ${e}`);
  }
}

async function disconnectBridge(): Promise<void> {
  info("Disconnecting from bridge...");
}

async function configBridge(args: string[]): Promise<void> {
  const action = args[0];
  
  if (!action) {
    const config = loadConfig();
    if (config) {
      section("Current Bridge Configuration");
      printTable([
        ["Port", config.port.toString()],
        ["Host", config.host],
        ["Auth Token", config.authToken.substring(0, 8) + "..."],
        ["Max Sessions", config.maxSessions.toString()],
        ["Session Timeout", `${config.sessionTimeoutMs / 1000}s`],
      ], [
        { header: "Setting", width: 20 },
        { header: "Value", width: 30 },
      ]);
    }
    return;
  }
  
  switch (action) {
    case "set":
      if (args[1] === "port" && args[2]) {
        const config = loadConfig();
        if (config) {
          config.port = parseInt(args[2], 10);
          saveConfig(config);
          success(`Port set to ${args[2]}`);
        }
      }
      break;
    case "token":
      const config = loadConfig();
      if (config) {
        config.authToken = generateToken();
        saveConfig(config);
        success("New auth token generated");
      }
      break;
  }
}

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function printBridgeHelp(): void {
  title("🌉 Gravity Claw Bridge");
  
  console.log(`
${dim("Usage:")} gravityclaw bridge [command] [options]

${dim("Commands:")}
  start              Start the bridge server
  stop               Stop the bridge server
  status             Show bridge status
  connect <url>      Connect to a remote bridge
  disconnect         Disconnect from bridge
  config             Show/set bridge configuration

${dim("Options:")}
  --token <token>    Auth token for connection
  --port <port>     Port for bridge server
  --host <host>     Host for bridge server
  `);
}