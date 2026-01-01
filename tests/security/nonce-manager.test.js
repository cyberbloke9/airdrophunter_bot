/**
 * Nonce Manager Unit Tests
 *
 * Tests nonce reservation, confirmation, stuck transaction detection,
 * and gap prevention.
 */

const NonceManager = require('../../src/security/nonce-manager');

describe('NonceManager', () => {
  let nonceManager;
  let mockLogger;
  let mockProvider;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock provider
    mockProvider = {
      getTransactionCount: jest.fn().mockResolvedValue(0),
      getGasPrice: jest.fn().mockResolvedValue({ mul: jest.fn().mockReturnThis(), div: jest.fn().mockReturnValue(BigInt(20000000000)) }),
    };

    nonceManager = new NonceManager({ logger: mockLogger, stuckTimeout: 1000 });
  });

  describe('Nonce Reservation', () => {
    test('reserves next nonce starting from on-chain count', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(5);

      const nonce = await nonceManager.getNextNonce('0x1234', mockProvider);
      expect(nonce).toBe(5);
    });

    test('increments nonce for subsequent requests', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(5);

      const nonce1 = await nonceManager.getNextNonce('0x1234', mockProvider);
      const nonce2 = await nonceManager.getNextNonce('0x1234', mockProvider);

      expect(nonce1).toBe(5);
      expect(nonce2).toBe(6);
    });

    test('handles concurrent requests without gaps', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      const promises = [
        nonceManager.getNextNonce('0x1234', mockProvider),
        nonceManager.getNextNonce('0x1234', mockProvider),
        nonceManager.getNextNonce('0x1234', mockProvider),
      ];

      const nonces = await Promise.all(promises);
      const sortedNonces = [...nonces].sort((a, b) => a - b);

      expect(sortedNonces).toEqual([0, 1, 2]);
    });

    test('isolates nonces per wallet', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      const nonce1 = await nonceManager.getNextNonce('0xAAAA', mockProvider);
      const nonce2 = await nonceManager.getNextNonce('0xBBBB', mockProvider);

      expect(nonce1).toBe(0);
      expect(nonce2).toBe(0);
    });

    test('normalizes wallet addresses to lowercase', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      const nonce1 = await nonceManager.getNextNonce('0xAAAA', mockProvider);
      const nonce2 = await nonceManager.getNextNonce('0xaaaa', mockProvider);

      expect(nonce2).toBe(1); // Same wallet, should increment
    });
  });

  describe('Nonce Confirmation', () => {
    test('confirms nonce and removes from pending', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      const nonce = await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.confirmNonce('0x1234', nonce, '0xtxhash');

      const pending = nonceManager.getPendingNonces('0x1234');
      expect(pending).not.toContain(nonce);
    });

    test('tracks last confirmed nonce', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.confirmNonce('0x1234', 0, '0xtxhash');

      const lastConfirmed = nonceManager.getLastConfirmedNonce('0x1234');
      expect(lastConfirmed).toBe(0);
    });

    test('updates confirmed nonce only for higher values', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      await nonceManager.confirmNonce('0x1234', 5, '0xtxhash1');
      await nonceManager.confirmNonce('0x1234', 3, '0xtxhash2');

      const lastConfirmed = nonceManager.getLastConfirmedNonce('0x1234');
      expect(lastConfirmed).toBe(5);
    });
  });

  describe('Nonce Release', () => {
    test('releases nonce on transaction failure', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      const nonce = await nonceManager.getNextNonce('0x1234', mockProvider);
      expect(nonceManager.getPendingNonces('0x1234')).toContain(nonce);

      await nonceManager.releaseNonce('0x1234', nonce);
      expect(nonceManager.getPendingNonces('0x1234')).not.toContain(nonce);
    });

    test('released nonce can be reused', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      const nonce1 = await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.releaseNonce('0x1234', nonce1);

      const nonce2 = await nonceManager.getNextNonce('0x1234', mockProvider);
      expect(nonce2).toBe(nonce1);
    });
  });

  describe('Transaction Tracking', () => {
    test('updates transaction hash after submission', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      await nonceManager.getNextNonce('0x1234', mockProvider);
      nonceManager.updateNonceTransaction('0x1234', 0, '0xTxHash123');

      const status = nonceManager.getStatus();
      // Check that the transaction was tracked
      expect(status.totalPending).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Stuck Transaction Detection', () => {
    test('detects stuck transactions after timeout', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      await nonceManager.getNextNonce('0x1234', mockProvider);

      // Wait for stuck timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      const stuck = await nonceManager.findStuckTransactions();
      expect(stuck.length).toBe(1);
      expect(stuck[0].nonce).toBe(0);
    });

    test('confirmed transactions are not stuck', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      const nonce = await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.confirmNonce('0x1234', nonce, '0xtxhash');

      await new Promise(resolve => setTimeout(resolve, 1100));

      const stuck = await nonceManager.findStuckTransactions();
      expect(stuck.length).toBe(0);
    });

    test('sorts stuck transactions by nonce', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.getNextNonce('0x1234', mockProvider);

      await new Promise(resolve => setTimeout(resolve, 1100));

      const stuck = await nonceManager.findStuckTransactions();
      expect(stuck[0].nonce).toBe(0);
      expect(stuck[1].nonce).toBe(1);
      expect(stuck[2].nonce).toBe(2);
    });
  });

  describe('Wallet Clearing', () => {
    test('clears all tracking for wallet', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.confirmNonce('0x1234', 0, '0xtxhash');

      nonceManager.clearWallet('0x1234');

      expect(nonceManager.getPendingNonces('0x1234')).toEqual([]);
      expect(nonceManager.getLastConfirmedNonce('0x1234')).toBeNull();
    });

    test('clearing one wallet does not affect others', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      await nonceManager.getNextNonce('0xAAAA', mockProvider);
      await nonceManager.getNextNonce('0xBBBB', mockProvider);

      nonceManager.clearWallet('0xAAAA');

      expect(nonceManager.getPendingNonces('0xAAAA')).toEqual([]);
      expect(nonceManager.getPendingNonces('0xBBBB')).toContain(0);
    });
  });

  describe('Status Reporting', () => {
    test('reports pending transactions by wallet', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.getNextNonce('0x1234', mockProvider);

      const status = nonceManager.getStatus();
      expect(status.totalPending).toBe(2);
      expect(status.pendingByWallet['0x1234']).toContain(0);
      expect(status.pendingByWallet['0x1234']).toContain(1);
    });

    test('reports stuck transactions', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      await nonceManager.getNextNonce('0x1234', mockProvider);

      await new Promise(resolve => setTimeout(resolve, 1100));

      const status = nonceManager.getStatus();
      expect(status.totalStuck).toBe(1);
    });
  });

  describe('Lock Timeout', () => {
    test('times out if lock held too long', async () => {
      // Create manager with very short timeout
      const shortTimeoutManager = new NonceManager({
        logger: mockLogger,
        lockTimeout: 50,
      });

      // First call acquires lock
      const promise1 = shortTimeoutManager.getNextNonce('0x1234', mockProvider);

      // Hold the lock by not confirming
      await promise1;

      // Make provider slow for second call while lock is held
      let holdingLock = true;
      const slowProvider = {
        getTransactionCount: jest.fn().mockImplementation(async () => {
          while (holdingLock) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          return 0;
        }),
      };

      // Start long-running first transaction
      const longPromise = shortTimeoutManager.getNextNonce('0x1234', slowProvider);

      // Give it time to acquire lock
      await new Promise(resolve => setTimeout(resolve, 20));

      // Second call should timeout waiting for lock
      const timeoutPromise = shortTimeoutManager.getNextNonce('0x1234', mockProvider);

      // Wait for timeout
      await expect(timeoutPromise).rejects.toThrow();

      // Cleanup
      holdingLock = false;
      await longPromise.catch(() => {});
    });
  });

  describe('Pending Nonces', () => {
    test('returns sorted pending nonces', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(5);

      await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.getNextNonce('0x1234', mockProvider);
      await nonceManager.getNextNonce('0x1234', mockProvider);

      const pending = nonceManager.getPendingNonces('0x1234');
      expect(pending).toEqual([5, 6, 7]);
    });

    test('returns empty array for unknown wallet', () => {
      const pending = nonceManager.getPendingNonces('0xUnknown');
      expect(pending).toEqual([]);
    });
  });

  describe('Gap Prevention', () => {
    test('fills gaps when nonces are released out of order', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(0);

      const nonce0 = await nonceManager.getNextNonce('0x1234', mockProvider);
      const nonce1 = await nonceManager.getNextNonce('0x1234', mockProvider);
      const nonce2 = await nonceManager.getNextNonce('0x1234', mockProvider);

      // Release middle nonce
      await nonceManager.releaseNonce('0x1234', nonce1);

      // Next reservation should fill the gap
      const nonce3 = await nonceManager.getNextNonce('0x1234', mockProvider);
      expect(nonce3).toBe(1); // Should get the released nonce
    });
  });

  describe('On-Chain Sync', () => {
    test('syncs with on-chain nonce', async () => {
      mockProvider.getTransactionCount.mockResolvedValue(10);

      const nonce = await nonceManager.getNextNonce('0x1234', mockProvider);
      expect(nonce).toBe(10);
    });

    test('handles on-chain nonce advancing', async () => {
      mockProvider.getTransactionCount
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(10);

      const nonce1 = await nonceManager.getNextNonce('0x1234', mockProvider);
      expect(nonce1).toBe(5);

      // Clear pending to simulate external confirmation
      nonceManager.clearWallet('0x1234');

      const nonce2 = await nonceManager.getNextNonce('0x1234', mockProvider);
      expect(nonce2).toBe(10);
    });
  });
});
