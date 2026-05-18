import Database from "better-sqlite3";
import { createLogger } from "./logger.ts";
import path from "path";
import { fileURLToPath } from "url";
import { PostgresDB, runMigrations } from "./db/postgres.ts";
import * as fs from "fs";
import { initSchema } from "./db/migrations/schema.ts";

const log = createLogger("db");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseUrl = process.env.DATABASE_URL;

interface DBInterface {
    prepare(sql: string): { all: (...params: unknown[]) => unknown[]; get: (...params: unknown[]) => unknown; run: (...params: unknown[]) => { changes: number; lastInsertRowid: number } };
    exec(sql: string): void;
    transaction<T>(fn: () => T): () => T;
    pragma(pragma: string, options?: { simple: true }): void | number;
}

let db: DBInterface;

if (databaseUrl) {
    log.info(`Using PostgreSQL database: ${databaseUrl.replace(/:[^:@]+@/, ":****@")}`);
    const pgDb = new PostgresDB(databaseUrl);
    
    db = pgDb as unknown as DBInterface;
    
    runMigrations(databaseUrl).catch((err) => {
        log.error("Migration failed", err);
        process.exit(1);
    });
} else {
    // Ensure data directory exists
    const dataDir = path.join(__dirname, "../data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const workerId = process.env.VITEST_WORKER_ID;
    const dbName = workerId ? `gravity_test_${workerId}.db` : "gravity.db";
    const dbPath = path.join(dataDir, dbName);
    log.info(`Connecting to SQLite DB at ${dbPath}`);
    const sqliteDb = new Database(dbPath, { timeout: 10000 });
    
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("wal_autocheckpoint = 1000");
    sqliteDb.pragma("foreign_keys = ON");
    sqliteDb.pragma("recursive_triggers = ON");
    
    db = sqliteDb as unknown as DBInterface;
    initSchema(db);

    log.info("SQLite DB initialized");
}

export { db };
export type DB = Database.Database | PostgresDB;
