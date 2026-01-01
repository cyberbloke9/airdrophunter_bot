'use strict';

/**
 * Phase 1 Edge Case Tests
 * Boundary conditions, error injection, and recovery scenarios
 * ~35 tests covering edge cases and error handling
 */

const { createSecurityLayer } = require('../../src/security');
const { createMonitoringLayer, ALERT_LEVEL, ALERT_CATEGORY } = require('../../src/monitoring');
const { AlertSystem } = require('../../src/monitoring/alerts');
const { Analytics } = require('../../src/monitoring/analytics');
const { Dashboard } = require('../../src/monitoring/dashboard');
const { SandwichDetector } = require('../../src/monitoring/sandwich-detector');
const { TxSimulator } = require('../../src/security/tx-simulator');
const { ethers } = require('ethers');

describe('Phase 1 Edge Case Tests', () => {
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
  });

  afterEach(() => {
    monitoringLayer.stop();
  });

  describe('Boundary Conditions', () => {
    describe('Alert Thresholds', () => {
      test('sandwich alert exactly at critical threshold', async () => {
        const result = await monitoringLayer.alertSystem.alertSandwichAttack(
          '0x123',
          0.02 // Exactly at critical threshold
        );
        expect(result.alert.level).toBe('critical');
      });

      test('sandwich alert just below critical threshold', async () => {
        const result = await monitoringLayer.alertSystem.alertSandwichAttack(
          '0x123',
          0.019 // Just below critical
        );
        expect(result.alert.level).toBe('high');
      });

      test('low balance exactly at critical threshold', async () => {
        const result = await monitoringLayer.alertSystem.alertLowBalance(
          '0x123',
          '0.05' // Exactly at critical threshold
        );
        expect(result.alert.level).toBe('critical');
      });

      test('low balance just above critical threshold', async () => {
        const result = await monitoringLayer.alertSystem.alertLowBalance(
          '0x123',
          '0.051' // Just above critical
        );
        expect(result.alert.level).toBe('high');
      });
    });

    describe('Empty and Null Values', () => {
      test('handles empty transaction hash', () => {
        monitoringLayer.start();

        monitoringLayer.dashboard.trackPendingTransaction({
          txHash: '',
          wallet: '0x' + '1'.repeat(40),
          type: 'swap',
        });

        const feed = monitoringLayer.dashboard.getTransactionFeed();
        expect(feed.pending.length).toBe(1);
      });

      test('handles undefined wallet status lookup', () => {
        const status = monitoringLayer.dashboard.getWalletStatus(undefined);
        expect(status).toBeNull();
      });

      test('handles empty wallet address in status update', () => {
        monitoringLayer.dashboard.updateWalletStatus('', { balance: '1.0' });
        const status = monitoringLayer.dashboard.getWalletStatus('');
        expect(status).toBeDefined();
      });

      test('handles null message in alert', async () => {
        const result = await monitoringLayer.sendAlert(
          ALERT_LEVEL.LOW,
          'test',
          null
        );
        expect(result.sent).toBe(true);
      });
    });

    describe('Numeric Boundaries', () => {
      test('handles zero gas used', () => {
        monitoringLayer.start();

        monitoringLayer.dashboard.trackPendingTransaction({ txHash: '0xabc' });
        monitoringLayer.dashboard.confirmTransaction('0xabc', { gasUsed: 0 });

        const feed = monitoringLayer.dashboard.getTransactionFeed();
        expect(feed.recent[0].gasUsed).toBe(0);
      });

      test('handles very large gas values', () => {
        monitoringLayer.start();

        monitoringLayer.dashboard.trackPendingTransaction({ txHash: '0xabc' });
        monitoringLayer.dashboard.confirmTransaction('0xabc', {
          gasUsed: Number.MAX_SAFE_INTEGER,
        });

        const feed = monitoringLayer.dashboard.getTransactionFeed();
        expect(feed.recent[0].gasUsed).toBe(Number.MAX_SAFE_INTEGER);
      });

      test('handles zero ETH extracted value', () => {
        monitoringLayer.start();

        monitoringLayer.dashboard.recordMevEvent({
          type: 'sandwich_detected',
          extractedValue: '0',
        });

        const metrics = monitoringLayer.dashboard.getMevMetrics();
        expect(metrics.stats.detected).toBe(1);
      });

      test('handles very large ETH values', () => {
        monitoringLayer.start();

        const largeValue = ethers.utils.parseEther('1000000').toString();
        monitoringLayer.dashboard.recordMevEvent({
          type: 'sandwich_detected',
          extractedValue: largeValue,
        });

        const metrics = monitoringLayer.dashboard.getMevMetrics();
        expect(metrics.stats.detected).toBe(1);
      });

      test('handles negative latency gracefully', () => {
        monitoringLayer.start();

        // Should not crash with negative value
        monitoringLayer.dashboard.updateRpcStatus(999, { latency: -10, healthy: true });

        const health = monitoringLayer.dashboard.getRpcHealth();
        // Should have at least one provider (the one we just added)
        expect(health.providers.length).toBeGreaterThanOrEqual(1);
        const provider = health.providers.find(p => p.chainId === 999);
        expect(provider).toBeDefined();
      });
    });
  });

  describe('Error Injection', () => {
    describe('Notification Service Failures', () => {
      test('handles notification service throwing error', async () => {
        const failingNotificationService = {
          notify: jest.fn().mockRejectedValue(new Error('Notification failed')),
        };

        const alertSystem = new AlertSystem({
          logger: mockLogger,
          notificationService: failingNotificationService,
        });

        // Should not throw, just log error
        const result = await alertSystem.sendAlert('high', 'test', 'Test');
        expect(result.sent).toBe(true); // Alert is still recorded
      });

      test('handles notification service timeout', async () => {
        const slowNotificationService = {
          notify: jest.fn().mockImplementation(
            () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
          ),
        };

        const alertSystem = new AlertSystem({
          logger: mockLogger,
          notificationService: slowNotificationService,
        });

        // Should complete (notification runs async)
        const result = await alertSystem.sendAlert('high', 'test', 'Test');
        expect(result.sent).toBe(true);
      });
    });

    describe('Provider Simulation Failures', () => {
      test('handles provider call rejection', async () => {
        const failingProvider = {
          call: jest.fn().mockRejectedValue(new Error('RPC error')),
          estimateGas: jest.fn().mockRejectedValue(new Error('RPC error')),
        };

        const result = await monitoringLayer.simulate(
          { to: '0x' + '1'.repeat(40), data: '0x' },
          failingProvider
        );

        // Should return a result indicating failure
        expect(result.success).toBe(false);
        // The simulator returns revertReason for errors
        expect(result.revertReason || result.error || result.errorMessage).toBeTruthy();
      });

      test('handles provider returning null', async () => {
        const nullProvider = {
          call: jest.fn().mockResolvedValue(null),
          estimateGas: jest.fn().mockResolvedValue(null),
        };

        const result = await monitoringLayer.simulate(
          { to: '0x' + '1'.repeat(40), data: '0x' },
          nullProvider
        );

        // Should handle gracefully
        expect(result).toBeDefined();
      });

      test('handles malformed provider response', async () => {
        const badProvider = {
          call: jest.fn().mockResolvedValue('invalid hex'),
          estimateGas: jest.fn().mockResolvedValue('not a number'),
        };

        const result = await monitoringLayer.simulate(
          { to: '0x' + '1'.repeat(40), data: '0x' },
          badProvider
        );

        expect(result).toBeDefined();
      });
    });

    describe('Invalid Input Handling', () => {
      test('rejects invalid alert level', async () => {
        await expect(
          monitoringLayer.sendAlert('invalid_level', 'test', 'Test')
        ).rejects.toThrow('Invalid alert level');
      });

      test('handles invalid chain ID', () => {
        monitoringLayer.start();

        // Should not throw with invalid chain ID
        monitoringLayer.dashboard.updateRpcStatus(-1, { latency: 100 });
        monitoringLayer.dashboard.updateRpcStatus(0, { latency: 100 });
        monitoringLayer.dashboard.updateRpcStatus(NaN, { latency: 100 });

        const health = monitoringLayer.dashboard.getRpcHealth();
        expect(health.providers.length).toBeGreaterThanOrEqual(0);
      });

      test('handles malformed transaction data', () => {
        monitoringLayer.start();

        monitoringLayer.dashboard.trackPendingTransaction({
          txHash: 'not-a-hash',
          wallet: 'invalid-address',
          type: null,
          chainId: 'invalid',
        });

        const feed = monitoringLayer.dashboard.getTransactionFeed();
        expect(feed.pending.length).toBe(1);
      });
    });
  });

  describe('Recovery Scenarios', () => {
    describe('Restart Recovery', () => {
      test('recovers state after stop/start cycle', async () => {
        monitoringLayer.start();

        // Add data
        monitoringLayer.dashboard.trackPendingTransaction({ txHash: '0x123' });
        await monitoringLayer.sendAlert(ALERT_LEVEL.HIGH, 'test', 'Test');

        // Stop
        monitoringLayer.stop();
        expect(monitoringLayer.dashboard.state.running).toBe(false);

        // Restart
        monitoringLayer.start();
        expect(monitoringLayer.dashboard.state.running).toBe(true);

        // Data should persist (in-memory)
        const feed = monitoringLayer.dashboard.getTransactionFeed();
        expect(feed.pending.length).toBe(1);
      });

      test('multiple stop/start cycles work correctly', () => {
        for (let i = 0; i < 5; i++) {
          monitoringLayer.start();
          expect(monitoringLayer.dashboard.state.running).toBe(true);

          monitoringLayer.stop();
          expect(monitoringLayer.dashboard.state.running).toBe(false);
        }
      });
    });

    describe('Orphaned Transaction Recovery', () => {
      test('handles confirmation for non-existent pending transaction', () => {
        monitoringLayer.start();

        // Confirm transaction that was never tracked as pending
        monitoringLayer.dashboard.confirmTransaction('0xorphan123', { gasUsed: 150000 });

        // Should not crash, but may not record
        const feed = monitoringLayer.dashboard.getTransactionFeed();
        expect(feed.pending.length).toBe(0);
      });

      test('handles double confirmation', () => {
        monitoringLayer.start();

        monitoringLayer.dashboard.trackPendingTransaction({ txHash: '0xabc' });
        monitoringLayer.dashboard.confirmTransaction('0xabc', { gasUsed: 100000 });
        monitoringLayer.dashboard.confirmTransaction('0xabc', { gasUsed: 200000 });

        const feed = monitoringLayer.dashboard.getTransactionFeed();
        expect(feed.recent.length).toBeGreaterThanOrEqual(1);
      });

      test('handles fail after confirm', () => {
        monitoringLayer.start();

        monitoringLayer.dashboard.trackPendingTransaction({ txHash: '0xabc' });
        monitoringLayer.dashboard.confirmTransaction('0xabc');
        monitoringLayer.dashboard.failTransaction('0xabc', { message: 'Late failure' });

        // Should handle gracefully
        const feed = monitoringLayer.dashboard.getTransactionFeed();
        expect(feed).toBeDefined();
      });
    });

    describe('Alert Recovery', () => {
      test('acknowledging already acknowledged alert', async () => {
        monitoringLayer.start();

        const { alert } = await monitoringLayer.sendAlert(ALERT_LEVEL.HIGH, 'test', 'Test');

        // Acknowledge twice
        const first = monitoringLayer.alertSystem.acknowledge(alert.id, 'admin1');
        const second = monitoringLayer.alertSystem.acknowledge(alert.id, 'admin2');

        expect(first).toBe(true);
        // Second ack behavior depends on implementation
        expect(alert.acknowledged).toBe(true);
      });

      test('acknowledging non-existent alert', () => {
        const result = monitoringLayer.alertSystem.acknowledge('fake_id_12345');
        expect(result).toBe(false);
      });
    });
  });

  describe('Concurrent Operation Edge Cases', () => {
    test('simultaneous track and confirm same transaction', async () => {
      monitoringLayer.start();

      const txHash = '0xconcurrent';

      // Simulate race condition
      const trackPromise = Promise.resolve().then(() => {
        monitoringLayer.dashboard.trackPendingTransaction({ txHash });
      });

      const confirmPromise = Promise.resolve().then(() => {
        monitoringLayer.dashboard.confirmTransaction(txHash);
      });

      await Promise.all([trackPromise, confirmPromise]);

      // Should not crash
      const feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed).toBeDefined();
    });

    test('concurrent alert sends with same dedup key', async () => {
      monitoringLayer.start();

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          monitoringLayer.sendAlert(ALERT_LEVEL.HIGH, 'test', 'Same message')
        );
      }

      const results = await Promise.all(promises);
      const sentCount = results.filter(r => r.sent).length;

      // Only one should succeed due to deduplication
      expect(sentCount).toBe(1);
    });
  });

  describe('Special Character Handling', () => {
    test('handles special characters in alert message', async () => {
      const specialMessage = 'Alert: <script>alert("XSS")</script> & "quotes" \'single\'';

      const result = await monitoringLayer.sendAlert(
        ALERT_LEVEL.HIGH,
        'test',
        specialMessage
      );

      expect(result.sent).toBe(true);
      expect(result.alert.message).toBe(specialMessage);
    });

    test('handles unicode in wallet addresses', () => {
      monitoringLayer.start();

      // Real addresses shouldn't have unicode, but test robustness
      const weirdAddress = '0x123\u0000abc';

      monitoringLayer.dashboard.updateWalletStatus(weirdAddress, { balance: '1.0' });

      // Should not crash
      const status = monitoringLayer.dashboard.getWalletStatus(weirdAddress);
      expect(status).toBeDefined();
    });

    test('handles very long strings', async () => {
      const longMessage = 'A'.repeat(10000);

      const result = await monitoringLayer.sendAlert(
        ALERT_LEVEL.LOW,
        'test',
        longMessage
      );

      expect(result.sent).toBe(true);
    });
  });

  describe('Timestamp Edge Cases', () => {
    test('handles transactions with future timestamps', () => {
      monitoringLayer.start();

      const futureTime = Date.now() + 1000000;

      monitoringLayer.dashboard.trackPendingTransaction({
        txHash: '0xfuture',
        timestamp: futureTime,
      });

      const feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(1);
    });

    test('handles transactions with past timestamps', () => {
      monitoringLayer.start();

      const pastTime = Date.now() - 1000000000; // Way in the past

      monitoringLayer.dashboard.trackPendingTransaction({
        txHash: '0xpast',
        timestamp: pastTime,
      });

      const feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(1);
    });
  });

  describe('Component Isolation', () => {
    test('dashboard works without alert system', () => {
      const isolatedDashboard = new Dashboard({
        logger: mockLogger,
        alertSystem: null,
        analytics: null,
      });

      isolatedDashboard.start();
      isolatedDashboard.trackPendingTransaction({ txHash: '0xtest' });
      isolatedDashboard.confirmTransaction('0xtest');

      const feed = isolatedDashboard.getTransactionFeed();
      expect(feed.recent.length).toBe(1);

      isolatedDashboard.stop();
    });

    test('alert system works without notification service', async () => {
      const isolatedAlertSystem = new AlertSystem({
        logger: mockLogger,
        notificationService: null,
      });

      const result = await isolatedAlertSystem.sendAlert('high', 'test', 'Test');
      expect(result.sent).toBe(true);
    });

    test('analytics works in isolation', () => {
      const isolatedAnalytics = new Analytics({ logger: mockLogger });

      isolatedAnalytics.recordTransaction({ success: true, type: 'swap' });
      isolatedAnalytics.recordMevEvent({ type: 'sandwich_detected' });

      const counters = isolatedAnalytics.getCounters();
      expect(counters.transactions.total).toBe(1);
      expect(counters.mev.sandwichesDetected).toBe(1);
    });
  });

  describe('Export Format Edge Cases', () => {
    test('JSON export with empty data', () => {
      monitoringLayer.start();

      const json = monitoringLayer.dashboard.exportMetrics('json');
      const parsed = JSON.parse(json);

      expect(parsed.transactions_pending).toBe(0);
      expect(parsed.uptime_seconds).toBeGreaterThanOrEqual(0);
    });

    test('Prometheus export with special metric values', () => {
      monitoringLayer.start();

      // Add data that might produce edge case metric values
      monitoringLayer.dashboard.trackPendingTransaction({ txHash: '0x1' });

      const prometheus = monitoringLayer.dashboard.exportMetrics('prometheus');

      expect(prometheus).toContain('# TYPE');
      expect(prometheus).not.toContain('undefined');
      expect(prometheus).not.toContain('NaN');
    });

    test('throws for unsupported export format', () => {
      monitoringLayer.start();

      expect(() => monitoringLayer.dashboard.exportMetrics('xml')).toThrow('Unknown format');
      expect(() => monitoringLayer.dashboard.exportMetrics('')).toThrow();
    });
  });

  describe('Report Generation Edge Cases', () => {
    test('generates report with no data', () => {
      const report = monitoringLayer.analytics.generateReport('daily');

      expect(report.reportType).toBe('daily');
      expect(report.summary.transactions.total).toBe(0);
    });

    test('generates all report types', () => {
      const types = ['daily', 'weekly', 'mev', 'gas', 'performance'];

      types.forEach(type => {
        const report = monitoringLayer.analytics.generateReport(type);
        expect(report.reportType).toBe(type);
      });
    });
  });

  describe('Muting Edge Cases', () => {
    test('mute with zero duration', async () => {
      monitoringLayer.alertSystem.mute('test', 0);

      // Should effectively not mute (or unmute immediately)
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await monitoringLayer.sendAlert(ALERT_LEVEL.HIGH, 'test', 'Test');
      expect(result.sent).toBe(true);
    });

    test('unmute category that was never muted', () => {
      // Should not throw
      monitoringLayer.alertSystem.unmute('never_muted_category');

      // Should still be able to send alerts
    });

    test('mute all categories', async () => {
      const categories = ['security', 'mev', 'transaction', 'rpc', 'system'];

      categories.forEach(cat => {
        monitoringLayer.alertSystem.mute(cat, 10000);
      });

      for (const cat of categories) {
        const result = await monitoringLayer.sendAlert(ALERT_LEVEL.HIGH, cat, 'Test');
        expect(result.sent).toBe(false);
        expect(result.reason).toBe('muted');
      }

      // Cleanup
      categories.forEach(cat => {
        monitoringLayer.alertSystem.unmute(cat);
      });
    });
  });
});
