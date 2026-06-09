import { syncLatestSessionToVault } from "./hooks/vault-sync.js";

function parseArgs(argv) {
  const args = new Map();

  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part?.startsWith("--")) {
      continue;
    }

    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
      continue;
    }

    args.set(key, next);
    i += 1;
  }

  return args;
}

function runOnce() {
  const result = syncLatestSessionToVault();
  const status = result.success
    ? `[VaultSync] Synced ${result.sessionId} -> ${result.archivePath}`
    : `[VaultSync] Skipped (${result.reason ?? "unknown"}${result.error ? `: ${result.error}` : ""})`;

  console.error(status);
  return result;
}

const args = parseArgs(process.argv.slice(2));
const once = Boolean(args.get("once"));
const intervalMinutes = Number(args.get("interval-minutes") ?? 5);

runOnce();

if (!once) {
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  console.error(`[VaultSync] Watching every ${Math.max(1, intervalMinutes)} minute(s)`);
  setInterval(runOnce, intervalMs);
}
