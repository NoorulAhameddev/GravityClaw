/**
 * Tool Argument Coercion — Modeled directly on Hermes Agent (arg_coercion.py)
 * 
 * Automatically repairs string-typed or slightly malformed values emitted by LLMs
 * against a tool's JSON Schema (e.g. "42" for numbers, "true" for booleans,
 * JSON-stringified objects/arrays, and scalar items where an array is expected).
 */

import { createLogger } from '../logger.ts';

const log = createLogger('arg-coercion');

export interface JSONSchemaProperty {
  type?: string | string[];
  description?: string;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  anyOf?: JSONSchemaProperty[];
  oneOf?: JSONSchemaProperty[];
}

export interface ToolSchema {
  type?: string | undefined;
  properties?: Record<string, unknown> | undefined;
  required?: string[] | undefined;
}

function coerceValue(
  value: unknown,
  expectedType: string,
  propSchema?: JSONSchemaProperty,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Boolean coercion
  if (expectedType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      if (lower === 'false' || lower === '0' || lower === 'no') return false;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return value;
  }

  // Number / Integer coercion
  if (expectedType === 'number' || expectedType === 'integer') {
    if (typeof value === 'number') {
      return expectedType === 'integer' ? Math.floor(value) : value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const num = Number(trimmed);
      if (!Number.isNaN(num) && trimmed !== '') {
        return expectedType === 'integer' ? Math.floor(num) : num;
      }
    }
    return value;
  }

  // Array coercion
  if (expectedType === 'array') {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Fall through to single-element array
        }
      }
      if (trimmed === 'null') return [];
      return [value];
    }
    return [value];
  }

  // Object coercion
  if (expectedType === 'object') {
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          // Fall through to original value
        }
      }
    }
    return value;
  }

  // String coercion
  if (expectedType === 'string') {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
  }

  return value;
}

export function coerceToolArgs(
  toolName: string,
  schema: ToolSchema | undefined,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return args;
  }

  if (!schema || !schema.properties) {
    return args;
  }

  const result: Record<string, unknown> = { ...args };
  const properties = schema.properties;

  for (const [key, value] of Object.entries(result)) {
    const propSchema = properties[key] as JSONSchemaProperty | undefined;
    if (!propSchema) {
      continue;
    }

    const expected = Array.isArray(propSchema.type)
      ? propSchema.type[0]
      : propSchema.type;

    if (!expected) {
      continue;
    }

    const coerced = coerceValue(value, expected, propSchema);
    if (coerced !== value) {
      log.debug(`Coerced arg [${toolName}.${key}]:`, { from: typeof value, to: typeof coerced });
      result[key] = coerced;
    }
  }

  return result;
}
