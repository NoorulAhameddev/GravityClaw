import pg from "pg";
import { createLogger } from "../logger.ts";

const log = createLogger("db:postgres");

const { Pool } = pg;

export class PostgresDB {
    pool: pg.Pool;
    private _inTransaction = false;

    constructor(connectionString: string) {
        this.pool = new Pool({
            connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        this.pool.on("error", (err) => {
            log.error("Unexpected pool error", err);
        });

        log.info("PostgreSQL connection pool created");
    }

    pragma(pragma: string, options?: { simple: true }): void | number {
        if (options?.simple) {
            return 0;
        }
        log.debug(`Pragma not supported in PostgreSQL: ${pragma}`);
        return;
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    prepare(sql: string): PreparedStatement {
        return new PreparedStatement(this.pool, sql);
    }

    exec(sql: string): void {
        this.pool.query(sql).catch((err) => {
            log.error("Exec error", { sql: sql.substring(0, 100), error: err });
        });
    }

    async execAsync(sql: string): Promise<void> {
        await this.pool.query(sql);
    }

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            this._inTransaction = true;
            const result = await fn();
            await client.query("COMMIT");
            return result;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            this._inTransaction = false;
            client.release();
        }
    }

    async begin(): Promise<void> {
        await this.pool.query("BEGIN");
        this._inTransaction = true;
    }

    async commit(): Promise<void> {
        await this.pool.query("COMMIT");
        this._inTransaction = false;
    }

    async rollback(): Promise<void> {
        await this.pool.query("ROLLBACK");
        this._inTransaction = false;
    }

    get inTransaction(): boolean {
        return this._inTransaction;
    }
}

export class PreparedStatement {
    private pool: pg.Pool;
    private sql: string;

    constructor(pool: pg.Pool, sql: string) {
        this.pool = pool;
        this.sql = sql;
    }

    async all(...params: unknown[]): Promise<unknown[]> {
        const result = await this.pool.query(this.sql, params);
        return result.rows as unknown[];
    }

    async get(...params: unknown[]): Promise<unknown> {
        const result = await this.pool.query(this.sql, params);
        return result.rows[0] as unknown;
    }

    async run(...params: unknown[]): Promise<{ changes: number; lastInsertRowid: number }> {
        const result = await this.pool.query(this.sql, params);
        return { changes: result.rowCount ?? 0, lastInsertRowid: 0 };
    }
}
