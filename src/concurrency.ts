import { createLogger } from "./logger.ts";
import { config } from "./config.ts";

const MAX_CONCURRENT = config.AGENT_MAX_CONCURRENT;
const MAX_QUEUED = 1000;

const log = createLogger("concurrency");

interface QueuedItem {
  sessionId: string;
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

interface ActiveAgent {
  sessionId: string;
  startTime: number;
}

const activeAgents = new Map<string, ActiveAgent>();
const pendingQueue: QueuedItem[] = [];

export function clearSessions(): void {
  const count = activeAgents.size + pendingQueue.length;
  log.info(`Clearing ${count} sessions (${activeAgents.size} active, ${pendingQueue.length} queued)`);

  for (const item of pendingQueue) {
    item.reject(new Error("System shutdown or reset requested"));
  }
  pendingQueue.length = 0;
  activeAgents.clear();
}

function processQueue(): void {
  if (pendingQueue.length === 0) return;
  if (activeAgents.size >= MAX_CONCURRENT) return;

  const next = pendingQueue.shift();
  if (!next) return;

  executeAgent(next.sessionId, next.fn).then(next.resolve).catch(next.reject);
}

async function executeAgent(
  sessionId: string,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  const startTime = Date.now();
  const active: ActiveAgent = { sessionId, startTime };

  activeAgents.set(sessionId, active);

  try {
    const result = await fn();
    return result;
  } finally {
    activeAgents.delete(sessionId);
    const duration = Date.now() - startTime;
    log.debug(`Agent session ${sessionId} completed in ${duration}ms`);
    processQueue();
  }
}

/**
 * Run a function with per-session concurrency limiting.
 *
 * If the maximum number of concurrent agents is reached, the request
 * is queued. If the queue exceeds MAX_QUEUED, the promise is rejected
 * with a 503 Service Unavailable error.
 */
export async function runWithConcurrencyLimit<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (activeAgents.size >= MAX_CONCURRENT) {
    if (pendingQueue.length >= MAX_QUEUED) {
      log.warn(`Queue full (${MAX_QUEUED}), rejecting session ${sessionId}`);
      throw new Error("Service Unavailable: Too many requests queued. Please try again later.");
    }

    log.warn(
      `Max concurrent agents (${MAX_CONCURRENT}) reached, queueing session ${sessionId} (queue: ${pendingQueue.length + 1})`,
    );

    return new Promise<T>((resolve, reject) => {
      pendingQueue.push({
        sessionId,
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
  }

  return executeAgent(sessionId, fn as () => Promise<unknown>) as Promise<T>;
}

export async function runWithLimit<T>(fn: () => Promise<T>): Promise<T> {
  return runWithConcurrencyLimit(`auto-${Date.now()}`, fn);
}

export function getActiveAgentCount(): number {
  return activeAgents.size;
}

export function getQueuedAgentCount(): number {
  return pendingQueue.length;
}

export function getConcurrencyStatus(): { active: number; queued: number; max: number } {
  return {
    active: activeAgents.size,
    queued: pendingQueue.length,
    max: MAX_CONCURRENT,
  };
}
