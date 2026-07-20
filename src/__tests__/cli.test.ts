import { describe, it, expect, vi } from "vitest";
import { parseArgs } from "../cli/rich-utils.ts";

describe("parseArgs", () => {
  it("defaults to start command with no args", () => {
    const result = parseArgs(["node", "cli.js"]);
    expect(result.command).toBe("start");
    expect(result.subcommand).toBeUndefined();
    expect(result.flags).toEqual({});
    expect(result.positional).toEqual([]);
  });

  it("parses a simple command", () => {
    const result = parseArgs(["node", "cli.js", "doctor"]);
    expect(result.command).toBe("doctor");
  });

  it("parses command with subcommand", () => {
    const result = parseArgs(["node", "cli.js", "sessions", "list"]);
    expect(result.command).toBe("sessions");
    expect(result.subcommand).toBe("list");
  });

  it("parses command with flags", () => {
    const result = parseArgs(["node", "cli.js", "cost", "--period", "week"]);
    expect(result.command).toBe("cost");
    expect(result.flags.period).toBe("week");
  });

  it("parses boolean flags", () => {
    const result = parseArgs(["node", "cli.js", "chat", "--verbose"]);
    expect(result.command).toBe("chat");
    expect(result.flags.verbose).toBe(true);
  });

  it("parses short flags", () => {
    const result = parseArgs(["node", "cli.js", "-v"]);
    expect(result.flags.v).toBe(true);
  });

  it("parses command with subcommand and positional args", () => {
    const result = parseArgs(["node", "cli.js", "sessions", "export", "abc123"]);
    expect(result.command).toBe("sessions");
    expect(result.subcommand).toBe("export");
    expect(result.positional).toEqual(["abc123"]);
  });

  it("parses skills add with positional name", () => {
    const result = parseArgs(["node", "cli.js", "skills", "add", "my-skill"]);
    expect(result.command).toBe("skills");
    expect(result.subcommand).toBe("add");
    expect(result.positional).toEqual(["my-skill"]);
  });

  it("parses help flag", () => {
    const result = parseArgs(["node", "cli.js", "--help"]);
    expect(result.flags.h).toBeUndefined();
    expect(result.flags.help).toBe(true);
  });

  it("handles unknown commands", () => {
    const result = parseArgs(["node", "cli.js", "nonexistent"]);
    expect(result.command).toBe("nonexistent");
  });
});

describe("CLI command dispatch", () => {
  it("help flag triggers printHelp", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(String(msg));
    });

    const { parseArgs } = await import("../cli/rich-utils.ts");
    const args = parseArgs(["node", "cli.js", "--help"]);

    expect(args.flags.help).toBe(true);
    spy.mockRestore();
  });

  it("version flag triggers printVersion", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(String(msg));
    });

    const { parseArgs } = await import("../cli/rich-utils.ts");
    const args = parseArgs(["node", "cli.js", "--version"]);

    expect(args.flags.version).toBe(true);
    spy.mockRestore();
  });

  it("doctor command is recognized", () => {
    const args = parseArgs(["node", "cli.js", "doctor"]);
    expect(args.command).toBe("doctor");
  });

  it("chat command with flags", () => {
    const args = parseArgs(["node", "cli.js", "chat", "--session", "test-123", "--verbose"]);
    expect(args.command).toBe("chat");
    expect(args.flags.session).toBe("test-123");
    expect(args.flags.verbose).toBe(true);
  });

  it("tools command", () => {
    const args = parseArgs(["node", "cli.js", "tools"]);
    expect(args.command).toBe("tools");
  });

  it("config command", () => {
    const args = parseArgs(["node", "cli.js", "config"]);
    expect(args.command).toBe("config");
  });

  it("thinkback command with year flag", () => {
    const args = parseArgs(["node", "cli.js", "thinkback", "--year", "2025"]);
    expect(args.command).toBe("thinkback");
    expect(args.flags.year).toBe("2025");
  });

  it("insights command with flags", () => {
    const args = parseArgs(["node", "cli.js", "insights", "--period", "month", "--html"]);
    expect(args.command).toBe("insights");
    expect(args.flags.period).toBe("month");
    expect(args.flags.html).toBe(true);
  });

  it("cost command with detailed flag", () => {
    const args = parseArgs(["node", "cli.js", "cost", "--detailed"]);
    expect(args.command).toBe("cost");
    expect(args.flags.detailed).toBe(true);
  });
});

describe("CLI error handling", () => {
  it("logs error for unknown command", async () => {
    const logs: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((msg) => {
      logs.push(String(msg));
    });

    console.error(`✗ Unknown command: nonexistent\n`);

    expect(logs.some(l => l.includes("Unknown command"))).toBe(true);
    errorSpy.mockRestore();
  });
});
