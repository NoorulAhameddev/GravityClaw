import { afterEach, beforeEach } from 'vitest';
import { db } from '../src/db.ts';
import { resetMetrics } from '../src/performance/tool-optimization.ts';
import {
  initializeMemoryOptimizations,
  forceCleanup,
} from '../src/performance/memory-optimization.ts';
import { clearIterationMetrics } from '../src/performance/agent-optimization.ts';

beforeEach(() => {
  // Disable foreign keys in tests because tests rely on dummy session_ids
  // that do not exist in the sessions table.
  try {
    db.exec('PRAGMA foreign_keys = OFF;');
  } catch (e) {}
  initializeMemoryOptimizations();
});

afterEach(() => {
  resetMetrics();
  clearIterationMetrics();
  forceCleanup();
});
