import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  saveFact,
  readAllFacts,
  recallFacts,
  loadFactsForPrompt,
  getSessionFactsFilePath,
  setMemoryRootForTests,
  resetMemoryRoot,
} from "../memory/markdown.ts";

describe("Markdown Memory", () => {
  const sessionId = "telegram:12345";
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gravyclaw-memory-"));
    setMemoryRootForTests(tempRoot);
  });

  afterEach(() => {
    resetMemoryRoot();
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("saves facts to markdown file", () => {
    const saved = saveFact(sessionId, "preferences", "User prefers concise responses");

    expect(saved.category).toBe("preferences");
    expect(saved.fact).toBe("User prefers concise responses");

    const filePath = getSessionFactsFilePath(sessionId);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain("[preferences]");
    expect(content).toContain("User prefers concise responses");
  });

  it("sanitizes session id in file path", () => {
    saveFact("telegram:group/42", "project", "Use TypeScript strict mode");
    const filePath = getSessionFactsFilePath("telegram:group/42");
    const sessionFolder = path.basename(path.dirname(filePath));

    expect(sessionFolder).toBe("telegram_group_42");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("reads all saved facts", () => {
    saveFact(sessionId, "preferences", "Use dark mode");
    saveFact(sessionId, "profile", "Timezone is UTC+5:30");

    const facts = readAllFacts(sessionId);
    expect(facts).toHaveLength(2);
    expect(facts[0]?.category).toBe("preferences");
    expect(facts[1]?.category).toBe("profile");
  });

  it("recalls matching facts by query", () => {
    saveFact(sessionId, "preferences", "Use dark mode");
    saveFact(sessionId, "project", "Current branch is feature/memory");
    saveFact(sessionId, "constraints", "No external API calls in air-gapped mode");

    const facts = recallFacts(sessionId, "branch");

    expect(facts).toHaveLength(1);
    expect(facts[0]?.fact).toContain("feature/memory");
  });

  it("limits recall results", () => {
    for (let i = 0; i < 5; i++) {
      saveFact(sessionId, "notes", `Important note ${i}`);
    }

    const facts = recallFacts(sessionId, "important", 3);
    expect(facts).toHaveLength(3);
  });

  it("loads facts for prompt and truncates when needed", () => {
    const longFact = "x".repeat(5000);
    saveFact(sessionId, "notes", longFact);

    const promptFacts = loadFactsForPrompt(sessionId, 300);

    expect(promptFacts.length).toBeLessThanOrEqual(300);
    expect(promptFacts).toContain("[truncated for context window]");
  });

  it("returns empty prompt facts when no file exists", () => {
    const promptFacts = loadFactsForPrompt("missing-session");
    expect(promptFacts).toBe("");
  });

  it("throws when saving empty fact", () => {
    expect(() => saveFact(sessionId, "preferences", "   ")).toThrow("fact is required");
  });
});
