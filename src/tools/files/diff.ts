import type { Tool } from "../index.js";
import { readFileSync, existsSync } from "fs";
import { createLogger } from "../../logger.js";

const log = createLogger("tool:diff");

function computeDiff(oldLines: string[], newLines: string[]): string {
  const result: string[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldIdx < oldLines.length ? oldLines[oldIdx] : undefined;
    const newLine = newIdx < newLines.length ? newLines[newIdx] : undefined;

    if (oldLine !== undefined && newLine !== undefined && oldLine === newLine) {
      result.push(` ${oldLine}`);
      oldIdx++;
      newIdx++;
    } else {
      if (newLine !== undefined) {
        const foundInOld = oldLines.indexOf(newLine, oldIdx);
        if (foundInOld > oldIdx) {
          while (oldIdx < foundInOld) {
            const line = oldLines[oldIdx];
            if (line !== undefined) result.push(`-${line}`);
            oldIdx++;
          }
          continue;
        }
      }
      if (oldLine !== undefined) {
        const foundInNew = newLines.indexOf(oldLine, newIdx);
        if (foundInNew > newIdx) {
          while (newIdx < foundInNew) {
            const line = newLines[newIdx];
            if (line !== undefined) result.push(`+${line}`);
            newIdx++;
          }
          continue;
        }
      }
      if (oldLine !== undefined) {
        result.push(`-${oldLine}`);
        oldIdx++;
      }
      if (newLine !== undefined) {
        result.push(`+${newLine}`);
        newIdx++;
      }
    }
  }

  return result.join("\n");
}

export const fileDiffTool: Tool = {
  name: "diff_files",
  description: "Compare two files or a file with text and show line-by-line differences",
  inputSchema: {
    type: "object" as const,
    properties: {
      fileA: {
        type: "string",
        description: "Path to the first file (or use contentA instead)",
      },
      fileB: {
        type: "string",
        description: "Path to the second file (or use contentB instead)",
      },
      contentA: {
        type: "string",
        description: "First content string (alternative to fileA)",
      },
      contentB: {
        type: "string",
        description: "Second content string (alternative to fileB)",
      },
      contextLines: {
        type: "number",
        description: "Number of context lines around changes (default: 3)",
        default: 3,
      },
    },
  },
  async execute(input) {
    const fileA = String(input["fileA"] || "");
    const fileB = String(input["fileB"] || "");
    const contentA = String(input["contentA"] || "");
    const contentB = String(input["contentB"] || "");
    const contextLines = Math.max(0, Number(input["contextLines"] ?? 3));

    let textA: string;
    let textB: string;

    if (fileA && existsSync(fileA)) {
      textA = readFileSync(fileA, "utf-8");
    } else if (contentA) {
      textA = contentA;
    } else {
      return "Error: Provide either fileA path or contentA text";
    }

    if (fileB && existsSync(fileB)) {
      textB = readFileSync(fileB, "utf-8");
    } else if (contentB) {
      textB = contentB;
    } else {
      return "Error: Provide either fileB path or contentB text";
    }

    const oldLines = textA.split("\n");
    const newLines = textB.split("\n");

    const diff = computeDiff(oldLines, newLines);
    const changeCount = (diff.match(/^[+-]/gm) || []).length;

    return JSON.stringify({
      fileA: fileA || "(inline)",
      fileB: fileB || "(inline)",
      oldLines: oldLines.length,
      newLines: newLines.length,
      changes: changeCount,
      diff,
    });
  },
};
