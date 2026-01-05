#!/usr/bin/env node
'use strict';

/**
 * Airdrop Hunter Bot - Command Line Interface
 *
 * Sprint 2.2: CLI Interface
 *
 * =============================================================================
 * THE 6 W's: COMMAND LINE INTERFACE
 * =============================================================================
 *
 * WHO:
 * ----
 * - POWER USERS: Developers and crypto enthusiasts who prefer terminal
 *   - Faster than web UI for repetitive tasks
 *   - Scriptable for automation
 *   - Works over SSH for remote management
 *
 * - BOT OPERATORS: People running the bot on servers
 *   - Headless environments (no GUI)
 *   - Containerized deployments (Docker, K8s)
 *   - CI/CD integration
 *
 * - SECURITY RESEARCHERS: Analyzing contracts before interaction
 *   - Quick drainer checks
 *   - Contract verification lookup
 *   - Risk assessment reports
 *
 * WHAT:
 * -----
 * The CLI provides:
 * 1. INTERACTIVE MODE - REPL for ongoing work
 *    - Tab completion
 *    - Command history
 *    - Context persistence
 *
 * 2. COMMAND MODE - Single command execution
 *    - Pipe-friendly output
 *    - Exit codes for scripting
 *    - JSON output option
 *
 * 3. SECURITY COMMANDS:
 *    - scan <address>: Multi-layer security analysis
 *    - verify <address>: Contract verification check
 *    - drainer <address>: Drainer detection
 *
 * 4. WALLET COMMANDS:
 *    - balance [address]: Check token balances
 *    - quote <from> <to> <amount>: Get swap quote
 *    - gas: Current gas prices
 *
 * 5. AIRDROP COMMANDS:
 *    - eligibility <protocol>: Check airdrop eligibility
 *    - activity: View activity history
 *
 * WHEN:
 * -----
 * WHEN to use CLI:
 * - Before interacting with any new contract
 * - When automating security checks in scripts
 * - When running on servers without GUI
 * - When you need quick, repeatable operations
 *
 * WHEN to use interactive mode:
 * - Exploratory security analysis
 * - Learning the tool
 * - Complex multi-step operations
 *
 * WHEN to use command mode:
 * - Single operations
 * - Shell scripts
 * - CI/CD pipelines
 *
 * WHERE:
 * ------
 * WHERE to run:
 * - Local development machine
 * - Remote servers via SSH
 * - Docker containers
 * - CI/CD runners
 *
 * WHERE output goes:
 * - stdout: Normal output (results, data)
 * - stderr: Errors and warnings
 * - Files: When using --output flag
 *
 * WHY:
 * ----
 * WHY a CLI:
 * 1. SPEED: Faster than web UI for power users
 * 2. AUTOMATION: Scripts can call commands
 * 3. PORTABILITY: Works anywhere Node.js runs
 * 4. COMPOSABILITY: Pipe output to other tools
 * 5. ACCESSIBILITY: Works in restricted environments
 *
 * WHY these specific commands:
 * - Security first: Most common use case is checking if a contract is safe
 * - Balance/quote: Essential DeFi operations
 * - Airdrop: The bot's primary purpose
 *
 * HOW:
 * ----
 * HOW to use:
 *
 * 1. Interactive Mode:
 *    $ node src/cli/index.js
 *    airdrop> scan 0x1234...
 *    airdrop> help
 *    airdrop> exit
 *
 * 2. Command Mode:
 *    $ node src/cli/index.js scan 0x1234...
 *    $ node src/cli/index.js --json verify 0x1234...
 *
 * 3. With environment:
 *    $ CHAIN_ID=137 node src/cli/index.js scan 0x1234...
 *
 * HOW it works internally:
 * 1. Parse arguments to determine mode
 * 2. If interactive: start REPL with readline
 * 3. If command: execute command and exit
 * 4. Load appropriate modules on demand
 * 5. Format output based on --json flag
 *
 * =============================================================================
 */

const readline = require('readline');
const { EventEmitter } = require('events');

// Lazy load security modules for performance
let drainerDetector = null;
let contractVerifier = null;

// =============================================================================
// CONSTANTS
// =============================================================================

const VERSION = '2.0.0';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

const CHAIN_NAMES = {
  1: 'Ethereum',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  8453: 'Base',
  56: 'BSC',
  43114: 'Avalanche',
};

// =============================================================================
// CLI CLASS
// =============================================================================

/**
 * Main CLI class
 */
class AirdropHunterCLI extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      jsonOutput: options.jsonOutput || false,
      chainId: options.chainId || parseInt(process.env.CHAIN_ID) || 1,
      interactive: options.interactive ?? true,
      color: options.color ?? process.stdout.isTTY,
    };

    this.rl = null;
    this.running = false;
    this.context = {
      lastAddress: null,
      lastResult: null,
    };

    // Command registry
    this.commands = new Map();
    this.registerCommands();
  }

  // ===========================================================================
  // COMMAND REGISTRATION
  // ===========================================================================

  registerCommands() {
    // Help
    this.commands.set('help', {
      description: 'Show help information',
      usage: 'help [command]',
      handler: this.cmdHelp.bind(this),
    });

    // Exit
    this.commands.set('exit', {
      description: 'Exit the CLI',
      usage: 'exit',
      aliases: ['quit', 'q'],
      handler: this.cmdExit.bind(this),
    });

    // Security commands
    this.commands.set('scan', {
      description: 'Full security scan of a contract',
      usage: 'scan <address> [chainId]',
      category: 'security',
      handler: this.cmdScan.bind(this),
    });

    this.commands.set('drainer', {
      description: 'Check if address is a known drainer',
      usage: 'drainer <address> [chainId]',
      category: 'security',
      handler: this.cmdDrainer.bind(this),
    });

    this.commands.set('verify', {
      description: 'Check contract verification status',
      usage: 'verify <address> [chainId]',
      category: 'security',
      handler: this.cmdVerify.bind(this),
    });

    // Info commands
    this.commands.set('status', {
      description: 'Show bot status and statistics',
      usage: 'status',
      category: 'info',
      handler: this.cmdStatus.bind(this),
    });

    this.commands.set('chain', {
      description: 'Get or set current chain',
      usage: 'chain [chainId]',
      category: 'info',
      handler: this.cmdChain.bind(this),
    });

    this.commands.set('version', {
      description: 'Show CLI version',
      usage: 'version',
      category: 'info',
      handler: this.cmdVersion.bind(this),
    });

    // Wallet commands
    this.commands.set('balance', {
      description: 'Check token balances',
      usage: 'balance <address> [chainId]',
      category: 'wallet',
      handler: this.cmdBalance.bind(this),
    });

    this.commands.set('gas', {
      description: 'Show current gas prices',
      usage: 'gas [chainId]',
      category: 'wallet',
      handler: this.cmdGas.bind(this),
    });

    // Clear
    this.commands.set('clear', {
      description: 'Clear the screen',
      usage: 'clear',
      handler: this.cmdClear.bind(this),
    });
  }

  // ===========================================================================
  // COMMAND HANDLERS
  // ===========================================================================

  async cmdHelp(args) {
    if (args.length > 0) {
      // Help for specific command
      const cmdName = args[0].toLowerCase();
      const cmd = this.commands.get(cmdName);

      if (!cmd) {
        return this.error(`Unknown command: ${cmdName}`);
      }

      this.output('');
      this.output(`${this.c(COLORS.bold)}${cmdName}${this.c(COLORS.reset)}`);
      this.output(`  ${cmd.description}`);
      this.output(`  Usage: ${cmd.usage}`);
      if (cmd.aliases) {
        this.output(`  Aliases: ${cmd.aliases.join(', ')}`);
      }
      return;
    }

    // General help
    this.output('');
    this.output(`${this.c(COLORS.bold)}${this.c(COLORS.cyan)}Airdrop Hunter Bot CLI v${VERSION}${this.c(COLORS.reset)}`);
    this.output(`${this.c(COLORS.dim)}AI-Powered Web3 Automation & Security${this.c(COLORS.reset)}`);
    this.output('');

    // Group commands by category
    const categories = new Map();
    for (const [name, cmd] of this.commands) {
      const cat = cmd.category || 'general';
      if (!categories.has(cat)) {
        categories.set(cat, []);
      }
      categories.get(cat).push({ name, ...cmd });
    }

    const categoryOrder = ['security', 'wallet', 'info', 'general'];
    const categoryNames = {
      security: '🔒 Security Commands',
      wallet: '💰 Wallet Commands',
      info: 'ℹ️  Info Commands',
      general: '⚙️  General Commands',
    };

    for (const cat of categoryOrder) {
      if (categories.has(cat)) {
        this.output(`${this.c(COLORS.bold)}${categoryNames[cat]}${this.c(COLORS.reset)}`);
        for (const cmd of categories.get(cat)) {
          const padding = ' '.repeat(12 - cmd.name.length);
          this.output(`  ${this.c(COLORS.cyan)}${cmd.name}${this.c(COLORS.reset)}${padding}${cmd.description}`);
        }
        this.output('');
      }
    }

    this.output(`${this.c(COLORS.dim)}Type "help <command>" for detailed usage.${this.c(COLORS.reset)}`);
  }

  async cmdExit() {
    this.output('Goodbye! Stay safe in Web3. 🛡️');
    this.stop();
  }

  async cmdScan(args) {
    if (args.length === 0) {
      return this.error('Usage: scan <address> [chainId]');
    }

    const address = args[0];
    const chainId = args[1] ? parseInt(args[1]) : this.options.chainId;

    if (!this.isValidAddress(address)) {
      return this.error('Invalid Ethereum address');
    }

    this.output(`\n${this.c(COLORS.cyan)}🔍 Scanning ${address}${this.c(COLORS.reset)}`);
    this.output(`Chain: ${CHAIN_NAMES[chainId] || chainId}`);
    this.output('');

    // Run drainer detection
    this.output(`${this.c(COLORS.bold)}[1/2] Drainer Detection${this.c(COLORS.reset)}`);
    const drainerResult = await this.runDrainerCheck(address, chainId);

    this.output('');

    // Run contract verification
    this.output(`${this.c(COLORS.bold)}[2/2] Contract Verification${this.c(COLORS.reset)}`);
    const verifyResult = await this.runVerificationCheck(address, chainId);

    // Summary
    this.output('');
    this.output(`${this.c(COLORS.bold)}━━━ SUMMARY ━━━${this.c(COLORS.reset)}`);

    const drainerSafe = drainerResult?.isSafe?.() ?? !drainerResult?.blocked;
    const verifySafe = verifyResult?.isSafe?.() ?? !verifyResult?.shouldBlock?.();

    if (drainerSafe && verifySafe) {
      this.output(`${this.c(COLORS.green)}✅ No critical issues detected${this.c(COLORS.reset)}`);
    } else if (!drainerSafe) {
      this.output(`${this.c(COLORS.bgRed)}${this.c(COLORS.white)} ⛔ DRAINER DETECTED - DO NOT INTERACT ${this.c(COLORS.reset)}`);
    } else {
      this.output(`${this.c(COLORS.yellow)}⚠️  Caution advised - verify manually${this.c(COLORS.reset)}`);
    }

    this.context.lastAddress = address;
    this.context.lastResult = { drainer: drainerResult, verify: verifyResult };

    if (this.options.jsonOutput) {
      return { drainer: drainerResult?.toJSON?.(), verify: verifyResult?.toJSON?.() };
    }
  }

  async cmdDrainer(args) {
    if (args.length === 0) {
      return this.error('Usage: drainer <address> [chainId]');
    }

    const address = args[0];
    const chainId = args[1] ? parseInt(args[1]) : this.options.chainId;

    if (!this.isValidAddress(address)) {
      return this.error('Invalid Ethereum address');
    }

    this.output(`\n${this.c(COLORS.cyan)}🔍 Drainer Check: ${address}${this.c(COLORS.reset)}`);
    this.output(`Chain: ${CHAIN_NAMES[chainId] || chainId}\n`);

    const result = await this.runDrainerCheck(address, chainId);

    this.context.lastAddress = address;
    this.context.lastResult = result;

    if (this.options.jsonOutput) {
      return result?.toJSON?.();
    }
  }

  async cmdVerify(args) {
    if (args.length === 0) {
      return this.error('Usage: verify <address> [chainId]');
    }

    const address = args[0];
    const chainId = args[1] ? parseInt(args[1]) : this.options.chainId;

    if (!this.isValidAddress(address)) {
      return this.error('Invalid Ethereum address');
    }

    this.output(`\n${this.c(COLORS.cyan)}🔍 Verification Check: ${address}${this.c(COLORS.reset)}`);
    this.output(`Chain: ${CHAIN_NAMES[chainId] || chainId}\n`);

    const result = await this.runVerificationCheck(address, chainId);

    this.context.lastAddress = address;
    this.context.lastResult = result;

    if (this.options.jsonOutput) {
      return result?.toJSON?.();
    }
  }

  async cmdStatus() {
    this.output('');
    this.output(`${this.c(COLORS.bold)}${this.c(COLORS.cyan)}Bot Status${this.c(COLORS.reset)}`);
    this.output('');

    // Show chain
    this.output(`Current Chain: ${CHAIN_NAMES[this.options.chainId] || this.options.chainId} (${this.options.chainId})`);

    // Show security module status
    this.output('');
    this.output(`${this.c(COLORS.bold)}Security Modules:${this.c(COLORS.reset)}`);

    if (drainerDetector) {
      const stats = drainerDetector.getStatistics();
      this.output(`  Drainer Detector: ${this.c(COLORS.green)}Active${this.c(COLORS.reset)}`);
      this.output(`    Analyzed: ${stats.analyzed}`);
      this.output(`    Blocked: ${stats.blocked}`);
    } else {
      this.output(`  Drainer Detector: ${this.c(COLORS.dim)}Not loaded${this.c(COLORS.reset)}`);
    }

    if (contractVerifier) {
      const stats = contractVerifier.getStatistics();
      this.output(`  Contract Verifier: ${this.c(COLORS.green)}Active${this.c(COLORS.reset)}`);
      this.output(`    Verified: ${stats.verified}`);
      this.output(`    Cache size: ${stats.cacheSize}`);
    } else {
      this.output(`  Contract Verifier: ${this.c(COLORS.dim)}Not loaded${this.c(COLORS.reset)}`);
    }
  }

  async cmdChain(args) {
    if (args.length === 0) {
      this.output(`Current chain: ${CHAIN_NAMES[this.options.chainId] || 'Unknown'} (${this.options.chainId})`);
      this.output('');
      this.output('Available chains:');
      for (const [id, name] of Object.entries(CHAIN_NAMES)) {
        const marker = parseInt(id) === this.options.chainId ? ' ←' : '';
        this.output(`  ${id}: ${name}${marker}`);
      }
      return;
    }

    const chainId = parseInt(args[0]);
    if (isNaN(chainId)) {
      return this.error('Invalid chain ID');
    }

    this.options.chainId = chainId;
    this.output(`Switched to chain: ${CHAIN_NAMES[chainId] || 'Unknown'} (${chainId})`);
  }

  async cmdVersion() {
    this.output(`Airdrop Hunter Bot CLI v${VERSION}`);
  }

  async cmdBalance(args) {
    if (args.length === 0) {
      return this.error('Usage: balance <address> [chainId]');
    }

    const address = args[0];
    const chainId = args[1] ? parseInt(args[1]) : this.options.chainId;

    if (!this.isValidAddress(address)) {
      return this.error('Invalid Ethereum address');
    }

    this.output(`\n${this.c(COLORS.cyan)}💰 Balance: ${address}${this.c(COLORS.reset)}`);
    this.output(`Chain: ${CHAIN_NAMES[chainId] || chainId}`);
    this.output('');
    this.output(`${this.c(COLORS.dim)}(Balance lookup requires RPC connection - not implemented in demo)${this.c(COLORS.reset)}`);
  }

  async cmdGas(args) {
    const chainId = args[0] ? parseInt(args[0]) : this.options.chainId;

    this.output(`\n${this.c(COLORS.cyan)}⛽ Gas Prices${this.c(COLORS.reset)}`);
    this.output(`Chain: ${CHAIN_NAMES[chainId] || chainId}`);
    this.output('');
    this.output(`${this.c(COLORS.dim)}(Gas price lookup requires RPC connection - not implemented in demo)${this.c(COLORS.reset)}`);
  }

  async cmdClear() {
    console.clear();
  }

  // ===========================================================================
  // SECURITY CHECK HELPERS
  // ===========================================================================

  async runDrainerCheck(address, chainId) {
    try {
      if (!drainerDetector) {
        const { createDrainerDetector } = require('../security/drainer-detection');
        drainerDetector = createDrainerDetector({
          logger: { warn: () => {}, error: () => {}, debug: () => {} }, // Suppress logging
        });
      }

      const result = await drainerDetector.analyze(address, chainId);

      // Display result
      if (result.blocked) {
        this.output(`${this.c(COLORS.bgRed)}${this.c(COLORS.white)} ⛔ BLOCKED ${this.c(COLORS.reset)} Risk Level: ${this.c(COLORS.red)}${result.riskLevel.toUpperCase()}${this.c(COLORS.reset)}`);

        if (result.detections?.length > 0) {
          this.output(`\n${this.c(COLORS.bold)}Detections:${this.c(COLORS.reset)}`);
          for (const d of result.detections) {
            this.output(`  • [${d.layer}] ${d.reason}`);
          }
        }
      } else if (result.riskLevel !== 'safe') {
        this.output(`${this.c(COLORS.yellow)}⚠️  Warning${this.c(COLORS.reset)} Risk Level: ${result.riskLevel}`);
      } else {
        this.output(`${this.c(COLORS.green)}✅ Safe${this.c(COLORS.reset)} No drainer signatures detected`);
      }

      return result;
    } catch (err) {
      this.error(`Drainer check failed: ${err.message}`);
      return null;
    }
  }

  async runVerificationCheck(address, chainId) {
    try {
      if (!contractVerifier) {
        const { createContractVerifier } = require('../security/contract-verifier');
        contractVerifier = createContractVerifier({
          logger: { warn: () => {}, error: () => {}, debug: () => {} },
        });
      }

      const result = await contractVerifier.verify(address, chainId);

      // Display result
      const trustColors = {
        safe: COLORS.green,
        caution: COLORS.yellow,
        risky: COLORS.red,
        blocked: COLORS.bgRed,
      };

      const color = trustColors[result.trustLevel] || COLORS.reset;
      this.output(`Trust Level: ${this.c(color)}${result.trustLevel.toUpperCase()}${this.c(COLORS.reset)} (Score: ${result.score})`);

      // Show components
      this.output(`\n${this.c(COLORS.bold)}Score Breakdown:${this.c(COLORS.reset)}`);
      for (const [name, comp] of Object.entries(result.components)) {
        const scoreStr = comp.score >= 0 ? `+${comp.score}` : comp.score;
        this.output(`  ${name}: ${scoreStr}`);
      }

      // Show warnings
      if (result.warnings?.length > 0) {
        this.output(`\n${this.c(COLORS.yellow)}Warnings:${this.c(COLORS.reset)}`);
        for (const w of result.warnings) {
          this.output(`  • ${w.message}`);
        }
      }

      // Show flags
      if (result.flags?.length > 0) {
        this.output(`\n${this.c(COLORS.bold)}Flags:${this.c(COLORS.reset)}`);
        for (const f of result.flags) {
          const flagColor = f.severity === 'critical' ? COLORS.red :
            f.severity === 'warning' ? COLORS.yellow :
            f.severity === 'positive' ? COLORS.green : COLORS.reset;
          this.output(`  ${this.c(flagColor)}• ${f.flag}${this.c(COLORS.reset)}`);
        }
      }

      return result;
    } catch (err) {
      this.error(`Verification check failed: ${err.message}`);
      return null;
    }
  }

  // ===========================================================================
  // OUTPUT HELPERS
  // ===========================================================================

  output(message) {
    if (this.options.jsonOutput) return;
    console.log(message);
  }

  error(message) {
    console.error(`${this.c(COLORS.red)}Error: ${message}${this.c(COLORS.reset)}`);
  }

  c(color) {
    return this.options.color ? color : '';
  }

  // ===========================================================================
  // VALIDATION HELPERS
  // ===========================================================================

  isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  // ===========================================================================
  // REPL
  // ===========================================================================

  async start() {
    this.running = true;

    // Banner
    this.output('');
    this.output(`${this.c(COLORS.bold)}${this.c(COLORS.cyan)}╔═══════════════════════════════════════════╗${this.c(COLORS.reset)}`);
    this.output(`${this.c(COLORS.bold)}${this.c(COLORS.cyan)}║   ${this.c(COLORS.white)}Airdrop Hunter Bot CLI v${VERSION}${this.c(COLORS.cyan)}         ║${this.c(COLORS.reset)}`);
    this.output(`${this.c(COLORS.bold)}${this.c(COLORS.cyan)}║   ${this.c(COLORS.dim)}AI-Powered Web3 Automation${this.c(COLORS.cyan)}           ║${this.c(COLORS.reset)}`);
    this.output(`${this.c(COLORS.bold)}${this.c(COLORS.cyan)}╚═══════════════════════════════════════════╝${this.c(COLORS.reset)}`);
    this.output('');
    this.output(`${this.c(COLORS.dim)}Type "help" for available commands. Type "exit" to quit.${this.c(COLORS.reset)}`);
    this.output(`Current chain: ${CHAIN_NAMES[this.options.chainId] || this.options.chainId}`);
    this.output('');

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${this.c(COLORS.cyan)}airdrop${this.c(COLORS.reset)}> `,
    });

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const input = line.trim();

      if (input) {
        await this.executeCommand(input);
      }

      if (this.running) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.stop();
    });
  }

  stop() {
    this.running = false;
    if (this.rl) {
      this.rl.close();
    }

    // Cleanup security modules
    if (drainerDetector) {
      drainerDetector = null;
    }
    if (contractVerifier) {
      contractVerifier.stop();
      contractVerifier = null;
    }

    process.exit(0);
  }

  async executeCommand(input) {
    const parts = input.split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Check for aliases
    let cmd = this.commands.get(cmdName);
    if (!cmd) {
      for (const [name, c] of this.commands) {
        if (c.aliases?.includes(cmdName)) {
          cmd = c;
          break;
        }
      }
    }

    if (!cmd) {
      this.error(`Unknown command: ${cmdName}. Type "help" for available commands.`);
      return;
    }

    try {
      const result = await cmd.handler(args);
      if (this.options.jsonOutput && result) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      this.error(`Command failed: ${err.message}`);
    }
  }
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    jsonOutput: false,
    chainId: parseInt(process.env.CHAIN_ID) || 1,
    interactive: true,
    command: null,
    commandArgs: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--json' || arg === '-j') {
      options.jsonOutput = true;
    } else if (arg === '--chain' || arg === '-c') {
      i++;
      options.chainId = parseInt(args[i]) || 1;
    } else if (arg === '--help' || arg === '-h') {
      options.command = 'help';
      options.interactive = false;
    } else if (arg === '--version' || arg === '-v') {
      options.command = 'version';
      options.interactive = false;
    } else if (!arg.startsWith('-')) {
      // First non-flag argument is the command
      if (!options.command) {
        options.command = arg;
        options.interactive = false;
      } else {
        options.commandArgs.push(arg);
      }
    }

    i++;
  }

  return options;
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  const cli = new AirdropHunterCLI({
    jsonOutput: options.jsonOutput,
    chainId: options.chainId,
    color: !options.jsonOutput && process.stdout.isTTY,
  });

  if (options.interactive && !options.command) {
    // Interactive mode
    await cli.start();
  } else if (options.command) {
    // Command mode
    await cli.executeCommand(`${options.command} ${options.commandArgs.join(' ')}`.trim());
    process.exit(0);
  } else {
    // Show help if no args
    await cli.cmdHelp([]);
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  AirdropHunterCLI,
  parseArgs,
  main,
  VERSION,
};
