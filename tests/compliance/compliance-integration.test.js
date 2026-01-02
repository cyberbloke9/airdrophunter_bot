'use strict';

/**
 * Compliance Layer Integration Tests
 * Sprint 2.1: Compliance Layer
 *
 * Tests the full compliance layer integration with
 * security and monitoring layers.
 */

const {
  createComplianceLayer,
  ComplianceLayer,
  AUDIT_CATEGORIES,
  SEVERITY_LEVELS,
  EXPORT_FORMATS,
  RISK_LEVELS,
  FALLBACK_MODES,
} = require('../../src/compliance');

const { SAMPLE_OFAC_ADDRESSES } = require('../../src/compliance/address-screening');

describe('Compliance Layer Integration', () => {
  let complianceLayer;
  let mockLogger;
  let mockSecurityLayer;
  let mockMonitoringLayer;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock Security Layer (Sprint 1.1)
    mockSecurityLayer = {
      inputValidator: {
        validateAddress: jest.fn().mockReturnValue({ valid: true }),
        validateTransaction: jest.fn().mockReturnValue({ valid: true }),
      },
      executionGuard: {
        execute: jest.fn().mockResolvedValue({ hash: '0xResult', gasUsed: 21000 }),
        validateExecution: jest.fn().mockReturnValue({ valid: true }),
      },
      accessControl: {
        checkPermission: jest.fn().mockReturnValue({ granted: true }),
        grantRole: jest.fn(),
        revokeRole: jest.fn(),
      },
      keyManager: {
        getKey: jest.fn().mockReturnValue('key'),
        sign: jest.fn().mockResolvedValue('signature'),
        rotateKey: jest.fn().mockResolvedValue(true),
      },
      approvalManager: {
        approve: jest.fn().mockResolvedValue({ hash: '0xApproval' }),
        revoke: jest.fn().mockResolvedValue({ hash: '0xRevoke' }),
      },
      nonceManager: {
        reserve: jest.fn().mockResolvedValue(42),
        confirm: jest.fn(),
        release: jest.fn(),
      },
      mevProtection: {
        chooseRoute: jest.fn().mockReturnValue({ route: 'flashbots', reason: 'high value' }),
        submit: jest.fn().mockResolvedValue({ bundleHash: '0xBundle' }),
      },
      rpcManager: {
        on: jest.fn(),
      },
      oracleGuard: {
        getPrice: jest.fn().mockResolvedValue({ price: 1800, source: 'chainlink', confidence: 0.99 }),
      },
      slippageGuard: {
        getSlippage: jest.fn().mockReturnValue(0.005),
        classifyToken: jest.fn().mockReturnValue('tier1'),
      },
    };

    // Mock Monitoring Layer (Sprint 1.2)
    mockMonitoringLayer = {
      alertSystem: {
        sendAlert: jest.fn(),
      },
      analytics: {
        recordEvent: jest.fn(),
      },
      dashboard: {},
      sandwichDetector: {
        on: jest.fn(),
      },
      txSimulator: {
        simulate: jest.fn().mockResolvedValue({ success: true, gasEstimate: 150000 }),
      },
    };

    complianceLayer = createComplianceLayer({
      logger: mockLogger,
      securityLayer: mockSecurityLayer,
      monitoringLayer: mockMonitoringLayer,
      config: {
        blockedCountries: ['KP', 'IR'],
      },
    });
  });

  afterEach(() => {
    complianceLayer.stop();
  });

  describe('Factory Creation', () => {
    test('should create compliance layer with all modules', () => {
      expect(complianceLayer.auditLogger).toBeDefined();
      expect(complianceLayer.addressScreener).toBeDefined();
      expect(complianceLayer.geoRestrictor).toBeDefined();
    });

    test('should create without security/monitoring layers', () => {
      const standalone = createComplianceLayer({
        logger: mockLogger,
      });

      expect(standalone.auditLogger).toBeDefined();
      standalone.stop();
    });
  });

  describe('Convenience Methods', () => {
    test('screenAddress should check address', async () => {
      const result = await complianceLayer.screenAddress('0x1234567890123456789012345678901234567890');

      expect(result.allowed).toBe(true);
    });

    test('screenTransaction should check transaction', async () => {
      const result = await complianceLayer.screenTransaction({
        hash: '0xTx',
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
      });

      expect(result.allowed).toBe(true);
    });

    test('checkGeo should check IP', async () => {
      const result = await complianceLayer.checkGeo('8.8.8.8');

      expect(result).toBeDefined();
    });

    test('getAuditLog should query audit entries', () => {
      complianceLayer.auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'test', {});

      const entries = complianceLayer.getAuditLog();

      expect(entries.length).toBeGreaterThan(0);
    });

    test('exportAudit should export in JSON format', () => {
      complianceLayer.auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'test', {});

      const json = complianceLayer.exportAudit(EXPORT_FORMATS.JSON);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
    });

    test('verifyAuditIntegrity should verify hash chain', () => {
      complianceLayer.auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'test1', {});
      complianceLayer.auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'test2', {});

      const isValid = complianceLayer.verifyAuditIntegrity();

      expect(isValid).toBe(true);
    });
  });

  describe('List Management', () => {
    test('blockAddress should add to blocklist', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      complianceLayer.blockAddress(address, 'Test block');

      const result = await complianceLayer.screenAddress(address);

      expect(result.allowed).toBe(false);
    });

    test('allowAddress should add to allowlist', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      complianceLayer.blockAddress(address, 'Blocked');
      complianceLayer.allowAddress(address, 'Override');

      const result = await complianceLayer.screenAddress(address);

      expect(result.allowed).toBe(true);
    });

    test('blockCountry should add to geo blocklist', () => {
      complianceLayer.blockCountry('XX', 'Test');

      expect(complianceLayer.geoRestrictor.isCountryBlocked('XX')).toBe(true);
    });

    test('unblockCountry should remove from geo blocklist', () => {
      complianceLayer.unblockCountry('KP');

      expect(complianceLayer.geoRestrictor.isCountryBlocked('KP')).toBe(false);
    });
  });

  describe('Security Layer Integration', () => {
    test('should wrap input validator for address screening', async () => {
      // The wrapper adds screening - verify by checking audit log
      const address = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      await mockSecurityLayer.inputValidator.validateAddress(address);

      // Check that audit log has an entry (wrapped functions log)
      const entries = complianceLayer.getAuditLog();
      expect(entries.length).toBeGreaterThan(0);
    });

    test('should wrap execution guard for audit logging', async () => {
      // Use valid, non-blocked address for the test
      const wallet = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      const tx = { hash: '0xTxHash', to: '0x1111111111111111111111111111111111111111' };

      const result = await mockSecurityLayer.executionGuard.execute(wallet, tx, {});

      // Verify audit log has execution entry
      const entries = complianceLayer.getAuditLog({ category: AUDIT_CATEGORIES.EXECUTION });
      expect(entries.length).toBeGreaterThan(0);
    });

    test('should wrap key manager for audit logging', () => {
      mockSecurityLayer.keyManager.getKey('key1', '0xWallet');

      // Check audit log for key usage
      const entries = complianceLayer.getAuditLog({ category: AUDIT_CATEGORIES.KEY_USAGE });
      expect(entries.length).toBeGreaterThan(0);
    });

    test('should wrap nonce manager for audit logging', async () => {
      await mockSecurityLayer.nonceManager.reserve('0xWallet', 1);

      // Check audit log for nonce entry
      const entries = complianceLayer.getAuditLog({ category: AUDIT_CATEGORIES.NONCE });
      expect(entries.length).toBeGreaterThan(0);
    });

    test('should wrap MEV protection for audit logging', () => {
      mockSecurityLayer.mevProtection.chooseRoute({ hash: '0xTx' }, {});

      // Check audit log for MEV protection entry
      const entries = complianceLayer.getAuditLog({ category: AUDIT_CATEGORIES.MEV_PROTECTION });
      expect(entries.length).toBeGreaterThan(0);
    });

    test('should wrap slippage guard for audit logging', () => {
      mockSecurityLayer.slippageGuard.getSlippage('ETH', 'USDC', {});

      // Check audit log for slippage entry
      const entries = complianceLayer.getAuditLog({ category: AUDIT_CATEGORIES.SLIPPAGE });
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe('Monitoring Layer Integration', () => {
    test('should forward sanctions alerts to alert system', async () => {
      const ofacAddress = Array.from(SAMPLE_OFAC_ADDRESSES)[0];
      await complianceLayer.screenAddress(ofacAddress);

      // Alert should be sent
      expect(mockMonitoringLayer.alertSystem.sendAlert).toHaveBeenCalled();
    });

    test('should add compliance dashboard methods', () => {
      expect(mockMonitoringLayer.dashboard.getComplianceStatus).toBeDefined();
      expect(mockMonitoringLayer.dashboard.exportComplianceReport).toBeDefined();
    });

    test('dashboard getComplianceStatus should return stats', () => {
      const status = mockMonitoringLayer.dashboard.getComplianceStatus();

      expect(status.auditLog).toBeDefined();
      expect(status.screening).toBeDefined();
    });
  });

  describe('Lifecycle', () => {
    test('should start compliance layer', () => {
      complianceLayer.start();

      expect(complianceLayer.started).toBe(true);
    });

    test('should stop compliance layer', () => {
      complianceLayer.start();
      complianceLayer.stop();

      expect(complianceLayer.started).toBe(false);
    });

    test('should emit events on start/stop', (done) => {
      complianceLayer.on('started', () => {
        complianceLayer.on('stopped', () => {
          done();
        });
        complianceLayer.stop();
      });
      complianceLayer.start();
    });

    test('getStatus should return comprehensive status', () => {
      complianceLayer.start();

      const status = complianceLayer.getStatus();

      expect(status.started).toBe(true);
      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.auditLogger).toBeDefined();
      expect(status.addressScreener).toBeDefined();
      expect(status.geoRestrictor).toBeDefined();
      expect(status.integrations.securityLayer).toBe(true);
      expect(status.integrations.monitoringLayer).toBe(true);
    });

    test('getSnapshot should return full snapshot', () => {
      complianceLayer.start();
      complianceLayer.auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'test', {});

      const snapshot = complianceLayer.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.status).toBeDefined();
      expect(snapshot.recentAuditEntries).toBeDefined();
      expect(snapshot.blockedAddresses).toBeDefined();
      expect(snapshot.blockedCountries).toBeDefined();
    });
  });

  describe('Cross-Module Flow', () => {
    test('complete transaction flow with compliance', async () => {
      complianceLayer.start();

      // 1. Screen the transaction
      const screenResult = await complianceLayer.screenTransaction({
        hash: '0xPending',
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
      });
      expect(screenResult.allowed).toBe(true);

      // 2. Check audit log has screening entry
      const auditEntries = complianceLayer.getAuditLog({ category: AUDIT_CATEGORIES.SCREENING });
      expect(auditEntries.length).toBeGreaterThan(0);

      // 3. Verify integrity
      expect(complianceLayer.verifyAuditIntegrity()).toBe(true);
    });

    test('blocked transaction flow', async () => {
      complianceLayer.start();

      // Screen a blocked address
      const ofacAddress = Array.from(SAMPLE_OFAC_ADDRESSES)[0];
      const screenResult = await complianceLayer.screenAddress(ofacAddress);

      expect(screenResult.allowed).toBe(false);

      // Check violation was logged
      const violations = complianceLayer.getAuditLog({ category: AUDIT_CATEGORIES.SCREENING });
      expect(violations.length).toBeGreaterThan(0);

      // Check alert was sent
      expect(mockMonitoringLayer.alertSystem.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'critical',
          category: 'compliance',
        })
      );
    });

    test('geo blocking flow', async () => {
      complianceLayer.start();

      // Block a country
      complianceLayer.blockCountry('XX', 'Test');

      // Verify it's blocked
      expect(complianceLayer.geoRestrictor.isCountryBlocked('XX')).toBe(true);

      // Check audit log for config change
      const configEntries = complianceLayer.getAuditLog({ category: AUDIT_CATEGORIES.CONFIG });
      expect(configEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle screening errors gracefully', async () => {
      // Invalid address should be blocked
      const result = await complianceLayer.screenAddress('invalid');

      expect(result.allowed).toBe(false);
    });

    test('should handle geo check errors gracefully', async () => {
      const result = await complianceLayer.checkGeo('invalid-ip');

      expect(result.allowed).toBe(false);
    });
  });

  describe('Audit Export', () => {
    beforeEach(() => {
      complianceLayer.auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx1', { value: 100 });
      complianceLayer.auditLogger.log(AUDIT_CATEGORIES.ACCESS, 'check', { user: 'alice' });
      complianceLayer.auditLogger.log(AUDIT_CATEGORIES.VIOLATION, 'blocked', { reason: 'test' });
    });

    test('should export to JSON', () => {
      const json = complianceLayer.exportAudit(EXPORT_FORMATS.JSON);
      const data = JSON.parse(json);

      expect(data.length).toBe(3);
    });

    test('should export to CSV', () => {
      const csv = complianceLayer.exportAudit(EXPORT_FORMATS.CSV);
      const lines = csv.split('\n');

      expect(lines.length).toBe(4); // Header + 3 entries
    });

    test('should export to NDJSON', () => {
      const ndjson = complianceLayer.exportAudit(EXPORT_FORMATS.NDJSON);
      const lines = ndjson.trim().split('\n');

      expect(lines.length).toBe(3);
      lines.forEach(line => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });

    test('should filter exports', () => {
      const json = complianceLayer.exportAudit(EXPORT_FORMATS.JSON, {
        category: AUDIT_CATEGORIES.VIOLATION,
      });
      const data = JSON.parse(json);

      expect(data.length).toBe(1);
      expect(data[0].category).toBe(AUDIT_CATEGORIES.VIOLATION);
    });
  });
});

describe('Compliance Layer Stress Tests', () => {
  let complianceLayer;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    complianceLayer = createComplianceLayer({ logger: mockLogger });
  });

  afterEach(() => {
    complianceLayer.stop();
  });

  test('should handle high volume of screenings', async () => {
    const addresses = [];
    for (let i = 0; i < 100; i++) {
      // Use addresses that don't match high-risk patterns (avoid null/dead patterns)
      // Start from 0x1000... to avoid null address detection
      const hex = (0x1000 + i).toString(16).padStart(40, '1');
      addresses.push(`0x${hex}`);
    }

    const results = await Promise.all(
      addresses.map(addr => complianceLayer.screenAddress(addr))
    );

    expect(results.length).toBe(100);
    // All should be allowed (none match OFAC or high-risk patterns)
    const allowedCount = results.filter(r => r.allowed === true).length;
    expect(allowedCount).toBe(100);
  });

  test('should handle high volume of audit logs', () => {
    for (let i = 0; i < 1000; i++) {
      complianceLayer.auditLogger.log(AUDIT_CATEGORIES.EXECUTION, `tx${i}`, { index: i });
    }

    const stats = complianceLayer.auditLogger.getStatistics();
    expect(stats.metrics.totalLogged).toBe(1000);

    // Verify integrity
    expect(complianceLayer.verifyAuditIntegrity()).toBe(true);
  });

  test('should handle concurrent operations', async () => {
    const operations = [];

    // Mix of screenings and geo checks
    for (let i = 0; i < 50; i++) {
      operations.push(
        complianceLayer.screenAddress(`0x${i.toString(16).padStart(40, '0')}`)
      );
      operations.push(
        complianceLayer.checkGeo(`8.8.${i % 256}.${i % 256}`)
      );
    }

    const results = await Promise.all(operations);
    expect(results.length).toBe(100);
  });
});
