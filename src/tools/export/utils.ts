/**
 * Export Utilities
 * Helper functions for managing data exports, downloading files, and handling compression
 */

import { createLogger } from "../../logger.ts";

const log = createLogger("export-utils");

export interface ExportResult {
  success: boolean;
  error?: string;
  warning?: string;
  data?: {
    format: string;
    base64: string;
    filename: string;
    compressed: boolean;
    size: number;
    [key: string]: unknown;
  };
}

export interface ExportOptions {
  sessionId: string;
  format: "json" | "markdown" | "csv" | "graphml";
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  compress?: boolean;
}

/**
 * Generate download URL for an export
 */
export function getDownloadUrl(exportResult: ExportResult): URL | null {
  if (!exportResult.success || !exportResult.data) {
    return null;
  }

  try {
    const url = new URL(
      `/api/export/download?filename=${encodeURIComponent(
        exportResult.data.filename
      )}&data=${encodeURIComponent(exportResult.data.base64)}&format=${
        exportResult.data.format
      }`,
      `http://localhost:${process.env.PORT || 3000}`
    );

    return url;
  } catch (err) {
    log.error("Failed to generate download URL", err);
    return null;
  }
}

/**
 * Decode base64 export data
 */
export function decodeExportData(
  base64Data: string,
  isCompressed: boolean = false
): Buffer {
  const buffer = Buffer.from(base64Data, "base64");

  if (isCompressed) {
    try {
      const { gunzipSync } = require("zlib");
      return gunzipSync(buffer);
    } catch (err) {
      log.error("Failed to decompress data", err);
      return buffer; // Return original if decompression fails
    }
  }

  return buffer;
}

/**
 * Parse export JSON data
 */
export function parseExportJSON(exportData: Buffer): Record<string, unknown> {
  try {
    const jsonString = exportData.toString("utf-8");
    return JSON.parse(jsonString);
  } catch (err) {
    log.error("Failed to parse export JSON", err);
    return {};
  }
}

/**
 * Save export to file system
 */
export function saveExportToFile(
  exportResult: ExportResult,
  outputPath: string
): boolean {
  if (!exportResult.success || !exportResult.data) {
    log.error("Cannot save failed export");
    return false;
  }

  try {
    const fs = require("fs");
    const buffer = decodeExportData(
      exportResult.data.base64,
      exportResult.data.compressed
    );

    fs.writeFileSync(outputPath, buffer);
    log.info(`Export saved to ${outputPath}`);
    return true;
  } catch (err) {
    log.error("Failed to save export to file", err);
    return false;
  }
}

/**
 * Get MIME type for export format
 */
export function getExportMimeType(
  filename: string
): "application/json" | "text/csv" | "text/markdown" | "application/graphml+xml" | "application/octet-stream" {
  if (filename.includes(".json")) {
    return "application/json";
  } else if (filename.includes(".csv")) {
    return "text/csv";
  } else if (filename.includes(".md") || filename.includes(".markdown")) {
    return "text/markdown";
  } else if (filename.includes(".graphml")) {
    return "application/graphml+xml";
  }

  return "application/octet-stream";
}

/**
 * Format export result for display
 */
export function formatExportSummary(exportResult: ExportResult): string {
  if (!exportResult.success) {
    return `❌ Export failed: ${exportResult.error || "Unknown error"}`;
  }

  if (exportResult.warning) {
    return `⚠️ ${exportResult.warning}`;
  }

  const data = exportResult.data;
  if (!data) {
    return "✅ Export completed";
  }

  const sizeKb = (data.size / 1024).toFixed(2);
  const compression = data.compressed ? " (compressed)" : "";

  return `✅ Export completed: ${data.filename} (${sizeKb} KB${compression})`;
}

/**
 * Build export tool call parameters
 */
export function buildExportParams(options: ExportOptions): Record<string, unknown> {
  const params: Record<string, unknown> = {
    sessionId: options.sessionId,
    format: options.format,
    compress: options.compress !== false,
  };

  if (options.limit !== undefined) {
    params.limit = options.limit;
  }

  if (options.dateFrom) {
    params.dateFrom = options.dateFrom;
  }

  if (options.dateTo) {
    params.dateTo = options.dateTo;
  }

  return params;
}

/**
 * Create a summary of memory export data
 */
export function summarizeMemoryExport(
  data: Record<string, unknown>
): { facts: number; entities: number; relationships: number } {
  const stats = (data.stats || {}) as Record<string, unknown>;
  
  return {
    facts: (stats.totalFacts as number) || 0,
    entities: (stats.totalEntities as number) || 0,
    relationships: (stats.totalRelationships as number) || 0,
  };
}

/**
 * Create a summary of usage export data
 */
export function summarizeUsageExport(
  data: Record<string, unknown>
): { records: number; totalCost: number; models: number } {
  const summary = (data.summary || {}) as Record<string, unknown>;
  
  return {
    records: (summary.totalRecords as number) || 0,
    totalCost: (summary.totalCost as number) || 0,
    models: Array.isArray(summary.models) ? summary.models.length : 0,
  };
}

/**
 * Create a summary of chat export data
 */
export function summarizeChatExport(
  data: Record<string, unknown>
): { messages: number; users: number; assistants: number } {
  const messages = (data.messages || []) as Record<string, unknown>[];
  
  let users = 0;
  let assistants = 0;

  for (const msg of messages) {
    if (msg.role === "user") users++;
    else if (msg.role === "assistant") assistants++;
  }

  return {
    messages: messages.length,
    users,
    assistants,
  };
}
