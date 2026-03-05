/**
 * Memory Export Tool
 * Export facts, entities, and relationships in JSON or Markdown format
 */

import type { Tool } from "../index.js";
import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";
import { gzipSync } from "zlib";

const log = createLogger("export-memory");

interface MemoryFact {
  id: number;
  content: string;
  category: string;
  createdAt: string;
  lastAccessed?: string;
  accessCount: number;
  importance: number;
}

interface MemoryEntity {
  id: number;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  accessCount: number;
  lastAccessed?: string;
  createdAt: string;
}

interface MemoryRelationship {
  id: number;
  fromEntityName?: string;
  toEntityName?: string;
  relationType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface MemoryExportJSON {
  metadata: {
    exportDate: string;
    sessionId: string;
    format: string;
    compressed: boolean;
  };
  facts: MemoryFact[];
  entities: MemoryEntity[];
  relationships: MemoryRelationship[];
  stats: {
    totalFacts: number;
    totalEntities: number;
    totalRelationships: number;
  };
}

/**
 * Fetch facts for a session
 */
function fetchFacts(sessionId: string, limit: number = 500): MemoryFact[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, fact_text as content, category, created_at as createdAt, 
                last_accessed as lastAccessed, access_count as accessCount, importance 
         FROM fact_stats WHERE session_id = ? 
         ORDER BY importance DESC, last_accessed DESC 
         LIMIT ?`
      )
      .all(sessionId, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      createdAt: row.createdAt,
      lastAccessed: row.lastAccessed,
      accessCount: row.accessCount || 0,
      importance: row.importance || 0,
    }));
  } catch (err) {
    log.warn("Facts table not available or error reading", { error: err });
    return [];
  }
}

/**
 * Fetch entities for a session
 */
function fetchEntities(sessionId: string, limit: number = 500): MemoryEntity[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, type, properties, access_count as accessCount, 
                last_accessed as lastAccessed, created_at as createdAt 
         FROM entities WHERE session_id = ? 
         ORDER BY access_count DESC 
         LIMIT ?`
      )
      .all(sessionId, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      properties: row.properties ? JSON.parse(row.properties) : {},
      accessCount: row.accessCount || 0,
      lastAccessed: row.lastAccessed,
      createdAt: row.createdAt,
    }));
  } catch (err) {
    log.warn("Entities table not available or error reading", { error: err });
    return [];
  }
}

/**
 * Fetch relationships for a session
 */
function fetchRelationships(
  sessionId: string,
  limit: number = 500
): MemoryRelationship[] {
  try {
    const rows = db
      .prepare(
        `SELECT r.id, e1.name as fromEntityName, e2.name as toEntityName, 
                r.relation_type as relationType, r.metadata, r.created_at as createdAt 
         FROM relationships r 
         LEFT JOIN entities e1 ON r.from_id = e1.id 
         LEFT JOIN entities e2 ON r.to_id = e2.id 
         WHERE r.session_id = ? 
         ORDER BY r.created_at DESC 
         LIMIT ?`
      )
      .all(sessionId, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      fromEntityName: row.fromEntityName,
      toEntityName: row.toEntityName,
      relationType: row.relationType,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdAt: row.createdAt,
    }));
  } catch (err) {
    log.warn("Relationships table not available or error reading", { error: err });
    return [];
  }
}

/**
 * Format memory as markdown
 */
function formatAsMarkdown(
  sessionId: string,
  facts: MemoryFact[],
  entities: MemoryEntity[],
  relationships: MemoryRelationship[]
): string {
  let markdown = `# Memory Export\n\n`;
  markdown += `**Export Date:** ${new Date().toISOString()}\n`;
  markdown += `**Session ID:** ${sessionId}\n\n`;

  markdown += `## Summary\n\n`;
  markdown += `- **Facts:** ${facts.length}\n`;
  markdown += `- **Entities:** ${entities.length}\n`;
  markdown += `- **Relationships:** ${relationships.length}\n\n`;

  // Facts section
  if (facts.length > 0) {
    markdown += `## Facts\n\n`;
    const categorized = facts.reduce(
      (acc, fact) => {
        if (!acc[fact.category]) {
          acc[fact.category] = [];
        }
        acc[fact.category]!.push(fact);
        return acc;
      },
      {} as Record<string, MemoryFact[]>
    );

    for (const [category, categoryFacts] of Object.entries(categorized)) {
      markdown += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;

      for (const fact of categoryFacts) {
        markdown += `- **${fact.content}**\n`;
        markdown += `  - Importance: ${(fact.importance || 0).toFixed(1)}\n`;
        markdown += `  - Access Count: ${fact.accessCount}\n`;
        if (fact.createdAt) {
          markdown += `  - Created: ${new Date(fact.createdAt).toLocaleString()}\n`;
        }
        markdown += `\n`;
      }
    }
  }

  // Entities section
  if (entities.length > 0) {
    markdown += `## Entities\n\n`;
    const typedEntities = entities.reduce(
      (acc, entity) => {
        if (!acc[entity.type]) {
          acc[entity.type] = [];
        }
        acc[entity.type]!.push(entity);
        return acc;
      },
      {} as Record<string, MemoryEntity[]>
    );

    for (const [type, typeEntities] of Object.entries(typedEntities)) {
      markdown += `### ${type}\n\n`;

      for (const entity of typeEntities) {
        markdown += `#### ${entity.name}\n\n`;
        markdown += `- **Type:** ${entity.type}\n`;
        markdown += `- **Access Count:** ${entity.accessCount}\n`;
        if (entity.createdAt) {
          markdown += `- **Created:** ${new Date(entity.createdAt).toLocaleString()}\n`;
        }

        if (Object.keys(entity.properties).length > 0) {
          markdown += `- **Properties:**\n`;
          for (const [key, value] of Object.entries(entity.properties)) {
            markdown += `  - ${key}: ${JSON.stringify(value)}\n`;
          }
        }
        markdown += `\n`;
      }
    }
  }

  // Relationships section
  if (relationships.length > 0) {
    markdown += `## Relationships\n\n`;

    for (const rel of relationships) {
      markdown += `- **${rel.fromEntityName || "Unknown"} --[${rel.relationType}]--> ${rel.toEntityName || "Unknown"}**\n`;
      if (Object.keys(rel.metadata).length > 0) {
        markdown += `  - Metadata: ${JSON.stringify(rel.metadata)}\n`;
      }
      markdown += `\n`;
    }
  }

  return markdown;
}

/**
 * Export memory tool
 */
export const exportMemoryTool: Tool = {
  name: "exportMemory",
  description:
    "Export memory (facts, entities, relationships) for a session in JSON or Markdown format",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Session ID to export memory for",
      },
      format: {
        type: "string",
        enum: ["json", "markdown"],
        description: "Export format (default: json)",
      },
      limit: {
        type: "number",
        description: "Maximum number of items per category (default: 500)",
      },
      compress: {
        type: "boolean",
        description: "Enable gzip compression (default: true)",
      },
    },
    required: ["sessionId"],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    try {
      const {
        sessionId,
        format = "json",
        limit = 500,
        compress = true,
      } = input as {
        sessionId: string;
        format?: string;
        limit?: number;
        compress?: boolean;
      };

      if (!sessionId.trim()) {
        return JSON.stringify({
          success: false,
          error: "sessionId is required",
        });
      }

      // Fetch all memory components
      const facts = fetchFacts(sessionId, limit);
      const entities = fetchEntities(sessionId, limit);
      const relationships = fetchRelationships(sessionId, limit);

      if (facts.length === 0 && entities.length === 0 && relationships.length === 0) {
        return JSON.stringify({
          success: true,
          warning: "No memory found for this session",
          data: {
            format,
            base64: "",
            filename: `memory-${sessionId}.${format === "json" ? "json" : "md"}`,
          },
        });
      }

      let exportData: string;

      if (format === "json") {
        const jsonExport: MemoryExportJSON = {
          metadata: {
            exportDate: new Date().toISOString(),
            sessionId,
            format,
            compressed: compress,
          },
          facts,
          entities,
          relationships,
          stats: {
            totalFacts: facts.length,
            totalEntities: entities.length,
            totalRelationships: relationships.length,
          },
        };
        exportData = JSON.stringify(jsonExport, null, 2);
      } else {
        // Markdown format
        exportData = formatAsMarkdown(sessionId, facts, entities, relationships);
      }

      // Compress if requested
      let finalData = exportData;
      let used_compression = false;
      if (compress && exportData.length > 1024) {
        try {
          const buffer = Buffer.from(exportData, "utf-8");
          const compressed = gzipSync(buffer);
          finalData = compressed.toString("base64");
          used_compression = true;
        } catch (err) {
          log.warn("Compression failed, returning uncompressed", { error: err });
        }
      }

      // Encode to base64
      const base64Data = used_compression
        ? finalData
        : Buffer.from(exportData, "utf-8").toString("base64");

      const extension = format === "json" ? "json" : "md";
      const filename = `memory-${sessionId}.${extension}${
        used_compression ? ".gz" : ""
      }`;

      log.info(
        `Exported memory for session ${sessionId}: ${facts.length} facts, ${entities.length} entities, ${relationships.length} relationships`
      );

      return JSON.stringify({
        success: true,
        data: {
          format,
          stats: {
            facts: facts.length,
            entities: entities.length,
            relationships: relationships.length,
          },
          base64: base64Data,
          filename,
          compressed: used_compression,
          size: finalData.length,
        },
      });
    } catch (err) {
      log.error("Failed to export memory", err);
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
};
