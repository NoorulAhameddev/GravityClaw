/**
 * Memory & Knowledge Graph Tools - Facts, Entities, Relationships
 * Provides backend support for Memory Vault dashboard
 */

import type { Tool } from "./index.ts";
import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import type {
    GraphEntity,
    GraphRelationship,
} from "../memory/graph.ts";

const log = createLogger("memory-tools");

interface FactRecord {
    id?: number;
    category: string;
    content: string;
    createdAt?: string;
    lastAccessed?: string;
    relevance?: number;
}

/**
 * List facts for a session with pagination
 */
export const listFactsTool: Tool = {
    name: "listFacts",
    description: "List all saved facts for the current session with pagination",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID"
            },
            limit: {
                type: "number",
                description: "Maximum number of facts to return (default: 50)"
            },
            offset: {
                type: "number",
                description: "Number of facts to skip (default: 0)"
            },
            category: {
                type: "string",
                description: "Optional category filter"
            }
        },
        required: ["sessionId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId, limit = 50, offset = 0, category } = input as {
                sessionId: string;
                limit?: number;
                offset?: number;
                category?: string;
            };

            // Try to get facts from markdown memory (if available)
            let facts: FactRecord[] = [];
            try {
                // Query markdown memory table if it exists
                let query = "SELECT * FROM facts WHERE session_id = ?";
                const params: unknown[] = [sessionId];
                
                if (category) {
                    query += " AND category = ?";
                    params.push(category);
                }
                
                query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
                params.push(limit, offset);

                const rows = db.prepare(query).all(...params) as any[];
                facts = rows.map(row => ({
                    id: row.id,
                    category: row.category,
                    content: row.content || row.fact,
                    createdAt: row.created_at,
                    lastAccessed: row.last_accessed,
                    relevance: row.relevance || 1.0
                }));
            } catch (err) {
                log.warn("Facts table not available, returning empty list");
            }

            return JSON.stringify({
                success: true,
                data: {
                    facts,
                    total: facts.length,
                    limit,
                    offset
                }
            });
        } catch (err) {
            log.error("Failed to list facts", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve facts"
            });
        }
    }
};

/**
 * List entities for a session with pagination
 */
export const listEntitiesTool: Tool = {
    name: "listEntities",
    description: "List all entities in the knowledge graph for a session",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID"
            },
            limit: {
                type: "number",
                description: "Maximum number of entities to return (default: 50)"
            },
            offset: {
                type: "number",
                description: "Number of entities to skip (default: 0)"
            },
            type: {
                type: "string",
                description: "Optional entity type filter"
            }
        },
        required: ["sessionId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId, limit = 50, offset = 0, type } = input as {
                sessionId: string;
                limit?: number;
                offset?: number;
                type?: string;
            };

            let query = "SELECT id, session_id, name, type, properties, access_count, last_accessed FROM entities WHERE session_id = ?";
            const params: unknown[] = [sessionId];

            if (type) {
                query += " AND type = ?";
                params.push(type);
            }

            query += " ORDER BY last_accessed DESC NULLS LAST LIMIT ? OFFSET ?";
            params.push(limit, offset);

            const rows = db.prepare(query).all(...params) as any[];
            
            const entities: GraphEntity[] = rows.map(row => ({
                id: row.id,
                sessionId: row.session_id,
                name: row.name,
                type: row.type,
                properties: JSON.parse(row.properties || "{}"),
                accessCount: row.access_count || 0,
                lastAccessed: row.last_accessed
            }));

            // Get relationship count for each entity
            const entitiesWithCounts = entities.map(entity => ({
                ...entity,
                relationshipCount: getEntityRelationshipCount(entity.id)
            }));

            return JSON.stringify({
                success: true,
                data: {
                    entities: entitiesWithCounts,
                    total: entitiesWithCounts.length,
                    limit,
                    offset
                }
            });
        } catch (err) {
            log.error("Failed to list entities", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve entities"
            });
        }
    }
};

/**
 * List relationships for a session with pagination
 */
export const listRelationshipsTool: Tool = {
    name: "listRelationships",
    description: "List all relationships in the knowledge graph for a session",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID"
            },
            limit: {
                type: "number",
                description: "Maximum number of relationships to return (default: 50)"
            },
            offset: {
                type: "number",
                description: "Number of relationships to skip (default: 0)"
            },
            relationType: {
                type: "string",
                description: "Optional relationship type filter"
            }
        },
        required: ["sessionId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId, limit = 50, offset = 0, relationType } = input as {
                sessionId: string;
                limit?: number;
                offset?: number;
                relationType?: string;
            };

            let query = `
                SELECT r.id, r.session_id, r.from_id, r.to_id, r.relation_type, r.metadata,
                       e1.name as from_name, e2.name as to_name
                FROM relationships r
                JOIN entities e1 ON r.from_id = e1.id
                JOIN entities e2 ON r.to_id = e2.id
                WHERE r.session_id = ?
            `;
            const params: unknown[] = [sessionId];

            if (relationType) {
                query += " AND r.relation_type = ?";
                params.push(relationType);
            }

            query += " ORDER BY r.created_at DESC LIMIT ? OFFSET ?";
            params.push(limit, offset);

            const rows = db.prepare(query).all(...params) as any[];

            const relationships = rows.map(row => ({
                id: row.id,
                sessionId: row.session_id,
                fromId: row.from_id,
                fromName: row.from_name,
                toId: row.to_id,
                toName: row.to_name,
                relationType: row.relation_type,
                metadata: JSON.parse(row.metadata || "{}")
            }));

            return JSON.stringify({
                success: true,
                data: {
                    relationships,
                    total: relationships.length,
                    limit,
                    offset
                }
            });
        } catch (err) {
            log.error("Failed to list relationships", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve relationships"
            });
        }
    }
};

/**
 * Search memory semantically
 */
export const searchMemoryTool: Tool = {
    name: "searchMemory",
    description: "Search facts and entities in memory using semantic queries",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID"
            },
            query: {
                type: "string",
                description: "Search query"
            },
            limit: {
                type: "number",
                description: "Maximum results to return (default: 10)"
            }
        },
        required: ["sessionId", "query"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId, query: searchQuery, limit = 10 } = input as {
                sessionId: string;
                query: string;
                limit?: number;
            };

            const results = {
                facts: [] as any[],
                entities: [] as any[],
                relationships: [] as any[]
            };

            // Search entities by name or type
            try {
                const entityRows = db.prepare(`
                    SELECT id, session_id, name, type, properties, access_count
                    FROM entities
                    WHERE session_id = ? AND (name LIKE ? OR type LIKE ?)
                    LIMIT ?
                `).all(sessionId, `%${searchQuery}%`, `%${searchQuery}%`, limit) as any[];

                results.entities = entityRows.map(row => ({
                    id: row.id,
                    name: row.name,
                    type: row.type,
                    properties: JSON.parse(row.properties || "{}"),
                    accessCount: row.access_count
                }));
            } catch (err) {
                log.warn(`Entity search failed: ${err}`);
            }

            // Search facts by content or category
            try {
                const factRows = db.prepare(`
                    SELECT id, category, content, created_at
                    FROM facts
                    WHERE session_id = ? AND (content LIKE ? OR category LIKE ?)
                    LIMIT ?
                `).all(sessionId, `%${searchQuery}%`, `%${searchQuery}%`, limit) as any[];

                results.facts = factRows.map(row => ({
                    id: row.id,
                    category: row.category,
                    content: row.content,
                    createdAt: row.created_at
                }));
            } catch (err) {
                log.warn(`Fact search failed: ${err}`);
            }

            return JSON.stringify({
                success: true,
                data: results
            });
        } catch (err) {
            log.error("Failed to search memory", err);
            return JSON.stringify({
                success: false,
                error: "Failed to search memory"
            });
        }
    }
};

// Helper function to get relationship count for an entity
function getEntityRelationshipCount(entityId: number): number {
    try {
        const result = db.prepare(
            "SELECT COUNT(*) as count FROM relationships WHERE from_id = ? OR to_id = ?"
        ).get(entityId, entityId) as { count: number };
        return result.count;
    } catch {
        return 0;
    }
}

export const memoryTools = [
    listFactsTool,
    listEntitiesTool,
    listRelationshipsTool,
    searchMemoryTool
];
