import type { Tool } from "../../types/tools.js";
import { createBackup } from "../../backup/index.ts";
import { db } from "../../db.ts";
import path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../../logger.ts";

const log = createLogger("tool:create-backup");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../../..", "gravity.db");

export const createBackupTool: Tool = {
    name: "create_backup",
    description:
        "Create an on-demand backup of the Gravity Claw database. The backup will be encrypted with AES-256-GCM and compressed with gzip. Returns the backup filename and metadata.",
    inputSchema: {
        type: "object" as const,
        properties: {
            description: {
                type: "string",
                description:
                    "Optional description of why this backup was created (for notes purposes)",
            },
        },
        required: [],
    },
    async execute(input) {
        try {
            log.info("Creating on-demand backup...");

            const filename = await createBackup(db as any, dbPath);

            return JSON.stringify({
                success: true,
                message: `Backup created successfully: ${filename}`,
                filename,
                description: input.description || "On-demand backup",
                timestamp: new Date().toISOString(),
            });
        } catch (err) {
            log.error("Failed to create backup", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    },
};
