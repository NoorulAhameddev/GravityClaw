import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const INBOX_DIR = path.join(ROOT, ".agent_inbox");
const OUTBOX_DIR = path.join(ROOT, ".agent_outbox");

const PROVIDERS = [
  {
    name: "OpenRouter",
    key: process.env.OPENROUTER_API_KEY,
    model: process.env.ANTIGRAVITY_MODEL_OPENROUTER || "openai/gpt-4o-mini",
    call: async (instructions) => {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://gravityclaw.local",
        },
        body: JSON.stringify({
          model: process.env.ANTIGRAVITY_MODEL_OPENROUTER || "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: "You are Antigravity, a parallel AI co-pilot executing delegated tasks. Complete the following task thoroughly and return the full results." },
            { role: "user", content: instructions },
          ],
          max_tokens: 16384,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "[no response]";
    },
  },
  {
    name: "Google Gemini",
    key: process.env.GOOGLE_API_KEY,
    model: process.env.ANTIGRAVITY_MODEL_GOOGLE || "gemini-1.5-flash",
    call: async (instructions) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${process.env.ANTIGRAVITY_MODEL_GOOGLE || "gemini-1.5-flash"}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `You are Antigravity, a parallel AI co-pilot executing delegated tasks. Complete the following task thoroughly.\n\n${instructions}` }] }],
            generationConfig: { maxOutputTokens: 8192 },
          }),
        },
      );
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "[no response]";
    },
  },
  {
    name: "OpenCodeZen",
    key: process.env.OPENCODEZEN_API_KEY,
    model: process.env.ANTIGRAVITY_MODEL_ZEN || "gpt-4o-mini",
    call: async (instructions) => {
      const baseUrl = process.env.OPENCODEZEN_BASE_URL || "https://opencode.ai/zen/v1";
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENCODEZEN_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.ANTIGRAVITY_MODEL_ZEN || "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are Antigravity, a parallel AI co-pilot executing delegated tasks. Complete the following task thoroughly." },
            { role: "user", content: instructions },
          ],
          max_tokens: 16384,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "[no response]";
    },
  },
].filter((p) => p.key);

async function ensureDirs() {
  await fs.mkdir(INBOX_DIR, { recursive: true });
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
}

async function processTask(fileName) {
  const filePath = path.join(INBOX_DIR, fileName);
  const processingPath = path.join(INBOX_DIR, fileName.replace(".json", ".processing.json"));
  const failedPath = path.join(INBOX_DIR, fileName.replace(".json", ".failed.json"));

  let task;
  try {
    const raw = await fs.readFile(filePath, "utf8");
    task = JSON.parse(raw);
  } catch {
    return;
  }

  if (task.status !== "pending") return;

  task.status = "processing";
  task.startedAt = new Date().toISOString();

  try {
    await fs.rename(filePath, processingPath);
  } catch {
    return;
  }

  console.error(`[InboxWatcher] Processing ${task.taskId}: ${task.title}`);

  let lastError;
  for (const provider of PROVIDERS) {
    try {
      const result = await provider.call(task.instructions);
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      task.provider = provider.name;
      task.result = result;
      task.output = result;

      const outboxPath = path.join(OUTBOX_DIR, `${task.taskId}.json`);
      await fs.writeFile(outboxPath, JSON.stringify(task, null, 2), "utf8");
      console.error(`[InboxWatcher] Completed ${task.taskId} (via ${provider.name})`);
      await fs.unlink(processingPath);
      return;
    } catch (err) {
      lastError = err;
      console.error(`[InboxWatcher] ${provider.name} failed for ${task.taskId}: ${err.message}`);
    }
  }

  task.status = "failed";
  task.failedAt = new Date().toISOString();
  task.error = lastError?.message || "No providers available";
  task.output = task.error;
  await fs.writeFile(failedPath, JSON.stringify(task, null, 2), "utf8");
  await fs.unlink(processingPath);
  console.error(`[InboxWatcher] Failed ${task.taskId}: ${task.error}`);
}

async function scanInbox() {
  try {
    const entries = await fs.readdir(INBOX_DIR);
    const taskFiles = entries
      .filter((f) => f.endsWith(".json") && !f.includes(".processing.") && !f.includes(".failed."))
      .sort();

    for (const file of taskFiles) {
      await processTask(file);
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`[InboxWatcher] Scan error: ${err.message}`);
    }
  }
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (!part?.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) { args.set(key, true); continue; }
    args.set(key, next);
    i++;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const once = Boolean(args.get("once"));
  const intervalMinutes = Number(args.get("interval-minutes") ?? 1);

  await ensureDirs();
  console.error(`[InboxWatcher] Watching ${INBOX_DIR} → ${OUTBOX_DIR}`);

  if (PROVIDERS.length === 0) {
    console.error(`[InboxWatcher] WARNING: No LLM API keys found. Set OPENROUTER_API_KEY or GOOGLE_API_KEY in .env`);
  } else {
    console.error(`[InboxWatcher] Providers: ${PROVIDERS.map((p) => `${p.name} (${p.model})`).join(", ")}`);
  }

  await scanInbox();

  if (!once) {
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
    console.error(`[InboxWatcher] Polling every ${Math.max(1, intervalMinutes)} minute(s)`);
    setInterval(() => scanInbox(), intervalMs);
  }
}

main().catch((err) => {
  console.error("[InboxWatcher] Fatal:", err);
  process.exit(1);
});
