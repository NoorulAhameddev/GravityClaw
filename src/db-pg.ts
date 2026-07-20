import { createLogger } from "./logger.ts";
import { config } from "./config.ts";

const log = createLogger("db-pg");

let pool: any = null;

export function getPgPool(): any {
  if (pool) return pool;

  if (!config.PG_ENABLED) return null;

  try {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: config.PG_CONNECTION_STRING || `postgresql://${config.PG_USER}:${config.PG_PASSWORD}@${config.PG_HOST}:${config.PG_PORT}/${config.PG_DATABASE}`,
      max: config.PG_POOL_SIZE || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err: Error) => {
      log.error("PostgreSQL pool error", err);
    });

    log.info(`PostgreSQL pool created (max: ${config.PG_POOL_SIZE || 10})`);
    return pool;
  } catch (err) {
    log.error("Failed to create PostgreSQL pool", err);
    return null;
  }
}

export async function queryPg(text: string, params?: any[]): Promise<any> {
  const p = getPgPool();
  if (!p) return null;

  try {
    const result = await p.query(text, params);
    return result;
  } catch (err) {
    log.error("PostgreSQL query failed", err);
    throw err;
  }
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    log.info("PostgreSQL pool closed");
  }
}
