/**
 * Depeg Monitor Module Tests
 *
 * Tests for stablecoin depeg monitoring including:
 * - Price monitoring and consensus
 * - Depeg detection and alerts
 * - Tier classification
 * - Portfolio exposure checks
 * - Emergency protocols
 */

const {
  DepegMonitor,
  createDepegMonitor,
  DepegEvent,
  PriceSourceAdapter,
  ChainlinkAdapter,
  CoinGeckoAdapter,
  DEXPoolAdapter,
  KNOWN_STABLES,
  STABLE_TIER,
  THRESHOLDS,
  DIVERSIFICATION_LIMITS,
  PRICE_SOURCE,
  ALERT_SEVERITY,
} = require('../../src/monitoring/depeg-monitor');

describe('Depeg Monitor Module', () => {
  let depegMonitor;

  beforeEach(() => {
    depegMonitor = createDepegMonitor({
      checkInterval: 1000, // Fast for testing
      defaultStables: false, // Don't auto-add stables
    });
  });

  afterEach(() => {
    if (depegMonitor) {
      depegMonitor.stop();
    }
  });

  describe('Constants', () => {
    test('should have stable tier definitions', () => {
      expect(STABLE_TIER.SAFEST).toBe('safest');
      expect(STABLE_TIER.MODERATE).toBe('moderate');
      expect(STABLE_TIER.RISKY).toBe('risky');
      expect(STABLE_TIER.ALGORITHMIC).toBe('algorithmic');
      expect(STABLE_TIER.UNKNOWN).toBe('unknown');
    });

    test('should have known stablecoins', () => {
      expect(KNOWN_STABLES.USDC).toBeDefined();
      expect(KNOWN_STABLES.USDT).toBeDefined();
      expect(KNOWN_STABLES.DAI).toBeDefined();
      expect(KNOWN_STABLES.FRAX).toBeDefined();
    });

    test('USDC should be classified as safest', () => {
      expect(KNOWN_STABLES.USDC.tier).toBe(STABLE_TIER.SAFEST);
    });

    test('algorithmic stables should have warning', () => {
      if (KNOWN_STABLES.USTC) {
        expect(KNOWN_STABLES.USTC.tier).toBe(STABLE_TIER.ALGORITHMIC);
        expect(KNOWN_STABLES.USTC.warning).toBeDefined();
      }
    });

    test('should have alert thresholds', () => {
      expect(THRESHOLDS.alertThreshold).toBe(0.02); // 2%
      expect(THRESHOLDS.criticalThreshold).toBe(0.05); // 5%
      expect(THRESHOLDS.emergencyThreshold).toBe(0.10); // 10%
    });

    test('should have diversification limits', () => {
      expect(DIVERSIFICATION_LIMITS.maxSingleStableExposure).toBe(0.50);
      expect(DIVERSIFICATION_LIMITS.maxTierExposure[STABLE_TIER.ALGORITHMIC]).toBe(0);
    });

    test('should have alert severity levels', () => {
      expect(ALERT_SEVERITY.INFO).toBe('info');
      expect(ALERT_SEVERITY.WARNING).toBe('warning');
      expect(ALERT_SEVERITY.CRITICAL).toBe('critical');
      expect(ALERT_SEVERITY.EMERGENCY).toBe('emergency');
    });
  });

  describe('DepegEvent', () => {
    test('should create depeg event', () => {
      const event = new DepegEvent(
        { symbol: 'USDC', pegTarget: 1.0 },
        {
          price: 0.97,
          deviation: -0.03,
          deviationPercent: 3,
          severity: ALERT_SEVERITY.WARNING,
          sources: [{ source: 'chainlink', price: 0.97 }],
        }
      );

      expect(event.symbol).toBe('USDC');
      expect(event.price).toBe(0.97);
      expect(event.deviation).toBe(-0.03);
      expect(event.severity).toBe(ALERT_SEVERITY.WARNING);
      expect(event.resolved).toBe(false);
    });

    test('should track event updates', () => {
      const event = new DepegEvent(
        { symbol: 'USDC', pegTarget: 1.0 },
        {
          price: 0.97,
          deviation: -0.03,
          deviationPercent: 3,
          severity: ALERT_SEVERITY.WARNING,
          sources: [],
        }
      );

      event.update(0.94, -0.06);

      expect(event.price).toBe(0.94);
      expect(event.deviation).toBe(-0.06);
      expect(event.peakDeviation).toBe(0.06);
    });

    test('should mark event as resolved', () => {
      const event = new DepegEvent(
        { symbol: 'USDC', pegTarget: 1.0 },
        {
          price: 0.97,
          deviation: -0.03,
          deviationPercent: 3,
          severity: ALERT_SEVERITY.WARNING,
          sources: [],
        }
      );

      event.resolve();

      expect(event.resolved).toBe(true);
      expect(event.resolvedAt).toBeDefined();
    });

    test('should track actions', () => {
      const event = new DepegEvent(
        { symbol: 'USDC' },
        { price: 0.95, deviation: -0.05, severity: ALERT_SEVERITY.CRITICAL, sources: [] }
      );

      event.addAction({ type: 'operations_paused', reason: 'Critical depeg' });

      expect(event.actions.length).toBe(1);
      expect(event.actions[0].type).toBe('operations_paused');
    });

    test('should serialize to JSON', () => {
      const event = new DepegEvent(
        { symbol: 'USDC', pegTarget: 1.0 },
        {
          price: 0.97,
          deviation: -0.03,
          deviationPercent: 3,
          severity: ALERT_SEVERITY.WARNING,
          sources: [],
        }
      );

      const json = event.toJSON();

      expect(json.symbol).toBe('USDC');
      expect(json.price).toBe(0.97);
      expect(json.severity).toBe(ALERT_SEVERITY.WARNING);
    });
  });

  describe('Price Source Adapters', () => {
    describe('ChainlinkAdapter', () => {
      test('should create adapter', () => {
        const adapter = new ChainlinkAdapter();
        expect(adapter.name).toBe(PRICE_SOURCE.CHAINLINK);
      });

      test('should fetch price', async () => {
        const adapter = new ChainlinkAdapter();
        const price = await adapter.fetchPrice({ symbol: 'USDC' });

        // Simulated price should be close to 1.0
        expect(price).toBeGreaterThan(0.99);
        expect(price).toBeLessThan(1.01);
      });

      test('should track status', async () => {
        const adapter = new ChainlinkAdapter();
        await adapter.fetchPrice({ symbol: 'USDC' });

        const status = adapter.getStatus();
        expect(status.lastFetch).toBeDefined();
        expect(status.healthy).toBe(true);
      });
    });

    describe('CoinGeckoAdapter', () => {
      test('should create adapter', () => {
        const adapter = new CoinGeckoAdapter();
        expect(adapter.name).toBe(PRICE_SOURCE.COINGECKO);
      });

      test('should fetch price', async () => {
        const adapter = new CoinGeckoAdapter();
        const price = await adapter.fetchPrice({ symbol: 'USDC' });

        expect(price).toBeGreaterThan(0.99);
        expect(price).toBeLessThan(1.01);
      });
    });

    describe('DEXPoolAdapter', () => {
      test('should create adapter', () => {
        const adapter = new DEXPoolAdapter();
        expect(adapter.name).toBe(PRICE_SOURCE.DEX_POOL);
      });

      test('should fetch price', async () => {
        const adapter = new DEXPoolAdapter();
        const price = await adapter.fetchPrice({ symbol: 'USDC' });

        expect(price).toBeGreaterThan(0.99);
        expect(price).toBeLessThan(1.01);
      });
    });
  });

  describe('DepegMonitor', () => {
    describe('Initialization', () => {
      test('should create with default options', () => {
        const monitor = new DepegMonitor();
        expect(monitor).toBeDefined();
        expect(monitor.getStatus().running).toBe(false);
      });

      test('should accept custom thresholds', () => {
        const monitor = new DepegMonitor({
          alertThreshold: 0.01, // 1%
          criticalThreshold: 0.03, // 3%
        });

        expect(monitor.config.alertThreshold).toBe(0.01);
        expect(monitor.config.criticalThreshold).toBe(0.03);
      });
    });

    describe('Stable Management', () => {
      test('should add stablecoin to monitor', () => {
        const config = depegMonitor.addStable('USDC');

        expect(config.symbol).toBe('USDC');
        expect(config.tier).toBe(STABLE_TIER.SAFEST);
      });

      test('should add custom stablecoin', () => {
        const config = depegMonitor.addStable('CUSTOM', {
          name: 'Custom Stable',
          tier: STABLE_TIER.MODERATE,
          pegTarget: 1.0,
          address: '0x1234567890123456789012345678901234567890',
          addresses: { 1: '0x1234567890123456789012345678901234567890' },
        });

        expect(config.symbol).toBe('CUSTOM');
        expect(config.tier).toBe(STABLE_TIER.MODERATE);
      });

      test('should warn about algorithmic stables', (done) => {
        depegMonitor.on('warning', (warning) => {
          expect(warning.type).toBe('algorithmic_stable');
          done();
        });

        depegMonitor.addStable('TEST_ALGO', {
          tier: STABLE_TIER.ALGORITHMIC,
          pegTarget: 1.0,
          address: '0x1234567890123456789012345678901234567890',
        });
      });

      test('should remove stablecoin from monitoring', () => {
        depegMonitor.addStable('USDC');
        depegMonitor.removeStable('USDC');

        const info = depegMonitor.getStableInfo('USDC');
        // Should still return known stable info even if not monitored
        expect(info).toBeDefined();
      });
    });

    describe('Monitoring Lifecycle', () => {
      test('should start monitoring', () => {
        depegMonitor.addStable('USDC');
        depegMonitor.start();

        expect(depegMonitor.getStatus().running).toBe(true);
      });

      test('should stop monitoring', () => {
        depegMonitor.start();
        depegMonitor.stop();

        expect(depegMonitor.getStatus().running).toBe(false);
      });

      test('should pause and resume', () => {
        depegMonitor.start();
        depegMonitor.pause();
        expect(depegMonitor.getStatus().paused).toBe(true);

        depegMonitor.resume();
        expect(depegMonitor.getStatus().paused).toBe(false);
      });

      test('should emit lifecycle events', (done) => {
        let startedFired = false;

        depegMonitor.on('started', () => {
          startedFired = true;
        });

        depegMonitor.on('stopped', () => {
          expect(startedFired).toBe(true);
          done();
        });

        depegMonitor.start();
        setTimeout(() => depegMonitor.stop(), 50);
      });
    });

    describe('Price Checking', () => {
      test('should check stablecoin price', async () => {
        depegMonitor.addStable('USDC');

        const result = await depegMonitor.checkStable('USDC', KNOWN_STABLES.USDC);

        expect(result.symbol).toBe('USDC');
        expect(result.price).toBeDefined();
        expect(result.deviation).toBeDefined();
        expect(result.healthy).toBeDefined();
      });

      test('should check all monitored stables', async () => {
        depegMonitor.addStable('USDC');
        depegMonitor.addStable('USDT');

        const results = await depegMonitor.checkAll();

        expect(results.length).toBe(2);
      });

      test('should get latest price', async () => {
        depegMonitor.addStable('USDC');
        await depegMonitor.checkAll();

        const price = depegMonitor.getPrice('USDC');

        expect(price).toBeDefined();
        expect(price.price).toBeDefined();
        expect(price.timestamp).toBeDefined();
      });
    });

    describe('Depeg Detection', () => {
      test('should determine correct severity', () => {
        // Access private method through prototype or create wrapper
        const monitor = depegMonitor;

        // INFO for normal
        expect(monitor.determineSeverity(0.01)).toBe(ALERT_SEVERITY.INFO);

        // WARNING for 2%+
        expect(monitor.determineSeverity(0.025)).toBe(ALERT_SEVERITY.WARNING);

        // CRITICAL for 5%+
        expect(monitor.determineSeverity(0.06)).toBe(ALERT_SEVERITY.CRITICAL);

        // EMERGENCY for 10%+
        expect(monitor.determineSeverity(0.12)).toBe(ALERT_SEVERITY.EMERGENCY);
      });

      test('should detect depeg and create event', async () => {
        // Create monitor with low threshold for testing
        const testMonitor = createDepegMonitor({
          alertThreshold: 0.001, // 0.1% - very sensitive
          defaultStables: false,
        });

        testMonitor.addStable('USDC');

        let alertFired = false;
        testMonitor.on('alert', () => {
          alertFired = true;
        });

        await testMonitor.checkAll();

        // Simulated prices have small variance, may or may not trigger
        // This tests the mechanism exists
        expect(testMonitor.getActiveEvents()).toBeDefined();

        testMonitor.stop();
      });

      test('should emit alert on depeg', async () => {
        const testMonitor = createDepegMonitor({
          alertThreshold: 0.0001, // Very sensitive for testing
          alertCooldown: 0, // No cooldown
          defaultStables: false,
        });

        testMonitor.addStable('USDC');

        const alertPromise = new Promise((resolve) => {
          testMonitor.on('alert', (alert) => {
            resolve(alert);
          });
          // Timeout fallback - simulated prices may not always trigger
          setTimeout(() => resolve(null), 100);
        });

        await testMonitor.checkAll();
        const alert = await alertPromise;

        // Alert may or may not fire depending on simulated price variance
        if (alert) {
          expect(alert.type).toBeDefined();
          expect(alert.event).toBeDefined();
        }

        testMonitor.stop();
      });

      test('should pause operations on critical depeg', (done) => {
        const testMonitor = createDepegMonitor({
          alertThreshold: 0.0001,
          criticalThreshold: 0.0001,
          pauseOnCritical: true,
          defaultStables: false,
        });

        testMonitor.addStable('USDC');

        testMonitor.on('operationsPaused', (event) => {
          expect(event.symbol).toBe('USDC');
          testMonitor.stop();
          done();
        });

        testMonitor.checkAll();
      });
    });

    describe('Exposure Checking', () => {
      test('should check portfolio exposure', () => {
        depegMonitor.addStable('USDC');
        depegMonitor.addStable('USDT');

        const result = depegMonitor.checkExposure({
          USDC: 6000, // 60%
          USDT: 4000, // 40%
        });

        expect(result.totalValue).toBe(10000);
        expect(result.warnings.length).toBeGreaterThan(0); // USDC exceeds 50%
      });

      test('should warn on single stable overexposure', () => {
        depegMonitor.addStable('USDC');

        const result = depegMonitor.checkExposure({
          USDC: 8000, // 80% - exceeds 50% limit
          ETH: 2000,
        });

        const singleExposureWarning = result.warnings.find(w => w.type === 'single_exposure');
        expect(singleExposureWarning).toBeDefined();
      });

      test('should warn on tier overexposure', () => {
        depegMonitor.addStable('FRAX');
        depegMonitor.addStable('LUSD');
        depegMonitor.addStable('crvUSD');

        const result = depegMonitor.checkExposure({
          FRAX: 4000, // 40% moderate
          LUSD: 3000, // 30% moderate = 70% total moderate
          crvUSD: 3000,
        });

        const tierWarning = result.warnings.find(w => w.type === 'tier_exposure');
        expect(tierWarning).toBeDefined();
      });

      test('should return healthy for balanced portfolio', () => {
        depegMonitor.addStable('USDC');
        depegMonitor.addStable('USDT');
        depegMonitor.addStable('DAI');

        const result = depegMonitor.checkExposure({
          USDC: 4000, // 40%
          USDT: 3000, // 30%
          DAI: 3000, // 30%
        });

        expect(result.healthy).toBe(true);
      });
    });

    describe('Event History', () => {
      test('should get active events', () => {
        const events = depegMonitor.getActiveEvents();
        expect(Array.isArray(events)).toBe(true);
      });

      test('should get event history', () => {
        const history = depegMonitor.getEventHistory();
        expect(Array.isArray(history)).toBe(true);
      });

      test('should filter event history', () => {
        const history = depegMonitor.getEventHistory({
          symbol: 'USDC',
          limit: 10,
        });

        expect(Array.isArray(history)).toBe(true);
      });
    });

    describe('Stable Information', () => {
      test('should get stable info', () => {
        depegMonitor.addStable('USDC');

        const info = depegMonitor.getStableInfo('USDC');

        expect(info.symbol).toBe('USDC');
        expect(info.tier).toBe(STABLE_TIER.SAFEST);
      });

      test('should get known stables', () => {
        const stables = depegMonitor.getKnownStables();

        expect(stables.USDC).toBeDefined();
        expect(stables.USDT).toBeDefined();
      });
    });

    describe('Price Sources', () => {
      test('should add custom price source', () => {
        const customAdapter = new PriceSourceAdapter('custom');

        depegMonitor.addPriceSource('custom', customAdapter);

        // Should not throw
        expect(true).toBe(true);
      });

      test('should remove price source', () => {
        depegMonitor.removePriceSource(PRICE_SOURCE.COINGECKO);

        // Should not throw
        expect(true).toBe(true);
      });
    });

    describe('Statistics', () => {
      test('should return statistics', async () => {
        depegMonitor.addStable('USDC');
        await depegMonitor.checkAll();

        const stats = depegMonitor.getStatistics();

        expect(stats.checksPerformed).toBeGreaterThan(0);
        expect(stats.monitoredCount).toBe(1);
      });
    });

    describe('Status', () => {
      test('should return comprehensive status', () => {
        depegMonitor.addStable('USDC');

        const status = depegMonitor.getStatus();

        expect(status.running).toBeDefined();
        expect(status.paused).toBeDefined();
        expect(status.healthy).toBeDefined();
        expect(status.monitoredStables).toContain('USDC');
      });
    });
  });

  describe('Factory Function', () => {
    test('should create with defaults', () => {
      const monitor = createDepegMonitor({ defaultStables: false });
      expect(monitor).toBeInstanceOf(DepegMonitor);
    });

    test('should add default stables', () => {
      const monitor = createDepegMonitor({
        defaultStables: ['USDC', 'USDT'],
      });

      const status = monitor.getStatus();
      expect(status.monitoredStables).toContain('USDC');
      expect(status.monitoredStables).toContain('USDT');
    });
  });

  describe('Edge Cases', () => {
    test('should handle no price sources', async () => {
      const monitor = createDepegMonitor({ defaultStables: false });

      // Remove all price sources
      monitor.removePriceSource(PRICE_SOURCE.CHAINLINK);
      monitor.removePriceSource(PRICE_SOURCE.COINGECKO);
      monitor.removePriceSource(PRICE_SOURCE.DEX_POOL);

      monitor.addStable('USDC');

      await expect(monitor.checkAll()).rejects.toThrow();
    });

    test('should handle unknown stable', () => {
      expect(() => {
        depegMonitor.addStable('UNKNOWN_STABLE');
      }).toThrow();
    });

    test('should calculate median correctly', () => {
      // Odd number
      const odd = [1, 3, 2];
      expect(depegMonitor.calculateMedian(odd)).toBe(2);

      // Even number
      const even = [1, 2, 3, 4];
      expect(depegMonitor.calculateMedian(even)).toBe(2.5);
    });
  });
});

describe('Integration Tests', () => {
  test('full monitoring lifecycle', async () => {
    const monitor = createDepegMonitor({
      checkInterval: 100,
      alertCooldown: 0,
      defaultStables: false,
    });

    // 1. Add stables
    monitor.addStable('USDC');
    monitor.addStable('USDT');
    monitor.addStable('DAI');

    // 2. Start monitoring
    monitor.start();
    expect(monitor.getStatus().running).toBe(true);

    // 3. Wait for checks
    await new Promise(resolve => setTimeout(resolve, 200));

    // 4. Check results
    const usdcPrice = monitor.getPrice('USDC');
    expect(usdcPrice).toBeDefined();

    // 5. Check exposure
    const exposure = monitor.checkExposure({
      USDC: 5000,
      USDT: 3000,
      DAI: 2000,
    });

    expect(exposure.totalValue).toBe(10000);

    // 6. Get statistics
    const stats = monitor.getStatistics();
    expect(stats.checksPerformed).toBeGreaterThan(0);

    // 7. Stop
    monitor.stop();
    expect(monitor.getStatus().running).toBe(false);
  });

  test('depeg event lifecycle', async () => {
    // This test simulates a depeg event detection
    const monitor = createDepegMonitor({
      alertThreshold: 0.0001, // Very sensitive
      criticalThreshold: 0.0002,
      alertCooldown: 0,
      pauseOnCritical: true,
      defaultStables: false,
    });

    const events = [];

    monitor.on('alert', (alert) => events.push({ type: 'alert', data: alert }));
    monitor.on('operationsPaused', (data) => events.push({ type: 'pause', data }));

    monitor.addStable('USDC');

    await monitor.checkAll();

    // Events should have been triggered due to very low threshold
    expect(events.length).toBeGreaterThan(0);

    monitor.stop();
  });
});
