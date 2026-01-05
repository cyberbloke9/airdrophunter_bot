/**
 * CLI Module Tests
 *
 * Tests for the command line interface including:
 * - Argument parsing
 * - Command registration
 * - Command execution
 * - Output formatting
 */

const {
  AirdropHunterCLI,
  parseArgs,
  VERSION,
} = require('../../src/cli');

describe('CLI Module', () => {
  let cli;

  beforeEach(() => {
    // Create CLI with no color output for testing
    cli = new AirdropHunterCLI({
      color: false,
      jsonOutput: false,
      interactive: false,
    });
  });

  describe('Constants', () => {
    test('should have version defined', () => {
      expect(VERSION).toBeDefined();
      expect(typeof VERSION).toBe('string');
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('parseArgs', () => {
    test('should parse empty args', () => {
      const options = parseArgs([]);
      expect(options.interactive).toBe(true);
      expect(options.command).toBeNull();
      expect(options.jsonOutput).toBe(false);
    });

    test('should parse --json flag', () => {
      const options = parseArgs(['--json']);
      expect(options.jsonOutput).toBe(true);
    });

    test('should parse -j flag', () => {
      const options = parseArgs(['-j']);
      expect(options.jsonOutput).toBe(true);
    });

    test('should parse --chain flag', () => {
      const options = parseArgs(['--chain', '137']);
      expect(options.chainId).toBe(137);
    });

    test('should parse -c flag', () => {
      const options = parseArgs(['-c', '42161']);
      expect(options.chainId).toBe(42161);
    });

    test('should parse command', () => {
      const options = parseArgs(['scan']);
      expect(options.command).toBe('scan');
      expect(options.interactive).toBe(false);
    });

    test('should parse command with args', () => {
      const options = parseArgs(['scan', '0x1234567890123456789012345678901234567890']);
      expect(options.command).toBe('scan');
      expect(options.commandArgs).toContain('0x1234567890123456789012345678901234567890');
    });

    test('should parse --help flag', () => {
      const options = parseArgs(['--help']);
      expect(options.command).toBe('help');
      expect(options.interactive).toBe(false);
    });

    test('should parse --version flag', () => {
      const options = parseArgs(['--version']);
      expect(options.command).toBe('version');
      expect(options.interactive).toBe(false);
    });

    test('should parse multiple flags with command', () => {
      const options = parseArgs(['--json', '--chain', '137', 'scan', '0x1234']);
      expect(options.jsonOutput).toBe(true);
      expect(options.chainId).toBe(137);
      expect(options.command).toBe('scan');
      expect(options.commandArgs).toContain('0x1234');
    });
  });

  describe('AirdropHunterCLI', () => {
    describe('Initialization', () => {
      test('should create with default options', () => {
        const defaultCli = new AirdropHunterCLI();
        expect(defaultCli).toBeDefined();
        expect(defaultCli.options.chainId).toBe(1);
      });

      test('should accept custom options', () => {
        const customCli = new AirdropHunterCLI({
          chainId: 137,
          jsonOutput: true,
        });
        expect(customCli.options.chainId).toBe(137);
        expect(customCli.options.jsonOutput).toBe(true);
      });

      test('should register commands', () => {
        expect(cli.commands.size).toBeGreaterThan(0);
        expect(cli.commands.has('help')).toBe(true);
        expect(cli.commands.has('scan')).toBe(true);
        expect(cli.commands.has('drainer')).toBe(true);
        expect(cli.commands.has('verify')).toBe(true);
      });
    });

    describe('Commands', () => {
      test('should have help command', () => {
        const cmd = cli.commands.get('help');
        expect(cmd).toBeDefined();
        expect(cmd.description).toBeDefined();
        expect(typeof cmd.handler).toBe('function');
      });

      test('should have exit command with aliases', () => {
        const cmd = cli.commands.get('exit');
        expect(cmd).toBeDefined();
        expect(cmd.aliases).toContain('quit');
        expect(cmd.aliases).toContain('q');
      });

      test('should have scan command', () => {
        const cmd = cli.commands.get('scan');
        expect(cmd).toBeDefined();
        expect(cmd.category).toBe('security');
      });

      test('should have drainer command', () => {
        const cmd = cli.commands.get('drainer');
        expect(cmd).toBeDefined();
        expect(cmd.category).toBe('security');
      });

      test('should have verify command', () => {
        const cmd = cli.commands.get('verify');
        expect(cmd).toBeDefined();
        expect(cmd.category).toBe('security');
      });

      test('should have status command', () => {
        const cmd = cli.commands.get('status');
        expect(cmd).toBeDefined();
        expect(cmd.category).toBe('info');
      });

      test('should have chain command', () => {
        const cmd = cli.commands.get('chain');
        expect(cmd).toBeDefined();
        expect(cmd.category).toBe('info');
      });

      test('should have balance command', () => {
        const cmd = cli.commands.get('balance');
        expect(cmd).toBeDefined();
        expect(cmd.category).toBe('wallet');
      });

      test('should have gas command', () => {
        const cmd = cli.commands.get('gas');
        expect(cmd).toBeDefined();
        expect(cmd.category).toBe('wallet');
      });
    });

    describe('Address Validation', () => {
      test('should validate valid addresses', () => {
        expect(cli.isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
        expect(cli.isValidAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe(true);
      });

      test('should reject invalid addresses', () => {
        expect(cli.isValidAddress('0x1234')).toBe(false);
        expect(cli.isValidAddress('not-an-address')).toBe(false);
        expect(cli.isValidAddress('')).toBe(false);
        expect(cli.isValidAddress('1234567890123456789012345678901234567890')).toBe(false);
      });
    });

    describe('Chain Command', () => {
      test('should get current chain', async () => {
        const originalLog = console.log;
        let output = '';
        console.log = (msg) => { output += msg + '\n'; };

        await cli.cmdChain([]);

        console.log = originalLog;
        expect(output).toContain('Current chain');
        expect(output).toContain('Ethereum');
      });

      test('should set chain', async () => {
        await cli.cmdChain(['137']);
        expect(cli.options.chainId).toBe(137);
      });
    });

    describe('Version Command', () => {
      test('should output version', async () => {
        const originalLog = console.log;
        let output = '';
        console.log = (msg) => { output += msg + '\n'; };

        await cli.cmdVersion();

        console.log = originalLog;
        expect(output).toContain(VERSION);
      });
    });

    describe('Help Command', () => {
      test('should output help text', async () => {
        const originalLog = console.log;
        let output = '';
        console.log = (msg) => { output += msg + '\n'; };

        await cli.cmdHelp([]);

        console.log = originalLog;
        expect(output).toContain('Airdrop Hunter Bot CLI');
        expect(output).toContain('Security Commands');
        expect(output).toContain('scan');
      });

      test('should output help for specific command', async () => {
        const originalLog = console.log;
        let output = '';
        console.log = (msg) => { output += msg + '\n'; };

        await cli.cmdHelp(['scan']);

        console.log = originalLog;
        expect(output).toContain('scan');
        expect(output).toContain('Usage');
      });
    });

    describe('Security Commands', () => {
      test('scan should require address', async () => {
        const originalError = console.error;
        let errorOutput = '';
        console.error = (msg) => { errorOutput += msg; };

        await cli.cmdScan([]);

        console.error = originalError;
        expect(errorOutput).toContain('Usage');
      });

      test('scan should validate address', async () => {
        const originalError = console.error;
        let errorOutput = '';
        console.error = (msg) => { errorOutput += msg; };

        await cli.cmdScan(['invalid']);

        console.error = originalError;
        expect(errorOutput).toContain('Invalid');
      });

      test('drainer should require address', async () => {
        const originalError = console.error;
        let errorOutput = '';
        console.error = (msg) => { errorOutput += msg; };

        await cli.cmdDrainer([]);

        console.error = originalError;
        expect(errorOutput).toContain('Usage');
      });

      test('verify should require address', async () => {
        const originalError = console.error;
        let errorOutput = '';
        console.error = (msg) => { errorOutput += msg; };

        await cli.cmdVerify([]);

        console.error = originalError;
        expect(errorOutput).toContain('Usage');
      });
    });

    describe('Execute Command', () => {
      test('should execute valid command', async () => {
        const originalLog = console.log;
        let output = '';
        console.log = (msg) => { output += msg + '\n'; };

        await cli.executeCommand('version');

        console.log = originalLog;
        expect(output).toContain(VERSION);
      });

      test('should handle unknown command', async () => {
        const originalError = console.error;
        let errorOutput = '';
        console.error = (msg) => { errorOutput += msg; };

        await cli.executeCommand('unknowncommand');

        console.error = originalError;
        expect(errorOutput).toContain('Unknown command');
      });

      test('should handle command aliases', async () => {
        const originalLog = console.log;
        let output = '';
        console.log = (msg) => { output += msg + '\n'; };

        // 'q' is an alias for 'exit'
        // We can't really test exit as it calls process.exit
        // Instead test that the alias lookup works
        let cmd = null;
        for (const [name, c] of cli.commands) {
          if (c.aliases?.includes('q')) {
            cmd = c;
            break;
          }
        }

        console.log = originalLog;
        expect(cmd).toBeDefined();
        expect(cmd.description).toContain('Exit');
      });
    });

    describe('Context', () => {
      test('should maintain context between commands', async () => {
        expect(cli.context.lastAddress).toBeNull();

        // Run a scan command (it will set lastAddress even if the scan fails)
        const originalLog = console.log;
        const originalError = console.error;
        console.log = () => {};
        console.error = () => {};

        await cli.cmdScan(['0x1234567890123456789012345678901234567890']);

        console.log = originalLog;
        console.error = originalError;

        expect(cli.context.lastAddress).toBe('0x1234567890123456789012345678901234567890');
      });
    });
  });

  describe('Integration Tests', () => {
    test('full drainer scan flow', async () => {
      const originalLog = console.log;
      const originalError = console.error;
      let output = '';
      console.log = (msg) => { output += msg + '\n'; };
      console.error = (msg) => { output += msg + '\n'; };

      await cli.cmdDrainer(['0x0000000000a84d1a9b0063a910315c7ffa9cd248', '1']);

      console.log = originalLog;
      console.error = originalError;

      // Should show drainer check result
      expect(output).toContain('Drainer Check');
      // Known drainer should be blocked
      expect(output.toLowerCase()).toContain('blocked');
    });

    test('full verification scan flow', async () => {
      const originalLog = console.log;
      const originalError = console.error;
      let output = '';
      console.log = (msg) => { output += msg + '\n'; };
      console.error = (msg) => { output += msg + '\n'; };

      await cli.cmdVerify(['0x1234567890123456789012345678901234567890', '1']);

      console.log = originalLog;
      console.error = originalError;

      // Should show verification result
      expect(output).toContain('Verification Check');
      expect(output).toContain('Trust Level');
    });

    test('chain switching', async () => {
      expect(cli.options.chainId).toBe(1);

      await cli.cmdChain(['137']);
      expect(cli.options.chainId).toBe(137);

      await cli.cmdChain(['42161']);
      expect(cli.options.chainId).toBe(42161);
    });
  });
});
