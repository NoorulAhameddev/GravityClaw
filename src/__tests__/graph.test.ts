import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db.ts";
import {
  saveEntity,
  getEntityByName,
  saveRelationship,
  queryGraph,
  formatGraphAsMermaid,
} from "../memory/graph.ts";

const SESSION_A = "graph:test:a";
const SESSION_B = "graph:test:b";

describe("Knowledge Graph Memory", () => {
  beforeEach(() => {
    db.prepare("DELETE FROM relationships WHERE session_id IN (?, ?)").run(SESSION_A, SESSION_B);
    db.prepare("DELETE FROM entities WHERE session_id IN (?, ?)").run(SESSION_A, SESSION_B);
  });

  afterEach(() => {
    db.prepare("DELETE FROM relationships WHERE session_id IN (?, ?)").run(SESSION_A, SESSION_B);
    db.prepare("DELETE FROM entities WHERE session_id IN (?, ?)").run(SESSION_A, SESSION_B);
  });

  it("saves and retrieves an entity", () => {
    const saved = saveEntity(SESSION_A, "GravityClaw", "project", { language: "TypeScript" });

    expect(saved.name).toBe("GravityClaw");
    expect(saved.type).toBe("project");
    expect(saved.properties.language).toBe("TypeScript");

    const loaded = getEntityByName(SESSION_A, "GravityClaw");
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe("GravityClaw");
  });

  it("upserts entity and merges properties", () => {
    saveEntity(SESSION_A, "Noor", "person", { timezone: "IST" });
    const updated = saveEntity(SESSION_A, "Noor", "person", { role: "developer" });

    expect(updated.properties.timezone).toBe("IST");
    expect(updated.properties.role).toBe("developer");

    const count = db
      .prepare("SELECT COUNT(*) as c FROM entities WHERE session_id = ? AND name = ?")
      .get(SESSION_A, "Noor") as { c: number };
    expect(count.c).toBe(1);
  });

  it("creates relationships and auto-creates missing entities", () => {
    const rel = saveRelationship(SESSION_A, "Noor", "works_on", "GravityClaw", { since: "2026" });

    expect(rel.relationType).toBe("works_on");

    const noor = getEntityByName(SESSION_A, "Noor");
    const project = getEntityByName(SESSION_A, "GravityClaw");

    expect(noor).not.toBeNull();
    expect(project).not.toBeNull();
  });

  it("queries graph by depth", () => {
    saveRelationship(SESSION_A, "Noor", "works_on", "GravityClaw");
    saveRelationship(SESSION_A, "GravityClaw", "uses", "OpenRouter");
    saveRelationship(SESSION_A, "OpenRouter", "supports", "gpt-4o");

    const depth1 = queryGraph(SESSION_A, "Noor", 1);
    expect(depth1).not.toBeNull();
    expect(depth1?.entities.some((e) => e.name === "GravityClaw")).toBe(true);
    expect(depth1?.entities.some((e) => e.name === "OpenRouter")).toBe(false);

    const depth2 = queryGraph(SESSION_A, "Noor", 2);
    expect(depth2?.entities.some((e) => e.name === "OpenRouter")).toBe(true);
  });

  it("isolates graph data by session", () => {
    saveRelationship(SESSION_A, "Noor", "works_on", "GravityClaw");
    saveRelationship(SESSION_B, "OtherUser", "works_on", "OtherProject");

    const a = queryGraph(SESSION_A, "Noor", 2);
    const b = queryGraph(SESSION_B, "OtherUser", 2);

    expect(a?.entities.some((e) => e.name === "OtherUser")).toBe(false);
    expect(b?.entities.some((e) => e.name === "Noor")).toBe(false);
  });

  it("formats query result as Mermaid", () => {
    saveRelationship(SESSION_A, "Noor", "works_on", "GravityClaw");

    const result = queryGraph(SESSION_A, "Noor", 2);
    expect(result).not.toBeNull();

    const mermaid = formatGraphAsMermaid(result!);
    expect(mermaid).toContain("graph TD");
    expect(mermaid).toContain("works_on");
    expect(mermaid).toContain("Noor");
    expect(mermaid).toContain("GravityClaw");
  });

  it("returns null when root entity does not exist", () => {
    const result = queryGraph(SESSION_A, "MissingEntity", 2);
    expect(result).toBeNull();
  });
});
