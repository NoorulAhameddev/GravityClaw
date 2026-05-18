import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ALLOWED = new Set([
  "src\\tools\\executor.ts",
  "src/tools/executor.ts",
]);

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
      files.push(...listFiles(full));
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("tool execution guardrail", () => {
  it("does not allow raw tool.execute calls outside ToolExecutor", () => {
    const roots = [join(ROOT, "src"), join(ROOT, "scripts")];
    const offenders = roots
      .flatMap(listFiles)
      .map((file) => ({
        rel: relative(ROOT, file),
        text: readFileSync(file, "utf8"),
      }))
      .filter(({ rel }) => !rel.includes("src\\__tests__") && !rel.includes("src/__tests__"))
      .filter(({ rel }) => !ALLOWED.has(rel))
      .flatMap(({ rel, text }) => {
        const lines = text.split(/\r?\n/);
        return lines
          .map((line, index) => ({ rel, line, lineNumber: index + 1 }))
          .filter(({ line }) => /\btool\.execute\s*\(/.test(line));
      });

    expect(offenders).toEqual([]);
  });
});
