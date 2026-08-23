import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const INBOX_DIR = path.join(ROOT, '.agent_inbox');
const OUTBOX_DIR = path.join(ROOT, '.agent_outbox');

const AGY_CANDIDATES = [
  process.env.AGY_BIN,
  path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', 'agy.exe'),
  path.join(process.env.APPDATA || '', 'agy', 'bin', 'agy.exe'),
  'agy',
].filter(Boolean);

const PRINT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 900_000);

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (!part?.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
      continue;
    }
    args.set(key, next);
    i++;
  }
  return args;
}

async function resolveAgy() {
  for (const candidate of AGY_CANDIDATES) {
    try {
      const { stdout } = await execFileP(candidate, ['--version']);
      if (stdout.trim()) return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    'Antigravity CLI (agy) not found. Install it with: irm https://antigravity.google/cli/install.ps1 | iex',
  );
}

async function ensureDirs() {
  await fs.mkdir(INBOX_DIR, { recursive: true });
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
}

function runAgyPrint(agyBin, instructions) {
  const prompt = String(instructions ?? '').trim();
  if (!prompt) return Promise.resolve('[no instructions]');
  const args = ['--output-format', 'text', '--dangerously-skip-permissions', '-p', prompt];

  return new Promise((resolve, reject) => {
    const child = spawn(agyBin, args, {
      windowsHide: true,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Process timed out'));
    }, PRINT_TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(stdout.trim() || stderr.trim() || '[no output]');
    });
  });
}

async function processTask(fileName, agyBin) {
  const filePath = path.join(INBOX_DIR, fileName);
  const processingPath = path.join(INBOX_DIR, fileName.replace('.json', '.processing.json'));
  const failedPath = path.join(INBOX_DIR, fileName.replace('.json', '.failed.json'));

  try {
    await fs.rename(filePath, processingPath);
  } catch {
    return;
  }

  let task;
  try {
    const raw = await fs.readFile(processingPath, 'utf8');
    task = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    try {
      await fs.unlink(processingPath);
    } catch {
      // already gone
    }
    return;
  }

  if (task.status !== 'pending') {
    try { await fs.rename(processingPath, filePath); } catch {}
    return;
  }

  task.status = 'processing';
  task.startedAt = new Date().toISOString();

  console.error(`[AntigravityConsumer] Dispatching ${task.taskId}: ${task.title}`);

  try {
    const result = await runAgyPrint(agyBin, task.instructions);
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.provider = 'Antigravity CLI';
    task.output = result;
    task.result = result;

    const safeTaskId = path.basename(String(task.taskId));
    const outboxPath = path.join(OUTBOX_DIR, `${safeTaskId}.json`);
    await fs.writeFile(outboxPath, JSON.stringify(task, null, 2), 'utf8');
    console.error(`[AntigravityConsumer] Completed ${task.taskId}`);
  } catch (err) {
    task.status = 'failed';
    task.failedAt = new Date().toISOString();
    task.error = err.message;
    task.output = err.message;
    await fs.writeFile(failedPath, JSON.stringify(task, null, 2), 'utf8');
    console.error(`[AntigravityConsumer] Failed ${task.taskId}: ${err.message}`);
  } finally {
    try {
      await fs.unlink(processingPath);
    } catch {
      // already gone
    }
  }
}

let isScanning = false;

async function scanInbox(agyBin) {
  if (isScanning) return;
  isScanning = true;

  try {
    const entries = await fs.readdir(INBOX_DIR);
    const taskFiles = entries
      .filter((f) => f.endsWith('.json') && !f.includes('.processing.') && !f.includes('.failed.'))
      .sort();

    for (const file of taskFiles) {
      await processTask(file, agyBin);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[AntigravityConsumer] Scan error: ${err.message}`);
    }
  } finally {
    isScanning = false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const once = Boolean(args.get('once'));
  const intervalMinutes = Number(args.get('interval-minutes') ?? 1);

  let agyBin;
  try {
    agyBin = await resolveAgy();
  } catch (err) {
    console.error(`[AntigravityConsumer] FATAL: ${err.message}`);
    process.exit(1);
  }

  await ensureDirs();
  console.error(`[AntigravityConsumer] Watching ${INBOX_DIR} → ${OUTBOX_DIR}`);
  console.error(`[AntigravityConsumer] agy bin: ${agyBin}`);

  await scanInbox(agyBin);

  if (!once) {
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
    console.error(`[AntigravityConsumer] Polling every ${Math.max(1, intervalMinutes)} minute(s)`);
    let scanning = false;
    setInterval(async () => {
      if (scanning) return;
      scanning = true;
      try {
        await scanInbox(agyBin);
      } finally {
        scanning = false;
      }
    }, intervalMs);
  }
}

main().catch((err) => {
  console.error('[AntigravityConsumer] Fatal:', err);
  process.exit(1);
});