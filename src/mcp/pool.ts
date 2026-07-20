import { createLogger } from "../logger.ts";
import { MCPClient } from "./client.ts";
import type { MCPServerConfig } from "./types.ts";
import { config } from "../config.ts";

const log = createLogger("mcp-pool");

interface PooledServer {
  name: string;
  instances: MCPClient[];
  maxInstances: number;
}

const pools = new Map<string, PooledServer>();

export function getPoolSize(serverName: string): number {
  return pools.get(serverName)?.instances.length ?? 0;
}

export async function acquireInstance(serverName: string): Promise<MCPClient | null> {
  let pool = pools.get(serverName);
  if (!pool) return null;

  let best = pool.instances[0];
  if (!best) return null;

  for (const inst of pool.instances) {
    if (inst.getActiveRequestCount?.() < (best?.getActiveRequestCount?.() ?? Infinity)) {
      best = inst;
    }
  }
  return best;
}

export async function createPool(
  serverName: string,
  configs: MCPServerConfig[],
  maxInstances: number,
): Promise<void> {
  if (pools.has(serverName)) {
    log.warn(`Pool already exists for ${serverName}`);
    return;
  }

  const instances: MCPClient[] = [];
  const count = Math.min(configs.length, maxInstances);

  for (let i = 0; i < count; i++) {
    const client = new MCPClient({ configs: [configs[i]!] });
    instances.push(client);
  }

  pools.set(serverName, { name: serverName, instances, maxInstances });
  log.info(`Pool created for ${serverName} with ${count} instances`);
}

export async function destroyPool(serverName: string): Promise<void> {
  const pool = pools.get(serverName);
  if (!pool) return;

  await Promise.all(pool.instances.map(inst => inst.shutdown()));
  pools.delete(serverName);
  log.info(`Pool destroyed for ${serverName}`);
}

export async function destroyAllPools(): Promise<void> {
  for (const name of pools.keys()) {
    await destroyPool(name);
  }
}
