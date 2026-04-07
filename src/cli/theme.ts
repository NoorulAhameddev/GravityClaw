import chalk from "chalk";
import { GRAVY_PALETTE } from "./palette.js";

const hasForceColor =
    typeof process.env.FORCE_COLOR === "string" &&
    process.env.FORCE_COLOR.trim().length > 0 &&
    process.env.FORCE_COLOR.trim() !== "0";

const supportsColor = !process.env.NO_COLOR && process.stdout.isTTY;
const baseChalk = supportsColor ? chalk : (chalk as unknown as { level: number; hex: (color: string) => (text: string) => string; bold: { hex: (color: string) => (text: string) => string } });

function createHexChalk(color: string): (text: string) => string {
    return (text: string) => baseChalk.hex(color)(text);
}

export const theme = {
    accent: createHexChalk(GRAVY_PALETTE.accent),
    accentBright: createHexChalk(GRAVY_PALETTE.accentBright),
    accentDim: createHexChalk(GRAVY_PALETTE.accentDim),
    info: createHexChalk(GRAVY_PALETTE.info),
    success: createHexChalk(GRAVY_PALETTE.success),
    warn: createHexChalk(GRAVY_PALETTE.warn),
    error: createHexChalk(GRAVY_PALETTE.error),
    muted: createHexChalk(GRAVY_PALETTE.muted),
    heading: (text: string) => baseChalk.bold.hex(GRAVY_PALETTE.accent)(text),
    command: createHexChalk(GRAVY_PALETTE.accentBright),
    option: createHexChalk(GRAVY_PALETTE.warn),
};

export function isRich(): boolean {
    return supportsColor;
}

export function colorize(
    rich: boolean,
    color: (value: string) => string,
    value: string
): string {
    return rich ? color(value) : value;
}
