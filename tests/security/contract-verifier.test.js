/**
 * Contract Verification Module Tests
 *
 * Tests for smart contract verification including:
 * - Trust score calculation
 * - Verification status checking
 * - Proxy detection
 * - Audit integration
 * - Deployer reputation
 */

const {
  ContractVerifier,
  createContractVerifier,
  VerificationResult,
  TRUST_LEVEL,
  TRUST_THRESHOLDS,
  VERIFICATION_SOURCES,
  AUDIT_FIRMS,
  PROXY_SLOTS,
  SCORE_COMPONENTS,
} = require('../../src/security/contract-verifier');

describe('Contract Verification Module', () => {
  let verifier;

  beforeEach(() => {
    verifier = createContractVerifier();
  });

  afterEach(() => {
    if (verifier) {
      verifier.stop();
    }
  });

  describe('Constants', () => {
    test('should have trust level definitions', () => {
      expect(TRUST_LEVEL.SAFE).toBe('safe');
      expect(TRUST_LEVEL.CAUTION).toBe('caution');
      expect(TRUST_LEVEL.RISKY).toBe('risky');
      expect(TRUST_LEVEL.BLOCKED).toBe('blocked');
    });

    test('should have trust thresholds', () => {
      expect(TRUST_THRESHOLDS.SAFE).toBe(80);
      expect(TRUST_THRESHOLDS.CAUTION).toBe(50);
      expect(TRUST_THRESHOLDS.RISKY).toBe(20);
    });

    test('should have verification sources for major chains', () => {
      expect(VERIFICATION_SOURCES[1]).toBeDefined(); // Ethereum
      expect(VERIFICATION_SOURCES[137]).toBeDefined(); // Polygon
      expect(VERIFICATION_SOURCES[42161]).toBeDefined(); // Arbitrum
      expect(VERIFICATION_SOURCES[10]).toBeDefined(); // Optimism
      expect(VERIFICATION_SOURCES[8453]).toBeDefined(); // Base
      expect(VERIFICATION_SOURCES[56]).toBeDefined(); // BSC
    });

    test('should have Ethereum verification source with etherscan', () => {
      const eth = VERIFICATION_SOURCES[1];
      expect(eth.name).toBe('Ethereum');
      expect(eth.etherscan).toBeDefined();
      expect(eth.etherscan.baseUrl).toContain('etherscan.io');
      expect(eth.sourcify).toBeDefined();
    });

    test('should have audit firm tiers', () => {
      expect(AUDIT_FIRMS.tier1).toBeDefined();
      expect(AUDIT_FIRMS.tier1.firms).toContain('Trail of Bits');
      expect(AUDIT_FIRMS.tier1.firms).toContain('OpenZeppelin');
      expect(AUDIT_FIRMS.tier1.scoreBonus).toBe(25);

      expect(AUDIT_FIRMS.tier2).toBeDefined();
      expect(AUDIT_FIRMS.tier2.firms).toContain('Quantstamp');
      expect(AUDIT_FIRMS.tier2.scoreBonus).toBe(20);

      expect(AUDIT_FIRMS.tier3).toBeDefined();
      expect(AUDIT_FIRMS.tier3.firms).toContain('Code4rena');
      expect(AUDIT_FIRMS.tier3.scoreBonus).toBe(15);
    });

    test('should have proxy slots for EIP-1967', () => {
      expect(PROXY_SLOTS.EIP1967_IMPLEMENTATION).toBeDefined();
      expect(PROXY_SLOTS.EIP1967_IMPLEMENTATION).toMatch(/^0x[a-f0-9]{64}$/);
      expect(PROXY_SLOTS.EIP1967_ADMIN).toBeDefined();
      expect(PROXY_SLOTS.OZ_IMPLEMENTATION).toBeDefined();
    });

    test('should have score components with max values', () => {
      expect(SCORE_COMPONENTS.verification.max).toBe(30);
      expect(SCORE_COMPONENTS.age.max).toBe(20);
      expect(SCORE_COMPONENTS.interactions.max).toBe(20);
      expect(SCORE_COMPONENTS.audit.max).toBe(25);
      expect(SCORE_COMPONENTS.deployer.max).toBe(10);
    });
  });

  describe('VerificationResult', () => {
    test('should create verification result', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      expect(result.address).toBe('0x1234567890123456789012345678901234567890');
      expect(result.chainId).toBe(1);
      expect(result.score).toBe(0);
      expect(result.trustLevel).toBe(TRUST_LEVEL.BLOCKED);
    });

    test('should initialize with empty components', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      expect(result.components.verification.score).toBe(0);
      expect(result.components.age.score).toBe(0);
      expect(result.components.interactions.score).toBe(0);
      expect(result.components.audit.score).toBe(0);
      expect(result.components.deployer.score).toBe(0);
    });

    test('should set component score and details', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);

      result.setComponent('verification', 25, { verified: true, source: 'etherscan' });

      expect(result.components.verification.score).toBe(25);
      expect(result.components.verification.details.verified).toBe(true);
      expect(result.components.verification.details.source).toBe('etherscan');
    });

    test('should add flags with severity', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);

      result.addFlag('Contract verified', 'positive');
      result.addFlag('Proxy detected', 'info');
      result.addFlag('Unverified implementation', 'critical');

      expect(result.flags.length).toBe(3);
      expect(result.flags[0].flag).toBe('Contract verified');
      expect(result.flags[0].severity).toBe('positive');
      expect(result.flags[2].severity).toBe('critical');
    });

    test('should add warnings', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);

      result.addWarning('Could not fetch age data');
      result.addWarning('API rate limited');

      expect(result.warnings.length).toBe(2);
      expect(result.warnings[0].message).toBe('Could not fetch age data');
    });

    test('should calculate final score', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);

      result.setComponent('verification', 25, {});
      result.setComponent('age', 20, {});
      result.setComponent('interactions', 20, {});
      result.setComponent('audit', 25, {});
      result.setComponent('deployer', 10, {});

      const score = result.calculateFinalScore();

      expect(score).toBe(100);
      expect(result.score).toBe(100);
      expect(result.trustLevel).toBe(TRUST_LEVEL.SAFE);
    });

    test('should set SAFE trust level for score 80+', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      result.setComponent('verification', 30, {});
      result.setComponent('age', 20, {});
      result.setComponent('interactions', 20, {});
      result.setComponent('audit', 10, {});
      result.calculateFinalScore();

      expect(result.trustLevel).toBe(TRUST_LEVEL.SAFE);
    });

    test('should set CAUTION trust level for score 50-79', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      result.setComponent('verification', 25, {});
      result.setComponent('age', 10, {});
      result.setComponent('interactions', 15, {});
      result.calculateFinalScore();

      expect(result.score).toBe(50);
      expect(result.trustLevel).toBe(TRUST_LEVEL.CAUTION);
    });

    test('should set RISKY trust level for score 20-49', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      result.setComponent('verification', 20, {});
      result.setComponent('age', 5, {});
      result.calculateFinalScore();

      expect(result.score).toBe(25);
      expect(result.trustLevel).toBe(TRUST_LEVEL.RISKY);
    });

    test('should set BLOCKED trust level for score <20', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      result.setComponent('verification', 10, {});
      result.calculateFinalScore();

      expect(result.score).toBe(10);
      expect(result.trustLevel).toBe(TRUST_LEVEL.BLOCKED);
    });

    test('isSafe should return correct value', () => {
      const safeResult = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      safeResult.setComponent('verification', 30, {});
      safeResult.setComponent('age', 20, {});
      safeResult.setComponent('interactions', 20, {});
      safeResult.setComponent('audit', 20, {});
      safeResult.calculateFinalScore();
      expect(safeResult.isSafe()).toBe(true);

      const riskyResult = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      riskyResult.calculateFinalScore();
      expect(riskyResult.isSafe()).toBe(false);
    });

    test('shouldBlock should return correct value', () => {
      const blockedResult = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      blockedResult.calculateFinalScore();
      expect(blockedResult.shouldBlock()).toBe(true);

      const safeResult = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      safeResult.setComponent('verification', 30, {});
      safeResult.setComponent('age', 20, {});
      safeResult.setComponent('interactions', 20, {});
      safeResult.setComponent('audit', 20, {});
      safeResult.calculateFinalScore();
      expect(safeResult.shouldBlock()).toBe(false);
    });

    test('should serialize to JSON', () => {
      const result = new VerificationResult('0x1234567890123456789012345678901234567890', 1);
      result.isProxy = true;
      result.implementation = '0xabcdef1234567890123456789012345678901234';
      result.addFlag('Test flag', 'info');
      result.addWarning('Test warning');
      result.setComponent('verification', 25, { verified: true });
      result.calculateFinalScore();

      const json = result.toJSON();
      expect(json.address).toBe('0x1234567890123456789012345678901234567890');
      expect(json.chainId).toBe(1);
      expect(json.score).toBe(25);
      expect(json.isProxy).toBe(true);
      expect(json.implementation).toBe('0xabcdef1234567890123456789012345678901234');
      expect(json.flags.length).toBe(1);
      expect(json.warnings.length).toBe(1);
      expect(json.components.verification.score).toBe(25);
    });
  });

  describe('ContractVerifier', () => {
    describe('Initialization', () => {
      test('should create with default options', () => {
        const v = new ContractVerifier();
        expect(v).toBeDefined();
        expect(v.config.strictMode).toBe(true);
        expect(v.config.cacheEnabled).toBe(true);
        v.stop();
      });

      test('should accept custom configuration', () => {
        const v = new ContractVerifier({
          strictMode: false,
          cacheEnabled: false,
          cacheTtl: 3600000,
        });

        expect(v.config.strictMode).toBe(false);
        expect(v.config.cacheEnabled).toBe(false);
        expect(v.config.cacheTtl).toBe(3600000);
        v.stop();
      });

      test('should accept API keys', () => {
        const v = new ContractVerifier({
          apiKeys: {
            1: { etherscan: 'test-api-key' },
          },
        });

        expect(v.config.apiKeys[1].etherscan).toBe('test-api-key');
        v.stop();
      });

      test('should accept known audits', () => {
        const v = new ContractVerifier({
          knownAudits: {
            '0x1234567890123456789012345678901234567890': {
              auditor: 'Trail of Bits',
              date: '2024-01-01',
            },
          },
        });

        expect(v.config.knownAudits['0x1234567890123456789012345678901234567890']).toBeDefined();
        v.stop();
      });
    });

    describe('Verification', () => {
      test('should verify and return result', async () => {
        const result = await verifier.verify(
          '0x1234567890123456789012345678901234567890',
          1
        );

        expect(result).toBeInstanceOf(VerificationResult);
        expect(result.address).toBe('0x1234567890123456789012345678901234567890');
        expect(result.chainId).toBe(1);
      });

      test('should normalize address to lowercase', async () => {
        const result = await verifier.verify(
          '0x1234567890ABCDEF1234567890ABCDEF12345678',
          1
        );

        expect(result.address).toBe('0x1234567890abcdef1234567890abcdef12345678');
      });

      test('should return cached result', async () => {
        const address = '0x1234567890123456789012345678901234567890';

        // First call
        const result1 = await verifier.verify(address, 1);
        expect(result1.cached).toBe(false);

        // Second call should use cache
        const result2 = await verifier.verify(address, 1);
        expect(result2.cached).toBe(true);
      });

      test('should skip cache with forceRefresh', async () => {
        const address = '0x1234567890123456789012345678901234567890';

        // First call
        await verifier.verify(address, 1);

        // Second call with forceRefresh
        const result = await verifier.verify(address, 1, { forceRefresh: true });
        expect(result.cached).toBeFalsy();
      });
    });

    describe('Trust Level Calculation', () => {
      test('should add warnings when verifying unknown chains', async () => {
        const result = await verifier.verify(
          '0x1234567890123456789012345678901234567890',
          99999 // Unknown chain
        );

        expect(result.warnings.some(w => w.message.includes('Unknown chain'))).toBe(true);
      });
    });

    describe('Known Audits', () => {
      test('should add known audit', () => {
        verifier.addKnownAudit('0xAuditedContract123456789012345678901234', {
          auditor: 'Trail of Bits',
          date: '2024-06-01',
          reportUrl: 'https://example.com/audit.pdf',
        });

        expect(verifier.config.knownAudits['0xauditedcontract123456789012345678901234']).toBeDefined();
        expect(verifier.config.knownAudits['0xauditedcontract123456789012345678901234'].auditor).toBe('Trail of Bits');
      });

      test('should recognize tier 1 auditors', async () => {
        const address = '0x1234567890123456789012345678901234567890';
        verifier.addKnownAudit(address, {
          auditor: 'Trail of Bits',
          date: '2024-01-01',
        });

        const result = await verifier.verify(address, 1);
        expect(result.components.audit.score).toBe(25);
        expect(result.components.audit.details.tier).toBe('tier1');
      });

      test('should recognize tier 2 auditors', async () => {
        const address = '0x2234567890123456789012345678901234567890';
        verifier.addKnownAudit(address, {
          auditor: 'Quantstamp',
          date: '2024-01-01',
        });

        const result = await verifier.verify(address, 1);
        expect(result.components.audit.score).toBe(20);
        expect(result.components.audit.details.tier).toBe('tier2');
      });

      test('should recognize tier 3 auditors', async () => {
        const address = '0x3234567890123456789012345678901234567890';
        verifier.addKnownAudit(address, {
          auditor: 'Code4rena',
          date: '2024-01-01',
        });

        const result = await verifier.verify(address, 1);
        expect(result.components.audit.score).toBe(15);
        expect(result.components.audit.details.tier).toBe('tier3');
      });
    });

    describe('Cache Management', () => {
      test('should clear cache for specific address', async () => {
        const address = '0x1234567890123456789012345678901234567890';

        // Populate cache
        await verifier.verify(address, 1);
        expect(verifier.cache.size).toBe(1);

        // Clear cache
        verifier.clearCache(address, 1);
        expect(verifier.cache.size).toBe(0);
      });

      test('should have cleanup method', () => {
        expect(typeof verifier.cleanupCache).toBe('function');
      });
    });

    describe('Statistics', () => {
      test('should track verification statistics', async () => {
        await verifier.verify('0x1234567890123456789012345678901234567890', 1);
        await verifier.verify('0x2234567890123456789012345678901234567890', 1);

        const stats = verifier.getStatistics();
        expect(stats.verified).toBe(2);
        expect(stats.cacheSize).toBe(2);
      });

      test('should track cache hits', async () => {
        const address = '0x1234567890123456789012345678901234567890';

        await verifier.verify(address, 1);
        await verifier.verify(address, 1); // Cache hit

        const stats = verifier.getStatistics();
        expect(stats.fromCache).toBe(1);
      });

      test('should track trust level distribution', async () => {
        // Verify multiple addresses
        await verifier.verify('0x1234567890123456789012345678901234567890', 1);
        await verifier.verify('0x2234567890123456789012345678901234567890', 1);

        const stats = verifier.getStatistics();
        expect(stats.byTrustLevel).toBeDefined();
        expect(typeof stats.byTrustLevel[TRUST_LEVEL.BLOCKED]).toBe('number');
      });
    });

    describe('Lifecycle', () => {
      test('should stop cleanly', () => {
        verifier.stop();
        expect(verifier.cleanupInterval).toBeNull();
      });

      test('should destroy and cleanup', () => {
        const v = createContractVerifier();
        v.destroy();

        expect(v.cleanupInterval).toBeNull();
        expect(v.cache.size).toBe(0);
      });
    });

    describe('Events', () => {
      test('should emit verified event', (done) => {
        verifier.on('verified', (result) => {
          expect(result.address).toBeDefined();
          expect(result.chainId).toBe(1);
          done();
        });

        verifier.verify('0x1234567890123456789012345678901234567890', 1);
      });

      test('should emit blocked event for low scores', (done) => {
        // Create verifier that will return blocked result
        const v = createContractVerifier();

        v.on('blocked', (result) => {
          expect(result.trustLevel).toBe(TRUST_LEVEL.BLOCKED);
          v.stop();
          done();
        });

        // This will be blocked due to no verification/age/etc data
        v.verify('0x1234567890123456789012345678901234567890', 1);
      });
    });
  });

  describe('Factory Function', () => {
    test('should create instance with defaults', () => {
      const v = createContractVerifier();
      expect(v).toBeInstanceOf(ContractVerifier);
      v.stop();
    });

    test('should create instance with custom config', () => {
      const v = createContractVerifier({
        strictMode: false,
        cacheEnabled: false,
      });

      expect(v.config.strictMode).toBe(false);
      expect(v.config.cacheEnabled).toBe(false);
      v.stop();
    });
  });
});

describe('Integration Tests', () => {
  test('full verification flow', async () => {
    const verifier = createContractVerifier({
      knownAudits: {
        '0xauditedcontract123456789012345678901234': {
          auditor: 'OpenZeppelin',
          date: '2024-01-15',
          reportUrl: 'https://example.com/audit-report.pdf',
        },
      },
    });

    // Test 1: Verify contract with audit
    const auditedResult = await verifier.verify(
      '0xAuditedContract123456789012345678901234',
      1
    );
    expect(auditedResult.components.audit.score).toBe(25);
    expect(auditedResult.flags.some(f => f.flag.includes('Audited by'))).toBe(true);

    // Test 2: Verify contract without audit
    const unauditedResult = await verifier.verify(
      '0x1234567890123456789012345678901234567890',
      1
    );
    expect(unauditedResult.components.audit.score).toBe(0);

    // Test 3: Check stats
    const stats = verifier.getStatistics();
    expect(stats.verified).toBe(2);

    verifier.stop();
  });

  test('multi-chain verification', async () => {
    const verifier = createContractVerifier();

    // Verify on different chains
    const ethResult = await verifier.verify('0x1234567890123456789012345678901234567890', 1);
    const polyResult = await verifier.verify('0x1234567890123456789012345678901234567890', 137);
    const arbResult = await verifier.verify('0x1234567890123456789012345678901234567890', 42161);

    expect(ethResult.chainId).toBe(1);
    expect(polyResult.chainId).toBe(137);
    expect(arbResult.chainId).toBe(42161);

    // Each chain should be cached separately
    expect(verifier.cache.size).toBe(3);

    verifier.stop();
  });

  test('cache expiration behavior', async () => {
    // Create verifier with very short cache TTL
    const verifier = createContractVerifier({
      cacheTtl: 100, // 100ms
    });

    const address = '0x1234567890123456789012345678901234567890';

    // First call
    const result1 = await verifier.verify(address, 1);
    expect(result1.cached).toBeFalsy();

    // Second call (should be cached)
    const result2 = await verifier.verify(address, 1);
    expect(result2.cached).toBe(true);

    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Third call (cache expired)
    const result3 = await verifier.verify(address, 1);
    expect(result3.cached).toBeFalsy();

    verifier.stop();
  });
});
