import { bootstrapSharedMemory, syncSharedMemoryToVault } from "./shared-memory-lib.js";

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

function runOnce(args) {
  const bootstrapResult = bootstrapSharedMemory();
  const skipVaultSync = Boolean(args.get("skip-vault-sync"));
  const vaultResult = skipVaultSync
    ? { success: true, skipped: true }
    : syncSharedMemoryToVault();

  const bootstrapStatus = bootstrapResult.success ? "ok" : "failed";
  const vaultStatus = vaultResult.skipped ? "skipped" : (vaultResult.success ? "ok" : "failed");
  console.error(`[SharedMemory] bootstrap=${bootstrapStatus} vault=${vaultStatus}`);

  return {
    success: bootstrapResult.success && (vaultResult.success || vaultResult.skipped),
    bootstrapResult,
    vaultResult,
  };
}

const args = parseArgs(process.argv.slice(2));
const once = Boolean(args.get("once"));
const intervalMinutes = Number(args.get("interval-minutes") ?? 5);

runOnce(args);

if (!once) {
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  console.error(`[SharedMemory] Watching every ${Math.max(1, intervalMinutes)} minute(s)`);
  setInterval(() => runOnce(args), intervalMs);
}

