/**
 * Vim CLI command - toggle vim mode for terminal editing.
 */

import { success, error, info, title, section, printTable, dim, bold } from "../utils.ts";

let vimModeEnabled = false;

export function isVimMode(): boolean {
    return vimModeEnabled;
}

export async function vimCommand(action?: string): Promise<void> {
    const subcommand = action?.toLowerCase();

    switch (subcommand) {
        case "on":
        case "enable":
            await enableVimMode();
            break;
        case "off":
        case "disable":
            await disableVimMode();
            break;
        case "toggle":
            vimModeEnabled = !vimModeEnabled;
            if (vimModeEnabled) {
                success("Vim mode enabled");
            } else {
                info("Vim mode disabled");
            }
            break;
        case undefined:
        case "status":
        case "info":
            await showVimStatus();
            break;
        default:
            printHelp();
            break;
    }
}

async function enableVimMode(): Promise<void> {
    vimModeEnabled = true;
    title("📝 Vim Mode Enabled");
    
    section("Active Keybindings");
    printTable([
        ["i", "Insert mode - type normally"],
        ["Esc", "Normal mode"],
        ["h j k l", "Navigate left/down/up/right"],
        ["w / b", "Word forward / back"],
        ["0 / $", "Line start / end"],
        ["gg / G", "File start / end"],
        ["dd", "Delete line"],
        ["dw", "Delete word"],
        ["x", "Delete character"],
        ["yy", "Yank line"],
        ["p", "Paste"],
        ["u", "Undo"],
        ["Ctrl+r", "Redo"],
        ["/", "Search"],
        ["n / N", "Next / previous match"],
        [":w", "Write (save)"],
        [":q", "Quit"],
        [":q!", "Force quit"],
        [":wq", "Save & quit"],
    ], [
        { header: "Key", width: 12 },
        { header: "Action", width: 30 },
    ]);

    console.log();
    success("Vim mode is now active for interactive prompts");
}

async function disableVimMode(): Promise<void> {
    vimModeEnabled = false;
    success("Vim mode disabled");
}

async function showVimStatus(): Promise<void> {
    title("📝 Vim Mode Status");

    section("Current State");
    printTable([
        ["Vim Mode", vimModeEnabled ? "Enabled" : "Disabled"],
    ], [
        { header: "Setting", width: 15 },
        { header: "Value", width: 15 },
    ]);

    console.log();
    if (!vimModeEnabled) {
        section("Enable Vim Mode");
        info("Run 'gravityclaw vim on' to enable vim keybindings");
    }
}

function printHelp(): void {
    title("📝 GravityClaw Vim Mode");

    section("Usage");
    printTable([
        ["gravityclaw vim", "Show status"],
        ["gravityclaw vim on", "Enable vim mode"],
        ["gravityclaw vim off", "Disable vim mode"],
        ["gravityclaw vim toggle", "Toggle vim mode"],
    ], [
        { header: "Command", width: 30 },
        { header: "Description", width: 30 },
    ]);

    console.log();
    section("Keybindings (when enabled)");
    info("Navigate: h j k l (left/down/up/right)");
    info("Word: w (forward), b (back)");
    info("Line: 0 (start), $ (end)");
    info("File: gg (top), G (bottom)");
    info("Edit: dd (delete line), x (delete char)");
    info("Yank/Paste: yy, p");
    info("Undo/Redo: u, Ctrl+r");
    info("Search: /, n, N");
}