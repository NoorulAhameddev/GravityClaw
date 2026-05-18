import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import type { GraphEntity, GraphRelationship, GraphQueryResult } from "../types/memory.js";

export type { GraphEntity, GraphRelationship, GraphQueryResult } from "../types/memory.js";

const log = createLogger("graph");

// Table creation is now handled centrally by src/db/migrations/schema.ts

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeEntityName(name: string): string {
  return name.trim();
}

function mapEntityRow(row: {
  id: number;
  session_id: string;
  name: string;
  type: string;
  properties: string;
  access_count?: number;
  last_accessed?: string | null;
}): GraphEntity {
  const entity: GraphEntity = {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    type: row.type,
    properties: parseJson<Record<string, unknown>>(row.properties, {}),
    lastAccessed: row.last_accessed ?? null,
  };

  if (row.access_count !== undefined) {
    entity.accessCount = row.access_count;
  }

  return entity;
}

function touchEntitiesById(sessionId: string, entityIds: number[]): void {
  if (entityIds.length === 0) {
    return;
  }

  const placeholders = entityIds.map(() => "?").join(",");
  db.prepare(
    `
      UPDATE entities
      SET access_count = COALESCE(access_count, 0) + 1,
          last_accessed = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND id IN (${placeholders})
    `
  ).run(sessionId, ...entityIds);
}

function mapRelationshipRow(row: {
  id: number;
  session_id: string;
  from_id: number;
  to_id: number;
  relation_type: string;
  metadata: string;
}): GraphRelationship {
  return {
    id: row.id,
    sessionId: row.session_id,
    fromId: row.from_id,
    toId: row.to_id,
    relationType: row.relation_type,
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
  };
}

export function saveEntity(
  sessionId: string,
  name: string,
  type: string,
  properties: Record<string, unknown> = {}
): GraphEntity {
  const normalizedName = normalizeEntityName(name);
  const normalizedType = type.trim() || "unknown";

  if (!sessionId.trim()) {
    throw new Error("sessionId is required");
  }
  if (!normalizedName) {
    throw new Error("entity name is required");
  }

  const existing = db
    .prepare(
      `SELECT id, session_id, name, type, properties FROM entities WHERE session_id = ? AND name = ?`
    )
    .get(sessionId, normalizedName) as
    | { id: number; session_id: string; name: string; type: string; properties: string }
    | undefined;

  const incomingProps = properties ?? {};
  if (existing) {
    const mergedProperties = {
      ...parseJson<Record<string, unknown>>(existing.properties, {}),
      ...incomingProps,
    };

    db.prepare(
      `
        UPDATE entities
        SET type = ?, properties = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(normalizedType, JSON.stringify(mergedProperties), existing.id);

    const updated = db
      .prepare(`SELECT id, session_id, name, type, properties FROM entities WHERE id = ?`)
      .get(existing.id) as {
      id: number;
      session_id: string;
      name: string;
      type: string;
      properties: string;
    };

    return mapEntityRow(updated);
  }

  const insert = db
    .prepare(`INSERT INTO entities (session_id, name, type, properties) VALUES (?, ?, ?, ?)`)
    .run(sessionId, normalizedName, normalizedType, JSON.stringify(incomingProps));

  const created = db
    .prepare(`SELECT id, session_id, name, type, properties FROM entities WHERE id = ?`)
    .get(insert.lastInsertRowid) as {
    id: number;
    session_id: string;
    name: string;
    type: string;
    properties: string;
  };

  return mapEntityRow(created);
}

export function getEntityByName(sessionId: string, name: string): GraphEntity | null {
  const normalizedName = normalizeEntityName(name);
  const row = db
    .prepare(`SELECT id, session_id, name, type, properties, access_count, last_accessed FROM entities WHERE session_id = ? AND name = ?`)
    .get(sessionId, normalizedName) as
    | {
        id: number;
        session_id: string;
        name: string;
        type: string;
        properties: string;
        access_count: number;
        last_accessed: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  touchEntitiesById(sessionId, [row.id]);

  const refreshed = db
    .prepare(`SELECT id, session_id, name, type, properties, access_count, last_accessed FROM entities WHERE id = ?`)
    .get(row.id) as {
    id: number;
    session_id: string;
    name: string;
    type: string;
    properties: string;
    access_count: number;
    last_accessed: string | null;
  };

  return mapEntityRow(refreshed);
}

export function saveRelationship(
  sessionId: string,
  entity1Name: string,
  relationType: string,
  entity2Name: string,
  metadata: Record<string, unknown> = {}
): GraphRelationship {
  if (!sessionId.trim()) {
    throw new Error("sessionId is required");
  }

  const normalizedRelationType = relationType.trim();
  if (!normalizedRelationType) {
    throw new Error("relation type is required");
  }

  const entity1 = saveEntity(sessionId, entity1Name, "unknown");
  const entity2 = saveEntity(sessionId, entity2Name, "unknown");

  const existing = db
    .prepare(
      `
      SELECT id, session_id, from_id, to_id, relation_type, metadata
      FROM relationships
      WHERE session_id = ? AND from_id = ? AND to_id = ? AND relation_type = ?
      `
    )
    .get(sessionId, entity1.id, entity2.id, normalizedRelationType) as
    | {
        id: number;
        session_id: string;
        from_id: number;
        to_id: number;
        relation_type: string;
        metadata: string;
      }
    | undefined;

  if (existing) {
    const mergedMetadata = {
      ...parseJson<Record<string, unknown>>(existing.metadata, {}),
      ...metadata,
    };

    db.prepare(`UPDATE relationships SET metadata = ? WHERE id = ?`).run(
      JSON.stringify(mergedMetadata),
      existing.id
    );

    const updated = db
      .prepare(
        `SELECT id, session_id, from_id, to_id, relation_type, metadata FROM relationships WHERE id = ?`
      )
      .get(existing.id) as {
      id: number;
      session_id: string;
      from_id: number;
      to_id: number;
      relation_type: string;
      metadata: string;
    };

    return mapRelationshipRow(updated);
  }

  const insert = db
    .prepare(
      `INSERT INTO relationships (session_id, from_id, to_id, relation_type, metadata) VALUES (?, ?, ?, ?, ?)`
    )
    .run(sessionId, entity1.id, entity2.id, normalizedRelationType, JSON.stringify(metadata));

  const created = db
    .prepare(
      `SELECT id, session_id, from_id, to_id, relation_type, metadata FROM relationships WHERE id = ?`
    )
    .get(insert.lastInsertRowid) as {
    id: number;
    session_id: string;
    from_id: number;
    to_id: number;
    relation_type: string;
    metadata: string;
  };

  return mapRelationshipRow(created);
}

export function queryGraph(sessionId: string, entityName: string, depth = 2): GraphQueryResult | null {
  const root = getEntityByName(sessionId, entityName);
  if (!root) {
    return null;
  }

  const maxDepth = Math.max(1, Math.min(5, Math.floor(depth)));
  const visited = new Set<number>([root.id]);
  const entityDepth = new Map<number, number>([[root.id, 0]]);
  const relationshipIds = new Set<number>();

  let frontier: number[] = [root.id];

  for (let currentDepth = 1; currentDepth <= maxDepth; currentDepth++) {
    if (frontier.length === 0) {
      break;
    }

    const placeholders = frontier.map(() => "?").join(",");
    const relRows = db
      .prepare(
        `
        SELECT id, session_id, from_id, to_id, relation_type, metadata
        FROM relationships
        WHERE session_id = ?
          AND (from_id IN (${placeholders}) OR to_id IN (${placeholders}))
      `
      )
      .all(sessionId, ...frontier, ...frontier) as Array<{
      id: number;
      session_id: string;
      from_id: number;
      to_id: number;
      relation_type: string;
      metadata: string;
    }>;

    const nextFrontier: number[] = [];

    for (const row of relRows) {
      relationshipIds.add(row.id);

      const neighbors = [row.from_id, row.to_id];
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          entityDepth.set(neighborId, currentDepth);
          nextFrontier.push(neighborId);
        }
      }
    }

    frontier = nextFrontier;
  }

  const entityIds = [...visited];
  const entityPlaceholders = entityIds.map(() => "?").join(",");
  const entitiesRows = db
    .prepare(
      `SELECT id, session_id, name, type, properties, access_count, last_accessed FROM entities WHERE session_id = ? AND id IN (${entityPlaceholders})`
    )
    .all(sessionId, ...entityIds) as Array<{
    id: number;
    session_id: string;
    name: string;
    type: string;
    properties: string;
    access_count: number;
    last_accessed: string | null;
  }>;

  const relIdList = [...relationshipIds];
  const relationshipsRows =
    relIdList.length > 0
      ? (db
          .prepare(
            `SELECT id, session_id, from_id, to_id, relation_type, metadata FROM relationships WHERE session_id = ? AND id IN (${relIdList
              .map(() => "?")
              .join(",")})`
          )
          .all(sessionId, ...relIdList) as Array<{
          id: number;
          session_id: string;
          from_id: number;
          to_id: number;
          relation_type: string;
          metadata: string;
        }>)
      : [];

  const entities = entitiesRows.map(mapEntityRow);
  const relationships = relationshipsRows.map(mapRelationshipRow);

  touchEntitiesById(sessionId, entityIds);

  entities.sort((a, b) => {
    const da = entityDepth.get(a.id) ?? 99;
    const dbDepth = entityDepth.get(b.id) ?? 99;
    if (da !== dbDepth) {
      return da - dbDepth;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    rootEntity: root,
    depth: maxDepth,
    entities,
    relationships,
  };
}

export function formatGraphAsMermaid(result: GraphQueryResult): string {
  const entityMap = new Map<number, GraphEntity>(result.entities.map((e) => [e.id, e]));

  const escapeLabel = (value: string): string =>
    value.replace(/"/g, "'").replace(/\n/g, " ").trim();

  const lines: string[] = ["graph TD"];

  for (const entity of result.entities) {
    const nodeId = `E${entity.id}`;
    const label = escapeLabel(`${entity.name} (${entity.type})`);
    lines.push(`  ${nodeId}["${label}"]`);
  }

  for (const rel of result.relationships) {
    const from = entityMap.get(rel.fromId);
    const to = entityMap.get(rel.toId);
    if (!from || !to) {
      continue;
    }
    const fromNode = `E${from.id}`;
    const toNode = `E${to.id}`;
    const relLabel = escapeLabel(rel.relationType);
    lines.push(`  ${fromNode} -->|"${relLabel}"| ${toNode}`);
  }

  return lines.join("\n");
}
