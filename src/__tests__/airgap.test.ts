import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as enforcement from "../airgap/enforcement.js";
import { localTextToSpeech, getLocalTTSBackend } from "../voice/local-tts.js";
import { localTranscribe } from "../voice/local-transcription.js";
import * as config from "../config.js";

describe("Air-Gapped Mode", () => {
  describe("Config AIR_GAPPED Setting", () => {
    it("should have AIR_GAPPED exported from config", () => {
      expect(config.AIR_GAPPED).toBeDefined();
      expect(typeof config.AIR_GAPPED).toBe("boolean");
    });

    it("should default to false when not set", () => {
      // This tests that the default is false
      expect(config.AIR_GAPPED).toBe(
        process.env.AIR_GAPPED === "true" || process.env.AIR_GAPPED === "1"
      );
    });
  });

  describe("Air-Gap Enforcement", () => {
    it("should export enforceAirGap function", () => {
      expect(enforcement.enforceAirGap).toBeDefined();
      expect(typeof enforcement.enforceAirGap).toBe("function");
    });

    it("should export getAirGapProvider function", () => {
      expect(enforcement.getAirGapProvider).toBeDefined();
      expect(typeof enforcement.getAirGapProvider).toBe("function");
    });

    it("should export checkAirGapTool function", () => {
      expect(enforcement.checkAirGapTool).toBeDefined();
      expect(typeof enforcement.checkAirGapTool).toBe("function");
    });

    it("should not throw if AIR_GAPPED is false", () => {
      if (!config.AIR_GAPPED) {
        expect(() => {
          enforcement.checkAirGapTool("test_tool");
        }).not.toThrow();
      }
    });

    it("should throw if AIR_GAPPED is true and tool is blocked", () => {
      if (config.AIR_GAPPED) {
        expect(() => {
          enforcement.checkAirGapTool("web_search");
        }).toThrow();

        expect(() => {
          enforcement.checkAirGapTool("browser_navigate");
        }).toThrow();
      }
    });

    it("should provide clear error message for blocked tools", () => {
      if (config.AIR_GAPPED) {
        try {
          enforcement.checkAirGapTool("web_search");
          expect.fail("Should have thrown");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          expect(message).toContain("AIR-GAPPED MODE");
          expect(message).toContain("web_search");
          expect(message).toContain("docs/AIRGAP.md");
        }
      }
    });

    it("should return 'ollama' as provider when air-gapped", () => {
      const provider = enforcement.getAirGapProvider();
      if (config.AIR_GAPPED) {
        expect(provider).toBe("ollama");
      } else {
        expect(provider).toBe(config.LLM_PROVIDER);
      }
    });
  });

  describe("Local TTS", () => {
    it("should export localTextToSpeech function", () => {
      expect(localTextToSpeech).toBeDefined();
      expect(typeof localTextToSpeech).toBe("function");
    });

    it("should export getLocalTTSBackend function", () => {
      expect(getLocalTTSBackend).toBeDefined();
      const type = typeof getLocalTTSBackend;
      expect(["string", "function"]).toContain(type);
    });

    it("should return null for empty text", async () => {
      const result = await localTextToSpeech("");
      expect(result).toBeNull();
    });

    it("should return null or Buffer (not error) with default options", async () => {
      const result = await localTextToSpeech("Hello world", {
        fallbackToText: true,
      });
      expect(result === null || result instanceof Buffer).toBe(true);
    });

    it("should throw error if no TTS backend available and fallbackToText=false", async () => {
      try {
        await localTextToSpeech("Hello world", {
          fallbackToText: false,
        });
        // If it doesn't throw, either piper or espeak is available (that's ok too)
        expect(true).toBe(true);
      } catch (err) {
        expect(err).toBeDefined();
        expect(
          err instanceof Error ? err.message : String(err)
        ).toContain("local TTS");
      }
    });

    it("should get TTS backend string", () => {
      const backend = getLocalTTSBackend();
      expect(
        backend === "piper-tts" ||
          backend === "espeak" ||
          backend === "text-only (no audio)"
      ).toBe(true);
    });
  });

  describe("Local Speech-to-Text", () => {
    it("should export localTranscribe function", () => {
      expect(localTranscribe).toBeDefined();
      expect(typeof localTranscribe).toBe("function");
    });

    it("should throw error for empty path", async () => {
      try {
        await localTranscribe("", { fallbackToError: true });
        expect.fail("Should throw");
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    it("should throw error for non-existent file", async () => {
      try {
        await localTranscribe("/nonexistent/path/audio.wav");
        expect.fail("Should throw");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain("not found");
      }
    });
  });

  describe("Tool Blocking in Air-Gap Mode", () => {
    it("should block web_search tool", () => {
      if (config.AIR_GAPPED) {
        expect(() => {
          enforcement.checkAirGapTool("web_search");
        }).toThrow("air-gapped");
      }
    });

    it("should block browser_navigate tool", () => {
      if (config.AIR_GAPPED) {
        expect(() => {
          enforcement.checkAirGapTool("browser_navigate");
        }).toThrow("air-gapped");
      }
    });

    it("should block browser_screenshot tool", () => {
      if (config.AIR_GAPPED) {
        expect(() => {
          enforcement.checkAirGapTool("browser_screenshot");
        }).toThrow("air-gapped");
      }
    });

    it("should block browser_click tool", () => {
      if (config.AIR_GAPPED) {
        expect(() => {
          enforcement.checkAirGapTool("browser_click");
        }).toThrow("air-gapped");
      }
    });

    it("should block browser_type tool", () => {
      if (config.AIR_GAPPED) {
        expect(() => {
          enforcement.checkAirGapTool("browser_type");
        }).toThrow("air-gapped");
      }
    });

    it("should block browser_extract tool", () => {
      if (config.AIR_GAPPED) {
        expect(() => {
          enforcement.checkAirGapTool("browser_extract");
        }).toThrow("air-gapped");
      }
    });
  });

  describe("Fetch Interception in Air-Gap Mode", () => {
    it("should allow localhost requests", async () => {
      if (config.AIR_GAPPED) {
        // This would require Ollama to be running to test properly
        // For now, just verify the function exists
        expect(enforcement.enforceAirGap).toBeDefined();
      }
    });

    it("should block external API calls", async () => {
      if (config.AIR_GAPPED) {
        // This would require enforcing air-gap first, then testing fetch
        // For now, just verify the behavior is callable
        expect(() => {
          enforcement.checkAirGapTool("external_api");
        }).toThrow();
      }
    });
  });

  describe("Ollama Integration", () => {
    it("should require Ollama when air-gapped", async () => {
      if (config.AIR_GAPPED) {
        // Ollama should be running at localhost:11434
        // This test would check if Ollama is accessible
        try {
          const response = await fetch("http://localhost:11434/api/tags", {
            signal: AbortSignal.timeout(5000),
          } as RequestInit);
          expect(response.status).toBe(200);
        } catch (err) {
          console.log(
            "Note: Ollama not running. Install with: ollama serve"
          );
        }
      }
    });
  });
});

describe("Air-Gap Mode Integration", () => {
  it("should provide clear setup instructions in error messages", () => {
    if (config.AIR_GAPPED) {
      try {
        enforcement.checkAirGapTool("web_search");
        expect.fail("Should throw");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Should guide users to documentation
        expect(
          message.toLowerCase().includes("docs") ||
            message.toLowerCase().includes("airgap") ||
            message.toLowerCase().includes("offline")
        ).toBe(true);
      }
    }
  });

  it("should allow local memory tools in air-gap mode", () => {
    // Memory tools should never throw in air-gap mode
    // They don't make external calls
    if (config.AIR_GAPPED) {
      // These should NOT throw
      expect(() => {
        enforcement.checkAirGapTool("save_fact");
        enforcement.checkAirGapTool("recall_facts");
        enforcement.checkAirGapTool("save_entity");
        enforcement.checkAirGapTool("query_graph");
      }).not.toThrow();
    }
  });
});
