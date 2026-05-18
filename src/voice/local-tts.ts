import { execSync, spawn } from "child_process";
import { createLogger } from "../logger.js";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const log = createLogger("voice:local-tts");

/**
 * Local TTS options for air-gapped mode
 * Priority: piper-tts > espeak > text-only fallback
 */

export interface LocalTTSOptions {
  fallbackToText?: boolean; // If true, returns null instead of throwing on unavailable backends
}

/**
 * Check if piper-tts is available
 */
function isPiperAvailable(): boolean {
  try {
    execSync("where piper > nul 2>&1 || which piper > /dev/null 2>&1", {
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if espeak is available (system command)
 */
function isEspeakAvailable(): boolean {
  try {
    execSync("where espeak > nul 2>&1 || which espeak > /dev/null 2>&1", {
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert text to speech using piper-tts (fast, local, high-quality)
 * Piper: https://github.com/rhasspy/piper
 *
 * Install: pip install piper-tts
 * Or: Download from https://github.com/rhasspy/piper/releases
 */
async function piperTextToSpeech(text: string): Promise<Buffer | null> {
  if (!isPiperAvailable()) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `piper-${Date.now()}.wav`);

    try {
      const piper = spawn("piper", ["--output-file", tmpFile], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdErr = "";

      piper.stdin!.write(text);
      piper.stdin!.end();

      piper.stderr!.on("data", (data) => {
        stdErr += data.toString();
      });

      piper.on("close", (code) => {
        try {
          if (code !== 0) {
            log.error(`Piper exited with code ${code}: ${stdErr}`);
            resolve(null); // Fallback
            return;
          }

          // Read the output file
          const buffer = readFileSync(tmpFile);
          unlinkSync(tmpFile); // Clean up
          log.debug(`Generated audio via piper: ${buffer.length} bytes`);
          resolve(buffer);
        } catch (err) {
          log.error(`Error reading piper output: ${err}`);
          resolve(null);
        }
      });

      piper.on("error", (err) => {
        log.debug(`Piper spawn error: ${err.message}`);
        resolve(null);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (piper.exitCode === null) {
          piper.kill();
          resolve(null);
        }
      }, 30000);
    } catch (err) {
      log.debug(`Piper error: ${err}`);
      resolve(null);
    }
  });
}

/**
 * Convert text to speech using espeak (fallback, available on Linux/Mac/Windows)
 * espeak: https://espeak.sourceforge.net/
 *
 * Install on Linux: apt-get install espeak
 * Install on macOS: brew install espeak
 * Install on Windows: Download from https://espeak.sourceforge.net/
 */
async function espeakTextToSpeech(text: string): Promise<Buffer | null> {
  if (!isEspeakAvailable()) {
    return null;
  }

  return new Promise((resolve) => {
    const tmpFile = join(tmpdir(), `espeak-${Date.now()}.wav`);

    try {
      // espeak can output to file directly
      const command = process.platform === "win32" 
        ? `espeak "${text.replace(/"/g, '\\"')}" -w "${tmpFile}"`
        : `espeak "${text.replace(/"/g, '\\"')}" -w "${tmpFile}"`;

      execSync(command, { timeout: 10000, stdio: "pipe" });

      const buffer = readFileSync(tmpFile);
      unlinkSync(tmpFile); // Clean up
      log.debug(`Generated audio via espeak: ${buffer.length} bytes`);
      resolve(buffer);
    } catch (err) {
      log.debug(`Espeak error: ${err}`);
      resolve(null);
    }
  });
}

/**
 * Main local TTS function
 * Tries piper first, then espeak, then returns null (text-only mode)
 */
export async function localTextToSpeech(
  text: string,
  options: LocalTTSOptions = {}
): Promise<Buffer | null> {
  const { fallbackToText = true } = options;

  if (!text || text.trim().length === 0) {
    return null;
  }

  log.debug(`Converting text to speech locally: ${text.length} chars`);

  // Try piper first (preferred: high quality, fast)
  try {
    const piperResult = await piperTextToSpeech(text);
    if (piperResult) {
      log.info("✓ Generated audio via piper-tts");
      return piperResult;
    }
  } catch (err) {
    log.debug(`Piper attempt failed: ${err}`);
  }

  // Try espeak (fallback: universal availability)
  try {
    const espeakResult = await espeakTextToSpeech(text);
    if (espeakResult) {
      log.info("✓ Generated audio via espeak");
      return espeakResult;
    }
  } catch (err) {
    log.debug(`Espeak attempt failed: ${err}`);
  }

  // No TTS available
  if (fallbackToText) {
    log.warn("⚠️  No local TTS available (piper/espeak not found) — using text-only mode");
    log.warn("Install piper-tts: pip install piper-tts");
    log.warn("Or espeak: apt-get install espeak (Linux) / brew install espeak (macOS)");
    return null; // Text-only fallback
  } else {
    throw new Error(
      "No local TTS available. Install piper-tts or espeak. See docs/AIRGAP.md"
    );
  }
}

/**
 * Get current TTS backend (for logging/debugging)
 */
export function getLocalTTSBackend(): string {
  if (isPiperAvailable()) return "piper-tts";
  if (isEspeakAvailable()) return "espeak";
  return "text-only (no audio)";
}
