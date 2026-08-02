/**
 * Command Validation & Security Module
 *
 * Provides secure command validation for shell execution with:
 * - Strict command allowlisting
 * - Command chaining detection and blocking
 * - Dangerous flag pattern detection
 * - Command-specific validation (npm, node, python, git)
 * - Comprehensive logging and telemetry
 */

import { createLogger } from '../logger.ts';

const logger = createLogger('command-validator');

/**
 * Command validation result
 */
export interface CommandValidation {
  allowed: boolean;
  reason?: string;
  parsed: {
    baseCommand: string;
    args: string[];
    hasChaining: boolean;
    hasRedirection: boolean;
    hasInjection: boolean;
  };
}

/**
 * Strict allowlist of permitted base commands
 */
const ALLOWED_COMMANDS = new Set([
  // File operations
  'ls',
  'dir',
  'cat',
  'type',
  'head',
  'tail',
  'wc',
  'pwd',
  'echo',
  // PowerShell cmdlets
  'get-childitem',
  'get-ciminstance',
  'get-process',
  'get-netipaddress',
  'get-netadapter',
  'get-nettcpconnection',
  'get-command',
  'get-help',
  'sort-object',
  'select-object',
  'format-table',
  // Git
  'git',
  // Node
  'node',
  // Python
  'python',
  'python3',
  'pip',
  'pip3',
  // npm (with restrictions)
  'npm',
]);

/**
 * Dangerous argument patterns (case-insensitive)
 */
const DANGEROUS_ARGS = [
  '-e',
  '--eval',
  '-c',
  '--command', // Inline execution
  '-r',
  '--require', // Module loading
  '--shell',
  '-s', // Shell spawning
  '--interactive',
  '-i', // Interactive mode
  '-m', // Python module execution
];

/**
 * Dangerous environment variable access patterns (case-insensitive)
 */
const DANGEROUS_ENV_PATTERNS = [
  '$env', // PowerShell environment variable
  'process.env', // Node.js environment variable
  '%env%', // Windows environment variable
  '${', // Shell variable expansion
  '$(', // Command substitution
  '$(',
  '`', // Backtick command substitution
  '|xargs', // Pipe to arg expansion
  'xargs', // Argument expansion
];

// Blocked commands that could reveal env vars
const ENV_EXFIL_COMMANDS = [
  'printenv',
  'env',
  'set',
  'readonly',
  'declare',
  'typeset',
  'export -p',
];

/**
 * Allowed npm subcommands
 */
const ALLOWED_NPM_SUBCOMMANDS = new Set(['run', 'test', 'build', 'start', 'install', 'ci']);

/**
 * Allowed npm run script names
 */
const ALLOWED_NPM_SCRIPTS = new Set(['dev', 'build', 'test', 'start', 'lint', 'typecheck']);

/**
 * Dangerous git commands to block
 */
const BLOCKED_GIT_COMMANDS = [
  'push --force',
  'reset --hard',
  'clean -fd',
  'push --force-with-lease',
  'rebase --interactive',
];

/**
 * Dangerous node flags
 */
const BLOCKED_NODE_FLAGS = new Set([
  '-e',
  '--eval',
  '--inspect',
  '--debug',
  '--watch',
  '--watch-preserve-output',
]);

/**
 * Validate a shell command for security
 * @param command - The command string to validate
 * @returns Validation result with parsed command details
 */
export function validateCommand(command: string): CommandValidation {
  // 1. Parse command into tokens
  const tokens = parseCommand(command);

  // 2. Check for chaining operators
  const hasChaining =
    /[;&|]/.test(command) || tokens.some((t) => t === '&&' || t === '||' || t === ';');

  // 3. Check for redirection
  const hasRedirection = /[<>|]/.test(command);

  // 4. Check for injection attempts
  const hasInjection = tokens.some((token) =>
    DANGEROUS_ARGS.some((arg) => token.toLowerCase() === arg.toLowerCase()),
  );

  // 5. Get base command
  const baseCommand = tokens[0]?.toLowerCase() || '';

  // 4b. Check for dangerous environment patterns - handle $VAR and %VAR% formats
  const hasDollarVar = /\$[a-zA-Z_][a-zA-Z0-9_]*/.test(command);
  const hasPercentVar = /%[a-zA-Z_][a-zA-Z0-9_]*%/i.test(command);
  const hasBacktick = /`/.test(command);
  const hasEnvAccess =
    hasDollarVar ||
    hasPercentVar ||
    hasBacktick ||
    DANGEROUS_ENV_PATTERNS.some((pattern) => command.toLowerCase().includes(pattern.toLowerCase()));
  if (hasEnvAccess) {
    const hint = hasBacktick
      ? 'RECOVERY HINT: Command substitution (`...`) is not allowed.'
      : 'RECOVERY HINT: Environment variable syntax ($env / %VAR%) is blocked for security. Pass explicit literal paths directly (e.g., dir "C:\\Users\\...\\Downloads").';
    return {
      allowed: false,
      reason: `${hasBacktick ? 'Command substitution not allowed' : 'Environment variable access not allowed'}. ${hint}`,
      parsed: {
        baseCommand,
        args: tokens.slice(1),
        hasChaining: hasChaining || hasBacktick,
        hasRedirection,
        hasInjection,
      },
    };
  }

  // 5b. Check for commands that could exfiltrate environment variables
  const commandLower = command.toLowerCase().trim();
  for (const exfilCmd of ENV_EXFIL_COMMANDS) {
    if (
      commandLower.startsWith(exfilCmd) ||
      commandLower.includes(' ' + exfilCmd) ||
      commandLower.includes('|' + exfilCmd)
    ) {
      return {
        allowed: false,
        reason: `Command could expose environment variables: ${exfilCmd}`,
        parsed: {
          baseCommand,
          args: tokens.slice(1),
          hasChaining,
          hasRedirection,
          hasInjection: true,
        },
      };
    }
  }

  // 6. Validate base command
  if (!ALLOWED_COMMANDS.has(baseCommand)) {
    const hint =
      baseCommand === 'powershell' || baseCommand === 'powershell.exe'
        ? 'RECOVERY HINT: Do not wrap commands with "powershell -Command". Pass PowerShell cmdlets directly (e.g., Get-ChildItem "C:\\Users\\...").'
        : `RECOVERY HINT: Use an allowlisted base command (ls, dir, cat, type, echo, Get-ChildItem, Get-CimInstance, etc.).`;
    return {
      allowed: false,
      reason: `Command not allowed: ${baseCommand}. ${hint}`,
      parsed: { baseCommand, args: tokens.slice(1), hasChaining, hasRedirection, hasInjection },
    };
  }

  // 7. Command-specific validation
  const commandSpecificValidation = validateCommandSpecific(baseCommand, tokens.slice(1));
  if (!commandSpecificValidation.allowed) {
    return commandSpecificValidation;
  }

  // 8. Final validation - check for dangerous patterns
  if (hasChaining || hasRedirection || hasInjection) {
    const hint = hasChaining
      ? 'RECOVERY HINT: Command chaining (| or ;) is not allowed. Execute a single un-chained command (e.g., Get-ChildItem "D:\\Projects\\...").'
      : hasRedirection
        ? 'RECOVERY HINT: File redirection (> or >>) is not allowed.'
        : 'RECOVERY HINT: Command contains unsafe arguments or injection tokens.';
    return {
      allowed: false,
      reason: `Command contains dangerous patterns. ${hint}`,
      parsed: { baseCommand, args: tokens.slice(1), hasChaining, hasRedirection, hasInjection },
    };
  }

  return {
    allowed: true,
    parsed: { baseCommand, args: tokens.slice(1), hasChaining, hasRedirection, hasInjection },
  };
}

/**
 * Parse a command string into tokens, respecting quotes
 * @param command - Command string to parse
 * @returns Array of command tokens
 */
function parseCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Validate command-specific rules for base commands
 * @param baseCommand - The base command to validate
 * @param args - Command arguments
 * @returns Validation result
 */
function validateCommandSpecific(baseCommand: string, args: string[]): CommandValidation {
  switch (baseCommand) {
    case 'npm':
      return validateNpmCommand(args);
    case 'node':
      return validateNodeCommand(args);
    case 'python':
    case 'python3':
      return validatePythonCommand(args);
    case 'git':
      return validateGitCommand(args);
    default:
      return {
        allowed: true,
        parsed: {
          baseCommand,
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: false,
        },
      };
  }
}

/**
 * Validate npm commands with strict subcommand and script restrictions
 * @param args - npm command arguments
 * @returns Validation result
 */
function validateNpmCommand(args: string[]): CommandValidation {
  const subcommand = args[0]?.toLowerCase();

  if (!subcommand) {
    return {
      allowed: false,
      reason: 'npm requires a subcommand',
      parsed: {
        baseCommand: 'npm',
        args,
        hasChaining: false,
        hasRedirection: false,
        hasInjection: false,
      },
    };
  }

  if (!ALLOWED_NPM_SUBCOMMANDS.has(subcommand)) {
    return {
      allowed: false,
      reason: `npm subcommand not allowed: ${subcommand}`,
      parsed: {
        baseCommand: 'npm',
        args,
        hasChaining: false,
        hasRedirection: false,
        hasInjection: false,
      },
    };
  }

  // For npm run, validate script name
  if (subcommand === 'run' && args[1]) {
    const scriptName = args[1].toLowerCase();
    if (!ALLOWED_NPM_SCRIPTS.has(scriptName)) {
      return {
        allowed: false,
        reason: `npm run script not allowed: ${scriptName}`,
        parsed: {
          baseCommand: 'npm',
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: false,
        },
      };
    }

    // Block any additional arguments after script name
    if (args.length > 2) {
      return {
        allowed: false,
        reason: 'npm run scripts cannot have additional arguments',
        parsed: {
          baseCommand: 'npm',
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: false,
        },
      };
    }
  }

  // For npm install, only allow package names from package.json
  if (subcommand === 'install' || subcommand === 'ci') {
    // npm install without arguments is safe (installs from package.json)
    // npm ci is safe
    return {
      allowed: true,
      parsed: {
        baseCommand: 'npm',
        args,
        hasChaining: false,
        hasRedirection: false,
        hasInjection: false,
      },
    };
  }

  return {
    allowed: true,
    parsed: {
      baseCommand: 'npm',
      args,
      hasChaining: false,
      hasRedirection: false,
      hasInjection: false,
    },
  };
}

/**
 * Validate node commands with restrictions on execution methods
 * @param args - node command arguments
 * @returns Validation result
 */
function validateNodeCommand(args: string[]): CommandValidation {
  // Check for dangerous flags
  for (const arg of args) {
    if (BLOCKED_NODE_FLAGS.has(arg)) {
      return {
        allowed: false,
        reason: `Node flag not allowed: ${arg}`,
        parsed: {
          baseCommand: 'node',
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: true,
        },
      };
    }
  }

  // If running a file, validate path
  const fileArg = args.find((arg) => !arg.startsWith('-'));
  if (fileArg) {
    // Allow relative paths only (must start with ./ or ../ or be in current directory)
    if (
      !fileArg.startsWith('./') &&
      !fileArg.startsWith('../') &&
      !fileArg.match(/^[a-zA-Z0-9_-]+\.js$/)
    ) {
      return {
        allowed: false,
        reason: 'Node script must be relative path (./ or ../) or local file in current directory',
        parsed: {
          baseCommand: 'node',
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: false,
        },
      };
    }
  }

  return {
    allowed: true,
    parsed: {
      baseCommand: 'node',
      args,
      hasChaining: false,
      hasRedirection: false,
      hasInjection: false,
    },
  };
}

/**
 * Validate python commands with restrictions on execution methods
 * @param args - python command arguments
 * @returns Validation result
 */
function validatePythonCommand(args: string[]): CommandValidation {
  // Check for dangerous flags
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg && ['-c', '--command', '-m'].includes(arg)) {
      return {
        allowed: false,
        reason: `Python flag not allowed: ${arg}`,
        parsed: {
          baseCommand: 'python',
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: true,
        },
      };
    }

    // Check if -m is followed by a module name (still block it)
    if (arg === '-m' && i + 1 < args.length) {
      return {
        allowed: false,
        reason: 'Python module execution (-m) not allowed',
        parsed: {
          baseCommand: 'python',
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: true,
        },
      };
    }
  }

  // For python scripts, validate file path similar to node
  const fileArg = args.find((arg) => !arg.startsWith('-'));
  if (fileArg) {
    if (
      !fileArg.startsWith('./') &&
      !fileArg.startsWith('../') &&
      !fileArg.match(/^[a-zA-Z0-9_-]+\.py$/)
    ) {
      return {
        allowed: false,
        reason:
          'Python script must be relative path (./ or ../) or local file in current directory',
        parsed: {
          baseCommand: 'python',
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: false,
        },
      };
    }
  }

  return {
    allowed: true,
    parsed: {
      baseCommand: 'python',
      args,
      hasChaining: false,
      hasRedirection: false,
      hasInjection: false,
    },
  };
}

/**
 * Validate git commands with restrictions on dangerous operations
 * @param args - git command arguments
 * @returns Validation result
 */
function validateGitCommand(args: string[]): CommandValidation {
  if (args.length === 0) {
    return {
      allowed: false,
      reason: 'git requires a subcommand',
      parsed: {
        baseCommand: 'git',
        args,
        hasChaining: false,
        hasRedirection: false,
        hasInjection: false,
      },
    };
  }

  const gitCommand = args.join(' ');

  // Check for blocked git commands
  for (const blocked of BLOCKED_GIT_COMMANDS) {
    if (gitCommand.includes(blocked)) {
      return {
        allowed: false,
        reason: `Git command not allowed: ${blocked}`,
        parsed: {
          baseCommand: 'git',
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: false,
        },
      };
    }
  }

  // Block dangerous git flags
  const dangerousFlags = ['--force', '-f'];
  for (const arg of args) {
    if (dangerousFlags.includes(arg)) {
      return {
        allowed: false,
        reason: `Git flag not allowed: ${arg}`,
        parsed: {
          baseCommand: 'git',
          args,
          hasChaining: false,
          hasRedirection: false,
          hasInjection: false,
        },
      };
    }
  }

  return {
    allowed: true,
    parsed: {
      baseCommand: 'git',
      args,
      hasChaining: false,
      hasRedirection: false,
      hasInjection: false,
    },
  };
}
