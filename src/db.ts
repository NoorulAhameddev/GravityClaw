import Database from "better-sqlite3";
import { createLogger } from "./logger.ts";
import path from "path";
import { fileURLToPath } from "url";
import { PostgresDB } from "./db/postgres.ts";
import * as fs from "fs";
import { SqliteDbProvider } from "./db/provider.ts";
import { PostgresDbProvider } from "./db/postgres-provider.ts";
import { migrations } from "./db/migrations/definitions.ts";
import { runMigrations } from "./db/migrations/runner.ts";

const log = createLogger("db");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseUrl = process.env.DATABASE_URL;

interface DBInterface {
  prepare(sql: string): {
    all: (...params: unknown[]) => unknown[];
    get: (...params: unknown[]) => unknown;
    run: (...params: unknown[]) => { changes: number; lastInsertRowid: number };
  };
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  pragma(pragma: string, options?: { simple: true }): void | number;
  close?: () => void;
}

const db: DBInterface = await initializeDatabase();

async function initializeDatabase(): Promise<DBInterface> {
  if (databaseUrl) {
    log.info(`Using PostgreSQL database: ${databaseUrl.replace(/:[^:@]+@/, ":****@")}`);
    const pgDb = new PostgresDB(databaseUrl);

    // Run migrations asynchronously and wait for them before returning
    await runMigrationsOnPostgres(databaseUrl);

    return pgDb as unknown as DBInterface;
  }

  // SQLite path
  const dataDir = path.join(__dirname, "../data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  } else {
    try {
      fs.chmodSync(dataDir, 0o700);
    } catch (err) {
      log.warn(
        `Could not set permissions on data directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const workerId = process.env.VITEST_WORKER_ID;
  const dbName = workerId ? `gravity_test_${workerId}.db` : "gravity.db";
  const dbPath = path.join(dataDir, dbName);
  log.info(`Connecting to SQLite DB at ${dbPath}`);

  const sqliteDb = new Database(dbPath, { timeout: 10000 });

  try {
    fs.chmodSync(dbPath, 0o600);
  } catch (err) {
    log.warn(
      `Could not set permissions on database file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("wal_autocheckpoint = 1000");
  sqliteDb.pragma("foreign_keys = ON");
  sqliteDb.pragma("recursive_triggers = ON");

  // Run migrations through the new system
  const provider = new SqliteDbProvider(sqliteDb);
  try {
    await runMigrations(provider, migrations);
  } catch (err) {
    log.error("Migration failed", err);
    throw err;
  }

  log.info("SQLite DB initialized with migrations");
  return sqliteDb as unknown as DBInterface;
}

/**
 * Run PostgreSQL migrations in the background.
 * Errors are logged and rethrown to prevent silent failures.
 */
async function runMigrationsOnPostgres(connectionString: string): Promise<void> {
  try {
    const provider = new PostgresDbProvider(connectionString);
    await runMigrations(provider, migrations);
    await provider.close();
    log.info("PostgreSQL migrations completed");
  } catch (err) {
    log.error("PostgreSQL migration failed", err);
    throw err;
  }
}

export { db };
export type DB = Database.Database | PostgresDB;
