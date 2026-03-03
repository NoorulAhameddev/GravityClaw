import { createLogger } from "./logger.ts";
import { parseArgs } from "./cli/utils.ts";
import { colors, title, section, error, dim, info } from "./cli/utils.ts";
import {
    chatCommand,
    doctorCommand,
    configCommand,
    toolsCommand,
    sessionsCommand,
} from "./cli/commands/index.ts";

const log = createLogger("cli");

function printBanner(): void {
    console.log(`
${colors.bright}${colors.cyan}   ╔═══════════════════════════════════════╗
   ║                                       ║
   ║       🦾  GRAVITY CLAW  🦾            ║
   ║   Personal AI Agent Ecosystem         ║
   ║                                       ║
   ╚═══════════════════════════════════════╝${colors.reset}
`);
}

function printHelp(): void {
    printBanner();
    
    console.log(`${colors.bright}Usage:${colors.reset}`);
    console.log(`  gravityclaw ${dim("[command]")} ${dim("[options]")}\n`);

    section("Commands:");
    console.log(`  ${colors.cyan}start${colors.reset}              Start Gravity Claw services ${dim("(default)")}`);
    console.log(`  ${colors.cyan}chat${colors.reset}               Interactive chat mode (REPL)`);
    console.log(`  ${colors.cyan}doctor${colors.reset}             Run health checks and diagnostics`);
    console.log(`  ${colors.cyan}config${colors.reset}             View current configuration`);
    console.log(`  ${colors.cyan}tools${colors.reset}              List available tools`);
    console.log(`  ${colors.cyan}sessions${colors.reset}           Manage conversation sessions`);
    console.log(`  ${colors.cyan}version${colors.reset}            Show version information`);
    console.log(`  ${colors.cyan}help${colors.reset}               Show this help\n`);

    section("Session Commands:");
    console.log(`  ${colors.cyan}sessions list${colors.reset}      List all sessions`);
    console.log(`  ${colors.cyan}sessions clear${colors.reset} ${dim("<id>")}  Clear a session`);
    console.log(`  ${colors.cyan}sessions export${colors.reset} ${dim("<id>")} Export session to JSON\n`);

    section("Options:");
    console.log(`  ${colors.cyan}--help, -h${colors.reset}         Show help for a command`);
    console.log(`  ${colors.cyan}--version, -v${colors.reset}      Show version`);
    console.log(`  ${colors.cyan}--verbose${colors.reset}          Enable verbose output`);
    console.log(`  ${colors.cyan}--session${colors.reset} ${dim("<id>")}     Use specific session ID\n`);

    section("Examples:");
    console.log(`  ${dim("$")} gravityclaw                    ${dim("# Start services")}`);
    console.log(`  ${dim("$")} gravityclaw chat               ${dim("# Interactive chat")}`);
    console.log(`  ${dim("$")} gravityclaw chat --session my-session`);
    console.log(`  ${dim("$")} gravityclaw doctor             ${dim("# Run diagnostics")}`);
    console.log(`  ${dim("$")} gravityclaw tools              ${dim("# List all tools")}`);
    console.log(`  ${dim("$")} gravityclaw sessions list      ${dim("# View sessions")}`);
    console.log(`  ${dim("$")} gravityclaw sessions export abc123 > backup.json\n`);

    section("Documentation:");
    console.log(`  ${colors.cyan}GitHub:${colors.reset}  https://github.com/noorulahamed/gravityclaw`);
    console.log(`  ${colors.cyan}Issues:${colors.reset}  https://github.com/noorulahamed/gravityclaw/issues\n`);
}

async function printVersion(): Promise<void> {
    const pkg = await import("../package.json", { with: { type: "json" } });
    
    printBanner();
    
    console.log(`${colors.bright}Version:${colors.reset} ${pkg.default.version}`);
    console.log(`${colors.bright}Node:${colors.reset}    ${process.version}`);
    console.log(`${colors.bright}Platform:${colors.reset} ${process.platform} ${process.arch}\n`);
}

async function run(): Promise<void> {
    const args = parseArgs(process.argv);
    const command = args.command.toLowerCase();

    // Handle global flags
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
                // Import and run main application
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

// Make stdin readable for interactive commands
if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
}

run().catch((err) => {
    log.error("CLI crashed", err);
    process.exit(1);
});
