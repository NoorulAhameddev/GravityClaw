import type Database from "better-sqlite3";

/**
 * Query result for write operations
 */
export interface QueryResult {
  changes: number;
  lastInsertRowid: number;
}

/**
 * Database provider interface.
 *
 * Abstracts over synchronous SQLite and asynchronous PostgreSQL.
 * All methods return Promises for unified async handling.
 */
export interface DbProvider {
  /** Execute a single SQL query with parameters, return all matching rows */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;

  /** Execute a single SQL query with parameters, return the first matching row */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;

  /** Execute a write query with parameters, return affected row count */
  run(sql: string, ...params: unknown[]): Promise<QueryResult>;

  /** Execute raw SQL (for migrations) */
  exec(sql: string): Promise<void>;

  /** Begin a transaction. The callback receives this provider for scoped queries. */
  transaction<T>(fn: (db: DbProvider) => Promise<T>): Promise<T>;

  /** Close the database connection */
  close(): Promise<void>;
}

/**
 * Synchronous SQLite adapter wrapping better-sqlite3.
 * Maps sync calls to Promise-returning interface for compatibility.
 */
export class SqliteDbProvider implements DbProvider {
  private db: Database.Database;
  private transactionLock = Promise.resolve();

  constructor(db: Database.Database) {
    this.db = db;
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  async run(sql: string, ...params: unknown[]): Promise<QueryResult> {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...params);
    return {
      changes: info.changes,
      lastInsertRowid: info.lastInsertRowid as number,
    };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: (db: DbProvider) => Promise<T>): Promise<T> {
    const acquire = () => {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => { release = resolve; });
      const previous = this.transactionLock;
      this.transactionLock = previous.then(() => promise);
      return previous.then(() => release);
    };
    
    const release = await acquire();
    try {
      this.db.exec("BEGIN");
      try {
        const result = await fn(this);
        this.db.exec("COMMIT");
        return result;
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    } finally {
      release();
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
