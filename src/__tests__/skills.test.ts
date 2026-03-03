import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { skillManagementTools, skillsManager } from "../skills/index.ts";

describe("Skills System", () => {
  const listSkillsTool = skillManagementTools.find(
    (t) => t.name === "list_skills"
  );
  const loadSkillTool = skillManagementTools.find((t) => t.name === "load_skill");
  const disableSkillTool = skillManagementTools.find(
    (t) => t.name === "disable_skill"
  );
  const reloadSkillsTool = skillManagementTools.find(
    (t) => t.name === "reload_skills"
  );

  beforeAll(async () => {
    await skillsManager.initialize();
  });

  afterAll(async () => {
    await skillsManager.shutdown();
  });

  it("should export 4 skill management tools", () => {
    expect(skillManagementTools).toHaveLength(4);
    expect(listSkillsTool).toBeDefined();
    expect(loadSkillTool).toBeDefined();
    expect(disableSkillTool).toBeDefined();
    expect(reloadSkillsTool).toBeDefined();
  });

  it("should list available skills", async () => {
    const result = await listSkillsTool!.execute({});
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.skills)).toBe(true);
    expect(parsed.count).toBeGreaterThanOrEqual(2);

    const names = parsed.skills.map((s: { name: string }) => s.name);
    expect(names).toContain("weather");
    expect(names).toContain("calculator");
  });

  it("should validate load_skill input", async () => {
    const result = await loadSkillTool!.execute({});
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("name_or_path");
  });

  it("should fail loading non-existent skill", async () => {
    const result = await loadSkillTool!.execute({
      name_or_path: "definitely-not-a-real-skill",
    });
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("not found");
  });

  it("should validate disable_skill input", async () => {
    const result = await disableSkillTool!.execute({});
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("skill_name");
  });

  it("should disable an existing skill", async () => {
    const disableResult = await disableSkillTool!.execute({
      skill_name: "weather",
    });
    const parsedDisable = JSON.parse(disableResult);

    expect(parsedDisable.success).toBe(true);

    const listResult = await listSkillsTool!.execute({});
    const parsedList = JSON.parse(listResult);
    const weather = parsedList.skills.find((s: { name: string }) => s.name === "weather");

    expect(weather).toBeDefined();
    expect(weather.enabled).toBe(false);
  });

  it("should reload skills from disk", async () => {
    const result = await reloadSkillsTool!.execute({});
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain("Reloaded");
  });

  it("should generate executable tools for loaded skills", async () => {
    await reloadSkillsTool!.execute({});
    const tools = skillsManager.getSkillTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("get_current_weather");
    expect(toolNames).toContain("get_forecast");
    expect(toolNames).toContain("calculate_expression");
    expect(toolNames).toContain("solve_equation");
  });

  it("should parse skill markdown files from skills directory", () => {
    const skillsDir = path.join(process.cwd(), "skills");
    const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith(".md"));

    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files).toContain("example-weather.md");
    expect(files).toContain("example-calculator.md");
  });
});
