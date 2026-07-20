import { createLogger } from "../logger.ts";

const log = createLogger("session-store");

interface SessionData {
    id: string;
    userId?: string;
    role?: string;
    createdAt: string;
    data: Record<string, unknown>;
}

class MemorySessionStore {
    private store = new Map<string, { data: SessionData; expiresAt: number }>();

    async get(sessionId: string): Promise<SessionData | null> {
        const entry = this.store.get(sessionId);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(sessionId);
            return null;
        }
        return entry.data;
    }

    async set(sessionId: string, data: SessionData, ttl: number = 3600): Promise<void> {
        this.store.set(sessionId, { data, expiresAt: Date.now() + ttl * 1000 });
    }

    async delete(sessionId: string): Promise<void> {
        this.store.delete(sessionId);
    }

    async list(): Promise<SessionData[]> {
        const now = Date.now();
        const results: SessionData[] = [];
        for (const [key, entry] of this.store) {
            if (now > entry.expiresAt) {
                this.store.delete(key);
            } else {
                results.push(entry.data);
            }
        }
        return results;
    }
}

let instance: MemorySessionStore = new MemorySessionStore();

const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
    try {
        const { createClient } = await import("redis");
        const client = createClient({ url: redisUrl });
        await client.connect();
        log.info("Redis session store connected");

        const redisStore = {
            async get(sessionId: string): Promise<SessionData | null> {
                const data = await client.get(`session:${sessionId}`);
                return data ? JSON.parse(data) : null;
            },
            async set(sessionId: string, data: SessionData, ttl: number = 3600): Promise<void> {
                await client.setEx(`session:${sessionId}`, ttl, JSON.stringify(data));
            },
            async delete(sessionId: string): Promise<void> {
                await client.del(`session:${sessionId}`);
            },
            async list(): Promise<SessionData[]> {
                const keys = await client.keys("session:*");
                if (keys.length === 0) return [];
                const values = await client.mGet(keys);
                return values.filter((v): v is string => v !== null).map((v: string) => JSON.parse(v));
            },
        };

        instance = redisStore as any;
    } catch {
        log.info("Redis unavailable, using in-memory session store");
    }
} else {
    log.info("No REDIS_URL configured, using in-memory session store");
}

export const sessionStore = instance;
