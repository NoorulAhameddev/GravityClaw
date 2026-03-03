import type { Tool } from "./index.ts";
import {
  saveEntity,
  saveRelationship,
  queryGraph,
  formatGraphAsMermaid,
} from "../../memory/graph.ts";

function getSessionIdFromInput(input: Record<string, unknown>): string {
  return String(input["__sessionId"] ?? "").trim();
}

function parseObjectField(input: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = input[field];
  if (!value) {
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export const saveEntityTool: Tool = {
  name: "save_entity",
  description:
    "Saves or updates a knowledge-graph entity for this session. Use for people, projects, systems, concepts, and durable structured context.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Entity name" },
      type: { type: "string", description: "Entity type (person, project, org, concept, etc.)" },
      properties: {
        type: "object",
        description: "Optional entity metadata object",
      },
    },
    required: ["name", "type"],
  },
  async execute(input) {
    const sessionId = getSessionIdFromInput(input);
    if (!sessionId) {
      return "Error: save_entity requires active session context.";
    }

    const name = String(input["name"] ?? "");
    const type = String(input["type"] ?? "unknown");
    const properties = parseObjectField(input, "properties");

    try {
      const entity = saveEntity(sessionId, name, type, properties);
      return JSON.stringify({ ok: true, entity });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return `Error saving entity: ${message}`;
    }
  },
};

export const saveRelationshipTool: Tool = {
  name: "save_relationship",
  description:
    "Creates or updates a relationship edge between two entities in the session knowledge graph.",
  inputSchema: {
    type: "object",
    properties: {
      entity1: { type: "string", description: "Source entity name" },
      relation: { type: "string", description: "Relationship type (e.g., works_on, depends_on, prefers)" },
      entity2: { type: "string", description: "Target entity name" },
      metadata: { type: "object", description: "Optional relationship metadata object" },
    },
    required: ["entity1", "relation", "entity2"],
  },
  async execute(input) {
    const sessionId = getSessionIdFromInput(input);
    if (!sessionId) {
      return "Error: save_relationship requires active session context.";
    }

    const entity1 = String(input["entity1"] ?? "");
    const relation = String(input["relation"] ?? "");
    const entity2 = String(input["entity2"] ?? "");
    const metadata = parseObjectField(input, "metadata");

    try {
      const relationship = saveRelationship(sessionId, entity1, relation, entity2, metadata);
      return JSON.stringify({ ok: true, relationship });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return `Error saving relationship: ${message}`;
    }
  },
};

export const queryGraphTool: Tool = {
  name: "query_graph",
  description:
    "Queries the session knowledge graph starting from an entity name and traversing connected relationships to a specified depth.",
  inputSchema: {
    type: "object",
    properties: {
      entity: { type: "string", description: "Root entity name to query" },
      depth: { type: "number", description: "Traversal depth (1-5, default 2)" },
    },
    required: ["entity"],
  },
  async execute(input) {
    const sessionId = getSessionIdFromInput(input);
    if (!sessionId) {
      return "Error: query_graph requires active session context.";
    }

    const entity = String(input["entity"] ?? "");
    const depthInput = Number(input["depth"] ?? 2);
    const depth = Number.isFinite(depthInput) ? depthInput : 2;

    const result = queryGraph(sessionId, entity, depth);
    if (!result) {
      return JSON.stringify({ ok: false, message: `Entity not found: ${entity}` });
    }

    return JSON.stringify({
      ok: true,
      result,
      mermaid: formatGraphAsMermaid(result),
    });
  },
};
