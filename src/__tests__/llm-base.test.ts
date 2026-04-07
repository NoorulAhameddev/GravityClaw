import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "../llm/base.ts";

describe("LLM system prompt", () => {
  it("includes general knowledge allowance", () => {
    expect(SYSTEM_PROMPT).toContain("general knowledge");
    expect(SYSTEM_PROMPT).toContain("ChatGPT");
    expect(SYSTEM_PROMPT).toContain("chatbot");
    expect(SYSTEM_PROMPT).toContain("general conversational assistant");
  });

  it("maintains local machine safety restriction", () => {
    expect(SYSTEM_PROMPT).toContain("local PC's status");
  });
});
