import { isRich, theme } from "./theme.js";
import { pickTagline, type TaglineOptions } from "./tagline.js";

type BannerOptions = TaglineOptions & {
    columns?: number;
    richTty?: boolean;
};

let bannerEmitted = false;

function splitGraphemes(value: string): string[] {
    return Array.from(value);
}

const hasJsonFlag = (argv: string[]) =>
    argv.some((arg) => arg === "--json" || arg.startsWith("--json="));

const hasVersionFlag = (argv: string[]) =>
    argv.some((arg) => arg === "--version" || arg === "-V");

export function formatCliBannerLine(version: string, options: BannerOptions = {}): string {
    const tagline = pickTagline(options);
    const rich = options.richTty ?? isRich();
    const title = "🦀 Gravity Claw";
    const prefix = "🦀 ";
    const columns = options.columns ?? process.stdout.columns ?? 120;
    const plainBaseLine = `${title} ${version}`;
    const plainFullLine = tagline ? `${plainBaseLine} — ${tagline}` : plainBaseLine;
    const fitsOnOneLine = plainFullLine.length <= columns;

    if (rich) {
        if (fitsOnOneLine) {
            if (!tagline) {
                return `${theme.heading(title)} ${theme.info(version)}`;
            }
            return `${theme.heading(title)} ${theme.info(version)} ${theme.muted("—")} ${theme.accentDim(tagline)}`;
        }
        const line1 = `${theme.heading(title)} ${theme.info(version)}`;
        if (!tagline) {
            return line1;
        }
        const line2 = `${" ".repeat(prefix.length)}${theme.accentDim(tagline)}`;
        return `${line1}\n${line2}`;
    }

    if (fitsOnOneLine) {
        return plainFullLine;
    }
    const line1 = plainBaseLine;
    if (!tagline) {
        return line1;
    }
    const line2 = `${" ".repeat(prefix.length)}${tagline}`;
    return `${line1}\n${line2}`;
}

const GRAVY_ASCII = [
    "▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄",
    "██░▄▄▄░██░▄▄░██░▄▄▄██░▀██░██░▄▄▀██░████░▄▄▀██░███░██",
    "██░███░██░▀▀░██░▄▄▄██░█░█░██░█████░████░▀▀░██░█░█░██",
    "██░▀▀▀░██░█████░▀▀▀██░██▄░██░▀▀▄██░▀▀░█░██░██▄▀▄▀▄██",
    "▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀",
    "              🦀 GRAVITY CLAW 🦀                    ",
    " ",
];

export function formatCliBannerArt(options: BannerOptions = {}): string {
    const rich = options.richTty ?? isRich();

    if (!rich) {
        return GRAVY_ASCII.join("\n");
    }

    const colorChar = (ch: string) => {
        if (ch === "█") {
            return theme.accentBright(ch);
        }
        if (ch === "░") {
            return theme.accentDim(ch);
        }
        if (ch === "▀") {
            return theme.accent(ch);
        }
        return theme.muted(ch);
    };

    const colored = GRAVY_ASCII.map((line) => {
        if (line.includes("GRAVITY CLAW")) {
            return (
                theme.muted("              ") +
                theme.accent("🦀") +
                theme.info(" GRAVITY CLAW ") +
                theme.accent("🦀")
            );
        }
        return splitGraphemes(line).map(colorChar).join("");
    });

    return colored.join("\n");
}

export function emitCliBanner(version: string, options: BannerOptions = {}) {
    if (bannerEmitted) {
        return;
    }
    const argv = options as unknown as string[];
    if (!process.stdout.isTTY) {
        return;
    }
    if (hasJsonFlag(argv)) {
        return;
    }
    if (hasVersionFlag(argv)) {
        return;
    }

    const line = formatCliBannerLine(version, options);
    process.stdout.write(`\n${line}\n\n`);
    bannerEmitted = true;
}

export function hasEmittedCliBanner(): boolean {
    return bannerEmitted;
}
