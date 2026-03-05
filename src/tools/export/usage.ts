/**
 * Usage Export Tool
 * Export usage analytics in JSON or CSV format
 */

import type { Tool } from "../index.js";
import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";
import { gzipSync } from "zlib";

const log = createLogger("export-usage");

interface UsageRecord {
  id: number;
  timestamp: string;
  sessionId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  latency?: number;
  provider?: string;
}

interface UsageExportJSON {
  metadata: {
    exportDate: string;
    sessionId?: string | undefined;
    format: string;
    compressed: boolean;
    dateRange?: {
      from: string;
      to: string;
    } | undefined;
  };
  summary: {
    totalRecords: number;
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCost: number;
    avgLatency?: number | undefined;
    models: Array<{
      model: string;
      calls: number;
      tokens: number;
      cost: number;
    }>;
  };
  records: UsageRecord[];
}

/**
 * Fetch usage records for a session or time range
 */
function fetchUsageRecords(
  sessionId?: string,
  dateFrom?: string,
  dateTo?: string,
  limit: number = 10000
): UsageRecord[] {
  try {
    let query =
      `SELECT id, timestamp, session_id as sessionId, model, 
              prompt_tokens as promptTokens, completion_tokens as completionTokens, 
              total_tokens as totalTokens, cost, latency_ms as latency, provider 
       FROM usage WHERE 1=1`;

    const params: unknown[] = [];

    if (sessionId) {
      query += ` AND session_id = ?`;
      params.push(sessionId);
    }

    if (dateFrom) {
      query += ` AND timestamp >= ?`;
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND timestamp <= ?`;
      params.push(dateTo);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params) as UsageRecord[];
    return rows;
  } catch (err) {
    log.warn("Usage table not available or error reading", { error: err });
    return [];
  }
}

/**
 * Calculate summary statistics
 */
function calculateSummary(records: UsageRecord[]) {
  if (records.length === 0) {
    return {
      totalRecords: 0,
      totalTokens: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalCost: 0,
      avgLatency: undefined,
      models: [],
    };
  }

  const modelMap = new Map<
    string,
    { calls: number; tokens: number; cost: number }
  >();

  let totalTokens = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCost = 0;
  let totalLatency = 0;
  let latencyCount = 0;

  for (const record of records) {
    totalTokens += record.totalTokens || 0;
    totalPromptTokens += record.promptTokens || 0;
    totalCompletionTokens += record.completionTokens || 0;
    totalCost += record.cost || 0;

    if (record.latency) {
      totalLatency += record.latency;
      latencyCount++;
    }

    const model = record.model || "unknown";
    const existing = modelMap.get(model) || { calls: 0, tokens: 0, cost: 0 };
    modelMap.set(model, {
      calls: existing.calls + 1,
      tokens: existing.tokens + (record.totalTokens || 0),
      cost: existing.cost + (record.cost || 0),
    });
  }

  const models = Array.from(modelMap.entries()).map(([model, stats]) => ({
    model,
    calls: stats.calls,
    tokens: stats.tokens,
    cost: parseFloat(stats.cost.toFixed(6)),
  }));

  return {
    totalRecords: records.length,
    totalTokens,
    totalPromptTokens,
    totalCompletionTokens,
    totalCost: parseFloat(totalCost.toFixed(6)),
    avgLatency: latencyCount > 0 ? totalLatency / latencyCount : undefined,
    models: models.sort((a, b) => b.cost - a.cost),
  };
}

/**
 * Format usage as CSV
 */
function formatAsCSV(records: UsageRecord[]): string {
  const headers = [
    "Timestamp",
    "Session ID",
    "Model",
    "Prompt Tokens",
    "Completion Tokens",
    "Total Tokens",
    "Cost",
    "Latency (ms)",
    "Provider",
  ];

  let csv = headers.join(",") + "\n";

  for (const record of records) {
    const row = [
      `"${record.timestamp}"`,
      `"${record.sessionId}"`,
      `"${record.model}"`,
      record.promptTokens,
      record.completionTokens,
      record.totalTokens,
      record.cost.toFixed(6),
      record.latency || "",
      `"${record.provider || ""}"`,
    ];

    csv += row.join(",") + "\n";
  }

  return csv;
}

/**
 * Export usage stats tool
 */
export const exportUsageStatsTool: Tool = {
  name: "exportUsageStats",
  description:
    "Export usage analytics and token/cost statistics in JSON or CSV format",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Optional session ID to filter by (exports all if omitted)",
      },
      format: {
        type: "string",
        enum: ["json", "csv"],
        description: "Export format (default: json)",
      },
      dateFrom: {
        type: "string",
        description: "Start date in ISO format (optional)",
      },
      dateTo: {
        type: "string",
        description: "End date in ISO format (optional)",
      },
      limit: {
        type: "number",
        description: "Maximum number of records to export (default: 10000)",
      },
      compress: {
        type: "boolean",
        description: "Enable gzip compression (default: true)",
      },
    },
    required: [],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    try {
      const {
        sessionId,
        format = "json",
        dateFrom,
        dateTo,
        limit = 10000,
        compress = true,
      } = input as {
        sessionId?: string;
        format?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        compress?: boolean;
      };

      // Fetch usage records
      const records = fetchUsageRecords(sessionId, dateFrom as string | undefined, dateTo as string | undefined, limit);

      if (records.length === 0) {
        return JSON.stringify({
          success: true,
          warning: "No usage records found",
          data: {
            format,
            recordCount: 0,
            base64: "",
            filename: `usage-export.${format === "json" ? "json" : "csv"}`,
          },
        });
      }

      // Calculate summary
      const summary = calculateSummary(records);

      let exportData: string;

      if (format === "json") {
        const jsonExport: UsageExportJSON = {
          metadata: {
            exportDate: new Date().toISOString(),
            sessionId,
            format,
            compressed: compress,
            dateRange: dateFrom || dateTo ? { from: dateFrom || "", to: dateTo || "" } : undefined,
          },
          summary,
          records,
        };
        exportData = JSON.stringify(jsonExport, null, 2);
      } else {
        // CSV format - include summary at top as comments
        let csv = `# Usage Export Report\n`;
        csv += `# Export Date: ${new Date().toISOString()}\n`;
        if (sessionId) {
          csv += `# Session ID: ${sessionId}\n`;
        }
        csv += `# Total Records: ${summary.totalRecords}\n`;
        csv += `# Total Cost: $${summary.totalCost.toFixed(6)}\n`;
        csv += `# Total Tokens: ${summary.totalTokens}\n\n`;

        csv += formatAsCSV(records);
        exportData = csv;
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

      const extension = format === "json" ? "json" : "csv";
      const filename = `usage-export${sessionId ? `-${sessionId}` : ""}.${extension}${
        used_compression ? ".gz" : ""
      }`;

      log.info(
        `Exported ${records.length} usage records, cost: $${summary.totalCost.toFixed(6)}`
      );

      return JSON.stringify({
        success: true,
        data: {
          format,
          recordCount: records.length,
          summary,
          base64: base64Data,
          filename,
          compressed: used_compression,
          size: finalData.length,
        },
      });
    } catch (err) {
      log.error("Failed to export usage stats", err);
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
};
