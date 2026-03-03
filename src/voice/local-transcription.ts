import { execSync } from "child_process";
import { createLogger } from "../logger.js";
import { existsSync } from "fs";

const log = createLogger("voice:local-transcription");

/**
 * Local speech-to-text using whisper.cpp
 * whisper.cpp: https://github.com/ggerganov/whisper.cpp
 * 
 * Fast, local, privacy-preserving speech recognition
 * Supports various audio formats (WAV, MP3, FLAC, etc.)
 */

export interface LocalTranscriptionOptions {
  language?: string; // Language code (e.g., 'en', 'es', 'fr')
  timeout?: number; // Timeout in milliseconds
  fallbackToError?: boolean; // If false, throw error if unavailable
}

/**
 * Check if whisper.cpp is available
 */
function isWhisperAvailable(): boolean {
  try {
    // Try to find whisper binary
    const result = execSync(
      "where whisper > nul 2>&1 || which whisper > /dev/null 2>&1",
      { timeout: 2000, stdio: "pipe" }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Check for whisper.cpp main executable
 */
function isWhisperCppAvailable(): boolean {
  // Check common installation paths
  const commonPaths = [
    "./whisper.cpp/main", // Local build
    "/usr/local/bin/whisper", // macOS/Linux standard
    "C:\\Program Files\\whisper\\whisper.exe", // Windows
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return true;
    }
  }

  return false;
}

/**
 * Transcribe audio file using whisper.cpp
 * Supports: WAV, MP3, FLAC, OGG, OPUS, and more
 */
export async function localTranscribe(
  audioPath: string,
  options: LocalTranscriptionOptions = {}
): Promise<string> {
  const { language = "en", timeout = 60000, fallbackToError = false } = options;

  if (!audioPath || audioPath.trim().length === 0) {
    throw new Error("Audio path cannot be empty");
  }

  // Check if file exists
  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  log.debug(`Transcribing audio: ${audioPath} (lang: ${language})`);

  // Check whisper availability
  if (!isWhisperAvailable() && !isWhisperCppAvailable()) {
    const message = [
      "❌ whisper.cpp not available for local speech-to-text",
      "",
      "Install whisper.cpp:",
      "1. Clone: git clone https://github.com/ggerganov/whisper.cpp.git",
      "2. Build: cd whisper.cpp && make",
      "3. Download model: ./models/download-ggml-model.sh base",
      "4. Transcribe: ./main -m models/ggml-base.en.bin audio.wav",
      "",
      "Or use alternative transcription tools.",
    ].join("\n");

    if (fallbackToError) {
      log.warn(message);
      return `[Transcription unavailable - please install whisper.cpp. See docs/AIRGAP.md]`;
    } else {
      throw new Error(message);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      // Build whisper command
      // Format: whisper audio.wav --model base --output-format txt --output-dir /tmp
      const cmd = `whisper "${audioPath}" --model base --language ${language} --output-format txt --output-dir /tmp --device cpu 2>&1`;

      log.debug(`Running: ${cmd}`);

      const output = execSync(cmd, {
        timeout,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Extract transcribed text from output
      // whisper outputs to /tmp/{basename}.txt by default
      const basename = audioPath.split("/").pop()?.replace(/\.[^.]+$/, "") || "audio";
      const outputFile = `/tmp/${basename}.txt`;

      if (existsSync(outputFile)) {
        const { readFileSync, unlinkSync } = require("fs");
        const text = readFileSync(outputFile, "utf-8").trim();
        unlinkSync(outputFile); // Clean up
        
        log.info(`✓ Transcribed ${audioPath}: ${text.length} chars`);
        resolve(text);
      } else {
        log.error(`Whisper output file not found: ${outputFile}`);
        resolve("[Transcription failed - output file not found]");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Transcription failed: ${errMsg}`);
      
      if (fallbackToError) {
        resolve(`[Transcription failed: ${errMsg}]`);
      } else {
        reject(new Error(`Local transcription failed: ${errMsg}. See docs/AIRGAP.md`));
      }
    }
  });
}

/**
 * Get current transcription backend
 */
export function getLocalTranscriptionBackend(): string {
  if (isWhisperAvailable() || isWhisperCppAvailable()) {
    return "whisper.cpp";
  }
  return "unavailable";
}

/**
 * Download a whisper model for offline use
 * Models: tiny, base, small, medium, large
 */
export async function downloadWhisperModel(model: string = "base"): Promise<void> {
  log.info(`Downloading whisper model: ${model}`);

  try {
    const cmd = `whisper-cpp-download-model.sh ${model}`;
    execSync(cmd, { timeout: 300000, stdio: "inherit" }); // 5 minute timeout
    log.info(`✓ Downloaded model: ${model}`);
  } catch (err) {
    const message = [
      `Failed to download whisper model: ${model}`,
      "",
      "Try manual download:",
      `./models/download-ggml-model.sh ${model}`,
      "",
      "Or see: https://github.com/ggerganov/whisper.cpp/tree/master/models",
    ].join("\n");
    
    log.error(message);
    throw new Error(message);
  }
}
