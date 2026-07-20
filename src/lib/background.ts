import { createLogger } from "../logger.ts";
import { telemetryLogger } from "./telemetry/logger.js";

const log = createLogger("background");

interface BackgroundTask {
  id: string;
  name: string;
  sessionId: string;
  promise: Promise<unknown>;
  createdAt: number;
}

const activeTasks = new Map<string, BackgroundTask>();
const MAX_CONCURRENT_BACKGROUND_TASKS = 100;

let taskCounter = 0;

/**
 * Track a background task with proper error handling and telemetry.
 *
 * Unlike fire-and-forget promises, tracked tasks:
 * 1. Log completion/failure with correlation IDs
 * 2. Surface failures to telemetry
 * 3. Prevent unhandled rejections
 * 4. Limit concurrency
 * 5. Provide observability into running background work
 */
export function trackBackgroundTask<T>(
  name: string,
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Enforce concurrency limit
  if (activeTasks.size >= MAX_CONCURRENT_BACKGROUND_TASKS) {
    log.warn(`Background task limit reached (${MAX_CONCURRENT_BACKGROUND_TASKS}), rejecting: ${name}`);
    return Promise.reject(
      new Error(`Too many background tasks running. ${name} was rejected.`),
    );
  }

  const taskId = `${name}-${++taskCounter}-${Date.now()}`;
  const task: BackgroundTask = {
    id: taskId,
    name,
    sessionId,
    promise: Promise.resolve(),
    createdAt: Date.now(),
  };

  const trackedPromise = fn()
    .then((result) => {
      activeTasks.delete(taskId);
      log.debug(`Background task completed: ${name} (${taskId})`);
      return result;
    })
    .catch((err) => {
      activeTasks.delete(taskId);
      const errMsg = err instanceof Error ? err.message : String(err);
      telemetryLogger.error("background_task_failed", {
        task_name: name,
        session_id: sessionId,
        task_id: taskId,
        error: errMsg,
      });
      log.warn(`Background task failed: ${name} — ${errMsg}`);
      // Do NOT rethrow — background task failures should not crash the main flow
      return undefined as T;
    });

  task.promise = trackedPromise;
  activeTasks.set(taskId, task);

  return trackedPromise;
}

/**
 * Wait for all active background tasks to complete (with timeout).
 * Useful during shutdown.
 */
export async function drainBackgroundTasks(timeoutMs = 30_000): Promise<void> {
  const tasks = Array.from(activeTasks.values());
  if (tasks.length === 0) return;

  log.info(`Draining ${tasks.length} background task(s)`);

  const timeout = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error("Background task drain timeout")), timeoutMs),
  );

  await Promise.race([
    Promise.allSettled(tasks.map((t) => t.promise)),
    timeout,
  ]).catch((err) => {
    log.warn(`Background task drain issue: ${err}`);
  });

  activeTasks.clear();
}

export function getBackgroundTaskCount(): number {
  return activeTasks.size;
}
