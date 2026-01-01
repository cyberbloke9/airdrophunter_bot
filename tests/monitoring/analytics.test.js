'use strict';

const { Analytics } = require('../../src/monitoring/analytics');
const { ethers } = require('ethers');

describe('Analytics', () => {
  let analytics;

  beforeEach(() => {
    analytics = new Analytics({
      logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
      persistToDisk: false,
    });
  });

  describe('constructor', () => {
    test('initializes with default config', () => {
      const a = new Analytics();
      expect(a.retentionDays).toBe(90);
      expect(a.persistToDisk).toBe(false);
    });

    test('accepts custom config', () => {
      const a = new Analytics({
        retentionDays: 30,
        dataDir: '/custom/path',
      });
      expect(a.retentionDays).toBe(30);
      expect(a.dataDir).toBe('/custom/path');
    });

    test('initializes counters', () => {
      const counters = analytics.getCounters();
      expect(counters.transactions.total).toBe(0);
      expect(counters.gas.totalSpentEth).toBe('0.0');
    });
  });

  describe('recordEvent', () => {
    test('records event with timestamp', () => {
      const event = analytics.recordEvent('test_event', { foo: 'bar' });

      expect(event.type).toBe('test_event');
      expect(event.data.foo).toBe('bar');
      expect(event.timestamp).toBeDefined();
      expect(event.id).toMatch(/^test_event_/);
    });

    test('limits events in memory', () => {
      const a = new Analytics({ maxEventsInMemory: 5 });

      for (let i = 0; i < 10; i++) {
        a.recordEvent('test', { i });
      }

      expect(a.events.length).toBe(5);
    });
  });

  describe('recordTransaction', () => {
    test('records successful transaction', () => {
      analytics.recordTransaction({
        success: true,
        chainId: 1,
        type: 'swap',
        gasUsed: '100000',
        gasPrice: '20000000000',
        txHash: '0xabc',
      });

      const counters = analytics.getCounters();
      expect(counters.transactions.total).toBe(1);
      expect(counters.transactions.successful).toBe(1);
      expect(counters.transactions.byChain[1]).toEqual({ total: 1, success: 1 });
    });

    test('records failed transaction', () => {
      analytics.recordTransaction({
        success: false,
        chainId: 1,
        type: 'swap',
      });

      const counters = analytics.getCounters();
      expect(counters.transactions.total).toBe(1);
      expect(counters.transactions.failed).toBe(1);
    });

    test('tracks gas costs', () => {
      analytics.recordTransaction({
        success: true,
        chainId: 1,
        type: 'swap',
        gasUsed: '100000',
        gasPrice: '10000000000', // 10 gwei
      });

      const counters = analytics.getCounters();
      expect(counters.gas.totalSpentWei).toBe('1000000000000000'); // 0.001 ETH
    });

    test('tracks by type', () => {
      analytics.recordTransaction({ success: true, type: 'swap' });
      analytics.recordTransaction({ success: true, type: 'transfer' });
      analytics.recordTransaction({ success: true, type: 'swap' });

      const counters = analytics.getCounters();
      expect(counters.transactions.byType.swap).toEqual({ total: 2, success: 2 });
      expect(counters.transactions.byType.transfer).toEqual({ total: 1, success: 1 });
    });
  });

  describe('recordSlippage', () => {
    test('records slippage event', () => {
      analytics.recordSlippage({
        expected: 1000,
        actual: 990,
        pair: 'ETH/USDC',
        chainId: 1,
      });

      const counters = analytics.getCounters();
      expect(counters.slippage.sampleCount).toBe(1);
      expect(counters.slippage.averageDeviation).toBeCloseTo(0.01, 4);
    });

    test('maintains rolling window', () => {
      for (let i = 0; i < 1500; i++) {
        analytics.recordSlippage({
          expected: 1000,
          actual: 990,
        });
      }

      const counters = analytics.getCounters();
      expect(counters.slippage.sampleCount).toBeLessThanOrEqual(1000);
    });
  });

  describe('recordMevEvent', () => {
    test('records sandwich detection', () => {
      analytics.recordMevEvent({
        type: 'sandwich_detected',
        extractedValue: ethers.utils.parseEther('0.1').toString(),
      });

      const counters = analytics.getCounters();
      expect(counters.mev.sandwichesDetected).toBe(1);
      expect(counters.mev.totalExtractedWei).toBe(ethers.utils.parseEther('0.1').toString());
    });

    test('records protected transaction', () => {
      analytics.recordMevEvent({
        protectionUsed: true,
        estimatedSavings: ethers.utils.parseEther('0.05').toString(),
      });

      const counters = analytics.getCounters();
      expect(counters.mev.protectedTransactions).toBe(1);
    });
  });

  describe('recordRpcEvent', () => {
    test('records RPC request', () => {
      analytics.recordRpcEvent({
        success: true,
        latency: 100,
        chainId: 1,
      });

      const counters = analytics.getCounters();
      expect(counters.rpc.requests).toBe(1);
      expect(counters.rpc.averageLatency).toBe(100);
    });

    test('records RPC failure', () => {
      analytics.recordRpcEvent({
        success: false,
        chainId: 1,
      });

      const counters = analytics.getCounters();
      expect(counters.rpc.failures).toBe(1);
      expect(counters.rpc.failureRate).toBe(1);
    });

    test('records failover', () => {
      analytics.recordRpcEvent({
        success: true,
        failover: true,
        chainId: 1,
      });

      const counters = analytics.getCounters();
      expect(counters.rpc.failovers).toBe(1);
    });
  });

  describe('recordAirdropActivity', () => {
    test('records protocol interaction', () => {
      analytics.recordAirdropActivity({
        protocol: 'uniswap',
        action: 'swap',
        chainId: 1,
      });

      const counters = analytics.getCounters();
      expect(counters.airdrop.protocols).toContain('uniswap');
      expect(counters.airdrop.actions.swap).toBe(1);
      expect(counters.airdrop.chainCount).toBe(1);
    });

    test('tracks unique protocols', () => {
      analytics.recordAirdropActivity({ protocol: 'uniswap' });
      analytics.recordAirdropActivity({ protocol: 'sushiswap' });
      analytics.recordAirdropActivity({ protocol: 'uniswap' });

      const counters = analytics.getCounters();
      expect(counters.airdrop.protocolCount).toBe(2);
    });
  });

  describe('getMetrics', () => {
    test('returns transaction metrics', () => {
      analytics.recordTransaction({ success: true, type: 'swap' });
      analytics.recordTransaction({ success: false, type: 'swap' });

      const metrics = analytics.getMetrics('transactions');
      expect(metrics.length).toBeGreaterThan(0);
    });

    test('returns slippage metrics', () => {
      analytics.recordSlippage({ expected: 1000, actual: 990 });

      const metrics = analytics.getMetrics('slippage');
      expect(metrics.length).toBeGreaterThan(0);
    });

    test('filters by time range', () => {
      const oldEvent = analytics.recordEvent('test', {});
      oldEvent.timestamp = Date.now() - 86400000 * 2; // 2 days ago

      analytics.recordEvent('test', {});

      const metrics = analytics.getMetrics('test', {
        start: Date.now() - 86400000, // 1 day ago
      });

      expect(metrics.length).toBe(1);
    });
  });

  describe('generateReport', () => {
    test('generates daily report', () => {
      analytics.recordTransaction({ success: true, type: 'swap' });

      const report = analytics.generateReport('daily');

      expect(report.reportType).toBe('daily');
      expect(report.summary.transactions.total).toBe(1);
    });

    test('generates weekly report', () => {
      const report = analytics.generateReport('weekly');

      expect(report.reportType).toBe('weekly');
      expect(report.dailySummaries.length).toBe(7);
    });

    test('generates performance report', () => {
      const report = analytics.generateReport('performance', { window: '24h' });

      expect(report.reportType).toBe('performance');
      expect(report.metrics).toBeDefined();
    });

    test('generates MEV report', () => {
      analytics.recordMevEvent({ type: 'sandwich_detected' });

      const report = analytics.generateReport('mev');

      expect(report.reportType).toBe('mev');
      expect(report.metrics.sandwichesDetected).toBe(1);
    });

    test('generates gas report', () => {
      analytics.recordTransaction({
        success: true,
        gasUsed: '100000',
        gasPrice: '10000000000',
        type: 'swap',
      });

      const report = analytics.generateReport('gas');

      expect(report.reportType).toBe('gas');
      expect(report.metrics.transactionCount).toBe(1);
    });

    test('throws for unknown report type', () => {
      expect(() => analytics.generateReport('unknown')).toThrow('Unknown report type');
    });
  });

  describe('getPerformanceSummary', () => {
    test('returns summary for wallet', () => {
      analytics.recordTransaction({
        success: true,
        wallet: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        gasUsed: '100000',
        gasPrice: '10000000000',
      });

      const summary = analytics.getPerformanceSummary(
        '0x1234567890123456789012345678901234567890'
      );

      expect(summary.transactions.total).toBe(1);
      expect(summary.transactions.successRate).toBe(1);
    });

    test('calculates success rate', () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      analytics.recordTransaction({ success: true, wallet });
      analytics.recordTransaction({ success: true, wallet });
      analytics.recordTransaction({ success: false, wallet });

      const summary = analytics.getPerformanceSummary(wallet);

      expect(summary.transactions.successRate).toBeCloseTo(0.666, 2);
    });
  });

  describe('exportData', () => {
    test('exports as JSON', () => {
      analytics.recordEvent('test', { foo: 'bar' });

      const json = analytics.exportData('json');
      const parsed = JSON.parse(json);

      expect(parsed.length).toBe(1);
      expect(parsed[0].data.foo).toBe('bar');
    });

    test('exports as CSV', () => {
      analytics.recordEvent('test', { foo: 'bar', num: 123 });

      const csv = analytics.exportData('csv');
      const lines = csv.split('\n');

      expect(lines.length).toBe(2); // header + 1 row
      expect(lines[0]).toContain('type');
    });

    test('applies filter by type', () => {
      analytics.recordEvent('type_a', {});
      analytics.recordEvent('type_b', {});

      const json = analytics.exportData('json', { type: 'type_a' });
      const parsed = JSON.parse(json);

      expect(parsed.length).toBe(1);
      expect(parsed[0].type).toBe('type_a');
    });

    test('applies limit', () => {
      for (let i = 0; i < 10; i++) {
        analytics.recordEvent('test', { i });
      }

      const json = analytics.exportData('json', { limit: 3 });
      const parsed = JSON.parse(json);

      expect(parsed.length).toBe(3);
    });

    test('throws for unknown format', () => {
      expect(() => analytics.exportData('xml')).toThrow('Unknown format');
    });
  });

  describe('resetCounters', () => {
    test('resets all counters', () => {
      analytics.recordTransaction({ success: true });
      analytics.recordMevEvent({ type: 'sandwich_detected' });

      analytics.resetCounters();

      const counters = analytics.getCounters();
      expect(counters.transactions.total).toBe(0);
      expect(counters.mev.sandwichesDetected).toBe(0);
    });
  });
});
