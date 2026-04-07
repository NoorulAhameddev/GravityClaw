/**
 * Premium CLI utilities for rich terminal output.
 */

import chalk from "chalk";
import ora, { type Ora } from "ora";
import boxen from "boxen";
import enquirer from "enquirer";
import { theme, isRich } from "./theme.js";
import { formatCliBannerArt } from "./banner.js";

const supportsColor = !process.env.NO_COLOR && process.stdout.isTTY;

if (!supportsColor) {
    (chalk as unknown as { level: number }).level = 0;
}

export const c = {
    reset: chalk.reset,
    bright: chalk.bold,
    dim: chalk.dim,
    red: chalk.red,
    green: chalk.green,
    yellow: chalk.yellow,
    blue: chalk.blue,
    magenta: chalk.magenta,
    cyan: chalk.cyan,
    white: chalk.white,
    gray: chalk.gray,
    bgRed: chalk.bgRed,
    bgGreen: chalk.bgGreen,
    bgYellow: chalk.bgYellow,
    bgBlue: chalk.bgBlue,
    bgCyan: chalk.bgCyan,
    bgMagenta: chalk.bgMagenta,
    bgWhite: chalk.bgWhite,
    accent: theme.accent,
    accentBright: theme.accentBright,
    accentDim: theme.accentDim,
    info: theme.info,
    success: theme.success,
    warn: theme.warn,
    error: theme.error,
    muted: theme.muted,
    heading: theme.heading,
    command: theme.command,
    option: theme.option,
};

export { theme, isRich };

export function success(message: string): void {
    console.log(`${c.green("✓")} ${message}`);
}

export function error(message: string): void {
    console.error(`${c.red("✗")} ${message}`);
}

export function warn(message: string): void {
    console.warn(`${c.yellow("⚠")} ${message}`);
}

export function info(message: string): void {
    console.log(`${c.cyan("ℹ")} ${message}`);
}

export function title(message: string): void {
    console.log();
    console.log(c.bright(c.cyan(message)));
    console.log();
}

export function section(message: string): void {
    console.log(c.bright(message));
}

export function dim(message: string): string {
    return c.dim(message);
}

export function highlight(message: string): string {
    return c.cyan(message);
}

export function bold(message: string): string {
    return c.bright(message);
}

export function code(message: string, _language: string = ""): string {
    return c.cyan(`\`${message}\``);
}

export function printRule(_style: string = "cyan"): void {
    const line = "─".repeat(Math.floor((process.stdout.columns || 80) / 2));
    console.log(c.cyan(line));
}

export function printSeparator(): void {
    console.log(c.gray("─".repeat(Math.floor((process.stdout.columns || 80) / 2))));
}

export function printBox(
    content: string,
    options?: {
        title?: string;
        borderStyle?: "single" | "double" | "round" | "classic";
        borderColor?: string;
        padding?: number;
        margin?: number;
    }
): void {
    const borderColor = options?.borderColor || "cyan";
    const padding = options?.padding || 1;
    const margin = options?.margin || 1;
    const title = options?.title || "";

    const boxOptions = {
        padding,
        margin,
        borderStyle: options?.borderStyle || "round",
        borderColor,
        title,
        titleAlignment: "center" as const,
    };

    console.log(boxen(content, boxOptions));
}

export function printPanel(
    content: string,
    panelTitle?: string,
    subtitle?: string,
    borderColor: string = "cyan"
): void {
    let fullContent = content;
    if (subtitle) {
        fullContent += `\n\n${c.dim(subtitle)}`;
    }
    printBox(fullContent, {
        title: panelTitle || "",
        borderColor,
    });
}

export function printTable(
    rows: string[][],
    headers: string[],
    options?: {
        headerStyle?: (text: string) => string;
        rowStyles?: string[];
        showLines?: boolean;
        compact?: boolean;
        colWidths?: number[];
    }
): void {
    const colWidths = options?.colWidths;
    
    const headerLine = headers.map((h, i) => {
        const w = colWidths?.[i] || h.length;
        const styled = options?.headerStyle?.(h) || c.cyan(h);
        return styled.padEnd(w);
    }).join("  ");
    
    console.log(headerLine);
    
    if (options?.showLines !== false) {
        console.log(c.gray("─".repeat(headerLine.length)));
    }

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const rowStyle = options?.rowStyles?.[i % (options.rowStyles?.length || 1)];
        
        const rowLine = row.map((cell, j) => {
            const w = colWidths?.[j] || headers[j]?.length || cell.length;
            let styled = cell;
            if (rowStyle === "green") styled = c.green(cell);
            else if (rowStyle === "yellow") styled = c.yellow(cell);
            else if (rowStyle === "red") styled = c.red(cell);
            else if (rowStyle === "dim") styled = c.dim(cell);
            return styled.padEnd(w);
        }).join("  ");
        
        console.log(rowLine);
    }
}

export function printKeyValue(
    data: Record<string, string>,
    options?: {
        keyStyle?: (text: string) => string;
        valueStyle?: (text: string) => string;
        separator?: string;
    }
): void {
    const keyStyle = options?.keyStyle || c.cyan;
    const valueStyle = options?.valueStyle || c.white;
    const separator = options?.separator || ":";

    for (const [key, value] of Object.entries(data)) {
        console.log(`${keyStyle(key)}${separator} ${valueStyle(value)}`);
    }
}

export function printTree(rootLabel: string, children: string[][], _guide: boolean = true): void {
    console.log(c.bright(c.cyan(rootLabel)));
    for (const child of children) {
        for (let i = 0; i < child.length; i++) {
            const prefix = i === child.length - 1 ? "└── " : "├── ";
            console.log(c.white(`  ${prefix}${child[i]}`));
        }
    }
}

export async function confirm(message: string): Promise<boolean> {
    const response = await enquirer.prompt({
        type: "confirm",
        name: "value",
        message,
        initial: false,
    });
    return (response as { value: boolean }).value;
}

export async function input(message: string, initial?: string): Promise<string> {
    const response = await enquirer.prompt({
        type: "input",
        name: "value",
        message,
        initial,
    });
    return (response as { value: string }).value;
}

export async function password(message: string): Promise<string> {
    const response = await enquirer.prompt({
        type: "password",
        name: "value",
        message,
    });
    return (response as { value: string }).value;
}

export async function select(
    message: string,
    choices: string[],
    defaultChoice?: number
): Promise<number | null> {
    const choiceNames = choices.map((choice, i) => ({
        name: String(i),
        message: choice,
    }));

    try {
        const response = await enquirer.prompt({
            type: "select",
            name: "value",
            message,
            choices: choiceNames,
            initial: defaultChoice ?? 0,
        });
        return parseInt((response as { value: string }).value, 10);
    } catch {
        return null;
    }
}

export async function multiSelect(
    message: string,
    choices: string[]
): Promise<number[]> {
    const response = await enquirer.prompt({
        type: "multiselect",
        name: "value",
        message,
        choices: choices.map((choice, i) => ({
            name: String(i),
            message: choice,
        })),
    });
    return (response as { value: string[] }).value.map((v) => parseInt(v, 10));
}

export class Spinner {
    private spinner: Ora | null = null;

    constructor(message: string) {
        if (supportsColor) {
            this.spinner = ora({
                text: message,
                color: "cyan",
                spinner: "dots",
            });
        }
    }

    start(): void {
        if (this.spinner) {
            this.spinner.start();
        }
    }

    stop(finalMessage?: string): void {
        if (this.spinner) {
            this.spinner.stop();
        }
        if (finalMessage) {
            console.log(finalMessage);
        }
    }

    succeed(message: string): void {
        if (this.spinner) {
            this.spinner.succeed(message);
        } else {
            success(message);
        }
    }

    fail(message: string): void {
        if (this.spinner) {
            this.spinner.fail(message);
        } else {
            error(message);
        }
    }

    update(message: string): void {
        if (this.spinner) {
            this.spinner.text = message;
        }
    }
}

export interface ProgressBarOptions {
    total: number;
    prefix?: string;
    suffix?: string;
    showProgress?: boolean;
    showSpeed?: boolean;
}

export class ProgressBar {
    private total: number;
    private current: number = 0;
    private prefix: string;
    private suffix: string;
    private showProgress: boolean;
    private width: number = 30;
    private startTime: number;

    constructor(options: ProgressBarOptions) {
        this.total = options.total;
        this.prefix = options.prefix || "";
        this.suffix = options.suffix || "";
        this.showProgress = options.showProgress ?? true;
        this.startTime = Date.now();
    }

    start(): void {
        this.startTime = Date.now();
        this.render();
    }

    update(current: number): void {
        this.current = current;
        this.render();
    }

    increment(delta: number = 1): void {
        this.current += delta;
        this.render();
    }

    private render(): void {
        const percent = Math.min(100, Math.round((this.current / this.total) * 100));
        const filled = Math.round((this.current / this.total) * this.width);
        const empty = this.width - filled;

        const bar = c.cyan("█".repeat(filled)) + c.gray("░".repeat(empty));
        
        let line = "";
        if (this.prefix) line += this.prefix + " ";
        line += bar;
        if (this.showProgress) line += ` ${percent}%`;
        if (this.suffix) line += " " + this.suffix;

        process.stdout.write("\r" + line);

        if (this.current >= this.total) {
            process.stdout.write("\n");
        }
    }

    stop(): void {
        this.current = this.total;
        this.render();
    }
}

export function printBanner(lines: string[]): void {
    const maxWidth = Math.max(...lines.map((l) => l.length));

    console.log();
    for (const line of lines) {
        const padded = line.padEnd(maxWidth);
        console.log(c.bright(c.cyan(padded)));
    }
    console.log();
}

export function printWelcome(): void {
    const ascii = formatCliBannerArt();
    console.log(ascii);
    console.log();
    
    const version = process.env.npm_package_version || "0.1.0";
    console.log(theme.heading("Personal AI Agent Ecosystem"));
    console.log();
    console.log(
        `${theme.muted("Version:")} ${theme.info(version)}  ` +
        `${theme.muted("Node:")} ${theme.info(process.version)}  ` +
        `${theme.muted("Platform:")} ${theme.info(process.platform)}`
    );
    console.log();
}

export interface ParsedArgs {
    command: string;
    subcommand?: string;
    flags: Record<string, string | boolean>;
    positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
    const args = argv.slice(2);
    const result: ParsedArgs = {
        command: "start",
        flags: {},
        positional: [],
    };

    let i = 0;
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
            if (!result.command || result.command === "start") {
                result.command = arg;
            } else if (!result.subcommand) {
                result.subcommand = arg;
            } else {
                result.positional.push(arg);
            }
            i++;
        }
    }

    return result;
}
