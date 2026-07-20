import { createLogger } from "./logger.ts";
import { parseArgs, printWelcome, title, section, error, info, printBox, printKeyValue, printRule, c, theme } from "./cli/rich-utils.ts";
import { emitCliBanner, formatCliBannerArt } from "./cli/banner.js";
import {
    chatCommand,
    doctorCommand,
    configCommand,
    toolsCommand,
    sessionsCommand,
    skillsCommand,
    costCommand,
    insightsCommand,
    pluginCommand,
    thinkbackCommand,
    vimCommand,
    initCommand,
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
${c.cyan("init")}               First-time setup wizard
${c.cyan("chat")}               Interactive chat mode (REPL)
${c.cyan("doctor")}             Run health checks and diagnostics
${c.cyan("config")}             View current configuration
${c.cyan("tools")}              List available tools
${c.cyan("sessions")}           Manage conversation sessions
${c.cyan("bridge")}             Manage remote bridge connections
${c.cyan("stats")}              Display usage statistics
${c.cyan("cost")}               Display usage costs
${c.cyan("skills")}            Manage custom skills
${c.cyan("insights")}           Usage analytics & trends
${c.cyan("plugin")}            Manage plugins
${c.cyan("thinkback")}          Year in review
${c.cyan("vim")}               Toggle vim mode
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

    section("Skills Commands:");
    printBox(
        `${c.cyan("skills list")}        List all skills
${c.cyan("skills add")} ${c.dim("<name>")}     Create new skill
${c.cyan("skills remove")} ${c.dim("<name>")}   Delete skill
${c.cyan("skills enable")} ${c.dim("<name>")}   Enable skill
${c.cyan("skills disable")} ${c.dim("<name>")}  Disable skill`,
        { title: "Skills", borderColor: "cyan" }
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
${c.dim("$")} gravityclaw sessions export abc123 > backup.json
${c.dim("$")} gravityclaw skills            ${c.dim("# List all skills")}
${c.dim("$")} gravityclaw skills add my-skill ${c.dim("# Create new skill")}
${c.dim("$")} gravityclaw cost               ${c.dim("# Show usage costs")}
${c.dim("$")} gravityclaw cost --period week   ${c.dim("# Weekly costs")}
${c.dim("$")} gravityclaw insights          ${c.dim("# Usage analytics")}
${c.dim("$")} gravityclaw plugin             ${c.dim("# List plugins")}`,
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

            case "bridge":
                const { bridgeCommand } = await import("./cli/commands/bridge.ts");
                await bridgeCommand(args.subcommand ? [args.subcommand, ...args.positional] : args.positional);
                break;

            case "stats":
                const { statsCommand } = await import("./cli/commands/stats.ts");
                await statsCommand({
                    period: args.flags.period as string,
                    verbose: Boolean(args.flags.verbose)
                });
                break;

            case "skills":
                await skillsCommand(
                    args.subcommand,
                    args.positional
                );
                break;

            case "cost":
                const { costCommand } = await import("./cli/commands/cost.ts");
                await costCommand({
                    period: args.flags.period as string,
                    detailed: Boolean(args.flags.detailed),
                    model: args.flags.model as string
                });
                break;

            case "insights":
                const { insightsCommand } = await import("./cli/commands/insights.ts");
                await insightsCommand({
                    period: args.flags.period as string,
                    html: Boolean(args.flags.html)
                });
                break;

            case "plugin":
                await pluginCommand(
                    args.subcommand,
                    args.positional
                );
                break;

            case "thinkback":
            case "year-in-review":
                await thinkbackCommand({
                    year: args.flags.year ? parseInt(String(args.flags.year)) : new Date().getFullYear(),
                    play: Boolean(args.flags.play)
                });
                break;

            case "vim":
                await vimCommand(args.subcommand);
                break;

            case "version":
                await printVersion();
                break;

            case "init":
                await initCommand();
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
