import OpenAI from "openai";
import { db } from "../db.ts";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("multimodal");

export type AttachmentType = "image" | "audio" | "video" | "document" | "other";

export interface AttachmentInput {
  type: AttachmentType;
  url?: string;
  base64Data?: string;
  extractedText?: string;
}

export interface AttachmentRecord {
  id: number;
  sessionId: string;
  type: AttachmentType;
  url: string | null;
  base64Data: string | null;
  extractedText: string | null;
  timestamp: string;
}

export interface ImageAnalysisOptions {
  analyzer?: (input: { url?: string; base64Data?: string }) => Promise<string>;
  model?: string;
}

export function initMultimodalMemory(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT,
      base64_data TEXT,
      extracted_text TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_type ON attachments(type);
    CREATE INDEX IF NOT EXISTS idx_attachments_timestamp ON attachments(timestamp);
  `);

  log.info("Multimodal memory initialized");
}

initMultimodalMemory();

function mapAttachmentRow(row: {
  id: number;
  session_id: string;
  type: string;
  url: string | null;
  base64_data: string | null;
  extracted_text: string | null;
  timestamp: string;
}): AttachmentRecord {
  const type = row.type as AttachmentType;
  return {
    id: row.id,
    sessionId: row.session_id,
    type,
    url: row.url,
    base64Data: row.base64_data,
    extractedText: row.extracted_text,
    timestamp: row.timestamp,
  };
}

export function saveAttachment(sessionId: string, input: AttachmentInput): AttachmentRecord {
  if (!sessionId.trim()) {
    throw new Error("sessionId is required");
  }
  if (!input.type) {
    throw new Error("attachment type is required");
  }

  const result = db
    .prepare(
      `
      INSERT INTO attachments (session_id, type, url, base64_data, extracted_text)
      VALUES (?, ?, ?, ?, ?)
      `
    )
    .run(
      sessionId,
      input.type,
      input.url ?? null,
      input.base64Data ?? null,
      input.extractedText ?? null
    );

  const row = db
    .prepare(
      `
      SELECT id, session_id, type, url, base64_data, extracted_text, timestamp
      FROM attachments WHERE id = ?
      `
    )
    .get(result.lastInsertRowid) as {
    id: number;
    session_id: string;
    type: string;
    url: string | null;
    base64_data: string | null;
    extracted_text: string | null;
    timestamp: string;
  };

  return mapAttachmentRow(row);
}

async function analyzeImageWithOpenAI(
  input: { url?: string; base64Data?: string },
  model = "gpt-4o-mini"
): Promise<string> {
  if (!config.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const imageUrl = input.url
    ? input.url
    : input.base64Data
      ? `data:image/jpeg;base64,${input.base64Data}`
      : undefined;

  if (!imageUrl) {
    throw new Error("No image input provided");
  }

  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe this image and extract any visible text (OCR). Return concise plain text.",
          },
          {
            type: "image_url",
            image_url: { url: imageUrl },
          },
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || "No visual details extracted.";
}

export async function analyzeAndStoreImageAttachment(
  sessionId: string,
  input: { url?: string; base64Data?: string },
  options?: ImageAnalysisOptions
): Promise<AttachmentRecord> {
  let extractedText = "";

  try {
    if (options?.analyzer) {
      extractedText = await options.analyzer(input);
    } else {
      extractedText = await analyzeImageWithOpenAI(input, options?.model);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log.warn(`Image analysis failed, storing fallback text: ${message}`);
    extractedText = input.url
      ? `Image attachment stored (analysis unavailable). URL: ${input.url}`
      : "Image attachment stored (analysis unavailable).";
  }

  const attachment: AttachmentInput = {
    type: "image",
    extractedText,
  };

  if (input.url) {
    attachment.url = input.url;
  }
  if (input.base64Data) {
    attachment.base64Data = input.base64Data;
  }

  return saveAttachment(sessionId, attachment);
}

export function searchAttachments(
  sessionId: string,
  query: string,
  limit = 10
): AttachmentRecord[] {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) {
    return [];
  }

  const effectiveLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const like = `%${cleanedQuery}%`;

  const rows = db
    .prepare(
      `
      SELECT id, session_id, type, url, base64_data, extracted_text, timestamp
      FROM attachments
      WHERE session_id = ?
        AND (
          COALESCE(extracted_text, '') LIKE ?
          OR COALESCE(url, '') LIKE ?
          OR type LIKE ?
        )
      ORDER BY timestamp DESC, id DESC
      LIMIT ?
      `
    )
    .all(sessionId, like, like, like, effectiveLimit) as Array<{
    id: number;
    session_id: string;
    type: string;
    url: string | null;
    base64_data: string | null;
    extracted_text: string | null;
    timestamp: string;
  }>;

  return rows.map(mapAttachmentRow);
}

export function getRecentAttachmentContext(
  sessionId: string,
  limit = 5,
  maxChars = 2500
): string {
  const effectiveLimit = Math.max(1, Math.min(20, Math.floor(limit)));

  const rows = db
    .prepare(
      `
      SELECT id, session_id, type, url, base64_data, extracted_text, timestamp
      FROM attachments
      WHERE session_id = ?
      ORDER BY timestamp DESC, id DESC
      LIMIT ?
      `
    )
    .all(sessionId, effectiveLimit) as Array<{
    id: number;
    session_id: string;
    type: string;
    url: string | null;
    base64_data: string | null;
    extracted_text: string | null;
    timestamp: string;
  }>;

  if (rows.length === 0) {
    return "";
  }

  const parts = rows.map((row) => {
    const summary = row.extracted_text?.trim() || "(no extracted text)";
    const shortSummary = summary.length > 300 ? `${summary.slice(0, 300)}...` : summary;
    const source = row.url ? ` url=${row.url}` : "";
    return `- [${row.type}]${source} :: ${shortSummary}`;
  });

  const full = parts.join("\n");
  if (full.length <= maxChars) {
    return full;
  }

  const suffix = "\n... [attachment context truncated]";
  return full.slice(0, Math.max(0, maxChars - suffix.length)) + suffix;
}
