/**
 * Key Manager Unit Tests
 *
 * Tests secure key storage, tiered wallet system,
 * encryption/decryption, and spending limits.
 */

const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const KeyManager = require('../../src/security/key-manager');
const { WALLET_TIER, KEY_SOURCE } = KeyManager;

describe('KeyManager', () => {
  let keyManager;
  let mockLogger;
  const testEncryptionKey = 'test-encryption-key-32-chars!!!';
  const testKeyStorePath = './.test-keys';

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    keyManager = new KeyManager({
      logger: mockLogger,
      encryptionKey: testEncryptionKey,
      keyStorePath: testKeyStorePath,
    });
  });

  afterEach(() => {
    // Clean up test key store
    if (fs.existsSync(testKeyStorePath)) {
      const files = fs.readdirSync(testKeyStorePath);
      for (const file of files) {
        fs.unlinkSync(path.join(testKeyStorePath, file));
      }
      fs.rmdirSync(testKeyStorePath);
    }
  });

  describe('Encryption/Decryption', () => {
    test('encrypts and decrypts data correctly', () => {
      const originalData = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const encrypted = keyManager.encrypt(originalData, testEncryptionKey);
      const decrypted = keyManager.decrypt(encrypted, testEncryptionKey);

      expect(decrypted).toBe(originalData);
    });

    test('encrypted data is different from original', () => {
      const originalData = 'test-private-key';

      const encrypted = keyManager.encrypt(originalData, testEncryptionKey);

      expect(encrypted).not.toBe(originalData);
      expect(encrypted).not.toContain(originalData);
    });

    test('different IVs produce different ciphertext', () => {
      const data = 'same-data';

      const encrypted1 = keyManager.encrypt(data, testEncryptionKey);
      const encrypted2 = keyManager.encrypt(data, testEncryptionKey);

      expect(encrypted1).not.toBe(encrypted2);
    });

    test('fails with wrong decryption key', () => {
      const data = 'test-data';
      const encrypted = keyManager.encrypt(data, testEncryptionKey);

      expect(() => {
        keyManager.decrypt(encrypted, 'wrong-key-32-characters!!!!!!!');
      }).toThrow();
    });
  });

  describe('Key Storage', () => {
    test('stores key to file', async () => {
      const testKey = '0x' + crypto.randomBytes(32).toString('hex');

      await keyManager.storeKey('test-wallet', testKey);

      const filePath = path.join(testKeyStorePath, 'test-wallet.enc');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('stored key can be loaded', async () => {
      const testKey = '0x' + crypto.randomBytes(32).toString('hex');

      await keyManager.storeKey('test-wallet', testKey);

      // Create new manager to test loading
      const manager2 = new KeyManager({
        logger: mockLogger,
        encryptionKey: testEncryptionKey,
        keyStorePath: testKeyStorePath,
        source: KEY_SOURCE.FILE,
      });

      const loadedKey = await manager2.loadFromFile('test-wallet');
      expect(loadedKey).toBe(testKey);
    });

    test('throws without encryption key', async () => {
      const noEncKeyManager = new KeyManager({ logger: mockLogger });

      await expect(
        noEncKeyManager.storeKey('test', 'key')
      ).rejects.toThrow('Encryption key required');
    });

    test('throws for non-existent file', async () => {
      await expect(
        keyManager.loadFromFile('non-existent')
      ).rejects.toThrow('Key file not found');
    });
  });

  describe('Environment Loading', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('loads from PRIVATE_KEY_<NAME>', async () => {
      process.env.PRIVATE_KEY_TEST = '0x1234';

      const key = await keyManager.loadFromEnv('test');
      expect(key).toBe('0x1234');
    });

    test('loads from <NAME>_PRIVATE_KEY', async () => {
      process.env.WALLET_PRIVATE_KEY = '0xabcd';

      const key = await keyManager.loadFromEnv('wallet');
      expect(key).toBe('0xabcd');
    });

    test('adds 0x prefix if missing', async () => {
      process.env.PRIVATE_KEY = '1234abcd';

      const key = await keyManager.loadFromEnv('any');
      expect(key).toBe('0x1234abcd');
    });

    test('throws when not found', async () => {
      await expect(
        keyManager.loadFromEnv('nonexistent')
      ).rejects.toThrow('not found');
    });
  });

  describe('Wallet Generation', () => {
    test('generates new wallet', async () => {
      const result = await keyManager.generateWallet('new-wallet', WALLET_TIER.HOT);

      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(result.mnemonic).toBeDefined();
      expect(result.privateKey).toBe('[STORED]');
    });

    test('stores key when store=true', async () => {
      await keyManager.generateWallet('stored-wallet', WALLET_TIER.HOT, true);

      const filePath = path.join(testKeyStorePath, 'stored-wallet.enc');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('returns private key when store=false', async () => {
      const result = await keyManager.generateWallet('temp-wallet', WALLET_TIER.HOT, false);

      expect(result.privateKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    test('audits wallet generation', async () => {
      await keyManager.generateWallet('audited-wallet', WALLET_TIER.HOT);

      const log = keyManager.getAuditLog();
      expect(log.some(e => e.action === 'WALLET_GENERATED')).toBe(true);
    });
  });

  describe('Tier Limits', () => {
    beforeEach(() => {
      // Register a test wallet
      keyManager.wallets.set('0xtest', {
        tier: WALLET_TIER.HOT,
        identifier: 'test',
        address: '0xTest',
        loadedAt: Date.now(),
      });
    });

    test('allows transaction within limit', () => {
      const result = keyManager.checkTierLimits('0xTest', 500);

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });

    test('rejects transaction exceeding limit', () => {
      const result = keyManager.checkTierLimits('0xTest', 2000); // Exceeds $1000 HOT limit

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds');
    });

    test('rejects when daily limit exceeded', () => {
      // Spend up to daily limit
      keyManager.recordSpending('0xTest', 4500);

      // Next transaction should exceed $5000 daily limit
      const result = keyManager.checkTierLimits('0xTest', 600);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit');
    });

    test('resets daily limit on new day', () => {
      // Set yesterday's date
      const spending = { date: '2024-01-01', amount: 5000 };
      keyManager.dailySpending.set('0xtest', spending);

      // Today's transaction should be allowed
      const result = keyManager.checkTierLimits('0xTest', 500);

      expect(result.allowed).toBe(true);
    });

    test('returns not allowed for unregistered wallet', () => {
      const result = keyManager.checkTierLimits('0xUnknown', 100);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not registered');
    });
  });

  describe('Spending Tracking', () => {
    test('records spending amount', () => {
      keyManager.recordSpending('0xTest', 500);
      keyManager.recordSpending('0xTest', 300);

      const spending = keyManager.dailySpending.get('0xtest');
      expect(spending.amount).toBe(800);
    });

    test('audits spending records', () => {
      keyManager.recordSpending('0xTest', 100);

      const log = keyManager.getAuditLog();
      expect(log.some(e => e.action === 'SPENDING_RECORDED')).toBe(true);
    });
  });

  describe('Wallet Registry', () => {
    test('gets wallet info', () => {
      keyManager.wallets.set('0xtest', {
        tier: WALLET_TIER.WARM,
        identifier: 'test',
        address: '0xTest',
        loadedAt: Date.now(),
      });

      const info = keyManager.getWalletInfo('0xTest');

      expect(info.tier).toBe(WALLET_TIER.WARM);
      expect(info.identifier).toBe('test');
    });

    test('returns null for unknown wallet', () => {
      const info = keyManager.getWalletInfo('0xUnknown');
      expect(info).toBeNull();
    });

    test('lists all wallets', () => {
      keyManager.wallets.set('0xaaa', { tier: WALLET_TIER.HOT, identifier: 'a' });
      keyManager.wallets.set('0xbbb', { tier: WALLET_TIER.WARM, identifier: 'b' });

      const wallets = keyManager.getAllWallets();

      expect(wallets.length).toBe(2);
      expect(wallets.some(w => w.identifier === 'a')).toBe(true);
      expect(wallets.some(w => w.identifier === 'b')).toBe(true);
    });
  });

  describe('Tier Configuration', () => {
    test('gets tier limits', () => {
      const limits = keyManager.getTierLimits(WALLET_TIER.HOT);

      expect(limits.maxTransactionValue).toBe(1000);
      expect(limits.dailyLimit).toBe(5000);
      expect(limits.requiresApproval).toBe(false);
    });

    test('warm tier requires approval', () => {
      const limits = keyManager.getTierLimits(WALLET_TIER.WARM);
      expect(limits.requiresApproval).toBe(true);
    });

    test('cold tier requires multisig', () => {
      const limits = keyManager.getTierLimits(WALLET_TIER.COLD);
      expect(limits.requiresMultisig).toBe(true);
    });

    test('sets tier limits', () => {
      keyManager.setTierLimits(WALLET_TIER.HOT, {
        maxTransactionValue: 2000,
        dailyLimit: 10000,
      });

      const limits = keyManager.getTierLimits(WALLET_TIER.HOT);
      expect(limits.maxTransactionValue).toBe(2000);
      expect(limits.dailyLimit).toBe(10000);
    });

    test('throws for invalid tier', () => {
      expect(() => {
        keyManager.setTierLimits('invalid', {});
      }).toThrow('Invalid tier');
    });

    test('returns null for unknown tier', () => {
      const limits = keyManager.getTierLimits('unknown');
      expect(limits).toBeNull();
    });
  });

  describe('Audit Logging', () => {
    test('records audit entries', () => {
      keyManager.audit('TEST_ACTION', { key: 'value' });

      const log = keyManager.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].action).toBe('TEST_ACTION');
      expect(log[0].details.key).toBe('value');
    });

    test('includes timestamp', () => {
      keyManager.audit('TEST_ACTION', {});

      const log = keyManager.getAuditLog();
      expect(log[0].timestamp).toBeDefined();
    });

    test('limits entries to 1000', () => {
      for (let i = 0; i < 1100; i++) {
        keyManager.audit('ACTION', { i });
      }

      expect(keyManager.auditLog.length).toBe(1000);
    });

    test('returns limited entries', () => {
      for (let i = 0; i < 50; i++) {
        keyManager.audit('ACTION', { i });
      }

      const log = keyManager.getAuditLog(10);
      expect(log.length).toBe(10);
    });

    test('logs sensitive actions with warn', () => {
      keyManager.audit('KEY_ROTATION_STARTED', { identifier: 'test' });

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Constants Export', () => {
    test('exports WALLET_TIER constants', () => {
      expect(WALLET_TIER.HOT).toBe('hot');
      expect(WALLET_TIER.WARM).toBe('warm');
      expect(WALLET_TIER.COLD).toBe('cold');
    });

    test('exports KEY_SOURCE constants', () => {
      expect(KEY_SOURCE.ENV).toBe('env');
      expect(KEY_SOURCE.FILE).toBe('file');
      expect(KEY_SOURCE.AWS_SECRETS).toBe('aws');
      expect(KEY_SOURCE.VAULT).toBe('vault');
      expect(KEY_SOURCE.HSM).toBe('hsm');
    });
  });

  describe('Custom Configuration', () => {
    test('uses custom tier limits', () => {
      const customManager = new KeyManager({
        logger: mockLogger,
        hotMaxTx: 5000,
        hotDailyLimit: 20000,
        warmMaxTx: 50000,
        warmDailyLimit: 200000,
      });

      const hotLimits = customManager.getTierLimits(WALLET_TIER.HOT);
      expect(hotLimits.maxTransactionValue).toBe(5000);
      expect(hotLimits.dailyLimit).toBe(20000);

      const warmLimits = customManager.getTierLimits(WALLET_TIER.WARM);
      expect(warmLimits.maxTransactionValue).toBe(50000);
      expect(warmLimits.dailyLimit).toBe(200000);
    });
  });

  describe('Wallet Loading', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('loads wallet and registers it', async () => {
      process.env.PRIVATE_KEY_TEST = '0x' + 'a'.repeat(64);

      const wallet = await keyManager.loadWallet('test', WALLET_TIER.HOT);

      expect(wallet).toBeDefined();
      expect(wallet.address).toBeDefined();

      const info = keyManager.getWalletInfo(wallet.address);
      expect(info.tier).toBe(WALLET_TIER.HOT);
    });

    test('audits wallet loading', async () => {
      process.env.PRIVATE_KEY_AUDIT = '0x' + 'b'.repeat(64);

      await keyManager.loadWallet('audit', WALLET_TIER.WARM);

      const log = keyManager.getAuditLog();
      expect(log.some(e => e.action === 'LOAD_WALLET')).toBe(true);
      expect(log.some(e => e.action === 'WALLET_LOADED')).toBe(true);
    });

    test('throws for unsupported source', async () => {
      const unsupportedManager = new KeyManager({
        logger: mockLogger,
        source: 'unsupported',
      });

      await expect(
        unsupportedManager.loadWallet('test')
      ).rejects.toThrow('Unsupported key source');
    });
  });
});
