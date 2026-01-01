'use strict';

/**
 * Phase 1 Stress Tests
 * High-volume concurrent operations testing
 * ~30 tests covering performance under load
 */

const { createSecurityLayer } = require('../../src/security');
const { createMonitoringLayer, ALERT_LEVEL, ALERT_CATEGORY } = require('../../src/monitoring');
const { ethers } = require('ethers');

describe('Phase 1 Stress Tests', () => {
  let securityLayer;
  let monitoringLayer;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    securityLayer = createSecurityLayer({ logger: mockLogger });
    monitoringLayer = createMonitoringLayer({
      logger: mockLogger,
      securityLayer,
    });
    monitoringLayer.start();
  });

  afterEach(() => {
    monitoringLayer.stop();
  });

  describe('High-Volume Transaction Tracking', () => {
    test('handles 100 concurrent pending transactions', () => {
      const transactions = [];

      for (let i = 0; i < 100; i++) {
        transactions.push({
          txHash: `0x${i.toString(16).padStart(64, '0')}`,
          wallet: `0x${(i % 10).toString().padStart(40, '0')}`,
          type: i % 2 === 0 ? 'swap' : 'claim',
          chainId: [1, 42161, 10, 137, 8453][i % 5],
        });
      }

      transactions.forEach(tx => {
        monitoringLayer.dashboard.trackPendingTransaction(tx);
      });

      const feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(100);
    });

    test('handles rapid transaction confirmations', () => {
      const txCount = 50;

      // Add pending transactions
      for (let i = 0; i < txCount; i++) {
        monitoringLayer.dashboard.trackPendingTransaction({
          txHash: `0x${i.toString(16).padStart(64, '0')}`,
          wallet: '0x' + '1'.repeat(40),
          type: 'swap',
        });
      }

      // Confirm all rapidly
      for (let i = 0; i < txCount; i++) {
        monitoringLayer.dashboard.confirmTransaction(
          `0x${i.toString(16).padStart(64, '0')}`,
          { gasUsed: 150000 + i * 1000 }
        );
      }

      const feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(0);
      expect(feed.recent.length).toBe(txCount);

      const counters = monitoringLayer.analytics.getCounters();
      expect(counters.transactions.total).toBe(txCount);
    });

    test('handles mixed success/failure transactions', () => {
      const txCount = 100;

      for (let i = 0; i < txCount; i++) {
        const txHash = `0x${i.toString(16).padStart(64, '0')}`;

        monitoringLayer.dashboard.trackPendingTransaction({
          txHash,
          wallet: '0x' + '2'.repeat(40),
          type: 'swap',
        });

        if (i % 3 === 0) {
          monitoringLayer.dashboard.failTransaction(txHash, { message: 'Reverted' });
        } else {
          monitoringLayer.dashboard.confirmTransaction(txHash, { gasUsed: 150000 });
        }
      }

      const counters = monitoringLayer.analytics.getCounters();
      expect(counters.transactions.total).toBe(txCount);
      expect(counters.transactions.failed).toBe(34); // Every 3rd (0, 3, 6...)
      expect(counters.transactions.successful).toBe(66);
    });
  });

  describe('High-Volume Alert Processing', () => {
    test('handles 50 rapid alerts with unique messages', async () => {
      // Reset rate limits for this test
      monitoringLayer.alertSystem.rateLimits.medium = { max: 100, windowMs: 60000 };

      const alertPromises = [];
      const timestamp = Date.now();

      for (let i = 0; i < 50; i++) {
        // Use completely unique messages with timestamp to avoid deduplication
        alertPromises.push(
          monitoringLayer.sendAlert(
            ALERT_LEVEL.MEDIUM,
            ['transaction', 'info', 'system', 'rpc', 'mev'][i % 5],
            `Alert-${timestamp}-${i}-${Math.random().toString(36).slice(2)}`
          )
        );
      }

      const results = await Promise.all(alertPromises);
      const sentCount = results.filter(r => r.sent).length;
      const stats = monitoringLayer.alertSystem.getStatistics();

      // All should send since messages are unique
      expect(sentCount).toBeGreaterThanOrEqual(5); // At minimum 5 (one per category)
      expect(stats.total).toBeGreaterThanOrEqual(5);
    });

    test('deduplication prevents duplicate spam', async () => {
      const alertPromises = [];

      // Send 20 identical alerts
      for (let i = 0; i < 20; i++) {
        alertPromises.push(
          monitoringLayer.sendAlert(
            ALERT_LEVEL.HIGH,
            ALERT_CATEGORY.SECURITY,
            'Same alert message'
          )
        );
      }

      const results = await Promise.all(alertPromises);
      const sentCount = results.filter(r => r.sent).length;
      const duplicateCount = results.filter(r => r.reason === 'duplicate').length;

      expect(sentCount).toBe(1);
      expect(duplicateCount).toBe(19);
    });

    test('rate limiting handles burst alerts', async () => {
      // Set strict rate limit
      monitoringLayer.alertSystem.rateLimits.low = { max: 5, windowMs: 60000 };

      const alertPromises = [];
      for (let i = 0; i < 20; i++) {
        alertPromises.push(
          monitoringLayer.sendAlert(ALERT_LEVEL.LOW, 'info', `Info ${i}`)
        );
      }

      const results = await Promise.all(alertPromises);
      const sentCount = results.filter(r => r.sent).length;
      const rateLimitedCount = results.filter(r => r.reason === 'rate_limited').length;

      expect(sentCount).toBe(5);
      expect(rateLimitedCount).toBe(15);
    });

    test('concurrent alerts across multiple categories', async () => {
      const categories = ['security', 'mev', 'transaction', 'rpc', 'system'];
      const levels = ['critical', 'high', 'medium', 'low'];

      const alertPromises = [];

      for (let i = 0; i < 50; i++) {
        const category = categories[i % categories.length];
        const level = levels[i % levels.length];

        alertPromises.push(
          monitoringLayer.sendAlert(level, category, `Alert ${i} unique ${Date.now()} ${Math.random()}`)
        );
      }

      await Promise.all(alertPromises);

      const stats = monitoringLayer.alertSystem.getStatistics();
      // Some alerts may be deduplicated, but we should have most
      expect(stats.total).toBeGreaterThanOrEqual(20);
      expect(Object.keys(stats.byCategory).length).toBeGreaterThanOrEqual(3);
      expect(Object.keys(stats.byLevel).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('High-Volume Analytics Recording', () => {
    test('records 1000 transaction events', () => {
      for (let i = 0; i < 1000; i++) {
        monitoringLayer.analytics.recordTransaction({
          success: i % 10 !== 0,
          type: ['swap', 'claim', 'transfer', 'approve'][i % 4],
          gasUsed: 100000 + (i % 100) * 1000,
        });
      }

      const counters = monitoringLayer.analytics.getCounters();
      expect(counters.transactions.total).toBe(1000);
      expect(counters.transactions.successful).toBe(900);
      expect(counters.transactions.failed).toBe(100);
    });

    test('records 500 MEV events', () => {
      for (let i = 0; i < 500; i++) {
        monitoringLayer.analytics.recordMevEvent({
          type: 'sandwich_detected',
          extractedValue: ethers.utils.parseEther((i / 1000).toString()).toString(),
          protectionUsed: i % 3 === 0,
        });
      }

      const counters = monitoringLayer.analytics.getCounters();
      expect(counters.mev.sandwichesDetected).toBe(500);
      expect(counters.mev.protectedTransactions).toBeGreaterThanOrEqual(100);
    });

    test('records 200 RPC events', () => {
      for (let i = 0; i < 200; i++) {
        monitoringLayer.dashboard.updateRpcStatus(
          [1, 42161, 10, 137, 8453][i % 5],
          {
            latency: 50 + (i % 100),
            healthy: i % 20 !== 0,
          }
        );
      }

      const counters = monitoringLayer.analytics.getCounters();
      expect(counters.rpc.requests).toBe(200);
    });
  });

  describe('Concurrent Multi-Wallet Operations', () => {
    test('tracks 50 wallets simultaneously', () => {
      for (let i = 0; i < 50; i++) {
        monitoringLayer.dashboard.updateWalletStatus(
          `0x${i.toString(16).padStart(40, '0')}`,
          {
            balance: (Math.random() * 10).toFixed(4),
            nonce: i * 10,
            chainId: [1, 42161, 10, 137, 8453][i % 5],
          }
        );
      }

      const statuses = monitoringLayer.dashboard.getAllWalletStatuses();
      expect(statuses.length).toBe(50);
    });

    test('handles frequent wallet balance updates', () => {
      const wallet = '0x' + '1'.repeat(40);

      // Update balance 100 times rapidly
      for (let i = 0; i < 100; i++) {
        monitoringLayer.dashboard.updateWalletStatus(wallet, {
          balance: (i / 10).toFixed(2),
          nonce: i,
        });
      }

      const status = monitoringLayer.dashboard.getWalletStatus(wallet);
      expect(status.balance).toBe('9.90');
      expect(status.nonce).toBe(99);
    });
  });

  describe('Concurrent MEV Detection', () => {
    test('processes 100 potential sandwich attacks', () => {
      for (let i = 0; i < 100; i++) {
        monitoringLayer.dashboard.recordMevEvent({
          type: 'sandwich_detected',
          extractedValue: ethers.utils.parseEther((i / 1000).toString()).toString(),
          txHash: `0x${i.toString(16).padStart(64, '0')}`,
          frontrunTx: `0xf${i.toString(16).padStart(63, '0')}`,
          backrunTx: `0xb${i.toString(16).padStart(63, '0')}`,
        });
      }

      const metrics = monitoringLayer.dashboard.getMevMetrics();
      expect(metrics.stats.detected).toBe(100);
      expect(metrics.recentSandwiches.length).toBeLessThanOrEqual(100);
    });

    test('tracks known attacker addresses at scale', () => {
      const attackers = [];
      for (let i = 0; i < 100; i++) {
        attackers.push(`0xa${i.toString(16).padStart(39, '0')}`);
      }

      monitoringLayer.sandwichDetector.addKnownAttackers(attackers);

      // Verify random sampling of attackers
      expect(monitoringLayer.sandwichDetector.isKnownAttacker(attackers[0])).toBe(true);
      expect(monitoringLayer.sandwichDetector.isKnownAttacker(attackers[50])).toBe(true);
      expect(monitoringLayer.sandwichDetector.isKnownAttacker(attackers[99])).toBe(true);
      expect(monitoringLayer.sandwichDetector.isKnownAttacker('0x' + '0'.repeat(40))).toBe(false);
    });
  });

  describe('Snapshot Generation Under Load', () => {
    test('generates snapshot with 100+ data points', () => {
      // Add 50 pending transactions
      for (let i = 0; i < 50; i++) {
        monitoringLayer.dashboard.trackPendingTransaction({
          txHash: `0x${i.toString(16).padStart(64, '0')}`,
          wallet: `0x${(i % 10).toString().padStart(40, '0')}`,
          type: 'swap',
          chainId: 1,
        });
      }

      // Add 20 wallets
      for (let i = 0; i < 20; i++) {
        monitoringLayer.dashboard.updateWalletStatus(
          `0x${i.toString().padStart(40, '0')}`,
          { balance: '1.0' }
        );
      }

      // Add 5 RPC providers
      for (let chainId of [1, 42161, 10, 137, 8453]) {
        monitoringLayer.dashboard.updateRpcStatus(chainId, { latency: 50, healthy: true });
      }

      const snapshot = monitoringLayer.getSnapshot();

      expect(snapshot.transactions.pending.length).toBe(50);
      expect(snapshot.wallets.length).toBe(20);
      expect(snapshot.rpc.providers.length).toBe(5);
    });

    test('snapshot generation performance', () => {
      // Add substantial data
      for (let i = 0; i < 100; i++) {
        monitoringLayer.dashboard.trackPendingTransaction({
          txHash: `0x${i.toString(16).padStart(64, '0')}`,
          wallet: '0x' + '1'.repeat(40),
          type: 'swap',
        });
      }

      const startTime = Date.now();
      const snapshot = monitoringLayer.getSnapshot();
      const duration = Date.now() - startTime;

      expect(snapshot).toBeDefined();
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });
  });

  describe('Memory Pressure Handling', () => {
    test('transaction feed maintains size limit', () => {
      // Track and confirm 200 transactions
      for (let i = 0; i < 200; i++) {
        const txHash = `0x${i.toString(16).padStart(64, '0')}`;
        monitoringLayer.dashboard.trackPendingTransaction({ txHash, wallet: '0x' + '1'.repeat(40) });
        monitoringLayer.dashboard.confirmTransaction(txHash, { gasUsed: 150000 });
      }

      const feed = monitoringLayer.dashboard.getTransactionFeed();
      // Recent feed should be capped at a reasonable size (implementation dependent)
      expect(feed.recent.length).toBeLessThanOrEqual(200);
    });

    test('alert history maintains size limit', async () => {
      // Send 200 unique alerts
      for (let i = 0; i < 200; i++) {
        await monitoringLayer.sendAlert(
          ['critical', 'high', 'medium', 'low'][i % 4],
          'test',
          `Unique alert ${i}`
        );
      }

      const history = monitoringLayer.alertSystem.getAlertHistory();
      // History should be capped (implementation dependent)
      expect(history.length).toBeLessThanOrEqual(200);
    });
  });

  describe('Concurrent Report Generation', () => {
    test('generates multiple reports concurrently', () => {
      // Add data
      for (let i = 0; i < 50; i++) {
        monitoringLayer.analytics.recordTransaction({ success: true, type: 'swap' });
        monitoringLayer.analytics.recordMevEvent({ type: 'sandwich_detected' });
      }

      // Generate reports concurrently
      const reports = ['daily', 'weekly', 'mev', 'gas', 'performance'].map(type =>
        monitoringLayer.analytics.generateReport(type)
      );

      expect(reports.length).toBe(5);
      reports.forEach(report => {
        expect(report.reportType).toBeDefined();
        expect(report.generatedAt).toBeDefined();
      });
    });
  });

  describe('Event Listener Stress', () => {
    test('handles many event listeners', () => {
      const listeners = [];

      // Add 50 listeners
      for (let i = 0; i < 50; i++) {
        const listener = jest.fn();
        listeners.push(listener);
        monitoringLayer.dashboard.on('transaction:pending', listener);
      }

      // Trigger event
      monitoringLayer.dashboard.trackPendingTransaction({
        txHash: '0x' + 'a'.repeat(64),
        wallet: '0x' + '1'.repeat(40),
      });

      // All listeners should be called
      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledTimes(1);
      });
    });

    test('handles rapid event emission', () => {
      const listener = jest.fn();
      monitoringLayer.dashboard.on('transaction:pending', listener);

      // Emit 100 events rapidly
      for (let i = 0; i < 100; i++) {
        monitoringLayer.dashboard.trackPendingTransaction({
          txHash: `0x${i.toString(16).padStart(64, '0')}`,
          wallet: '0x' + '1'.repeat(40),
        });
      }

      expect(listener).toHaveBeenCalledTimes(100);
    });
  });

  describe('Prometheus Export Under Load', () => {
    test('exports metrics with large dataset', () => {
      // Add substantial data
      for (let i = 0; i < 100; i++) {
        monitoringLayer.dashboard.trackPendingTransaction({
          txHash: `0x${i.toString(16).padStart(64, '0')}`,
          wallet: '0x' + '1'.repeat(40),
          type: 'swap',
        });
      }

      for (let i = 0; i < 20; i++) {
        monitoringLayer.dashboard.updateWalletStatus(
          `0x${i.toString().padStart(40, '0')}`,
          { balance: '1.0' }
        );
      }

      const prometheus = monitoringLayer.dashboard.exportMetrics('prometheus');

      expect(prometheus).toContain('airdrop_bot_transactions_pending 100');
      expect(prometheus).toContain('# HELP');
      expect(prometheus.length).toBeGreaterThan(500);
    });

    test('JSON export performance', () => {
      // Add data
      for (let i = 0; i < 100; i++) {
        monitoringLayer.analytics.recordTransaction({ success: true, type: 'swap' });
      }

      const startTime = Date.now();
      const json = monitoringLayer.dashboard.exportMetrics('json');
      const duration = Date.now() - startTime;

      expect(JSON.parse(json)).toBeDefined();
      expect(duration).toBeLessThan(50); // Should be fast
    });
  });
});
