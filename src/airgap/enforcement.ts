import { createLogger } from "../logger.js";
import { config } from "../config.js";

const log = createLogger("airgap");

/**
 * Global fetch override to block external API calls in air-gapped mode
 */
let originalFetch: typeof global.fetch;

/**
 * List of allowed URLs/patterns in air-gapped mode (Ollama, local services)
 */
const ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1", // IPv6 localhost
];

/**
 * List of allowed ports for local services
 */
const ALLOWED_PORTS = [
  "11434", // Ollama default port
  "5000",  // Common local service ports
  "3000",
  "8000",
  "8080",
  "9000",
];

/**
 * Check if a URL is allowed in air-gapped mode
 */
function isUrlAllowed(url: string | URL | Request): boolean {
  let urlStr: string;

  if (typeof url === "string") {
    urlStr = url;
  } else if (url instanceof URL) {
    urlStr = url.href;
  } else if (url instanceof Request) {
    urlStr = url.url;
  } else {
    return false;
  }

  try {
    const urlObj = new URL(urlStr);
    const hostname = urlObj.hostname.toLowerCase();
    const port = urlObj.port || (urlObj.protocol === "https:" ? "443" : "80");

    // Allow localhost and 127.0.0.1
    const isLocalhost = ALLOWED_HOSTS.some(
      (host) =>
        hostname === host ||
        hostname.endsWith(`.local`) ||
        hostname.endsWith(`.localhost`)
    );

    // Allow specific local ports
    const isAllowedPort = ALLOWED_PORTS.includes(port);

    return isLocalhost && isAllowedPort;
  } catch (err) {
    log.debug(`Failed to parse URL for air-gap check: ${urlStr}`);
    return false;
  }
}

/**
 * Intercept global fetch to block external calls in air-gapped mode
 */
function createAirGapFetch(): typeof global.fetch {
  return async (url, options) => {
    if (!isUrlAllowed(url)) {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;
      const message = `🚫 AIR-GAPPED MODE: External API call blocked\n\nURL: ${urlStr}\n\nTo resolve:\n• Ensure you're using local services only\n• For LLM: Use Ollama (http://localhost:11434)\n• For web data: Use local-only tools\n• For TTS: Use local alternatives (piper, espeak)\n\nLearn more: docs/AIRGAP.md`;
      log.error(message);
      throw new Error(message);
    }

    return originalFetch(url, options);
  };
}

/**
 * Enforce air-gapped mode by intercepting fetch and validating LLM provider
 */
export async function enforceAirGap(): Promise<void> {
  if (!config.AIR_GAPPED) {
    return; // Air gap not enabled
  }

  log.warn("⚠️  AIR-GAPPED MODE ENABLED — using local models only");

  // Override global fetch
  originalFetch = global.fetch;
  global.fetch = createAirGapFetch() as typeof global.fetch;

  log.info("✓ Fetch override installed for air-gap enforcement");

  // Validate Ollama is available
  try {
    log.info("Checking Ollama health...");
    const response = await originalFetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(5000),
    } as RequestInit);

    if (!response.ok) {
      throw new Error(`Ollama health check failed: ${response.status}`);
    }

    const data = (await response.json()) as { models: Array<{ name: string }> };
    log.info(`✓ Ollama is running with ${data.models.length} model(s)`);

    if (data.models.length === 0) {
      log.warn("⚠️  No models available in Ollama. Install with: ollama pull llama2");
    } else {
      log.debug(`Available models: ${data.models.map((m) => m.name).join(", ")}`);
    }
  } catch (err) {
    const message = [
      "❌ AIR-GAPPED MODE FAILED: Ollama is not responding",
      "",
      "To fix:",
      "1. Install Ollama: https://ollama.ai",
      "2. Start Ollama: ollama serve",
      "3. Pull a model: ollama pull llama2",
      "4. Restart this application",
      "",
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    ].join("\n");

    log.error(message);
    throw new Error(message);
  }
}

/**
 * Check if a provider is allowed in air-gapped mode
 * Returns the name of the provider to use (always 'ollama')
 */
export function getAirGapProvider(): string {
  if (!config.AIR_GAPPED) {
    return config.LLM_PROVIDER;
  }

  return "ollama"; // Force Ollama when air-gapped
}

/**
 * Throw error if trying to use external API in air-gapped mode
 */
export function checkAirGapTool(toolName: string): void {
  if (!config.AIR_GAPPED) {
    return;
  }

  throw new Error(
    `🚫 AIR-GAPPED MODE: ${toolName} is not available in air-gapped mode.\n\nThis tool requires external APIs which are disabled for security.\nInstead:\n• Use local memory tools for data storage\n• Use Ollama for LLM queries\n• Use local voice alternatives\n\nLearn more: docs/AIRGAP.md`
  );
}
