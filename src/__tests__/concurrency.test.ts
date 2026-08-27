import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runWithConcurrencyLimit,
  runWithLimit,
  clearSessions,
  getActiveAgentCount,
  getQueuedAgentCount,
  getConcurrencyStatus,
} from '../concurrency.ts';
import { config } from '../config.ts';

interface Gate<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const gateReleases: Array<() => void> = [];

function makeGate<T = void>(): Gate<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  gateReleases.push(() => (resolve as (value?: T) => void)());
  return { promise, resolve, reject };
}

function fire<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const p = runWithConcurrencyLimit(key, fn);
  p.catch(() => {});
  return p;
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const WAIT_OPTS = { timeout: 8000, interval: 5 } as const;

const SHUTDOWN_MESSAGE = 'System shutdown or reset requested';
const QUEUE_FULL_MESSAGE = 'Service Unavailable: Too many requests queued. Please try again later.';

describe('Concurrency layer', () => {
  let seq = 0;
  const nextKey = (prefix: string): string => `test-concurrency:${prefix}:${++seq}`;

  beforeEach(() => {
    expect(getActiveAgentCount()).toBe(0);
    expect(getQueuedAgentCount()).toBe(0);
  });

  afterEach(async () => {
    for (const release of gateReleases.splice(0)) release();
    await vi.waitFor(
      () => {
        expect(getActiveAgentCount()).toBe(0);
        expect(getQueuedAgentCount()).toBe(0);
      },
      { timeout: 5000, interval: 5 },
    ).catch(() => {});
    clearSessions();
  });

  describe('same-key serialization', () => {
    it('starts the second same-key call only after the first fully settles', async () => {
      const key = nextKey('serial-two');
      const events: string[] = [];
      const gate = makeGate<void>();

      const first = fire(key, async () => {
        events.push('first:start');
        await gate.promise;
        events.push('first:end');
        return 'one';
      });
      const second = fire(key, async () => {
        events.push('second:start');
        return 'two';
      });

      await vi.waitFor(() => expect(events).toContain('first:start'), WAIT_OPTS);
      expect(getQueuedAgentCount()).toBe(1);
      expect(getActiveAgentCount()).toBe(1);

      await tick();
      await tick();
      expect(events).not.toContain('second:start');

      gate.resolve();

      expect(await first).toBe('one');
      expect(await second).toBe('two');
      expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    });

    it('runs more than two same-key calls in strict FIFO arrival order', async () => {
      const key = nextKey('fifo-three');
      const order: string[] = [];
      const gateA = makeGate<void>();
      const gateB = makeGate<void>();

      const a = fire(key, async () => {
        order.push('a');
        await gateA.promise;
        order.push('a:done');
      });
      const b = fire(key, async () => {
        order.push('b');
        await gateB.promise;
        order.push('b:done');
      });
      const c = fire(key, async () => {
        order.push('c');
        return 'c-result';
      });

      await vi.waitFor(() => expect(order).toEqual(['a']), WAIT_OPTS);

      gateA.resolve();
      await vi.waitFor(() => expect(order).toEqual(['a', 'a:done', 'b']), WAIT_OPTS);

      await tick();
      await tick();
      expect(order).not.toContain('c');

      gateB.resolve();

      expect(await c).toBe('c-result');
      await Promise.all([a, b]);
      expect(order).toEqual(['a', 'a:done', 'b', 'b:done', 'c']);
    });
  });

  describe('cross-key parallelism', () => {
    it('runs different-key calls concurrently while both are blocked', async () => {
      const keyA = nextKey('cross-a');
      const keyB = nextKey('cross-b');
      const gateA = makeGate<void>();
      const gateB = makeGate<void>();
      let aStarted = false;
      let bStarted = false;

      const pa = fire(keyA, async () => {
        aStarted = true;
        await gateA.promise;
        return 'a';
      });
      const pb = fire(keyB, async () => {
        bStarted = true;
        await gateB.promise;
        return 'b';
      });

      await vi.waitFor(() => expect(aStarted && bStarted).toBe(true), WAIT_OPTS);

      expect(getActiveAgentCount()).toBe(2);
      expect(getConcurrencyStatus().active).toBe(2);

      gateA.resolve();
      gateB.resolve();

      expect(await Promise.all([pa, pb])).toEqual(['a', 'b']);
      expect(getActiveAgentCount()).toBe(0);
    });
  });

  describe('global concurrency cap', () => {
    it('parks excess calls until a slot frees up', async () => {
      const max = getConcurrencyStatus().max;
      expect(max).toBeGreaterThan(0);

      const releases: Array<() => void> = [];
      const running: Array<Promise<void>> = [];
      for (let i = 0; i < max; i++) {
        const gate = makeGate<void>();
        releases.push(() => gate.resolve());
        running.push(
          fire(nextKey(`cap-fill-${i}`), async () => {
            await gate.promise;
          }),
        );
      }

      await vi.waitFor(() => expect(getActiveAgentCount()).toBe(max), WAIT_OPTS);
      expect(getQueuedAgentCount()).toBe(0);

      let overflowStarted = false;
      const overflowGate = makeGate<void>();
      const overflow = fire(nextKey('cap-overflow'), async () => {
        overflowStarted = true;
        await overflowGate.promise;
      });

      expect(getQueuedAgentCount()).toBe(1);

      await tick();
      await tick();
      expect(overflowStarted).toBe(false);
      expect(getActiveAgentCount()).toBe(max);

      releases[0]?.();
      await running[0]!;

      await vi.waitFor(() => expect(overflowStarted).toBe(true), WAIT_OPTS);
      expect(getActiveAgentCount()).toBe(max);
      expect(getQueuedAgentCount()).toBe(0);

      overflowGate.resolve();
      for (const release of releases.slice(1)) release();
      await Promise.all(running);
      await overflow;

      expect(getActiveAgentCount()).toBe(0);
      expect(getQueuedAgentCount()).toBe(0);
    });

    it('rejects with Service Unavailable once 1000 entries are queued on a key', async () => {
      const key = nextKey('queue-cap');
      const headGate = makeGate<void>();
      const head = fire(key, async () => {
        await headGate.promise;
      });

      await vi.waitFor(() => expect(getActiveAgentCount()).toBe(1), WAIT_OPTS);

      const queued: Array<Promise<string>> = [];
      for (let i = 0; i < 1000; i++) {
        queued.push(
          fire(key, async () => {
            await Promise.resolve();
            return `ok-${i}`;
          }),
        );
      }

      await vi.waitFor(() => expect(getQueuedAgentCount()).toBe(1000), WAIT_OPTS);
      expect(getActiveAgentCount()).toBe(1);

      await expect(runWithConcurrencyLimit(key, async () => 'late')).rejects.toThrow(
        QUEUE_FULL_MESSAGE,
      );

      headGate.resolve();

      const results = await Promise.all(queued);
      expect(results).toHaveLength(1000);
      expect(results.every((r) => r.startsWith('ok-'))).toBe(true);

      await vi.waitFor(
        () => {
          expect(getActiveAgentCount()).toBe(0);
          expect(getQueuedAgentCount()).toBe(0);
        },
        WAIT_OPTS,
      );
    }, 15000);
  });

  describe('clearSessions', () => {
    it('rejects queued same-key calls but lets the running call finish', async () => {
      const key = nextKey('clear-mixed');
      const gate = makeGate<void>();

      const running = fire(key, async () => {
        await gate.promise;
        return 'ran';
      });
      await vi.waitFor(() => expect(getActiveAgentCount()).toBe(1), WAIT_OPTS);

      const queued = fire(key, async () => 'never-runs');
      expect(getQueuedAgentCount()).toBe(1);

      clearSessions();

      await expect(queued).rejects.toThrow(SHUTDOWN_MESSAGE);

      gate.resolve();

      await expect(running).resolves.toBe('ran');

      await vi.waitFor(() => expect(getActiveAgentCount()).toBe(0), WAIT_OPTS);
      expect(getQueuedAgentCount()).toBe(0);
    });

    it('fails slot-parked calls and lets saturated active calls finish', async () => {
      const max = getConcurrencyStatus().max;

      const releases: Array<() => void> = [];
      const running: Array<Promise<number>> = [];
      for (let i = 0; i < max; i++) {
        const gate = makeGate<void>();
        releases.push(() => gate.resolve());
        const index = i;
        running.push(
          fire(nextKey(`clear-sat-${index}`), async () => {
            await gate.promise;
            return index;
          }),
        );
      }

      await vi.waitFor(() => expect(getActiveAgentCount()).toBe(max), WAIT_OPTS);

      let waiterStarted = false;
      const waiter = fire(nextKey('clear-slot-waiter'), async () => {
        waiterStarted = true;
        return 'waiter';
      });
      await tick();
      await tick();
      expect(waiterStarted).toBe(false);

      clearSessions();

      await expect(waiter).rejects.toThrow(SHUTDOWN_MESSAGE);

      for (const release of releases) release();

      const settled = await Promise.all(running);
      expect(settled).toEqual(Array.from({ length: max }, (_, i) => i));

      await vi.waitFor(() => expect(getActiveAgentCount()).toBe(0), WAIT_OPTS);
      expect(waiterStarted).toBe(false);
      expect(getQueuedAgentCount()).toBe(0);
    });
  });

  describe('slot refcount accounting', () => {
    it('drains counters back to baseline after a mixed burst across many keys', async () => {
      const max = getConcurrencyStatus().max;

      const gates = Array.from({ length: max }, () => makeGate<void>());
      const activePart = gates.map((gate, i) =>
        fire(nextKey(`burst-active-${i}`), async () => {
          await gate.promise;
          return `a-${i}`;
        }),
      );

      await vi.waitFor(() => expect(getActiveAgentCount()).toBe(max), WAIT_OPTS);

      const overflowPart = Array.from({ length: 2 * max }, (_, i) =>
        fire(nextKey(`burst-overflow-${i}`), async () => `o-${i}`),
      );

      await vi.waitFor(() => expect(getQueuedAgentCount()).toBe(0), WAIT_OPTS);
      expect(getActiveAgentCount()).toBe(max);
      expect(getActiveAgentCount()).toBeLessThanOrEqual(max);

      for (const gate of gates) gate.resolve();

      const all = await Promise.all([...activePart, ...overflowPart]);
      expect(all).toHaveLength(3 * max);

      expect(getActiveAgentCount()).toBe(0);
      expect(getQueuedAgentCount()).toBe(0);

      const status = getConcurrencyStatus();
      expect(status).toEqual({
        active: 0,
        queued: 0,
        max: config.AGENT_MAX_CONCURRENT,
      });
    });

    it('executes a bare function via runWithLimit without a session key', async () => {
      await expect(runWithLimit(async () => 'bare')).resolves.toBe('bare');
      await vi.waitFor(() => expect(getActiveAgentCount()).toBe(0), WAIT_OPTS);
    });
  });

  describe('error propagation', () => {
    it('propagates the failure and does not wedge the same key', async () => {
      const key = nextKey('error-simple');

      await expect(
        fire(key, async () => {
          throw new Error('kaboom');
        }),
      ).rejects.toThrow('kaboom');

      await expect(fire(key, async () => 'after-failure')).resolves.toBe('after-failure');

      expect(getActiveAgentCount()).toBe(0);
      expect(getQueuedAgentCount()).toBe(0);
    });

    it('lets later same-key calls proceed after an intermediate failure', async () => {
      const key = nextKey('error-chain');
      const gate = makeGate<void>();
      const order: string[] = [];

      const a = fire(key, async () => {
        order.push('a');
        await gate.promise;
      });
      const b = fire(key, async () => {
        order.push('b');
        throw new Error('mid-chain failure');
      });
      const c = fire(key, async () => {
        order.push('c');
        return 'c-ok';
      });

      await vi.waitFor(() => expect(order).toEqual(['a']), WAIT_OPTS);

      gate.resolve();

      await expect(b).rejects.toThrow('mid-chain failure');
      await expect(c).resolves.toBe('c-ok');
      await a;

      expect(order).toEqual(['a', 'b', 'c']);
      expect(getActiveAgentCount()).toBe(0);
      expect(getQueuedAgentCount()).toBe(0);
    });
  });
});
