import { createLogger } from './logger.ts';
import { config } from './config.ts';

const MAX_CONCURRENT = config.AGENT_MAX_CONCURRENT;
const MAX_QUEUED = 1000;

const log = createLogger('concurrency');

interface SlotWaiter {
  settled: boolean;
  start: () => void;
  fail: (reason: unknown) => void;
}

interface WaitHandle {
  cancel: (reason: unknown) => void;
}

let activeCount = 0;
let pendingCount = 0;

const slotQueue: SlotWaiter[] = [];
const waitHandles = new Set<WaitHandle>();
const sessionTails = new Map<string, Promise<void>>();

function makeShutdownError(): Error {
  return new Error('System shutdown or reset requested');
}

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const waiter: SlotWaiter = {
      settled: false,
      start: () => {
        if (waiter.settled) return;
        waiter.settled = true;
        resolve();
      },
      fail: (reason) => {
        if (waiter.settled) return;
        waiter.settled = true;
        reject(reason);
      },
    };
    slotQueue.push(waiter);
  });
}

function releaseSlot(): void {
  activeCount -= 1;
  while (slotQueue.length > 0) {
    const next = slotQueue.shift();
    if (!next || next.settled) continue;
    next.start();
    break;
  }
}

async function executeAgent<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  activeCount += 1;
  const startTime = Date.now();
  try {
    return await fn();
  } finally {
    releaseSlot();
    log.debug(`Agent session ${sessionId} completed in ${Date.now() - startTime}ms`);
  }
}

function enqueueSessionRun<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  pendingCount += 1;

  let started = false;
  let cancelled = false;

  let resolveExecution!: (value: T | PromiseLike<T>) => void;
  let rejectExecution!: (reason: unknown) => void;
  const execution = new Promise<T>((resolve, reject) => {
    resolveExecution = resolve;
    rejectExecution = reject;
  });

  const handle: WaitHandle = {
    cancel: (reason: unknown) => {
      if (started) return;
      started = true;
      cancelled = true;
      pendingCount -= 1;
      waitHandles.delete(handle);
      rejectExecution(reason);
    },
  };
  waitHandles.add(handle);

  const previous = sessionTails.get(sessionId) ?? Promise.resolve();

  const runner: Promise<T> = previous.then(async (): Promise<T> => {
    if (cancelled) throw makeShutdownError();
    started = true;
    waitHandles.delete(handle);
    pendingCount -= 1;
    if (activeCount >= MAX_CONCURRENT) {
      await acquireSlot();
    }
    return executeAgent(sessionId, fn);
  });

  void runner.then(resolveExecution, rejectExecution);

  const tail = runner.then(
    () => undefined,
    () => undefined,
  );
  sessionTails.set(sessionId, tail);
  void tail.then(() => {
    if (sessionTails.get(sessionId) === tail) {
      sessionTails.delete(sessionId);
    }
  });

  return execution;
}

export function clearSessions(): void {
  log.info(
    `Clearing ${activeCount + pendingCount} sessions (${activeCount} active, ${pendingCount} queued)`,
  );

  for (const handle of [...waitHandles]) {
    handle.cancel(makeShutdownError());
  }
  for (const waiter of slotQueue.splice(0)) {
    waiter.fail(makeShutdownError());
  }
  sessionTails.clear();
}

/**
 * Run a function under true per-session serialization plus a global
 * concurrency cap.
 *
 * Calls sharing the same session key execute strictly one at a time in
 * FIFO arrival order: a call whose key already has a pending or active
 * execution waits for the previous execution to fully complete before
 * competing for a global slot. Across different sessions, at most
 * MAX_CONCURRENT executions run simultaneously; excess requests wait in
 * a global FIFO queue. If total pending executions reach MAX_QUEUED,
 * the incoming call is rejected with a Service Unavailable error.
 */
export async function runWithConcurrencyLimit<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (pendingCount >= MAX_QUEUED) {
    log.warn(`Queue full (${MAX_QUEUED}), rejecting session ${sessionId}`);
    throw new Error('Service Unavailable: Too many requests queued. Please try again later.');
  }

  return enqueueSessionRun(sessionId, fn);
}

export async function runWithLimit<T>(fn: () => Promise<T>): Promise<T> {
  return runWithConcurrencyLimit(`auto-${Date.now()}`, fn);
}

export function getActiveAgentCount(): number {
  return activeCount;
}

export function getQueuedAgentCount(): number {
  return pendingCount;
}

export function getConcurrencyStatus(): { active: number; queued: number; max: number } {
  return {
    active: activeCount,
    queued: pendingCount,
    max: MAX_CONCURRENT,
  };
}
