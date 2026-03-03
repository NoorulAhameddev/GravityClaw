/**
 * CLI utilities for formatting, colors, and user interaction.
 */

// ANSI color codes (respects NO_COLOR env var)
const supportsColor = !process.env.NO_COLOR && process.stdout.isTTY;

export const colors = {
    reset: supportsColor ? "\x1b[0m" : "",
    bright: supportsColor ? "\x1b[1m" : "",
    dim: supportsColor ? "\x1b[2m" : "",
    red: supportsColor ? "\x1b[31m" : "",
    green: supportsColor ? "\x1b[32m" : "",
    yellow: supportsColor ? "\x1b[33m" : "",
    blue: supportsColor ? "\x1b[34m" : "",
    magenta: supportsColor ? "\x1b[35m" : "",
    cyan: supportsColor ? "\x1b[36m" : "",
    white: supportsColor ? "\x1b[37m" : "",
};

export function success(message: string): void {
    console.log(`${colors.green}✓${colors.reset} ${message}`);
}

export function error(message: string): void {
    console.error(`${colors.red}✗${colors.reset} ${message}`);
}

export function warn(message: string): void {
    console.warn(`${colors.yellow}⚠${colors.reset} ${message}`);
}

export function info(message: string): void {
    console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

export function title(message: string): void {
    console.log(`\n${colors.bright}${colors.cyan}${message}${colors.reset}\n`);
}

export function section(message: string): void {
    console.log(`${colors.bright}${message}${colors.reset}`);
}

export function dim(message: string): string {
    return `${colors.dim}${message}${colors.reset}`;
}

export function highlight(message: string): string {
    return `${colors.cyan}${message}${colors.reset}`;
}

export function bold(message: string): string {
    return `${colors.bright}${message}${colors.reset}`;
}

/**
 * Parse CLI arguments into a structured format.
 */
export interface ParsedArgs {
    command: string;
    subcommand?: string;
    flags: Record<string, string | boolean>;
    positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
    const args = argv.slice(2);
    const result: ParsedArgs = {
        command: args[0] || "start",
        flags: {},
        positional: [],
    };

    let i = 1;
    while (i < args.length) {
        const arg = args[i];
        if (!arg) break;

        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            const nextArg = args[i + 1];
            
            if (nextArg && !nextArg.startsWith("-")) {
                result.flags[key] = nextArg;
                i += 2;
            } else {
                result.flags[key] = true;
                i++;
            }
        } else if (arg.startsWith("-")) {
            const key = arg.slice(1);
            result.flags[key] = true;
            i++;
        } else {
            if (!result.subcommand) {
                result.subcommand = arg;
            } else {
                result.positional.push(arg);
            }
            i++;
        }
    }

    return result;
}

/**
 * Prompt user for yes/no confirmation.
 */
export async function confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
        process.stdout.write(`${message} ${dim("(y/n)")}: `);
        
        process.stdin.once("data", (data) => {
            const answer = data.toString().trim().toLowerCase();
            resolve(answer === "y" || answer === "yes");
        });
    });
}

/**
 * Read line from stdin.
 */
export async function readLine(prompt?: string): Promise<string> {
    return new Promise((resolve) => {
        if (prompt) {
            process.stdout.write(prompt);
        }
        
        process.stdin.once("data", (data) => {
            resolve(data.toString().trim());
        });
    });
}

/**
 * Format table output.
 */
export interface TableColumn {
    header: string;
    width: number;
    align?: "left" | "right";
}

export function printTable(rows: string[][], columns: TableColumn[]): void {
    // Print header
    const headerRow = columns
        .map((col, i) => {
            const text = col.header.padEnd(col.width);
            return text.substring(0, col.width);
        })
        .join("  ");
    
    console.log(bold(headerRow));
    console.log("─".repeat(columns.reduce((sum, col) => sum + col.width + 2, -2)));

    // Print rows
    for (const row of rows) {
        const formattedRow = columns
            .map((col, i) => {
                const text = row[i] || "";
                if (col.align === "right") {
                    return text.padStart(col.width).substring(0, col.width);
                }
                return text.padEnd(col.width).substring(0, col.width);
            })
            .join("  ");
        
        console.log(formattedRow);
    }
}

/**
 * Spinner for long-running operations.
 */
export class Spinner {
    private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    private interval?: NodeJS.Timeout | undefined;
    private frameIndex = 0;
    private message: string;

    constructor(message: string) {
        this.message = message;
    }

    start(): void {
        if (!process.stdout.isTTY) return;

        this.interval = setInterval(() => {
            const frame = this.frames[this.frameIndex];
            process.stdout.write(`\r${colors.cyan}${frame}${colors.reset} ${this.message}`);
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        }, 80);
    }

    stop(finalMessage?: string): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
        
        if (process.stdout.isTTY) {
            process.stdout.write("\r" + " ".repeat(this.message.length + 3) + "\r");
        }
        
        if (finalMessage) {
            console.log(finalMessage);
        }
    }

    succeed(message: string): void {
        this.stop();
        success(message);
    }

    fail(message: string): void {
        this.stop();
        error(message);
    }
}
