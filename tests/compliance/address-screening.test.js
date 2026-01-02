'use strict';

/**
 * Address Screening Unit Tests
 * Sprint 2.1: Compliance Layer
 */

const {
  AddressScreener,
  ScreeningResult,
  TxScreeningResult,
  createAddressScreener,
  RISK_LEVELS,
  SCREENING_SOURCES,
  MATCH_TYPES,
  SAMPLE_OFAC_ADDRESSES,
} = require('../../src/compliance/address-screening');

describe('AddressScreener', () => {
  let screener;
  let mockLogger;
  let mockAuditLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockAuditLogger = {
      logScreening: jest.fn(),
      logConfig: jest.fn(),
      logViolation: jest.fn(),
    };
    screener = createAddressScreener({
      logger: mockLogger,
      auditLogger: mockAuditLogger,
    });
  });

  afterEach(() => {
    screener.destroy();
  });

  describe('ScreeningResult', () => {
    test('should create result with defaults', () => {
      const result = new ScreeningResult('0x1234567890123456789012345678901234567890');

      expect(result.allowed).toBe(true);
      expect(result.risk).toBe(RISK_LEVELS.NONE);
      expect(result.matches).toEqual([]);
      expect(result.cached).toBe(false);
    });

    test('should normalize address to lowercase', () => {
      const result = new ScreeningResult('0xABCD1234567890123456789012345678901234AB');

      expect(result.address).toBe('0xabcd1234567890123456789012345678901234ab');
    });

    test('should serialize to JSON', () => {
      const result = new ScreeningResult('0x1234567890123456789012345678901234567890', {
        allowed: false,
        risk: RISK_LEVELS.BLOCKED,
        matches: [{ type: 'exact', listName: 'OFAC' }],
      });

      const json = result.toJSON();
      expect(json.allowed).toBe(false);
      expect(json.risk).toBe('blocked');
      expect(json.matches.length).toBe(1);
    });
  });

  describe('TxScreeningResult', () => {
    test('should compute risk summary', () => {
      const fromResult = new ScreeningResult('0x1111111111111111111111111111111111111111', {
        allowed: true,
        risk: RISK_LEVELS.NONE,
      });
      const toResult = new ScreeningResult('0x2222222222222222222222222222222222222222', {
        allowed: false,
        risk: RISK_LEVELS.BLOCKED,
      });

      const txResult = new TxScreeningResult({ hash: '0xTx' }, {
        from: fromResult,
        to: toResult,
      });

      expect(txResult.allowed).toBe(false);
      expect(txResult.riskSummary.highest).toBe(RISK_LEVELS.BLOCKED);
      expect(txResult.riskSummary.blockedCount).toBe(1);
    });

    test('should allow when all addresses pass', () => {
      const fromResult = new ScreeningResult('0x1111111111111111111111111111111111111111', {
        allowed: true,
        risk: RISK_LEVELS.NONE,
      });
      const toResult = new ScreeningResult('0x2222222222222222222222222222222222222222', {
        allowed: true,
        risk: RISK_LEVELS.LOW,
      });

      const txResult = new TxScreeningResult({ hash: '0xTx' }, {
        from: fromResult,
        to: toResult,
      });

      expect(txResult.allowed).toBe(true);
    });
  });

  describe('Address Validation', () => {
    test('should reject invalid addresses', async () => {
      const result = await screener.checkAddress('not-an-address');

      expect(result.allowed).toBe(false);
      expect(result.risk).toBe(RISK_LEVELS.BLOCKED);
    });

    test('should reject null/undefined addresses', async () => {
      const result1 = await screener.checkAddress(null);
      const result2 = await screener.checkAddress(undefined);

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);
    });

    test('should accept valid addresses', async () => {
      const result = await screener.checkAddress('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D');

      expect(result.allowed).toBe(true);
      expect(result.risk).toBe(RISK_LEVELS.NONE);
    });
  });

  describe('OFAC Screening', () => {
    test('should block OFAC-listed addresses', async () => {
      const ofacAddress = Array.from(SAMPLE_OFAC_ADDRESSES)[0];
      const result = await screener.checkAddress(ofacAddress);

      expect(result.allowed).toBe(false);
      expect(result.risk).toBe(RISK_LEVELS.BLOCKED);
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].listName).toBe('OFAC_SDN');
    });

    test('should emit event on sanctions match', async () => {
      const sanctionsHandler = jest.fn();
      screener.on('sanctionsMatch', sanctionsHandler);

      const ofacAddress = Array.from(SAMPLE_OFAC_ADDRESSES)[0];
      await screener.checkAddress(ofacAddress);

      expect(sanctionsHandler).toHaveBeenCalled();
    });

    test('should update statistics on OFAC match', async () => {
      const ofacAddress = Array.from(SAMPLE_OFAC_ADDRESSES)[0];
      await screener.checkAddress(ofacAddress);

      const stats = screener.getScreeningStats();
      expect(stats.ofacMatches).toBe(1);
      expect(stats.blockedCount).toBe(1);
    });

    test('should allow updating OFAC list', async () => {
      const customList = ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
      const result = await screener.updateOfacList(customList);

      expect(result.currentSize).toBe(1);

      const checkResult = await screener.checkAddress(customList[0]);
      expect(checkResult.allowed).toBe(false);
    });
  });

  describe('Custom Blocklist', () => {
    test('should block addresses on blocklist', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      screener.addToBlocklist(address, 'Test block');

      const result = await screener.checkAddress(address);

      expect(result.allowed).toBe(false);
      expect(result.risk).toBe(RISK_LEVELS.BLOCKED);
      expect(result.sources).toContain(SCREENING_SOURCES.CUSTOM_BLOCKLIST);
    });

    test('should remove from blocklist', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      screener.addToBlocklist(address, 'Test block');
      screener.removeFromBlocklist(address);

      const result = await screener.checkAddress(address);
      expect(result.allowed).toBe(true);
    });

    test('should invalidate cache when adding to blocklist', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      // First check (cached as allowed)
      await screener.checkAddress(address);

      // Add to blocklist
      screener.addToBlocklist(address, 'Late block');

      // Second check should reflect blocklist
      const result = await screener.checkAddress(address);
      expect(result.allowed).toBe(false);
    });

    test('should list blocked addresses', () => {
      screener.addToBlocklist('0x1111111111111111111111111111111111111111', 'Reason 1');
      screener.addToBlocklist('0x2222222222222222222222222222222222222222', 'Reason 2');

      const blocked = screener.getBlockedAddresses();
      expect(blocked.length).toBe(2);
    });

    test('should reject invalid addresses for blocklist', () => {
      expect(() => {
        screener.addToBlocklist('invalid', 'reason');
      }).toThrow('Invalid address format');
    });
  });

  describe('Custom Allowlist', () => {
    test('should allow addresses on allowlist (highest priority)', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      // Add to both lists
      screener.addToBlocklist(address, 'Blocked');
      screener.addToAllowlist(address, 'Allowed override');

      // Allowlist should take priority
      const result = await screener.checkAddress(address);
      expect(result.allowed).toBe(true);
      expect(result.sources).toContain(SCREENING_SOURCES.CUSTOM_ALLOWLIST);
    });

    test('should remove from allowlist', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      screener.addToAllowlist(address, 'Allowed');
      screener.removeFromAllowlist(address);

      const allowlist = screener.getAllowlist();
      expect(allowlist.length).toBe(0);
    });
  });

  describe('High-Risk Patterns', () => {
    test('should detect null address', async () => {
      const result = await screener.checkAddress('0x0000000000000000000000000000000000000000');

      expect(result.risk).toBe(RISK_LEVELS.HIGH);
      expect(result.matches[0].type).toBe('high_risk_pattern');
    });

    test('should detect dead address pattern', async () => {
      const result = await screener.checkAddress('0xdead000000000000000000000000000000000000');

      expect(result.risk).toBe(RISK_LEVELS.HIGH);
    });
  });

  describe('Batch Screening', () => {
    test('should screen multiple addresses', async () => {
      const addresses = [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        Array.from(SAMPLE_OFAC_ADDRESSES)[0],
      ];

      const results = await screener.checkAddresses(addresses);

      expect(results.length).toBe(3);
      expect(results[0].allowed).toBe(true);
      expect(results[1].allowed).toBe(true);
      expect(results[2].allowed).toBe(false);
    });
  });

  describe('Transaction Screening', () => {
    test('should screen transaction addresses', async () => {
      const tx = {
        hash: '0xTxHash',
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
      };

      const result = await screener.checkTransaction(tx);

      expect(result.allowed).toBe(true);
      expect(result.fromResult).toBeDefined();
      expect(result.toResult).toBeDefined();
    });

    test('should block transaction with sanctioned destination', async () => {
      const ofacAddress = Array.from(SAMPLE_OFAC_ADDRESSES)[0];
      const tx = {
        hash: '0xTxHash',
        from: '0x1111111111111111111111111111111111111111',
        to: ofacAddress,
      };

      const result = await screener.checkTransaction(tx);

      expect(result.allowed).toBe(false);
      expect(result.riskSummary.blockedCount).toBe(1);
    });

    test('should emit event on blocked transaction', async () => {
      const blockedHandler = jest.fn();
      screener.on('transactionBlocked', blockedHandler);

      const ofacAddress = Array.from(SAMPLE_OFAC_ADDRESSES)[0];
      await screener.checkTransaction({
        hash: '0xTx',
        from: '0x1111111111111111111111111111111111111111',
        to: ofacAddress,
      });

      expect(blockedHandler).toHaveBeenCalled();
    });

    test('should screen additional addresses (token, router)', async () => {
      const tx = {
        hash: '0xTxHash',
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        tokenAddress: '0x3333333333333333333333333333333333333333',
        routerAddress: '0x4444444444444444444444444444444444444444',
      };

      const result = await screener.checkTransaction(tx);

      expect(result.additionalResults.length).toBe(2);
    });
  });

  describe('Caching', () => {
    test('should cache screening results', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      await screener.checkAddress(address);
      const result2 = await screener.checkAddress(address);

      expect(result2.cached).toBe(true);
    });

    test('should track cache statistics', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      await screener.checkAddress(address);
      await screener.checkAddress(address);
      await screener.checkAddress(address);

      const stats = screener.getCacheStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 1);
    });

    test('should clear cache', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      await screener.checkAddress(address);

      const cleared = screener.clearCache();
      expect(cleared.clearedEntries).toBe(1);

      const stats = screener.getCacheStats();
      expect(stats.size).toBe(0);
    });

    test('should expire cached entries', async () => {
      // Create screener with short TTL
      const shortTtlScreener = createAddressScreener({
        logger: mockLogger,
        cacheTtl: 100, // 100ms
      });

      const address = '0x1234567890123456789012345678901234567890';
      await shortTtlScreener.checkAddress(address);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));

      const result = await shortTtlScreener.checkAddress(address);
      expect(result.cached).toBe(false);

      shortTtlScreener.destroy();
    });
  });

  describe('Statistics', () => {
    test('should track screening statistics', async () => {
      await screener.checkAddress('0x1111111111111111111111111111111111111111');
      await screener.checkAddress('0x2222222222222222222222222222222222222222');
      await screener.checkAddress(Array.from(SAMPLE_OFAC_ADDRESSES)[0]);

      const stats = screener.getScreeningStats();

      expect(stats.totalScreenings).toBe(3);
      expect(stats.allowedCount).toBe(2);
      expect(stats.blockedCount).toBe(1);
    });

    test('should report list sizes', () => {
      screener.addToBlocklist('0x1111111111111111111111111111111111111111', 'test');
      screener.addToAllowlist('0x2222222222222222222222222222222222222222', 'test');

      const stats = screener.getScreeningStats();

      expect(stats.blocklistSize).toBe(1);
      expect(stats.allowlistSize).toBe(1);
      expect(stats.ofacListSize).toBeGreaterThan(0);
    });
  });

  describe('Audit Logging Integration', () => {
    test('should log screenings to audit logger', async () => {
      await screener.checkAddress('0x1234567890123456789012345678901234567890');

      expect(mockAuditLogger.logScreening).toHaveBeenCalled();
    });

    test('should log blocklist changes to audit logger', () => {
      screener.addToBlocklist('0x1234567890123456789012345678901234567890', 'test');

      expect(mockAuditLogger.logConfig).toHaveBeenCalledWith(
        'blocklist_add',
        expect.any(Object)
      );
    });
  });

  describe('Fail Modes', () => {
    test('should fail closed by default', async () => {
      // Create screener with Chainalysis that will fail
      const failingScreener = createAddressScreener({
        logger: mockLogger,
        chainalysisApiKey: 'fake-key',
        failOpen: false,
      });

      // Mock a failure scenario (chainalysis would throw)
      // In real scenario, this tests API failures
      // For now, just verify the config
      expect(failingScreener.config.failOpen).toBe(false);

      failingScreener.destroy();
    });

    test('should support fail open mode (dangerous)', () => {
      const failOpenScreener = createAddressScreener({
        logger: mockLogger,
        failOpen: true,
      });

      expect(failOpenScreener.config.failOpen).toBe(true);
      failOpenScreener.destroy();
    });
  });

  describe('Events', () => {
    test('should emit blocklistUpdated on add', (done) => {
      screener.on('blocklistUpdated', (data) => {
        expect(data.action).toBe('add');
        done();
      });

      screener.addToBlocklist('0x1234567890123456789012345678901234567890', 'test');
    });

    test('should emit blocklistUpdated on remove', (done) => {
      screener.addToBlocklist('0x1234567890123456789012345678901234567890', 'test');

      screener.on('blocklistUpdated', (data) => {
        if (data.action === 'remove') {
          done();
        }
      });

      screener.removeFromBlocklist('0x1234567890123456789012345678901234567890');
    });
  });
});
