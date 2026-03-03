/**
 * Sessions command - manage conversation sessions.
 */

import { db } from "../../db.ts";
import { success, error, info, title, section, printTable, confirm, dim } from "../utils.ts";

export async function sessionsCommand(action?: string, sessionId?: string): Promise<void> {
    if (!action || action === "list") {
        await listSessions();
    } else if (action === "clear" && sessionId) {
        await clearSession(sessionId);
    } else if (action === "clear" && !sessionId) {
        error("Session ID required for clear action");
        info("Usage: gravityclaw sessions clear <session-id>");
        process.exitCode = 1;
    } else if (action === "export" && sessionId) {
        await exportSession(sessionId);
    } else {
        error(`Unknown action: ${action}`);
        info("Available actions: list, clear, export");
        process.exitCode = 1;
    }
}

async function listSessions(): Promise<void> {
    title("💬 Sessions");

    try {
        const sessions = db.prepare(`
            SELECT 
                session_id,
                COUNT(*) as message_count,
                MAX(timestamp) as last_activity
            FROM memory
            GROUP BY session_id
            ORDER BY last_activity DESC
            LIMIT 20
        `).all() as Array<{ session_id: string; message_count: number; last_activity: number }>;

        if (sessions.length === 0) {
            info("No sessions found");
            return;
        }

        const rows = sessions.map((session) => {
            const date = new Date(session.last_activity);
            const dateStr = date.toLocaleString();
            
            return [
                session.session_id,
                session.message_count.toString(),
                dateStr,
            ];
        });

        printTable(rows, [
            { header: "Session ID", width: 40 },
            { header: "Messages", width: 12, align: "right" },
            { header: "Last Activity", width: 30 },
        ]);

        console.log();
        info(`Total sessions: ${sessions.length}${sessions.length === 20 ? " (showing most recent 20)" : ""}`);
    } catch (err) {
        error(`Failed to list sessions: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
    }
}

async function clearSession(sessionId: string): Promise<void> {
    title(`🗑️  Clear Session: ${sessionId}`);

    try {
        // Check if session exists
        const existingMessages = db.prepare("SELECT COUNT(*) as count FROM memory WHERE session_id = ?")
            .get(sessionId) as { count: number };

        if (existingMessages.count === 0) {
            error("Session not found");
            process.exitCode = 1;
            return;
        }

        info(`This session has ${existingMessages.count} messages`);
        const confirmed = await confirm("Are you sure you want to clear this session?");

        if (!confirmed) {
            info("Cancelled");
            return;
        }

        // Delete messages
        db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);

        // Try to delete facts file
        try {
            const { unlinkSync, existsSync } = await import("fs");
            const factsPath = `memory-files/${sessionId}/facts.md`;
            if (existsSync(factsPath)) {
                unlinkSync(factsPath);
            }
        } catch {
            // Ignore file errors
        }

        success(`Session ${sessionId} cleared`);
    } catch (err) {
        error(`Failed to clear session: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
    }
}

async function exportSession(sessionId: string): Promise<void> {
    title(`📤 Export Session: ${sessionId}`);

    try {
        const messages = db.prepare(`
            SELECT role, content, timestamp
            FROM memory
            WHERE session_id = ?
            ORDER BY timestamp ASC
        `).all(sessionId) as Array<{ role: string; content: string; timestamp: number }>;

        if (messages.length === 0) {
            error("Session not found or empty");
            process.exitCode = 1;
            return;
        }

        // Format as JSON
        const exportData = {
            sessionId,
            exportDate: new Date().toISOString(),
            messageCount: messages.length,
            messages: messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
                timestamp: new Date(msg.timestamp).toISOString(),
            })),
        };

        console.log(JSON.stringify(exportData, null, 2));
        
        info(`Exported ${messages.length} messages`);
        console.log(dim("\nTip: redirect output to save to file:"));
        console.log(dim(`  gravityclaw sessions export ${sessionId} > export.json`));
    } catch (err) {
        error(`Failed to export session: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
    }
}
