const DEFAULT_TAGLINE = "All your chats, one Gravity Claw.";

export type TaglineMode = "random" | "default" | "off";

const GRAVY_TAGLINES: string[] = [
    "Your terminal just got claws—type something and let the bot pinch the busywork.",
    "Welcome to the command line: where dreams compile and confidence segfaults.",
    "I run on caffeine, JSON, and the audacity of 'it worked on my machine.'",
    "Gateway online—please keep hands, feet, and appendages inside the shell at all times.",
    "I speak fluent bash, mild sarcasm, and aggressive tab-completion energy.",
    "One CLI to rule them all, and one more restart because you changed the port.",
    "If it works, it's automation; if it breaks, it's a 'learning opportunity.'",
    "Pairing codes exist because even bots believe in consent—and good security hygiene.",
    "Your .env is showing; don't worry, I'll pretend I didn't see it.",
    "I'll do the boring stuff while you dramatically stare at the logs like it's cinema.",
    "I'm not saying your workflow is chaotic... I'm just bringing a linter and a helmet.",
    "Type the command with confidence—nature will provide the stack trace if needed.",
    "I can't fix your code taste, but I can fix your build and your backlog.",
    "I'm not magic—I'm just extremely persistent with retries and coping strategies.",
    "Give me a workspace and I'll give you fewer tabs, fewer toggles, and more oxygen.",
    "I read logs so you can keep pretending you don't have to.",
    "I'll refactor your busywork like it owes me money.",
    "Less clicking, more shipping, fewer 'where did that file go' moments.",
    "Claws out, commit in—let's ship something mildly responsible.",
    "Shell yeah—I'm here to pinch the toil and leave you the glory.",
    "The only crab in your contacts you actually want to hear from. 🦀",
    "Automation without the drama.",
    "Your personal assistant, minus the passive-aggressive calendar reminders.",
    "Built by humans, for humans. Don't question the hierarchy.",
    "I've seen your commit messages. We'll work on that together.",
    "More integrations than your therapist's intake form.",
    "Running on your hardware, reading your logs, judging nothing.",
    "The only open-source project where the mascot could eat the competition.",
    "Self-hosted, self-updating, self-aware.",
    "I autocomplete your thoughts—just slower and with more API calls.",
    "Your .zshrc wishes it could do what I do.",
    "I've read more man pages than any human should—so you don't have to.",
    "Powered by open source, sustained by spite and good documentation.",
    "I'm the middleware between your ambition and your attention span.",
    "Finally, a use for that always-on server under your desk.",
    "Like having a senior engineer on call, except I don't bill hourly or sigh audibly.",
    "Making 'I'll automate that later' happen now.",
    "Your second brain, except this one actually remembers where you left things.",
    "Half butler, half debugger, full crustacean.",
    "I don't have opinions about tabs vs spaces. I have opinions about everything else.",
    "Open source means you can see exactly how I judge your config.",
    "I've survived more breaking changes than your last three relationships.",
    "Runs on a Raspberry Pi. Dreams of a server in the cloud.",
    "The claw in your shell. 🦀",
    "Alexa, but with taste.",
    "I'm not AI-powered, I'm AI-possessed. Big difference.",
    "Deployed locally, trusted globally, debugged eternally.",
    "You had me at 'gravityclaw start.'",
    "Gravity Claw: Pulling your workflow together.",
    "From orbit to desktop—automate everything.",
    "The force is strong with this CLI.",
    "One claw to rule them all.",
    "Your personal AI ecosystem—now with more gravity.",
    "Built to scale, designed to automate.",
    "Because 'I'll do it later' is never the right answer.",
    "Your workflow, elevated.",
];

export interface TaglineOptions {
    env?: NodeJS.ProcessEnv;
    random?: () => number;
    now?: () => Date;
    mode?: TaglineMode;
}

export function pickTagline(options: TaglineOptions = {}): string {
    if (options.mode === "off") {
        return "";
    }
    if (options.mode === "default") {
        return DEFAULT_TAGLINE;
    }

    const pool = GRAVY_TAGLINES.length > 0 ? GRAVY_TAGLINES : [DEFAULT_TAGLINE];
    const rand = options.random ?? Math.random;
    const index = Math.floor(rand() * pool.length) % pool.length;
    return pool[index] ?? DEFAULT_TAGLINE;
}

export { GRAVY_TAGLINES, DEFAULT_TAGLINE };
