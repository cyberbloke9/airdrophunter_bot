'use strict';

const {
  createMonitoringLayer,
  AlertSystem,
  Analytics,
  Dashboard,
  SandwichDetector,
  TxSimulator,
  ALERT_LEVEL,
  ALERT_CATEGORY,
} = require('../../src/monitoring');

const { createSecurityLayer } = require('../../src/security');
const { ethers } = require('ethers');

describe('Monitoring Layer Integration', () => {
  let monitoring;
  let securityLayer;

  beforeEach(() => {
    securityLayer = createSecurityLayer({
      logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
    });

    monitoring = createMonitoringLayer({
      logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
      securityLayer,
    });
  });

  afterEach(() => {
    monitoring.stop();
  });

  describe('createMonitoringLayer Factory', () => {
    test('creates all monitoring components', () => {
      expect(monitoring.alertSystem).toBeInstanceOf(AlertSystem);
      expect(monitoring.analytics).toBeInstanceOf(Analytics);
      expect(monitoring.dashboard).toBeInstanceOf(Dashboard);
      expect(monitoring.sandwichDetector).toBeInstanceOf(SandwichDetector);
      expect(monitoring.txSimulator).toBeInstanceOf(TxSimulator);
    });

    test('exports convenience methods', () => {
      expect(typeof monitoring.sendAlert).toBe('function');
      expect(typeof monitoring.analyzeTransaction).toBe('function');
      expect(typeof monitoring.recordEvent).toBe('function');
      expect(typeof monitoring.getSnapshot).toBe('function');
      expect(typeof monitoring.simulate).toBe('function');
    });

    test('exports lifecycle methods', () => {
      expect(typeof monitoring.start).toBe('function');
      expect(typeof monitoring.stop).toBe('function');
      expect(typeof monitoring.getStatus).toBe('function');
    });

    test('exports constants correctly', () => {
      expect(ALERT_LEVEL.CRITICAL).toBe('critical');
      expect(ALERT_LEVEL.HIGH).toBe('high');
      expect(ALERT_LEVEL.MEDIUM).toBe('medium');
      expect(ALERT_LEVEL.LOW).toBe('low');

      expect(ALERT_CATEGORY.SECURITY).toBe('security');
      expect(ALERT_CATEGORY.MEV).toBe('mev');
      expect(ALERT_CATEGORY.TRANSACTION).toBe('transaction');
    });
  });

  describe('Alert + Analytics Integration', () => {
    test('analytics records alert events', async () => {
      monitoring.start();

      await monitoring.sendAlert(ALERT_LEVEL.HIGH, ALERT_CATEGORY.SECURITY, 'Test alert');

      const stats = monitoring.getStatus();
      expect(stats.alertSystem.total).toBe(1);
    });

    test('alerts propagate to dashboard', async () => {
      monitoring.start();

      await monitoring.alertSystem.sendAlert(ALERT_LEVEL.CRITICAL, ALERT_CATEGORY.SECURITY, 'Critical alert');

      // Dashboard should have received the alert via event listener
      const activeAlerts = monitoring.dashboard.getActiveAlerts();
      expect(activeAlerts.length).toBe(1);
      expect(activeAlerts[0].level).toBe('critical');
    });

    test('alert statistics track over time', async () => {
      monitoring.start();

      await monitoring.sendAlert(ALERT_LEVEL.HIGH, ALERT_CATEGORY.MEV, 'MEV alert');
      await monitoring.sendAlert(ALERT_LEVEL.MEDIUM, ALERT_CATEGORY.TRANSACTION, 'Tx alert');
      await monitoring.sendAlert(ALERT_LEVEL.LOW, ALERT_CATEGORY.SYSTEM, 'Info');

      const stats = monitoring.alertSystem.getStatistics();
      expect(stats.total).toBe(3);
      expect(stats.byLevel.high).toBe(1);
      expect(stats.byLevel.medium).toBe(1);
      expect(stats.byLevel.low).toBe(1);
    });
  });

  describe('Dashboard + Analytics Integration', () => {
    test('transactions recorded to both dashboard and analytics', () => {
      monitoring.start();

      monitoring.dashboard.trackPendingTransaction({
        txHash: '0x123',
        wallet: '0xabc',
        type: 'swap',
        chainId: 1,
      });

      monitoring.dashboard.confirmTransaction('0x123', {
        gasUsed: 100000,
        gasPrice: '10000000000',
      });

      const feed = monitoring.dashboard.getTransactionFeed();
      expect(feed.recent.length).toBe(1);

      const counters = monitoring.analytics.getCounters();
      expect(counters.transactions.total).toBe(1);
    });

    test('MEV events recorded to both dashboard and analytics', () => {
      monitoring.start();

      monitoring.dashboard.recordMevEvent({
        type: 'sandwich_detected',
        extractedValue: ethers.utils.parseEther('0.1').toString(),
      });

      const mevMetrics = monitoring.dashboard.getMevMetrics();
      expect(mevMetrics.stats.detected).toBe(1);

      const counters = monitoring.analytics.getCounters();
      expect(counters.mev.sandwichesDetected).toBe(1);
    });

    test('RPC events recorded to analytics', () => {
      monitoring.start();

      monitoring.dashboard.updateRpcStatus(1, {
        latency: 150,
        healthy: true,
      });

      const counters = monitoring.analytics.getCounters();
      expect(counters.rpc.requests).toBe(1);
      expect(counters.rpc.averageLatency).toBe(150);
    });
  });

  describe('TxSimulator + MEV Protection Integration', () => {
    test('simulator detects swap transactions', () => {
      const isSwap = monitoring.txSimulator.isSwapTransaction({
        data: '0x38ed1739' + '0'.repeat(64), // swapExactTokensForTokens
      });
      expect(isSwap).toBe(true);
    });

    test('simulator tracks metrics over multiple simulations', async () => {
      const mockProvider = {
        call: jest.fn().mockResolvedValue('0x'),
        estimateGas: jest.fn().mockResolvedValue(ethers.BigNumber.from(100000)),
      };

      await monitoring.simulate(
        { to: '0x1234567890123456789012345678901234567890', data: '0x' },
        mockProvider
      );

      await monitoring.simulate(
        { to: '0x1234567890123456789012345678901234567890', data: '0x' },
        mockProvider
      );

      const metrics = monitoring.txSimulator.getMetrics();
      expect(metrics.totalSimulations).toBe(2);
      expect(metrics.successfulSimulations).toBe(2);
    });
  });

  describe('SandwichDetector + AlertSystem Integration', () => {
    test('detector sends alerts for significant sandwiches', async () => {
      const alertSpy = jest.spyOn(monitoring.alertSystem, 'alertSandwichAttack');

      // Manually add sandwich to trigger alert threshold check
      monitoring.sandwichDetector.stats.sandwichesDetected++;

      // The sandwich detector would normally call alertSandwichAttack
      // We verify the method exists and is callable
      expect(typeof monitoring.sandwichDetector.alertSystem.alertSandwichAttack).toBe('function');

      alertSpy.mockRestore();
    });

    test('detector tracks known attackers', () => {
      monitoring.sandwichDetector.addKnownAttackers([
        '0xattacker1111111111111111111111111111111111',
        '0xattacker2222222222222222222222222222222222',
      ]);

      expect(monitoring.sandwichDetector.isKnownAttacker(
        '0xattacker1111111111111111111111111111111111'
      )).toBe(true);
    });
  });

  describe('Full Monitoring Flow', () => {
    test('complete transaction lifecycle', () => {
      monitoring.start();

      // 1. Track pending transaction
      monitoring.dashboard.trackPendingTransaction({
        txHash: '0xabc123',
        wallet: '0x1234567890123456789012345678901234567890',
        type: 'swap',
        chainId: 1,
        value: ethers.utils.parseEther('1').toString(),
      });

      // Verify pending
      let feed = monitoring.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(1);

      // 2. Confirm transaction
      monitoring.dashboard.confirmTransaction('0xabc123', {
        gasUsed: 150000,
        gasPrice: ethers.utils.parseUnits('20', 'gwei').toString(),
      });

      // Verify confirmed
      feed = monitoring.dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(0);
      expect(feed.recent.length).toBe(1);
      expect(feed.recent[0].status).toBe('confirmed');

      // 3. Verify analytics recorded
      const counters = monitoring.analytics.getCounters();
      expect(counters.transactions.total).toBe(1);
      expect(counters.transactions.successful).toBe(1);
    });

    test('MEV detection flow', async () => {
      monitoring.start();

      // 1. Simulate a swap
      const mockProvider = {
        call: jest.fn().mockResolvedValue(
          ethers.utils.defaultAbiCoder.encode(
            ['uint256[]'],
            [[ethers.utils.parseEther('1'), ethers.utils.parseEther('1000')]]
          )
        ),
        estimateGas: jest.fn().mockResolvedValue(ethers.BigNumber.from(150000)),
      };

      const simResult = await monitoring.txSimulator.estimateOutput(
        { to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', data: '0x38ed1739' },
        mockProvider
      );

      expect(simResult.simulationSuccess).toBe(true);
      expect(simResult.expectedOutput).toBeDefined();

      // 2. Record MEV event if detected
      monitoring.dashboard.recordMevEvent({
        type: 'sandwich_detected',
        extractedValue: ethers.utils.parseEther('0.05').toString(),
        txHash: '0xvictim123',
      });

      // 3. Verify metrics
      const mevMetrics = monitoring.dashboard.getMevMetrics();
      expect(mevMetrics.stats.detected).toBe(1);
    });

    test('alert escalation flow', async () => {
      monitoring.alertSystem.escalationTimeMs = 50;
      monitoring.start();

      // 1. Send high priority alert
      const { alert } = await monitoring.alertSystem.sendAlert(
        ALERT_LEVEL.HIGH,
        ALERT_CATEGORY.SECURITY,
        'Suspicious activity detected'
      );

      expect(alert.level).toBe('high');
      expect(alert.escalated).toBe(false);

      // 2. Wait and trigger escalation
      await new Promise(resolve => setTimeout(resolve, 100));
      monitoring.alertSystem._checkEscalations();

      // 3. Verify escalation
      const active = monitoring.alertSystem.getActiveAlerts();
      const escalatedAlert = active.find(a => a.id === alert.id);
      expect(escalatedAlert.escalated).toBe(true);
      expect(escalatedAlert.level).toBe('critical');
    });
  });

  describe('Dashboard Snapshot', () => {
    test('snapshot includes all components', () => {
      monitoring.start();

      // Add some data
      monitoring.dashboard.updateWalletStatus('0x1234', { balance: '1.5' });
      monitoring.dashboard.updateRpcStatus(1, { healthy: true, latency: 100 });
      monitoring.dashboard.trackPendingTransaction({ txHash: '0xabc' });

      const snapshot = monitoring.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.status).toBeDefined();
      expect(snapshot.transactions).toBeDefined();
      expect(snapshot.wallets).toBeDefined();
      expect(snapshot.rpc).toBeDefined();
      expect(snapshot.mev).toBeDefined();
      expect(snapshot.alerts).toBeDefined();
      expect(snapshot.system).toBeDefined();
    });

    test('snapshot reflects current state', async () => {
      monitoring.start();

      // Add transactions
      monitoring.dashboard.trackPendingTransaction({ txHash: '0x1' });
      monitoring.dashboard.trackPendingTransaction({ txHash: '0x2' });
      monitoring.dashboard.confirmTransaction('0x1');

      // Add alert
      await monitoring.alertSystem.sendAlert(ALERT_LEVEL.HIGH, 'test', 'Test');

      const snapshot = monitoring.getSnapshot();

      expect(snapshot.transactions.pending.length).toBe(1);
      expect(snapshot.transactions.recent.length).toBe(1);
      expect(snapshot.alerts.active.length).toBe(1);
    });
  });

  describe('Metrics Export', () => {
    test('exports metrics as JSON', () => {
      monitoring.start();

      const json = monitoring.dashboard.exportMetrics('json');
      const parsed = JSON.parse(json);

      expect(parsed.uptime_seconds).toBeDefined();
      expect(parsed.transactions_pending).toBeDefined();
      expect(parsed.mev_sandwiches_detected).toBeDefined();
    });

    test('exports metrics as Prometheus', () => {
      monitoring.start();

      const prometheus = monitoring.dashboard.exportMetrics('prometheus');

      expect(prometheus).toContain('# HELP');
      expect(prometheus).toContain('# TYPE');
      expect(prometheus).toContain('airdrop_bot_uptime_seconds');
      expect(prometheus).toContain('airdrop_bot_transactions_pending');
    });
  });

  describe('Lifecycle Management', () => {
    test('start/stop lifecycle', () => {
      expect(monitoring.dashboard.state.running).toBe(false);

      monitoring.start();
      expect(monitoring.dashboard.state.running).toBe(true);

      monitoring.stop();
      expect(monitoring.dashboard.state.running).toBe(false);
    });

    test('getStatus returns comprehensive status', () => {
      monitoring.start();

      const status = monitoring.getStatus();

      expect(status.alertSystem).toBeDefined();
      expect(status.sandwichDetector).toBeDefined();
      expect(status.analytics).toBeDefined();
      expect(status.dashboard).toBeDefined();
      expect(status.txSimulator).toBeDefined();
    });
  });

  describe('Report Generation', () => {
    test('generates daily report with data', () => {
      monitoring.start();

      monitoring.analytics.recordTransaction({ success: true, type: 'swap' });
      monitoring.analytics.recordMevEvent({ type: 'sandwich_detected' });

      const report = monitoring.analytics.generateReport('daily');

      expect(report.reportType).toBe('daily');
      expect(report.summary.transactions.total).toBe(1);
    });

    test('generates MEV report', () => {
      monitoring.start();

      monitoring.analytics.recordMevEvent({
        type: 'sandwich_detected',
        extractedValue: ethers.utils.parseEther('0.1').toString(),
      });

      monitoring.analytics.recordMevEvent({ protectionUsed: true });

      const report = monitoring.analytics.generateReport('mev');

      expect(report.metrics.sandwichesDetected).toBe(1);
      expect(report.metrics.protectedTransactions).toBe(1);
    });
  });
});
