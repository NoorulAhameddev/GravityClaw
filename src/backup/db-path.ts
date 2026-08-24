import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveSqliteDbPath(): string | null {
  if (process.env.DATABASE_URL) return null;
  const dataDir = path.join(__dirname, '../../data');
  const workerId = process.env.VITEST_WORKER_ID;
  const dbName = workerId ? `gravity_test_${workerId}.db` : 'gravity.db';
  return path.join(dataDir, dbName);
}
