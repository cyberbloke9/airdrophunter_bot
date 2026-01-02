'use strict';

/**
 * Audit Logger Unit Tests
 * Sprint 2.1: Compliance Layer
 */

const {
  AuditLogger,
  AuditEntry,
  MemoryStorage,
  createAuditLogger,
  AUDIT_CATEGORIES,
  SEVERITY_LEVELS,
  EXPORT_FORMATS,
} = require('../../src/compliance/audit-logger');

describe('AuditLogger', () => {
  let auditLogger;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    auditLogger = createAuditLogger({ logger: mockLogger });
  });

  afterEach(() => {
    auditLogger.removeAllListeners();
  });

  describe('AuditEntry', () => {
    test('should generate unique IDs', () => {
      const entry1 = new AuditEntry('test', 'action', {});
      const entry2 = new AuditEntry('test', 'action', {});
      expect(entry1.id).not.toBe(entry2.id);
      expect(entry1.id).toMatch(/^audit_[a-z0-9]+_[a-f0-9]+$/);
    });

    test('should compute hash chain', () => {
      const entry = new AuditEntry('test', 'action', { foo: 'bar' });
      const hash = entry.computeHash(null);

      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64); // SHA-256 hex
      expect(entry.hash).toBe(hash);
      expect(entry.previousHash).toBeNull();
    });

    test('should link to previous hash', () => {
      const entry1 = new AuditEntry('test', 'action1', {});
      entry1.computeHash(null);

      const entry2 = new AuditEntry('test', 'action2', {});
      entry2.computeHash(entry1.hash);

      expect(entry2.previousHash).toBe(entry1.hash);
    });

    test('should serialize to JSON', () => {
      const entry = new AuditEntry('execution', 'tx_success', { txHash: '0x123' });
      entry.computeHash(null);

      const json = entry.toJSON();
      expect(json.category).toBe('execution');
      expect(json.action).toBe('tx_success');
      expect(json.data.txHash).toBe('0x123');
      expect(json.hash).toBeTruthy();
    });

    test('should serialize to CSV', () => {
      const entry = new AuditEntry('execution', 'tx_success', { value: '100' });
      const csv = entry.toCSV();

      expect(csv).toContain(entry.id);
      expect(csv).toContain('execution');
      expect(csv).toContain('tx_success');
    });
  });

  describe('MemoryStorage', () => {
    let storage;

    beforeEach(() => {
      storage = new MemoryStorage({ maxEntries: 1000 });
    });

    test('should append entries', () => {
      const entry = new AuditEntry('test', 'action', {});
      storage.append(entry);

      expect(storage.entries.length).toBe(1);
    });

    test('should index by category', () => {
      storage.append(new AuditEntry('execution', 'action1', {}));
      storage.append(new AuditEntry('access', 'action2', {}));
      storage.append(new AuditEntry('execution', 'action3', {}));

      const results = storage.query({ category: 'execution' });
      expect(results.length).toBe(2);
    });

    test('should index by wallet', () => {
      const entry1 = new AuditEntry('test', 'action', {}, { wallet: '0xABC' });
      const entry2 = new AuditEntry('test', 'action', {}, { wallet: '0xDEF' });
      storage.append(entry1);
      storage.append(entry2);

      const results = storage.query({ wallet: '0xabc' }); // Case insensitive
      expect(results.length).toBe(1);
    });

    test('should filter by time range', () => {
      const entry1 = new AuditEntry('test', 'action', {});
      entry1.timestamp = Date.now() - 10000;
      const entry2 = new AuditEntry('test', 'action', {});
      entry2.timestamp = Date.now();

      storage.append(entry1);
      storage.append(entry2);

      const results = storage.query({ startTime: Date.now() - 5000 });
      expect(results.length).toBe(1);
    });

    test('should support pagination', () => {
      for (let i = 0; i < 20; i++) {
        storage.append(new AuditEntry('test', `action${i}`, {}));
      }

      const page1 = storage.query({}, { limit: 5, offset: 0 });
      const page2 = storage.query({}, { limit: 5, offset: 5 });

      expect(page1.length).toBe(5);
      expect(page2.length).toBe(5);
      expect(page1[0].action).not.toBe(page2[0].action);
    });

    test('should sort by timestamp', () => {
      for (let i = 0; i < 5; i++) {
        const entry = new AuditEntry('test', `action${i}`, {});
        entry.timestamp = Date.now() + i * 1000;
        storage.append(entry);
      }

      const descResults = storage.query({}, { sort: 'desc' });
      const ascResults = storage.query({}, { sort: 'asc' });

      expect(descResults[0].action).toBe('action4');
      expect(ascResults[0].action).toBe('action0');
    });

    test('should get statistics', () => {
      storage.append(new AuditEntry('execution', 'action', {}, { severity: 'info' }));
      storage.append(new AuditEntry('access', 'action', {}, { severity: 'warn' }));
      storage.append(new AuditEntry('execution', 'action', {}, { severity: 'info' }));

      const stats = storage.getStatistics();
      expect(stats.totalEntries).toBe(3);
      expect(stats.byCategory.execution).toBe(2);
      expect(stats.byCategory.access).toBe(1);
    });
  });

  describe('Core Logging', () => {
    test('should log entries with hash chain', () => {
      const entry1 = auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'test1', { a: 1 });
      const entry2 = auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'test2', { b: 2 });

      expect(entry1.hash).toBeTruthy();
      expect(entry2.previousHash).toBe(entry1.hash);
    });

    test('should emit events on log', (done) => {
      auditLogger.on('entry', (entry) => {
        expect(entry.category).toBe(AUDIT_CATEGORIES.ACCESS);
        done();
      });

      auditLogger.log(AUDIT_CATEGORIES.ACCESS, 'test', {});
    });

    test('should emit category-specific events', (done) => {
      auditLogger.on('entry:execution', (entry) => {
        expect(entry.action).toBe('tx_test');
        done();
      });

      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx_test', {});
    });

    test('should track metrics', () => {
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'test', {});
      auditLogger.log(AUDIT_CATEGORIES.VIOLATION, 'violation', {});
      auditLogger.log(AUDIT_CATEGORIES.ACCESS, 'test', { severity: SEVERITY_LEVELS.CRITICAL });

      const stats = auditLogger.getStatistics();
      expect(stats.metrics.totalLogged).toBe(3);
      expect(stats.metrics.violations).toBe(1);
    });

    test('should support async logging', async () => {
      const entry = await auditLogger.logAsync(AUDIT_CATEGORIES.EXECUTION, 'async_test', { data: 'value' });

      expect(entry.action).toBe('async_test');
      expect(entry.hash).toBeTruthy();
    });
  });

  describe('Category-Specific Logging', () => {
    test('logExecution should log transaction details', () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      const tx = {
        hash: '0xabcd',
        to: '0x5678',
        value: '1000000000000000000',
        gasPrice: '25000000000',
        nonce: 5,
        chainId: 1,
      };
      const result = { success: true, gasUsed: 21000, blockNumber: 12345 };

      const entry = auditLogger.logExecution(wallet, tx, result);

      expect(entry.category).toBe(AUDIT_CATEGORIES.EXECUTION);
      expect(entry.action).toBe('tx_success');
      expect(entry.data.wallet).toBe(wallet);
      expect(entry.data.txHash).toBe('0xabcd');
    });

    test('logExecution should log failures', () => {
      const entry = auditLogger.logExecution('0x123', { hash: '0xfail' }, {
        success: false,
        revertReason: 'Insufficient funds',
      });

      expect(entry.action).toBe('tx_failure');
      expect(entry.data.revertReason).toBe('Insufficient funds');
    });

    test('logAccess should log permission checks', () => {
      const entry = auditLogger.logAccess('user123', 'admin:write', false, {
        resource: '/api/config',
      });

      expect(entry.category).toBe(AUDIT_CATEGORIES.ACCESS);
      expect(entry.action).toBe('access_denied');
      expect(entry.data.permission).toBe('admin:write');
    });

    test('logKeyUsage should log key operations', () => {
      const entry = auditLogger.logKeyUsage('key_001', 'sign', '0xWallet');

      expect(entry.category).toBe(AUDIT_CATEGORIES.KEY_USAGE);
      expect(entry.data.keyId).toBe('key_001');
      expect(entry.data.operation).toBe('sign');
    });

    test('logApproval should log token approvals', () => {
      const entry = auditLogger.logApproval(
        '0xWallet',
        '0xToken',
        '0xSpender',
        '1000000000000000000'
      );

      expect(entry.category).toBe(AUDIT_CATEGORIES.APPROVAL);
      expect(entry.action).toBe('approval_granted');
    });

    test('logApproval should detect revocations', () => {
      const entry = auditLogger.logApproval('0xWallet', '0xToken', '0xSpender', '0');

      expect(entry.action).toBe('approval_revoked');
    });

    test('logMevProtection should log routing decisions', () => {
      const entry = auditLogger.logMevProtection(
        { hash: '0xTx' },
        'flashbots',
        'High value transaction'
      );

      expect(entry.category).toBe(AUDIT_CATEGORIES.MEV_PROTECTION);
      expect(entry.data.route).toBe('flashbots');
    });

    test('logMevIncident should log attacks', () => {
      const entry = auditLogger.logMevIncident(
        { hash: '0xVictim' },
        '0xAttacker',
        '50000000000000000',
        { frontrunTx: '0xFront', backrunTx: '0xBack' }
      );

      expect(entry.category).toBe(AUDIT_CATEGORIES.MEV_INCIDENT);
      expect(entry.metadata.severity).toBe(SEVERITY_LEVELS.CRITICAL);
    });

    test('logScreening should log sanctions checks', () => {
      const entry = auditLogger.logScreening('0xAddress', {
        allowed: false,
        risk: 'blocked',
        matches: [{ listName: 'OFAC_SDN' }],
      }, 'ofac');

      expect(entry.category).toBe(AUDIT_CATEGORIES.SCREENING);
      expect(entry.action).toBe('sanctions_match');
    });

    test('logGeoCheck should mask IP addresses', () => {
      const entry = auditLogger.logGeoCheck('192.168.1.100', 'United States', true);

      expect(entry.data.ip).toBe('192.168.xxx.xxx');
    });

    test('logViolation should log compliance violations', () => {
      const entry = auditLogger.logViolation('sanctions_attempt', {
        address: '0xBlocked',
        action: 'swap',
      }, SEVERITY_LEVELS.CRITICAL);

      expect(entry.category).toBe(AUDIT_CATEGORIES.VIOLATION);
      expect(entry.metadata.severity).toBe(SEVERITY_LEVELS.CRITICAL);
    });
  });

  describe('Query and Export', () => {
    beforeEach(() => {
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx1', { value: 100 });
      auditLogger.log(AUDIT_CATEGORIES.ACCESS, 'check1', { user: 'alice' });
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx2', { value: 200 });
    });

    test('should query by category', () => {
      const results = auditLogger.query({ category: AUDIT_CATEGORIES.EXECUTION });
      expect(results.length).toBe(2);
    });

    test('should export to JSON', () => {
      const json = auditLogger.export(EXPORT_FORMATS.JSON);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(3);
    });

    test('should export to NDJSON', () => {
      const ndjson = auditLogger.export(EXPORT_FORMATS.NDJSON);
      const lines = ndjson.trim().split('\n');

      expect(lines.length).toBe(3);
      expect(() => JSON.parse(lines[0])).not.toThrow();
    });

    test('should export to CSV', () => {
      const csv = auditLogger.export(EXPORT_FORMATS.CSV);
      const lines = csv.trim().split('\n');

      expect(lines[0]).toContain('id,timestamp,category');
      expect(lines.length).toBe(4); // Header + 3 entries
    });
  });

  describe('Integrity Verification', () => {
    test('should verify intact hash chain', () => {
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx1', {});
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx2', {});
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx3', {});

      const isValid = auditLogger.verifyIntegrity();
      expect(isValid).toBe(true);
    });

    test('should detect tampering', () => {
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx1', {});
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx2', {});

      // Tamper with an entry
      auditLogger.storage.entries[0].data.tampered = true;

      const isValid = auditLogger.verifyIntegrity();
      expect(isValid).toBe(false);
    });

    test('should get hash chain', () => {
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx1', {});
      auditLogger.log(AUDIT_CATEGORIES.EXECUTION, 'tx2', {});

      const chain = auditLogger.getHashChain();
      expect(chain.length).toBe(2);
      expect(chain[1].previousHash).toBe(chain[0].hash);
    });
  });

  describe('Lifecycle', () => {
    test('should rotate logs', () => {
      const smallLogger = createAuditLogger({
        logger: mockLogger,
        storageOptions: { rotationSize: 5 },
      });

      for (let i = 0; i < 10; i++) {
        smallLogger.log(AUDIT_CATEGORIES.EXECUTION, `tx${i}`, {});
      }

      const stats = smallLogger.getStatistics();
      // 10 entries with rotation at 5 = 2 rotations
      expect(smallLogger.storage.archives.length).toBe(2);
    });

    test('should enforce retention policy on purge', () => {
      expect(() => {
        auditLogger.purge(1000, true); // Try to purge recent data
      }).toThrow(/retention policy/);
    });

    test('should archive old entries', () => {
      // Add entries with old timestamps
      for (let i = 0; i < 5; i++) {
        const entry = auditLogger.log(AUDIT_CATEGORIES.EXECUTION, `tx${i}`, {});
        entry.timestamp = Date.now() - (i * 1000000);
      }

      const result = auditLogger.archive(2000000);
      expect(result.archivedCount).toBeGreaterThan(0);
    });
  });

  describe('Utility', () => {
    test('should mask IPv4 addresses', () => {
      expect(auditLogger.maskIp('192.168.1.100')).toBe('192.168.xxx.xxx');
    });

    test('should mask IPv6 addresses', () => {
      const masked = auditLogger.maskIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(masked).toContain('xxxx');
    });

    test('should generate correlation IDs', () => {
      const id1 = auditLogger.getCorrelationId();
      const id2 = auditLogger.getCorrelationId();

      expect(id1).toMatch(/^corr_[a-z0-9]+_[a-f0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    test('should create child loggers with context', () => {
      const childLogger = auditLogger.createChildLogger({
        wallet: '0xChild',
        chainId: 1,
      });

      const entry = childLogger.log(AUDIT_CATEGORIES.EXECUTION, 'test', {});
      expect(entry.metadata.wallet).toBe('0xChild');
      expect(entry.metadata.chainId).toBe(1);
    });
  });
});
