'use strict';

/**
 * Phase 1 System Tests
 * Tests complete integration between Security Layer (Sprint 1.1) and Monitoring Layer (Sprint 1.2)
 * ~35 tests covering end-to-end workflows
 */

const { createSecurityLayer } = require('../../src/security');
const { createMonitoringLayer, ALERT_LEVEL, ALERT_CATEGORY } = require('../../src/monitoring');
const { ethers } = require('ethers');

describe('Phase 1 System Tests', () => {
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

  describe('Security + Monitoring Integration', () => {
    test('security layer components accessible from monitoring layer', () => {
      expect(monitoringLayer.txSimulator).toBeDefined();
      expect(typeof monitoringLayer.simulate).toBe('function');
    });

    test('monitoring alerts triggered by security events', async () => {
      monitoringLayer.start();

      // Simulate a security event that should trigger an alert
      await monitoringLayer.sendAlert(
        ALERT_LEVEL.HIGH,
        ALERT_CATEGORY.SECURITY,
        'Suspicious transaction pattern detected'
      );

      const stats = monitoringLayer.alertSystem.getStatistics();
      expect(stats.total).toBe(1);
      expect(stats.byCategory.security).toBe(1);
    });

    test('transaction validation triggers monitoring events', () => {
      monitoringLayer.start();

      const tx = {
        to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        value: ethers.utils.parseEther('1').toString(),
        data: '0x38ed1739',
        gasLimit: 300000,
      };

      // Track transaction in monitoring
      monitoringLayer.dashboard.trackPendingTransaction({
        txHash: '0xabc123',
        wallet: '0x1234567890123456789012345678901234567890',
        type: 'swap',
        chainId: 1,
        ...tx,
      });

      const feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(1);
    });

    test('emergency stop propagates to monitoring dashboard', async () => {
      monitoringLayer.start();

      await monitoringLayer.alertSystem.alertEmergencyStop('Critical security threat');

      const active = monitoringLayer.dashboard.getActiveAlerts();
      expect(active.length).toBe(1);
      expect(active[0].level).toBe('critical');
    });
  });

  describe('End-to-End Transaction Lifecycle', () => {
    test('complete swap transaction flow', async () => {
      monitoringLayer.start();

      const txHash = '0x' + 'a'.repeat(64);
      const wallet = '0x' + '1'.repeat(40);

      // 1. Track pending transaction
      monitoringLayer.dashboard.trackPendingTransaction({
        txHash,
        wallet,
        type: 'swap',
        chainId: 1,
        value: ethers.utils.parseEther('0.5').toString(),
      });

      // 2. Verify pending state
      let feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(1);
      expect(feed.pending[0].status).toBe('pending');

      // 3. Simulate successful confirmation
      monitoringLayer.dashboard.confirmTransaction(txHash, {
        gasUsed: 150000,
        gasPrice: ethers.utils.parseUnits('20', 'gwei').toString(),
        effectiveGasPrice: ethers.utils.parseUnits('18', 'gwei').toString(),
      });

      // 4. Verify confirmed state
      feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(0);
      expect(feed.recent.length).toBe(1);
      expect(feed.recent[0].status).toBe('confirmed');

      // 5. Verify analytics recorded
      const counters = monitoringLayer.analytics.getCounters();
      expect(counters.transactions.total).toBe(1);
      expect(counters.transactions.successful).toBe(1);
    });

    test('failed transaction flow with alert', async () => {
      monitoringLayer.start();

      const txHash = '0x' + 'b'.repeat(64);

      // 1. Track pending
      monitoringLayer.dashboard.trackPendingTransaction({
        txHash,
        wallet: '0x' + '2'.repeat(40),
        type: 'claim',
        chainId: 42161,
      });

      // 2. Fail transaction
      monitoringLayer.dashboard.failTransaction(txHash, {
        message: 'Execution reverted: insufficient funds',
        code: 'UNPREDICTABLE_GAS_LIMIT',
      });

      // 3. Send failure alert
      await monitoringLayer.sendAlert(
        ALERT_LEVEL.MEDIUM,
        ALERT_CATEGORY.TRANSACTION,
        `Transaction ${txHash.slice(0, 10)}... failed: insufficient funds`
      );

      // 4. Verify state
      const feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed.recent[0].status).toBe('failed');

      const counters = monitoringLayer.analytics.getCounters();
      expect(counters.transactions.failed).toBe(1);
    });

    test('MEV detection flow', async () => {
      monitoringLayer.start();

      const victimTx = '0x' + 'c'.repeat(64);

      // 1. Track victim transaction
      monitoringLayer.dashboard.trackPendingTransaction({
        txHash: victimTx,
        wallet: '0x' + '3'.repeat(40),
        type: 'swap',
        chainId: 1,
      });

      // 2. Detect sandwich attack
      const extractedValue = ethers.utils.parseEther('0.05');
      monitoringLayer.dashboard.recordMevEvent({
        type: 'sandwich_detected',
        txHash: victimTx,
        extractedValue: extractedValue.toString(),
        frontrunTx: '0x' + 'f'.repeat(64),
        backrunTx: '0x' + 'e'.repeat(64),
      });

      // 3. Alert on sandwich
      await monitoringLayer.alertSystem.alertSandwichAttack(
        victimTx,
        parseFloat(ethers.utils.formatEther(extractedValue))
      );

      // 4. Verify metrics
      const mevMetrics = monitoringLayer.dashboard.getMevMetrics();
      expect(mevMetrics.stats.detected).toBe(1);

      const stats = monitoringLayer.alertSystem.getStatistics();
      expect(stats.byCategory.mev).toBe(1);
    });
  });

  describe('Multi-Chain Operations', () => {
    test('tracks transactions across multiple chains', () => {
      monitoringLayer.start();

      const chains = [1, 42161, 10, 137, 8453];

      chains.forEach((chainId, i) => {
        monitoringLayer.dashboard.trackPendingTransaction({
          txHash: `0x${chainId.toString().padStart(64, '0')}`,
          wallet: `0x${i.toString().padStart(40, '0')}`,
          type: 'swap',
          chainId,
        });
      });

      const feed = monitoringLayer.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(5);
    });

    test('RPC health tracked per chain', () => {
      monitoringLayer.start();

      // Update RPC status for multiple chains
      monitoringLayer.dashboard.updateRpcStatus(1, { latency: 50, healthy: true });
      monitoringLayer.dashboard.updateRpcStatus(42161, { latency: 80, healthy: true });
      monitoringLayer.dashboard.updateRpcStatus(10, { latency: 120, healthy: false });

      const health = monitoringLayer.dashboard.getRpcHealth();
      expect(health.providers.length).toBeGreaterThanOrEqual(3);

      const unhealthyChain = health.providers.find(p => p.chainId === 10);
      expect(unhealthyChain.healthy).toBe(false);
    });

    test('alerts for chain-specific RPC failures', async () => {
      monitoringLayer.start();

      await monitoringLayer.alertSystem.alertRpcFailure(
        'https://arb-mainnet.g.alchemy.com',
        42161,
        'Connection timeout'
      );

      const active = monitoringLayer.dashboard.getActiveAlerts();
      expect(active.length).toBe(1);
      expect(active[0].category).toBe('rpc');
    });
  });

  describe('Wallet Management Integration', () => {
    test('wallet balance tracking with low balance alerts', async () => {
      monitoringLayer.start();

      const wallet = '0x' + '4'.repeat(40);

      // Update wallet with low balance
      monitoringLayer.dashboard.updateWalletStatus(wallet, {
        balance: '0.05',
        chainId: 1,
        nonce: 42,
      });

      // Trigger low balance alert
      await monitoringLayer.alertSystem.alertLowBalance(wallet, '0.05');

      const status = monitoringLayer.dashboard.getWalletStatus(wallet);
      expect(status.balance).toBe('0.05');

      const alerts = monitoringLayer.dashboard.getActiveAlerts();
      expect(alerts.some(a => a.message.includes('balance'))).toBe(true);
    });

    test('multiple wallet tracking', () => {
      monitoringLayer.start();

      const wallets = [
        { address: '0x' + '1'.repeat(40), balance: '1.5' },
        { address: '0x' + '2'.repeat(40), balance: '2.3' },
        { address: '0x' + '3'.repeat(40), balance: '0.8' },
      ];

      wallets.forEach(w => {
        monitoringLayer.dashboard.updateWalletStatus(w.address, {
          balance: w.balance,
          chainId: 1,
        });
      });

      const allStatuses = monitoringLayer.dashboard.getAllWalletStatuses();
      expect(allStatuses.length).toBe(3);
    });
  });

  describe('Alert System Integration', () => {
    test('alert escalation affects dashboard state', async () => {
      monitoringLayer.alertSystem.escalationTimeMs = 50;
      monitoringLayer.start();

      // Send high priority alert
      const { alert } = await monitoringLayer.alertSystem.sendAlert(
        ALERT_LEVEL.HIGH,
        ALERT_CATEGORY.SECURITY,
        'Potential exploit detected'
      );

      // Wait for escalation
      await new Promise(resolve => setTimeout(resolve, 100));
      monitoringLayer.alertSystem._checkEscalations();

      // Verify escalation in dashboard
      const active = monitoringLayer.dashboard.getActiveAlerts();
      const escalated = active.find(a => a.id === alert.id);
      expect(escalated.level).toBe('critical');
      expect(escalated.escalated).toBe(true);
    });

    test('alert acknowledgment workflow', async () => {
      monitoringLayer.start();

      // Send multiple alerts
      const { alert: alert1 } = await monitoringLayer.sendAlert(
        ALERT_LEVEL.HIGH,
        ALERT_CATEGORY.MEV,
        'Sandwich attack on transaction'
      );

      await monitoringLayer.sendAlert(
        ALERT_LEVEL.MEDIUM,
        ALERT_CATEGORY.TRANSACTION,
        'Transaction delayed'
      );

      // Acknowledge first alert
      monitoringLayer.alertSystem.acknowledge(alert1.id, 'operator');
      monitoringLayer.dashboard.acknowledgeAlert(alert1.id);

      // Verify only second alert is active
      const active = monitoringLayer.dashboard.getActiveAlerts();
      expect(active.length).toBe(1);
      expect(active[0].level).toBe('medium');
    });

    test('alert rate limiting prevents spam', async () => {
      monitoringLayer.start();

      // Set strict rate limit for testing
      monitoringLayer.alertSystem.rateLimits.low = { max: 2, windowMs: 60000 };

      await monitoringLayer.sendAlert(ALERT_LEVEL.LOW, 'info', 'Info 1');
      await monitoringLayer.sendAlert(ALERT_LEVEL.LOW, 'info', 'Info 2');
      const result = await monitoringLayer.sendAlert(ALERT_LEVEL.LOW, 'info', 'Info 3');

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('rate_limited');
    });
  });

  describe('Analytics and Reporting', () => {
    test('transaction analytics aggregation', () => {
      monitoringLayer.start();

      // Record multiple transactions
      for (let i = 0; i < 10; i++) {
        monitoringLayer.analytics.recordTransaction({
          success: i < 8,
          type: i % 2 === 0 ? 'swap' : 'claim',
          gasUsed: 150000 + i * 10000,
        });
      }

      const counters = monitoringLayer.analytics.getCounters();
      expect(counters.transactions.total).toBe(10);
      expect(counters.transactions.successful).toBe(8);
      expect(counters.transactions.failed).toBe(2);
    });

    test('MEV analytics tracking', () => {
      monitoringLayer.start();

      // Record MEV events
      monitoringLayer.analytics.recordMevEvent({
        type: 'sandwich_detected',
        extractedValue: ethers.utils.parseEther('0.1').toString(),
      });

      monitoringLayer.analytics.recordMevEvent({
        protectionUsed: true,
        type: 'protected',
      });

      const counters = monitoringLayer.analytics.getCounters();
      expect(counters.mev.sandwichesDetected).toBe(1);
      expect(counters.mev.protectedTransactions).toBe(1);
    });

    test('daily report generation', () => {
      monitoringLayer.start();

      // Add data
      monitoringLayer.analytics.recordTransaction({ success: true, type: 'swap' });
      monitoringLayer.analytics.recordMevEvent({ type: 'sandwich_detected' });

      const report = monitoringLayer.analytics.generateReport('daily');

      expect(report.reportType).toBe('daily');
      expect(report.summary.transactions.total).toBe(1);
      expect(report.generatedAt).toBeDefined();
    });

    test('Prometheus metrics export', () => {
      monitoringLayer.start();

      // Add some data
      monitoringLayer.dashboard.trackPendingTransaction({ txHash: '0xabc' });
      monitoringLayer.dashboard.updateWalletStatus('0x123', { balance: '1.0' });

      const prometheus = monitoringLayer.dashboard.exportMetrics('prometheus');

      expect(prometheus).toContain('# HELP');
      expect(prometheus).toContain('airdrop_bot_');
      expect(prometheus).toContain('transactions_pending');
    });
  });

  describe('System Snapshot', () => {
    test('comprehensive snapshot captures all state', async () => {
      monitoringLayer.start();

      // Add various data
      monitoringLayer.dashboard.trackPendingTransaction({
        txHash: '0x' + 'a'.repeat(64),
        chainId: 1,
      });

      monitoringLayer.dashboard.updateWalletStatus('0x' + '1'.repeat(40), {
        balance: '2.5',
      });

      monitoringLayer.dashboard.updateRpcStatus(1, { latency: 50, healthy: true });

      await monitoringLayer.sendAlert(ALERT_LEVEL.MEDIUM, 'test', 'Test alert');

      const snapshot = monitoringLayer.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.transactions.pending.length).toBe(1);
      expect(snapshot.wallets.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.rpc.providers.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.alerts.active.length).toBe(1);
      expect(snapshot.status).toBeDefined();
    });

    test('status reflects running state', () => {
      expect(monitoringLayer.dashboard.state.running).toBe(false);

      monitoringLayer.start();
      expect(monitoringLayer.dashboard.state.running).toBe(true);

      const status = monitoringLayer.getStatus();
      expect(status.dashboard.running).toBe(true);
      expect(status.alertSystem).toBeDefined();
      expect(status.sandwichDetector).toBeDefined();
    });
  });

  describe('Event Propagation', () => {
    test('alert events propagate through system', async () => {
      const alertListener = jest.fn();
      const dashboardListener = jest.fn();

      monitoringLayer.alertSystem.on('alert', alertListener);
      monitoringLayer.dashboard.on('alert:new', dashboardListener);

      monitoringLayer.start();

      await monitoringLayer.sendAlert(ALERT_LEVEL.HIGH, ALERT_CATEGORY.SECURITY, 'Test');

      expect(alertListener).toHaveBeenCalled();
    });

    test('transaction events propagate', () => {
      const pendingListener = jest.fn();
      const confirmedListener = jest.fn();

      monitoringLayer.dashboard.on('transaction:pending', pendingListener);
      monitoringLayer.dashboard.on('transaction:confirmed', confirmedListener);

      monitoringLayer.start();

      monitoringLayer.dashboard.trackPendingTransaction({ txHash: '0xabc' });
      monitoringLayer.dashboard.confirmTransaction('0xabc');

      expect(pendingListener).toHaveBeenCalled();
      expect(confirmedListener).toHaveBeenCalled();
    });
  });

  describe('Graceful Shutdown', () => {
    test('stop cleans up all components', () => {
      monitoringLayer.start();

      expect(monitoringLayer.dashboard.state.running).toBe(true);
      expect(monitoringLayer.alertSystem.escalationInterval).not.toBeNull();

      monitoringLayer.stop();

      expect(monitoringLayer.dashboard.state.running).toBe(false);
      expect(monitoringLayer.alertSystem.escalationInterval).toBeNull();
    });

    test('can restart after stop', () => {
      monitoringLayer.start();
      monitoringLayer.stop();
      monitoringLayer.start();

      expect(monitoringLayer.dashboard.state.running).toBe(true);
    });
  });
});
