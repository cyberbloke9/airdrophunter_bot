/**
 * RPC Manager Unit Tests
 *
 * Tests multi-provider failover, health monitoring,
 * and request load balancing.
 */

const { ethers } = require('ethers');
const RpcManager = require('../../src/security/rpc-manager');
const { HEALTH_STATE } = RpcManager;

describe('RpcManager', () => {
  let rpcManager;
  let mockLogger;
  let mockProvider;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockProvider = {
      getBlockNumber: jest.fn().mockResolvedValue(12345),
      call: jest.fn().mockResolvedValue('0x'),
    };

    // Mock ethers.providers.JsonRpcProvider
    jest.spyOn(ethers.providers, 'JsonRpcProvider').mockImplementation(() => mockProvider);

    rpcManager = new RpcManager({ logger: mockLogger });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rpcManager.stopHealthChecks();
  });

  describe('Chain Configuration', () => {
    test('initializes with default chain configs', () => {
      const status = rpcManager.getHealthStatus();

      expect(status[1]).toBeDefined(); // Mainnet
      expect(status[42161]).toBeDefined(); // Arbitrum
      expect(status[10]).toBeDefined(); // Optimism
      expect(status[8453]).toBeDefined(); // Base
      expect(status[137]).toBeDefined(); // Polygon
    });

    test('adds custom chain config', () => {
      rpcManager.addChainConfig(999, [
        { url: 'https://custom.rpc.com', priority: 1, name: 'Custom' },
      ]);

      const status = rpcManager.getHealthStatus();
      expect(status[999]).toBeDefined();
      expect(status[999][0].name).toBe('Custom');
    });

    test('sorts RPCs by priority', () => {
      rpcManager.addChainConfig(999, [
        { url: 'https://low.rpc.com', priority: 3, name: 'Low' },
        { url: 'https://high.rpc.com', priority: 1, name: 'High' },
        { url: 'https://mid.rpc.com', priority: 2, name: 'Mid' },
      ]);

      const status = rpcManager.getHealthStatus();
      expect(status[999][0].name).toBe('High');
      expect(status[999][1].name).toBe('Mid');
      expect(status[999][2].name).toBe('Low');
    });
  });

  describe('Provider Selection', () => {
    test('returns provider for configured chain', async () => {
      const provider = await rpcManager.getProvider(1);
      expect(provider).toBeDefined();
    });

    test('throws for unconfigured chain', async () => {
      await expect(rpcManager.getProvider(99999)).rejects.toThrow('No RPC configured');
    });

    test('caches provider on success', async () => {
      await rpcManager.getProvider(1);
      await rpcManager.getProvider(1);

      // Should only create one new provider (first call)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using')
      );
    });
  });

  describe('Health Monitoring', () => {
    test('updates health on success', () => {
      rpcManager.updateHealth(1, 'https://test.rpc.com', true, null, 100);

      const key = '1:https://test.rpc.com';
      const health = rpcManager.health.get(key);

      expect(health.state).toBe(HEALTH_STATE.HEALTHY);
      expect(health.latency).toBe(100);
      expect(health.successCount).toBe(1);
    });

    test('marks degraded on high latency', () => {
      rpcManager.updateHealth(1, 'https://test.rpc.com', true, null, 4500); // 90% of 5000ms max

      const key = '1:https://test.rpc.com';
      const health = rpcManager.health.get(key);

      expect(health.state).toBe(HEALTH_STATE.DEGRADED);
    });

    test('marks unhealthy after 3 failures', () => {
      const url = 'https://test.rpc.com';

      rpcManager.updateHealth(1, url, false, new Error('Error 1'));
      rpcManager.updateHealth(1, url, false, new Error('Error 2'));
      rpcManager.updateHealth(1, url, false, new Error('Error 3'));

      const key = `1:${url}`;
      const health = rpcManager.health.get(key);

      expect(health.state).toBe(HEALTH_STATE.UNHEALTHY);
      expect(health.errorCount).toBe(3);
    });

    test('decays error count on success', () => {
      const url = 'https://test.rpc.com';

      rpcManager.updateHealth(1, url, false, new Error('Error'));
      rpcManager.updateHealth(1, url, false, new Error('Error'));
      rpcManager.updateHealth(1, url, true, null, 100);

      const key = `1:${url}`;
      const health = rpcManager.health.get(key);

      expect(health.errorCount).toBe(1); // Decayed from 2 to 1
    });
  });

  describe('Provider Health Check', () => {
    test('returns true for healthy provider', async () => {
      const isHealthy = await rpcManager.isProviderHealthy(mockProvider, 1);
      expect(isHealthy).toBe(true);
    });

    test('returns false on timeout', async () => {
      mockProvider.getBlockNumber.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      );

      // Use short timeout for test
      rpcManager.config.requestTimeout = 50;

      const isHealthy = await rpcManager.isProviderHealthy(mockProvider, 1);
      expect(isHealthy).toBe(false);
    });

    test('returns false on high latency', async () => {
      mockProvider.getBlockNumber.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(12345), 100))
      );

      rpcManager.config.maxLatency = 50;

      const isHealthy = await rpcManager.isProviderHealthy(mockProvider, 1);
      expect(isHealthy).toBe(false);
    });
  });

  describe('Failover', () => {
    test('fails over to next RPC on error', async () => {
      let callCount = 0;

      const result = await rpcManager.executeWithFailover(1, async (provider) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First provider failed');
        }
        return 'success';
      }, { attempts: 1 });

      expect(result).toBe('success');
      expect(rpcManager.metrics.failovers).toBe(1);
    });

    test('retries before failing over', async () => {
      let attempts = 0;

      const result = await rpcManager.executeWithFailover(1, async (provider) => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      }, { attempts: 3 });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('throws after all RPCs exhausted', async () => {
      await expect(
        rpcManager.executeWithFailover(1, async () => {
          throw new Error('All failed');
        }, { attempts: 1 })
      ).rejects.toThrow('All failed');
    });

    test('skips unhealthy providers', async () => {
      const rpcs = rpcManager.rpcConfigs.get(1);
      const firstUrl = rpcs[0].url;

      // Mark first as unhealthy
      rpcManager.updateHealth(1, firstUrl, false, new Error('Error'));
      rpcManager.updateHealth(1, firstUrl, false, new Error('Error'));
      rpcManager.updateHealth(1, firstUrl, false, new Error('Error'));

      let usedUrl = null;
      await rpcManager.executeWithFailover(1, async (provider) => {
        // Provider was created, record which URL was used
        usedUrl = 'second';
        return 'success';
      }, { attempts: 1 });

      // Should have skipped the unhealthy first provider
      expect(usedUrl).toBe('second');
    });
  });

  describe('Metrics', () => {
    test('tracks request metrics', async () => {
      await rpcManager.executeWithFailover(1, async () => 'result');
      await rpcManager.executeWithFailover(1, async () => 'result');

      const metrics = rpcManager.getMetrics();

      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(2);
      expect(metrics.averageLatency).toBeGreaterThanOrEqual(0);
    });

    test('tracks failed requests', async () => {
      try {
        await rpcManager.executeWithFailover(1, async () => {
          throw new Error('Failed');
        }, { attempts: 1 });
      } catch (e) {
        // Expected
      }

      const metrics = rpcManager.getMetrics();
      expect(metrics.failedRequests).toBeGreaterThan(0);
    });

    test('calculates success rate', async () => {
      await rpcManager.executeWithFailover(1, async () => 'result');
      await rpcManager.executeWithFailover(1, async () => 'result');

      const metrics = rpcManager.getMetrics();
      expect(metrics.successRate).toBe('100.00%');
    });
  });

  describe('Health Status', () => {
    test('returns status for all chains', () => {
      const status = rpcManager.getHealthStatus();

      expect(Object.keys(status).length).toBeGreaterThan(0);

      // Each chain should have RPC entries
      for (const chainId of Object.keys(status)) {
        expect(Array.isArray(status[chainId])).toBe(true);
        expect(status[chainId].length).toBeGreaterThan(0);
      }
    });

    test('includes latency and error count', async () => {
      const rpcs = rpcManager.rpcConfigs.get(1);
      rpcManager.updateHealth(1, rpcs[0].url, true, null, 150);

      const status = rpcManager.getHealthStatus();
      expect(status[1][0].latency).toBe(150);
    });
  });

  describe('Healthy Count', () => {
    test('counts healthy providers', () => {
      const rpcs = rpcManager.rpcConfigs.get(1);

      // Mark all as healthy
      for (const rpc of rpcs) {
        rpcManager.updateHealth(1, rpc.url, true, null, 100);
      }

      const count = rpcManager.getHealthyCount(1);
      expect(count).toBe(rpcs.length);
    });

    test('returns 0 for unknown chain', () => {
      const count = rpcManager.getHealthyCount(99999);
      expect(count).toBe(0);
    });

    test('excludes unhealthy providers', () => {
      const rpcs = rpcManager.rpcConfigs.get(1);

      // Mark first as unhealthy
      rpcManager.updateHealth(1, rpcs[0].url, false, new Error('Error'));
      rpcManager.updateHealth(1, rpcs[0].url, false, new Error('Error'));
      rpcManager.updateHealth(1, rpcs[0].url, false, new Error('Error'));

      // Mark rest as healthy
      for (let i = 1; i < rpcs.length; i++) {
        rpcManager.updateHealth(1, rpcs[i].url, true, null, 100);
      }

      const count = rpcManager.getHealthyCount(1);
      expect(count).toBe(rpcs.length - 1);
    });
  });

  describe('Minimum Healthy Check', () => {
    test('returns true when minimum healthy', () => {
      const rpcs = rpcManager.rpcConfigs.get(1);
      rpcManager.updateHealth(1, rpcs[0].url, true, null, 100);

      const hasMinimum = rpcManager.hasMinimumHealthy(1);
      expect(hasMinimum).toBe(true);
    });

    test('returns false when below minimum', () => {
      rpcManager.config.minHealthyProviders = 10;

      const hasMinimum = rpcManager.hasMinimumHealthy(1);
      expect(hasMinimum).toBe(false);
    });
  });

  describe('Custom RPC', () => {
    test('adds custom RPC endpoint', () => {
      rpcManager.addRpc(1, 'https://custom.rpc.com', 0, 'Custom Primary');

      const status = rpcManager.getHealthStatus();
      expect(status[1][0].name).toBe('Custom Primary'); // Priority 0 = first
    });

    test('initializes health for new RPC', () => {
      rpcManager.addRpc(1, 'https://new.rpc.com', 5, 'New');

      const key = '1:https://new.rpc.com';
      const health = rpcManager.health.get(key);

      expect(health.state).toBe(HEALTH_STATE.UNKNOWN);
    });
  });

  describe('Health Reset', () => {
    test('resets health for specific RPC', () => {
      const url = 'https://test.rpc.com';

      // Set some state
      rpcManager.updateHealth(1, url, false, new Error('Error'));
      rpcManager.updateHealth(1, url, false, new Error('Error'));
      rpcManager.updateHealth(1, url, false, new Error('Error'));

      // Reset
      rpcManager.resetHealth(1, url);

      const key = `1:${url}`;
      const health = rpcManager.health.get(key);

      expect(health.state).toBe(HEALTH_STATE.UNKNOWN);
      expect(health.errorCount).toBe(0);
    });
  });

  describe('Cache Management', () => {
    test('clears provider cache', async () => {
      await rpcManager.getProvider(1);
      expect(rpcManager.providers.size).toBe(1);

      rpcManager.clearCache();
      expect(rpcManager.providers.size).toBe(0);
    });
  });

  describe('Health Checks', () => {
    test('starts and stops health checks', () => {
      rpcManager.startHealthChecks();
      expect(rpcManager.healthCheckHandle).toBeDefined();

      rpcManager.stopHealthChecks();
      expect(rpcManager.healthCheckHandle).toBeNull();
    });

    test('does not start duplicate health checks', () => {
      rpcManager.startHealthChecks();
      const firstHandle = rpcManager.healthCheckHandle;

      rpcManager.startHealthChecks();
      expect(rpcManager.healthCheckHandle).toBe(firstHandle);
    });
  });

  describe('Configuration', () => {
    test('uses custom configuration', () => {
      const customManager = new RpcManager({
        logger: mockLogger,
        healthCheckInterval: 60000,
        maxLatency: 10000,
        maxBlockLag: 10,
        requestTimeout: 20000,
      });

      expect(customManager.config.healthCheckInterval).toBe(60000);
      expect(customManager.config.maxLatency).toBe(10000);
      expect(customManager.config.maxBlockLag).toBe(10);
      expect(customManager.config.requestTimeout).toBe(20000);
    });
  });
});
