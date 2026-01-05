/**
 * Drainer Detection Module Tests
 *
 * Tests for wallet drainer protection including:
 * - Blacklist checking
 * - Bytecode pattern matching
 * - Function signature analysis
 * - Behavioral analysis
 */

const {
  DrainerDetector,
  createDrainerDetector,
  DetectionResult,
  RISK_LEVEL,
  DANGEROUS_FUNCTIONS,
  KNOWN_DRAINER_ADDRESSES,
  DRAINER_BYTECODE_SIGNATURES,
  SAFE_APPROVAL_RECIPIENTS,
  BEHAVIORAL_THRESHOLDS,
} = require('../../src/security/drainer-detection');

describe('Drainer Detection Module', () => {
  let detector;

  beforeEach(() => {
    detector = createDrainerDetector();
  });

  describe('Constants', () => {
    test('should have risk level definitions', () => {
      expect(RISK_LEVEL.CRITICAL).toBe('critical');
      expect(RISK_LEVEL.HIGH).toBe('high');
      expect(RISK_LEVEL.MEDIUM).toBe('medium');
      expect(RISK_LEVEL.LOW).toBe('low');
      expect(RISK_LEVEL.SAFE).toBe('safe');
    });

    test('should have known drainer addresses for Ethereum', () => {
      expect(KNOWN_DRAINER_ADDRESSES[1]).toBeDefined();
      expect(KNOWN_DRAINER_ADDRESSES[1].size).toBeGreaterThan(0);
    });

    test('should have drainer bytecode signatures', () => {
      expect(Object.keys(DRAINER_BYTECODE_SIGNATURES).length).toBeGreaterThan(0);
      expect(DRAINER_BYTECODE_SIGNATURES['inferno_v1']).toBeDefined();
      expect(DRAINER_BYTECODE_SIGNATURES['pink_v2']).toBeDefined();
    });

    test('should have dangerous function signatures', () => {
      expect(DANGEROUS_FUNCTIONS['0xa22cb465']).toBeDefined(); // setApprovalForAll
      expect(DANGEROUS_FUNCTIONS['0x095ea7b3']).toBeDefined(); // approve
      expect(DANGEROUS_FUNCTIONS['0xd505accf']).toBeDefined(); // permit
    });

    test('should have safe approval recipients for major DEXes', () => {
      expect(SAFE_APPROVAL_RECIPIENTS[1]).toBeDefined();
      expect(SAFE_APPROVAL_RECIPIENTS[1].size).toBeGreaterThan(0);
    });

    test('should have behavioral thresholds', () => {
      expect(BEHAVIORAL_THRESHOLDS.contractAge).toBeDefined();
      expect(BEHAVIORAL_THRESHOLDS.interactionCount).toBeDefined();
      expect(BEHAVIORAL_THRESHOLDS.contractAge.critical).toBe(3600);
    });
  });

  describe('DetectionResult', () => {
    test('should create detection result', () => {
      const result = new DetectionResult('0x1234567890123456789012345678901234567890', 1);
      expect(result.address).toBe('0x1234567890123456789012345678901234567890');
      expect(result.chainId).toBe(1);
      expect(result.riskLevel).toBe(RISK_LEVEL.SAFE);
      expect(result.blocked).toBe(false);
    });

    test('should add detection and update risk level', () => {
      const result = new DetectionResult('0x1234567890123456789012345678901234567890', 1);

      result.addDetection('blacklist', RISK_LEVEL.CRITICAL, 'Known drainer');

      expect(result.riskLevel).toBe(RISK_LEVEL.CRITICAL);
      expect(result.blocked).toBe(true);
      expect(result.detections.length).toBe(1);
    });

    test('should keep highest risk level', () => {
      const result = new DetectionResult('0x1234567890123456789012345678901234567890', 1);

      result.addDetection('behavioral', RISK_LEVEL.MEDIUM, 'New contract');
      result.addDetection('bytecode', RISK_LEVEL.HIGH, 'Suspicious pattern');
      result.addDetection('functionAnalysis', RISK_LEVEL.LOW, 'Minor concern');

      expect(result.riskLevel).toBe(RISK_LEVEL.HIGH);
    });

    test('should serialize to JSON', () => {
      const result = new DetectionResult('0x1234567890123456789012345678901234567890', 1);
      result.addWarning('Test warning');

      const json = result.toJSON();
      expect(json.address).toBe('0x1234567890123456789012345678901234567890');
      expect(json.chainId).toBe(1);
      expect(json.warnings.length).toBe(1);
    });

    test('isSafe should return correct value', () => {
      const safeResult = new DetectionResult('0x1234567890123456789012345678901234567890', 1);
      expect(safeResult.isSafe()).toBe(true);

      const dangerousResult = new DetectionResult('0x1234567890123456789012345678901234567890', 1);
      dangerousResult.addDetection('blacklist', RISK_LEVEL.CRITICAL, 'Known drainer');
      expect(dangerousResult.isSafe()).toBe(false);
    });
  });

  describe('DrainerDetector', () => {
    describe('Initialization', () => {
      test('should create with default options', () => {
        const d = new DrainerDetector();
        expect(d).toBeDefined();
        expect(d.config.strictMode).toBe(true);
      });

      test('should accept custom blacklist', () => {
        const customBlacklist = new Set(['0xbadaddress1234567890123456789012345678']);
        const d = new DrainerDetector({ customBlacklist });

        const chainBlacklist = d.blacklist.get(1);
        expect(chainBlacklist.has('0xbadaddress1234567890123456789012345678')).toBe(true);
      });

      test('should accept custom whitelist', () => {
        const customWhitelist = new Set(['0xgoodaddress12345678901234567890123456']);
        const d = new DrainerDetector({ customWhitelist });

        expect(d.isWhitelisted('0xgoodaddress12345678901234567890123456', 1)).toBe(true);
      });
    });

    describe('Blacklist Check', () => {
      test('should detect known drainer addresses', async () => {
        // Add a known address to test
        const testAddress = '0x0000000000a84d1a9b0063a910315c7ffa9cd248';
        const result = await detector.analyze(testAddress, 1);

        expect(result.riskLevel).toBe(RISK_LEVEL.CRITICAL);
        expect(result.blocked).toBe(true);
        expect(result.layers.blacklist).toBeDefined();
      });

      test('should pass non-blacklisted addresses', async () => {
        const safeAddress = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45'; // Uniswap Router
        const result = await detector.analyze(safeAddress, 1);

        expect(result.layers.blacklist).toBeNull();
      });
    });

    describe('Bytecode Pattern Matching', () => {
      test('should detect known drainer bytecode patterns', async () => {
        // Test with bytecode containing Inferno pattern
        const result = await detector.analyze(
          '0x1234567890123456789012345678901234567890',
          1,
          { bytecode: '0x608060405234801561001057600080fd5b50' }
        );

        expect(result.layers.bytecode).toBeDefined();
        expect(result.riskLevel).not.toBe(RISK_LEVEL.SAFE);
      });

      test('should pass clean bytecode', async () => {
        const result = await detector.analyze(
          '0x1234567890123456789012345678901234567890',
          1,
          { bytecode: '0x60806040523480156100a0b0c0d0e0f0' } // Different pattern
        );

        // Should not have critical bytecode detection
        if (result.layers.bytecode) {
          expect(result.layers.bytecode.risk).not.toBe(RISK_LEVEL.CRITICAL);
        }
      });
    });

    describe('Function Analysis', () => {
      test('should detect setApprovalForAll to non-whitelisted address', async () => {
        // setApprovalForAll(address,bool) selector = 0xa22cb465
        // Calling with unknown operator address
        const calldata = '0xa22cb465' +
          '000000000000000000000000deadbeef12345678901234567890123456789012' + // operator
          '0000000000000000000000000000000000000000000000000000000000000001';   // approved = true

        const result = await detector.analyze(
          '0x1234567890123456789012345678901234567890',
          1,
          { calldata }
        );

        expect(result.layers.functionAnalysis).toBeDefined();
        expect(result.riskLevel).not.toBe(RISK_LEVEL.SAFE);
      });

      test('should pass setApprovalForAll to whitelisted address', async () => {
        // OpenSea Seaport address (whitelisted)
        const seaportAddress = '00000000000000adc04c56bf30ac9d3c0aaf14dc';
        const calldata = '0xa22cb465' +
          '000000000000000000000000' + seaportAddress +
          '0000000000000000000000000000000000000000000000000000000000000001';

        const result = await detector.analyze(
          '0x1234567890123456789012345678901234567890',
          1,
          { calldata }
        );

        // Should not be blocked for whitelisted address
        expect(result.blocked).toBe(false);
      });

      test('should detect infinite approval', async () => {
        // approve(address,uint256) selector = 0x095ea7b3
        // MAX_UINT256 = ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
        const calldata = '0x095ea7b3' +
          '000000000000000000000000deadbeef12345678901234567890123456789012' + // spender
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';   // amount = MAX

        const result = await detector.analyze(
          '0x1234567890123456789012345678901234567890',
          1,
          { calldata }
        );

        expect(result.layers.functionAnalysis).toBeDefined();
      });
    });

    describe('Whitelist Management', () => {
      test('should add address to blacklist', () => {
        const badAddress = '0xbadaddress1234567890123456789012345678';
        detector.addToBlacklist(badAddress, 1);

        const chainBlacklist = detector.blacklist.get(1);
        expect(chainBlacklist.has(badAddress.toLowerCase())).toBe(true);
      });

      test('should add address to whitelist', () => {
        const goodAddress = '0xgoodaddress12345678901234567890123456';
        detector.addToWhitelist(goodAddress, 1);

        expect(detector.isWhitelisted(goodAddress, 1)).toBe(true);
      });

      test('should check if address is whitelisted', () => {
        // Uniswap Router should be whitelisted by default
        expect(detector.isWhitelisted('0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', 1)).toBe(true);

        // Random address should not be
        expect(detector.isWhitelisted('0xrandomaddress123456789012345678901234', 1)).toBe(false);
      });
    });

    describe('Statistics', () => {
      test('should track analysis statistics', async () => {
        await detector.analyze('0x1234567890123456789012345678901234567890', 1);
        await detector.analyze('0x0000000000a84d1a9b0063a910315c7ffa9cd248', 1); // Known drainer

        const stats = detector.getStatistics();
        expect(stats.analyzed).toBe(2);
        expect(stats.blocked).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Status', () => {
      test('should return comprehensive status', () => {
        const status = detector.getStatus();

        expect(status.blacklistSize).toBeGreaterThan(0);
        expect(status.whitelistSize).toBeGreaterThan(0);
        expect(status.stats).toBeDefined();
        expect(status.config.strictMode).toBe(true);
      });
    });

    describe('Events', () => {
      test('should emit blocked event for drainers', (done) => {
        detector.on('blocked', (result) => {
          expect(result.blocked).toBe(true);
          expect(result.riskLevel).toBe(RISK_LEVEL.CRITICAL);
          done();
        });

        detector.analyze('0x0000000000a84d1a9b0063a910315c7ffa9cd248', 1);
      });

      test('should emit analyzed event for all analyses', (done) => {
        detector.on('analyzed', (result) => {
          expect(result.address).toBeDefined();
          done();
        });

        detector.analyze('0x1234567890123456789012345678901234567890', 1);
      });
    });
  });

  describe('Factory Function', () => {
    test('should create instance with defaults', () => {
      const d = createDrainerDetector();
      expect(d).toBeInstanceOf(DrainerDetector);
    });

    test('should create instance with custom config', () => {
      const d = createDrainerDetector({
        strictMode: false,
        enableSimulation: false,
      });

      expect(d.config.strictMode).toBe(false);
      expect(d.config.enableSimulation).toBe(false);
    });
  });
});

describe('Integration Tests', () => {
  test('full drainer analysis flow', async () => {
    const detector = createDrainerDetector();

    // Test 1: Known drainer should be blocked
    const drainerResult = await detector.analyze(
      '0x0000000000a84d1a9b0063a910315c7ffa9cd248',
      1
    );
    expect(drainerResult.blocked).toBe(true);
    expect(drainerResult.riskLevel).toBe(RISK_LEVEL.CRITICAL);

    // Test 2: Clean address should pass
    const cleanResult = await detector.analyze(
      '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap
      1
    );
    expect(cleanResult.blocked).toBe(false);

    // Test 3: Stats should be updated
    const stats = detector.getStatistics();
    expect(stats.analyzed).toBe(2);
  });

  test('dangerous function detection with calldata', async () => {
    const detector = createDrainerDetector();

    // setApprovalForAll to unknown address
    const calldata = '0xa22cb465' +
      '000000000000000000000000badbadbadbadbadbadbadbadbadbadbadbadbad1' +
      '0000000000000000000000000000000000000000000000000000000000000001';

    const result = await detector.analyze(
      '0x1234567890123456789012345678901234567890',
      1,
      { calldata }
    );

    expect(result.detections.length).toBeGreaterThan(0);
    expect(result.layers.functionAnalysis).toBeDefined();
  });
});
