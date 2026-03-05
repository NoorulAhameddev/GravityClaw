/**
 * Knowledge Graph Export Tool
 * Export knowledge graph in JSON or GraphML format
 */

import type { Tool } from "../index.js";
import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";
import { gzipSync } from "zlib";

const log = createLogger("export-graph");

interface GraphNode {
  id: number;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  accessCount: number;
  lastAccessed?: string;
}

interface GraphEdge {
  id: number;
  source: number;
  target: number;
  sourceLabel?: string;
  targetLabel?: string;
  relationType: string;
  metadata: Record<string, unknown>;
}

interface GraphExportJSON {
  metadata: {
    exportDate: string;
    sessionId: string;
    format: string;
    compressed: boolean;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    nodeTypes: Record<string, number>;
    relationshipTypes: Record<string, number>;
  };
}

/**
 * Fetch nodes (entities) for a session
 */
function fetchNodes(sessionId: string): GraphNode[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, type, properties, access_count as accessCount, 
                last_accessed as lastAccessed 
         FROM entities WHERE session_id = ? 
         ORDER BY access_count DESC`
      )
      .all(sessionId) as any[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      properties: row.properties ? JSON.parse(row.properties) : {},
      accessCount: row.accessCount || 0,
      lastAccessed: row.lastAccessed,
    }));
  } catch (err) {
    log.warn("Error fetching nodes", { error: err });
    return [];
  }
}

/**
 * Fetch edges (relationships) for a session
 */
function fetchEdges(sessionId: string): GraphEdge[] {
  try {
    const rows = db
      .prepare(
        `SELECT r.id, r.from_id as source, r.to_id as target, 
                e1.name as sourceLabel, e2.name as targetLabel, 
                r.relation_type as relationType, r.metadata 
         FROM relationships r 
         LEFT JOIN entities e1 ON r.from_id = e1.id 
         LEFT JOIN entities e2 ON r.to_id = e2.id 
         WHERE r.session_id = ? 
         ORDER BY r.created_at DESC`
      )
      .all(sessionId) as any[];

    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      target: row.target,
      sourceLabel: row.sourceLabel,
      targetLabel: row.targetLabel,
      relationType: row.relationType,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    }));
  } catch (err) {
    log.warn("Error fetching edges", { error: err });
    return [];
  }
}

/**
 * Calculate graph statistics
 */
function calculateStats(nodes: GraphNode[], edges: GraphEdge[]) {
  const nodeTypes: Record<string, number> = {};
  const relationshipTypes: Record<string, number> = {};

  for (const node of nodes) {
    nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
  }

  for (const edge of edges) {
    relationshipTypes[edge.relationType] =
      (relationshipTypes[edge.relationType] || 0) + 1;
  }

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    nodeTypes,
    relationshipTypes,
  };
}

/**
 * Format graph as GraphML (XML format for graph tools)
 */
function formatAsGraphML(
  sessionId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): string {
  let graphml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  graphml += `<graphml xmlns="http://graphml.graphdrawing.org/xmlformat/graphml/1.0/graphml.xsd">\n`;
  graphml += `  <graph id="KnowledgeGraph" edgedefault="directed">\n`;

  // Add graph attributes
  graphml += `    <data key="sessionId">${escapeXml(sessionId)}</data>\n`;
  graphml += `    <data key="exportDate">${new Date().toISOString()}</data>\n`;

  // Add nodes
  for (const node of nodes) {
    graphml += `    <node id="node_${node.id}" label="${escapeXml(node.name)}">\n`;
    graphml += `      <data key="type">${escapeXml(node.type)}</data>\n`;
    graphml += `      <data key="accessCount">${node.accessCount}</data>\n`;
    if (node.lastAccessed) {
      graphml += `      <data key="lastAccessed">${escapeXml(node.lastAccessed)}</data>\n`;
    }

    // Add properties
    for (const [key, value] of Object.entries(node.properties)) {
      const strValue =
        typeof value === "string" ? value : JSON.stringify(value);
      graphml += `      <data key="prop_${escapeXml(key)}">${escapeXml(strValue)}</data>\n`;
    }

    graphml += `    </node>\n`;
  }

  // Add edges
  for (const edge of edges) {
    const edgeLabel =
      edge.relationType +
      (edge.sourceLabel && edge.targetLabel
        ? `: ${edge.sourceLabel} → ${edge.targetLabel}`
        : "");

    graphml += `    <edge id="edge_${edge.id}" source="node_${edge.source}" target="node_${edge.target}" label="${escapeXml(edgeLabel)}">\n`;
    graphml += `      <data key="relationType">${escapeXml(edge.relationType)}</data>\n`;

    // Add metadata
    for (const [key, value] of Object.entries(edge.metadata)) {
      const strValue =
        typeof value === "string" ? value : JSON.stringify(value);
      graphml += `      <data key="meta_${escapeXml(key)}">${escapeXml(strValue)}</data>\n`;
    }

    graphml += `    </edge>\n`;
  }

  graphml += `  </graph>\n`;
  graphml += `</graphml>\n`;

  return graphml;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Export knowledge graph tool
 */
export const exportGraphTool: Tool = {
  name: "exportGraph",
  description:
    "Export knowledge graph (entities and relationships) in JSON or GraphML format",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Session ID to export graph for",
      },
      format: {
        type: "string",
        enum: ["json", "graphml"],
        description: "Export format (default: json)",
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
      const { sessionId, format = "json", compress = true } = input as {
        sessionId: string;
        format?: string;
        compress?: boolean;
      };

      if (!sessionId.trim()) {
        return JSON.stringify({
          success: false,
          error: "sessionId is required",
        });
      }

      // Fetch graph data
      const nodes = fetchNodes(sessionId);
      const edges = fetchEdges(sessionId);

      if (nodes.length === 0) {
        return JSON.stringify({
          success: true,
          warning: "No graph data found for this session",
          data: {
            format,
            base64: "",
            filename: `graph-${sessionId}.${format === "json" ? "json" : "graphml"}`,
          },
        });
      }

      // Calculate statistics
      const stats = calculateStats(nodes, edges);

      let exportData: string;

      if (format === "json") {
        const jsonExport: GraphExportJSON = {
          metadata: {
            exportDate: new Date().toISOString(),
            sessionId,
            format,
            compressed: compress,
          },
          nodes,
          edges,
          stats,
        };
        exportData = JSON.stringify(jsonExport, null, 2);
      } else {
        // GraphML format
        exportData = formatAsGraphML(sessionId, nodes, edges);
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

      const extension = format === "json" ? "json" : "graphml";
      const filename = `graph-${sessionId}.${extension}${
        used_compression ? ".gz" : ""
      }`;

      log.info(
        `Exported graph for session ${sessionId}: ${nodes.length} nodes, ${edges.length} edges`
      );

      return JSON.stringify({
        success: true,
        data: {
          format,
          stats,
          base64: base64Data,
          filename,
          compressed: used_compression,
          size: finalData.length,
        },
      });
    } catch (err) {
      log.error("Failed to export graph", err);
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
};
