'use strict';

const { Dashboard } = require('../../src/monitoring/dashboard');
const { ethers } = require('ethers');

describe('Dashboard', () => {
  let dashboard;
  let mockAlertSystem;
  let mockAnalytics;

  beforeEach(() => {
    mockAlertSystem = {
      on: jest.fn(),
      getStatistics: jest.fn().mockReturnValue({}),
      acknowledge: jest.fn(),
    };

    mockAnalytics = {
      recordTransaction: jest.fn(),
      recordMevEvent: jest.fn(),
      recordRpcEvent: jest.fn(),
      getCounters: jest.fn().mockReturnValue({}),
    };

    dashboard = new Dashboard({
      logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      alertSystem: mockAlertSystem,
      analytics: mockAnalytics,
      refreshIntervalMs: 100, // Short for testing
    });
  });

  afterEach(() => {
    dashboard.stop();
  });

  describe('constructor', () => {
    test('initializes with default config', () => {
      const d = new Dashboard();
      expect(d.refreshIntervalMs).toBe(30000);
      expect(d.state.running).toBe(false);
    });

    test('initializes data structures', () => {
      expect(dashboard.data.transactions.pending).toBeInstanceOf(Map);
      expect(dashboard.data.wallets).toBeInstanceOf(Map);
      expect(dashboard.data.alerts.active).toEqual([]);
    });
  });

  describe('start/stop', () => {
    test('starts the dashboard', () => {
      dashboard.start();

      expect(dashboard.state.running).toBe(true);
      expect(dashboard.state.startedAt).toBeDefined();
      expect(dashboard.refreshInterval).not.toBeNull();
    });

    test('stops the dashboard', () => {
      dashboard.start();
      dashboard.stop();

      expect(dashboard.state.running).toBe(false);
      expect(dashboard.refreshInterval).toBeNull();
    });

    test('emits started event', () => {
      const listener = jest.fn();
      dashboard.on('started', listener);

      dashboard.start();

      expect(listener).toHaveBeenCalled();
    });

    test('emits stopped event', () => {
      const listener = jest.fn();
      dashboard.on('stopped', listener);

      dashboard.start();
      dashboard.stop();

      expect(listener).toHaveBeenCalled();
    });

    test('warns if already running', () => {
      dashboard.start();
      dashboard.start();

      expect(dashboard.logger.warn).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    test('returns dashboard status', async () => {
      dashboard.start();

      // Small delay to ensure uptime > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      const status = dashboard.getStatus();

      expect(status.running).toBe(true);
      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.components).toBeDefined();
      expect(status.data).toBeDefined();
    });

    test('shows component availability', () => {
      const status = dashboard.getStatus();

      expect(status.components.alertSystem).toBe(true);
      expect(status.components.analytics).toBe(true);
    });
  });

  describe('subscribe', () => {
    test('subscribes to events', () => {
      const callback = jest.fn();
      const unsubscribe = dashboard.subscribe('test_event', callback);

      dashboard._notify('test_event', { data: 'test' });

      expect(callback).toHaveBeenCalledWith({ data: 'test' });
      expect(typeof unsubscribe).toBe('function');
    });

    test('unsubscribes from events', () => {
      const callback = jest.fn();
      const unsubscribe = dashboard.subscribe('test_event', callback);

      unsubscribe();
      dashboard._notify('test_event', {});

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('exportMetrics', () => {
    test('exports as JSON', () => {
      dashboard.start();

      const json = dashboard.exportMetrics('json');
      const parsed = JSON.parse(json);

      expect(parsed.uptime_seconds).toBeDefined();
      expect(parsed.transactions_pending).toBe(0);
    });

    test('exports as Prometheus format', () => {
      dashboard.start();

      const prometheus = dashboard.exportMetrics('prometheus');

      expect(prometheus).toContain('# HELP');
      expect(prometheus).toContain('airdrop_bot_uptime_seconds');
      expect(prometheus).toContain('airdrop_bot_transactions_pending');
    });

    test('throws for unknown format', () => {
      expect(() => dashboard.exportMetrics('xml')).toThrow('Unknown format');
    });
  });

  describe('transaction tracking', () => {
    test('tracks pending transaction', () => {
      dashboard.trackPendingTransaction({
        txHash: '0xabc',
        wallet: '0x123',
        type: 'swap',
        chainId: 1,
      });

      const feed = dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(1);
      expect(feed.pending[0].txHash).toBe('0xabc');
    });

    test('confirms transaction', () => {
      dashboard.trackPendingTransaction({
        txHash: '0xabc',
        wallet: '0x123',
        type: 'swap',
      });

      dashboard.confirmTransaction('0xabc', { gasUsed: 100000 });

      const feed = dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(0);
      expect(feed.recent.length).toBe(1);
      expect(feed.recent[0].status).toBe('confirmed');
    });

    test('fails transaction', () => {
      dashboard.trackPendingTransaction({
        txHash: '0xabc',
        wallet: '0x123',
        type: 'swap',
      });

      dashboard.failTransaction('0xabc', { message: 'Reverted' });

      const feed = dashboard.getTransactionFeed();
      expect(feed.pending.length).toBe(0);
      expect(feed.recent[0].status).toBe('failed');
      expect(feed.recent[0].error).toBe('Reverted');
    });

    test('emits transaction events', () => {
      const pendingListener = jest.fn();
      const confirmedListener = jest.fn();

      dashboard.on('transaction:pending', pendingListener);
      dashboard.on('transaction:confirmed', confirmedListener);

      dashboard.trackPendingTransaction({ txHash: '0xabc' });
      dashboard.confirmTransaction('0xabc');

      expect(pendingListener).toHaveBeenCalled();
      expect(confirmedListener).toHaveBeenCalled();
    });

    test('records to analytics', () => {
      dashboard.trackPendingTransaction({ txHash: '0xabc' });
      dashboard.confirmTransaction('0xabc');

      expect(mockAnalytics.recordTransaction).toHaveBeenCalled();
    });
  });

  describe('wallet tracking', () => {
    test('updates wallet status', () => {
      dashboard.updateWalletStatus('0x123', {
        balance: '1.5',
        nonce: 10,
      });

      const status = dashboard.getWalletStatus('0x123');
      expect(status.balance).toBe('1.5');
      expect(status.nonce).toBe(10);
    });

    test('merges wallet updates', () => {
      dashboard.updateWalletStatus('0x123', { balance: '1.5' });
      dashboard.updateWalletStatus('0x123', { nonce: 10 });

      const status = dashboard.getWalletStatus('0x123');
      expect(status.balance).toBe('1.5');
      expect(status.nonce).toBe(10);
    });

    test('returns null for unknown wallet', () => {
      const status = dashboard.getWalletStatus('0xunknown');
      expect(status).toBeNull();
    });

    test('gets all wallet statuses', () => {
      dashboard.updateWalletStatus('0x111', { balance: '1' });
      dashboard.updateWalletStatus('0x222', { balance: '2' });

      const statuses = dashboard.getAllWalletStatuses();
      expect(statuses.length).toBe(2);
    });
  });

  describe('RPC tracking', () => {
    test('updates RPC status', () => {
      dashboard.updateRpcStatus(1, {
        latency: 100,
        healthy: true,
      });

      const health = dashboard.getRpcHealth();
      expect(health.providers.length).toBe(1);
      expect(health.providers[0].chainId).toBe(1);
    });

    test('tracks failovers', () => {
      dashboard.updateRpcStatus(1, {
        failover: true,
        failoverFrom: 'rpc1',
        failoverTo: 'rpc2',
      });

      const health = dashboard.getRpcHealth();
      expect(health.lastFailover).toBeDefined();
      expect(health.lastFailover.chainId).toBe(1);
    });

    test('records RPC events to analytics', () => {
      dashboard.updateRpcStatus(1, { latency: 100 });

      expect(mockAnalytics.recordRpcEvent).toHaveBeenCalled();
    });
  });

  describe('oracle tracking', () => {
    test('updates oracle price', () => {
      dashboard.updateOraclePrice('ETH/USD', { price: 3000, staleness: 60 });

      const status = dashboard.getOracleStatus();
      expect(status.prices.length).toBe(1);
      expect(status.prices[0].price).toBe(3000);
    });

    test('updates sequencer status', () => {
      dashboard.updateSequencerStatus(42161, { isUp: true, upSince: Date.now() });

      const status = dashboard.getOracleStatus();
      expect(status.l2Sequencers.length).toBe(1);
    });
  });

  describe('MEV tracking', () => {
    test('records sandwich event', () => {
      dashboard.recordMevEvent({
        type: 'sandwich_detected',
        extractedValue: ethers.utils.parseEther('0.1').toString(),
      });

      const metrics = dashboard.getMevMetrics();
      expect(metrics.stats.detected).toBe(1);
      expect(metrics.recentSandwiches.length).toBe(1);
    });

    test('tracks protected transactions', () => {
      dashboard.recordMevEvent({ protected: true });

      const metrics = dashboard.getMevMetrics();
      expect(metrics.stats.protected).toBe(1);
    });

    test('emits MEV events', () => {
      const listener = jest.fn();
      dashboard.on('mev:sandwich', listener);

      dashboard.recordMevEvent({ type: 'sandwich_detected' });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('alert integration', () => {
    test('records alert', () => {
      dashboard.recordAlert({
        id: 'alert_1',
        level: 'high',
        message: 'Test alert',
        acknowledged: false,
      });

      const active = dashboard.getActiveAlerts();
      expect(active.length).toBe(1);
    });

    test('acknowledges alert', () => {
      dashboard.recordAlert({
        id: 'alert_1',
        level: 'high',
        acknowledged: false,
      });

      dashboard.acknowledgeAlert('alert_1');

      const active = dashboard.getActiveAlerts();
      expect(active.length).toBe(0);
    });
  });

  describe('getSnapshot', () => {
    test('returns comprehensive snapshot', () => {
      dashboard.start();
      dashboard.updateWalletStatus('0x123', { balance: '1' });
      dashboard.trackPendingTransaction({ txHash: '0xabc' });

      const snapshot = dashboard.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.status).toBeDefined();
      expect(snapshot.transactions).toBeDefined();
      expect(snapshot.wallets).toBeDefined();
      expect(snapshot.rpc).toBeDefined();
      expect(snapshot.oracles).toBeDefined();
      expect(snapshot.mev).toBeDefined();
      expect(snapshot.alerts).toBeDefined();
      expect(snapshot.system).toBeDefined();
    });
  });

  describe('system status', () => {
    test('returns system status', async () => {
      dashboard.start();

      // Small delay to ensure uptime > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      const status = dashboard.getSystemStatus();

      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.emergencyStop).toBe(false);
    });
  });

  describe('refresh', () => {
    test('emits refresh event periodically', async () => {
      const listener = jest.fn();
      dashboard.on('refresh', listener);

      dashboard.start();

      // Wait for refresh
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(listener).toHaveBeenCalled();
    });
  });
});
