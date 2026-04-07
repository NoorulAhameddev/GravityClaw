import { createLogger } from "./logger.ts";
import { parseArgs, printWelcome, title, section, error, info, printBox, printKeyValue, printRule, c, theme } from "./cli/rich-utils.ts";
import { emitCliBanner, formatCliBannerArt } from "./cli/banner.js";
import {
    chatCommand,
    doctorCommand,
    configCommand,
    toolsCommand,
    sessionsCommand,
} from "./cli/commands/index.ts";

const log = createLogger("cli");

function printHelp(): void {
    printWelcome();
    
    console.log();
    section("Usage:");
    console.log(`  gravityclaw ${c.dim("[command]")} ${c.dim("[options]")}\n`);

    section("Commands:");
    printBox(
        `${c.cyan("start")}              Start Gravity Claw services ${c.dim("(default)")}
${c.cyan("chat")}               Interactive chat mode (REPL)
${c.cyan("doctor")}             Run health checks and diagnostics
${c.cyan("config")}             View current configuration
${c.cyan("tools")}              List available tools
${c.cyan("sessions")}           Manage conversation sessions
${c.cyan("version")}            Show version information
${c.cyan("help")}               Show this help`,
        { title: "Commands", borderColor: "cyan" }
    );
    console.log();

    section("Session Commands:");
    printBox(
        `${c.cyan("sessions list")}      List all sessions
${c.cyan("sessions clear")} ${c.dim("<id>")}  Clear a session
${c.cyan("sessions export")} ${c.dim("<id>")} Export session to JSON`,
        { title: "Sessions", borderColor: "cyan" }
    );
    console.log();

    section("Options:");
    printBox(
        `${c.cyan("--help, -h")}         Show help for a command
${c.cyan("--version, -v")}      Show version
${c.cyan("--verbose")}          Enable verbose output
${c.cyan("--session")} ${c.dim("<id>")}     Use specific session ID`,
        { title: "Options", borderColor: "cyan" }
    );
    console.log();

    section("Examples:");
    printBox(
        `${c.dim("$")} gravityclaw                    ${c.dim("# Start services")}
${c.dim("$")} gravityclaw chat               ${c.dim("# Interactive chat")}
${c.dim("$")} gravityclaw chat --session my-session
${c.dim("$")} gravityclaw doctor             ${c.dim("# Run diagnostics")}
${c.dim("$")} gravityclaw tools              ${c.dim("# List all tools")}
${c.dim("$")} gravityclaw sessions list      ${c.dim("# View sessions")}
${c.dim("$")} gravityclaw sessions export abc123 > backup.json`,
        { title: "Examples", borderColor: "cyan" }
    );
    console.log();

    section("Documentation:");
    printKeyValue({
        "GitHub": "https://github.com/noorulahamed/gravityclaw",
        "Issues": "https://github.com/noorulahamed/gravityclaw/issues",
    });
    console.log();
}

async function printVersion(): Promise<void> {
    const pkg = await import("../package.json", { with: { type: "json" } });
    
    printWelcome();
    
    printBox(
        `${c.bright("Version:")} ${pkg.default.version}
${c.bright("Node:")}    ${process.version}
${c.bright("Platform:")} ${process.platform} ${process.arch}`,
        { title: "Version Info", borderColor: "cyan" }
    );
    console.log();
}

async function run(): Promise<void> {
    const args = parseArgs(process.argv);
    const command = args.command.toLowerCase();

    if (args.flags.h || args.flags.help) {
        printHelp();
        return;
    }

    if (args.flags.v || args.flags.version) {
        await printVersion();
        return;
    }

    try {
        switch (command) {
            case "start":
                info("Starting Gravity Claw...\n");
                await import("./index.ts");
                break;

            case "chat":
                await chatCommand({
                    sessionId: args.flags.session as string | undefined,
                    verbose: Boolean(args.flags.verbose),
                });
                break;

            case "doctor":
                await doctorCommand();
                break;

            case "config":
                await configCommand();
                break;

            case "tools":
                await toolsCommand();
                break;

            case "sessions":
                await sessionsCommand(
                    args.subcommand,
                    args.positional[0]
                );
                break;

            case "version":
                await printVersion();
                break;

            case "help":
                printHelp();
                break;

            default:
                error(`Unknown command: ${command}\n`);
                printHelp();
                process.exitCode = 1;
        }
    } catch (err) {
        error(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
        
        if (args.flags.verbose) {
            console.error(err);
        }
        
        process.exitCode = 1;
    }
}

if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
}

run().catch((err) => {
    log.error("CLI crashed", err);
    process.exit(1);
});
