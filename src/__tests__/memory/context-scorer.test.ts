import { describe, it, expect } from 'vitest';
import {
  calculateFreshness,
  calculateRelevance,
  scoreAndRankContext,
  resolveContradictions,
} from '../../memory/context-scorer.ts';

describe('Context Scorer & Contradiction Resolution (WRAI.TH)', () => {
  it('calculates exponential freshness decaying with age', () => {
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;
    const oneDayAgo = now - 24 * 3600 * 1000;
    const twoDaysAgo = now - 48 * 3600 * 1000;

    const freshNow = calculateFreshness(now, now, 24);
    const fresh1h = calculateFreshness(oneHourAgo, now, 24);
    const fresh24h = calculateFreshness(oneDayAgo, now, 24);
    const fresh48h = calculateFreshness(twoDaysAgo, now, 24);

    expect(freshNow).toBe(1.0);
    expect(fresh1h).toBeLessThan(1.0);
    expect(fresh1h).toBeGreaterThan(fresh24h);
    expect(fresh24h).toBeCloseTo(0.5, 2);
    expect(fresh48h).toBeCloseTo(0.25, 2);
  });

  it('calculates token overlap relevance accurately', () => {
    const content = 'We are configuring Postgres database with connection pool size 20';
    const relevantQuery = 'Postgres database connection';
    const irrelevantQuery = 'Quantum physics photon entanglement';

    const highRel = calculateRelevance(content, relevantQuery);
    const lowRel = calculateRelevance(content, irrelevantQuery);

    expect(highRel).toBe(1.0);
    expect(lowRel).toBe(0.1);
  });

  it('ranks items prioritizing decisions and relevant fresh facts', () => {
    const now = Date.now();
    const items = [
      {
        id: '1',
        category: 'tool_output' as const,
        content: 'npm install exited with code 0',
        timestamp: now - 1000,
      },
      {
        id: '2',
        category: 'decision' as const,
        content: 'Adopt TypeScript for all backend services and API routes',
        timestamp: now - 3600 * 1000,
      },
      {
        id: '3',
        category: 'conversation' as const,
        content: 'Hello, how can I help you today?',
        timestamp: now - 2000,
      },
    ];

    const ranked = scoreAndRankContext(items, 'TypeScript backend API');
    expect(ranked[0]?.id).toBe('2'); // Decision should win due to priority + relevance
    expect(ranked[0]?.finalScore).toBeGreaterThan(ranked[1]?.finalScore ?? 0);
  });

  it('detects and suppresses contradictory / superseded older statements', () => {
    const now = Date.now();
    const items = [
      {
        id: 'old-port',
        category: 'fact' as const,
        content: 'Server port is 3000',
        timestamp: now - 7200 * 1000,
      },
      {
        id: 'new-port',
        category: 'decision' as const,
        content: 'Server port is 8080 due to firewall rule changes',
        timestamp: now - 1000,
      },
      {
        id: 'unrelated',
        category: 'fact' as const,
        content: 'Database host is db.internal',
        timestamp: now - 5000,
      },
    ];

    const ranked = scoreAndRankContext(items, 'server port');
    const oldPortItem = ranked.find((i) => i.id === 'old-port');
    const newPortItem = ranked.find((i) => i.id === 'new-port');

    expect(newPortItem?.finalScore).toBeGreaterThan(0);
    expect(oldPortItem?.isDeprecated).toBe(true);
    expect(oldPortItem?.supersededBy).toBe('new-port');
    expect(oldPortItem?.finalScore).toBe(0);
  });
});
