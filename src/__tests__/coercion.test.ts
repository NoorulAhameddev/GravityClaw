import { describe, it, expect } from 'vitest';
import { coerceToolArgs } from '../tools/coercion.ts';

describe('Tool Argument Coercion (Hermes Parity)', () => {
  const sampleSchema = {
    type: 'object',
    properties: {
      count: { type: 'integer' },
      ratio: { type: 'number' },
      enabled: { type: 'boolean' },
      tags: { type: 'array' },
      metadata: { type: 'object' },
      untyped: {},
    },
  };

  it('should coerce string numbers to numbers/integers', () => {
    const raw = {
      count: '42',
      ratio: '3.14159',
    };
    const coerced = coerceToolArgs('test_tool', sampleSchema, raw);
    expect(coerced.count).toBe(42);
    expect(coerced.ratio).toBe(3.14159);
  });

  it('should coerce boolean strings to actual booleans', () => {
    const raw = {
      enabled: 'true',
    };
    const coerced = coerceToolArgs('test_tool', sampleSchema, raw);
    expect(coerced.enabled).toBe(true);

    const rawFalse = {
      enabled: 'false',
    };
    const coercedFalse = coerceToolArgs('test_tool', sampleSchema, rawFalse);
    expect(coercedFalse.enabled).toBe(false);
  });

  it('should coerce stringified JSON arrays to arrays', () => {
    const raw = {
      tags: '["alpha", "beta", "gamma"]',
    };
    const coerced = coerceToolArgs('test_tool', sampleSchema, raw);
    expect(Array.isArray(coerced.tags)).toBe(true);
    expect(coerced.tags).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('should wrap bare scalar into single-element array if array expected', () => {
    const raw = {
      tags: 'single_tag',
    };
    const coerced = coerceToolArgs('test_tool', sampleSchema, raw);
    expect(coerced.tags).toEqual(['single_tag']);
  });

  it('should parse stringified JSON objects to objects', () => {
    const raw = {
      metadata: '{"env": "production", "version": 2}',
    };
    const coerced = coerceToolArgs('test_tool', sampleSchema, raw);
    expect(typeof coerced.metadata).toBe('object');
    expect(coerced.metadata).toEqual({ env: 'production', version: 2 });
  });

  it('should preserve non-string or already correct types unmodified', () => {
    const raw = {
      count: 100,
      enabled: true,
      tags: ['a', 'b'],
      metadata: { key: 'val' },
    };
    const coerced = coerceToolArgs('test_tool', sampleSchema, raw);
    expect(coerced).toEqual(raw);
  });
});
