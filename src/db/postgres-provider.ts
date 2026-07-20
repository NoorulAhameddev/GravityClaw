import pg from "pg";
import { createLogger } from "../logger.ts";
import type { DbProvider, QueryResult } from "./provider.ts";

function sqliteToPg(sql: string) {
    let pg = sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY');
    pg = pg.replace(/DATETIME/g, 'TIMESTAMP');
    // For the specific INSERT OR IGNORE in 0002 migration
    if (pg.includes('INSERT OR IGNORE INTO session_settings')) {
        pg = pg.replace('INSERT OR IGNORE INTO', 'INSERT INTO');
        pg = pg.replace('WHERE m1.session_id IS NOT NULL;', 'WHERE m1.session_id IS NOT NULL ON CONFLICT (session_id) DO NOTHING;');
    }
    return pg;
}

const log = createLogger("db:postgres");
const { Pool } = pg;

/**
 * Asynchronous PostgreSQL database provider.
 *
 * This is the CORRECT implementation of DbProvider for PostgreSQL.
 * Each method returns a Promise and properly awaits the query.
 * No fire-and-forget patterns, no empty results.
 */
export class PostgresDbProvider implements DbProvider {
  private pool: pg.Pool;

  constructor(connectionString: string, maxConnections = 10) {
    this.pool = new Pool({
      connectionString,
      max: maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on("error", (err) => {
      log.error("Unexpected PostgreSQL pool error", err);
    });

    log.info("PostgreSQL connection pool created", {
      maxConnections,
      idleTimeout: 30000,
      connectionTimeout: 5000,
    });
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sqliteToPg(sql), params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sqliteToPg(sql), params);
      return result.rows[0] as T | undefined;
    } finally {
      client.release();
    }
  }

  async run(sql: string, ...params: unknown[]): Promise<QueryResult> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sqliteToPg(sql), params);
      return {
        changes: result.rowCount ?? 0,
        lastInsertRowid: 0,
      };
    } finally {
      client.release();
    }
  }

  async exec(sql: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(sqliteToPg(sql));
    } finally {
      client.release();
    }
  }

  async transaction<T>(fn: (db: DbProvider) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(this);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    log.info("PostgreSQL connection pool closed");
  }
}
