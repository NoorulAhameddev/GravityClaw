import { createLogger } from "../../logger.ts";
import type { DbProvider } from "../provider.ts";

const log = createLogger("db:migrations");

interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

export interface Migration {
  name: string;
  up: (db: DbProvider) => Promise<void>;
  down?: (db: DbProvider) => Promise<void>;
  description: string;
}

/**
 * Run pending migrations against a database provider.
 *
 * Uses a `_migrations` tracking table to record which migrations have been applied.
 * Migrations are applied in order and idempotent (already-applied migrations are skipped).
 *
 * Usage:
 *   const migrations = loadMigrations();
 *   await runMigrations(db, migrations);
 */
export async function runMigrations(db: DbProvider, migrations: Migration[]): Promise<void> {
  // Ensure tracking table exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Get already-applied migration names
  const applied = await db.all<MigrationRecord>("SELECT name FROM _migrations ORDER BY id");
  const appliedNames = new Set(applied.map((r) => r.name));

  let lastIndex = -1;

  for (let i = 0; i < migrations.length; i++) {
    const migration = migrations[i]!;

    if (appliedNames.has(migration.name)) {
      continue;
    }

    log.info(`Applying migration: ${migration.name} — ${migration.description}`);

    await db.transaction(async (txDb) => {
      await migration.up(txDb);
      await txDb.run(
        "INSERT INTO _migrations (id, name) VALUES (?, ?)",
        i + 1,
        migration.name,
      );
    });

    log.info(`Migration applied: ${migration.name}`);
    lastIndex = i;
  }

  if (lastIndex === -1) {
    log.info("All migrations already applied");
  } else {
    log.info(`Applied ${lastIndex + 1} migration(s)`);
  }
}

/**
 * Roll back the last N migrations.
 * Each migration must implement a `down` function.
 */
export async function rollbackMigrations(
  db: DbProvider,
  migrations: Migration[],
  steps = 1,
): Promise<void> {
  const applied = await db.all<MigrationRecord>(
    "SELECT name FROM _migrations ORDER BY id DESC LIMIT ?",
    steps,
  );

  for (const record of applied) {
    const migration = migrations.find((m) => m.name === record.name);
    if (!migration) {
      log.warn(`Cannot rollback: migration "${record.name}" not found in registry`);
      continue;
    }
    if (!migration.down) {
      log.warn(`Cannot rollback: migration "${record.name}" has no down function`);
      continue;
    }

    log.info(`Rolling back migration: ${migration.name} — ${migration.description}`);

    await db.transaction(async (txDb) => {
      await migration.down!(txDb);
      await txDb.run("DELETE FROM _migrations WHERE name = ?", migration.name);
    });

    log.info(`Rollback complete: ${migration.name}`);
  }
}
