/**
 * RPC Manager - Multi-Provider Failover with Health Monitoring
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: Single RPC = single point of failure. Public RPCs have rate limits,
 * downtime, and can serve stale data. Need automatic failover and health
 * monitoring for reliability.
 *
 * STATE-OF-THE-ART:
 * - Multiple RPC endpoints per chain with priority
 * - Health monitoring with latency tracking
 * - Automatic failover on errors
 * - Request load balancing
 * - Stale block detection
 *
 * @module security/rpc-manager
 */

const { ethers } = require('ethers');

// RPC health states
const HEALTH_STATE = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
};

class RpcManager {
  constructor(config = {}) {
    this.logger = config.logger || console;

    // RPC configurations by chain
    this.rpcConfigs = new Map();

    // Active providers
    this.providers = new Map();

    // Health tracking
    this.health = new Map(); // `${chainId}:${url}` -> health info

    // Configuration
    this.config = {
      healthCheckInterval: config.healthCheckInterval ?? 30000, // 30 seconds
      maxLatency: config.maxLatency ?? 5000, // 5 seconds
      maxBlockLag: config.maxBlockLag ?? 5, // 5 blocks behind = stale
      minHealthyProviders: config.minHealthyProviders ?? 1,
      requestTimeout: config.requestTimeout ?? 10000,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };

    // Health check interval handle
    this.healthCheckHandle = null;

    // Request metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      failovers: 0,
      averageLatency: 0,
    };

    // Initialize default RPC configs
    this.initializeDefaultConfigs();
  }

  /**
   * Initialize default RPC configurations
   */
  initializeDefaultConfigs() {
    // Ethereum Mainnet
    this.addChainConfig(1, [
      { url: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com', priority: 1, name: 'Primary' },
      { url: 'https://rpc.ankr.com/eth', priority: 2, name: 'Ankr' },
      { url: 'https://ethereum.publicnode.com', priority: 3, name: 'PublicNode' },
      { url: 'https://1rpc.io/eth', priority: 4, name: '1RPC' },
    ]);

    // Arbitrum
    this.addChainConfig(42161, [
      { url: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc', priority: 1, name: 'Official' },
      { url: 'https://rpc.ankr.com/arbitrum', priority: 2, name: 'Ankr' },
      { url: 'https://arbitrum.publicnode.com', priority: 3, name: 'PublicNode' },
    ]);

    // Optimism
    this.addChainConfig(10, [
      { url: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io', priority: 1, name: 'Official' },
      { url: 'https://rpc.ankr.com/optimism', priority: 2, name: 'Ankr' },
      { url: 'https://optimism.publicnode.com', priority: 3, name: 'PublicNode' },
    ]);

    // Base
    this.addChainConfig(8453, [
      { url: process.env.BASE_RPC_URL || 'https://mainnet.base.org', priority: 1, name: 'Official' },
      { url: 'https://base.publicnode.com', priority: 2, name: 'PublicNode' },
      { url: 'https://1rpc.io/base', priority: 3, name: '1RPC' },
    ]);

    // Polygon
    this.addChainConfig(137, [
      { url: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com', priority: 1, name: 'Official' },
      { url: 'https://rpc.ankr.com/polygon', priority: 2, name: 'Ankr' },
      { url: 'https://polygon.publicnode.com', priority: 3, name: 'PublicNode' },
    ]);
  }

  /**
   * Add chain configuration
   *
   * @param {number} chainId - Chain ID
   * @param {object[]} rpcs - Array of RPC configs
   */
  addChainConfig(chainId, rpcs) {
    // Sort by priority
    const sorted = rpcs.sort((a, b) => a.priority - b.priority);
    this.rpcConfigs.set(chainId, sorted);

    // Initialize health tracking
    for (const rpc of sorted) {
      const key = `${chainId}:${rpc.url}`;
      this.health.set(key, {
        state: HEALTH_STATE.UNKNOWN,
        latency: null,
        lastCheck: null,
        lastBlock: null,
        errorCount: 0,
        successCount: 0,
      });
    }
  }

  /**
   * Get provider for a chain (with automatic failover)
   *
   * @param {number} chainId - Chain ID
   * @returns {Promise<ethers.providers.JsonRpcProvider>}
   */
  async getProvider(chainId) {
    // Check cache
    const cached = this.providers.get(chainId);
    if (cached && await this.isProviderHealthy(cached.provider, chainId)) {
      return cached.provider;
    }

    // Find healthy provider
    const rpcs = this.rpcConfigs.get(chainId);
    if (!rpcs || rpcs.length === 0) {
      throw new Error(`No RPC configured for chain ${chainId}`);
    }

    for (const rpc of rpcs) {
      const key = `${chainId}:${rpc.url}`;
      const healthInfo = this.health.get(key);

      // Skip unhealthy providers
      if (healthInfo?.state === HEALTH_STATE.UNHEALTHY) {
        continue;
      }

      try {
        const provider = new ethers.providers.JsonRpcProvider({
          url: rpc.url,
          timeout: this.config.requestTimeout,
        });

        // Quick health check
        const isHealthy = await this.isProviderHealthy(provider, chainId);
        if (isHealthy) {
          this.providers.set(chainId, { provider, rpc });
          this.logger.info(`[RpcManager] Using ${rpc.name} for chain ${chainId}`);
          return provider;
        }
      } catch (error) {
        this.logger.warn(`[RpcManager] ${rpc.name} failed: ${error.message}`);
        this.updateHealth(chainId, rpc.url, false, error);
      }
    }

    throw new Error(`No healthy RPC available for chain ${chainId}`);
  }

  /**
   * Execute request with automatic failover
   *
   * @param {number} chainId - Chain ID
   * @param {Function} requestFn - Request function (receives provider)
   * @param {object} options - Options
   * @returns {Promise<any>}
   */
  async executeWithFailover(chainId, requestFn, options = {}) {
    const rpcs = this.rpcConfigs.get(chainId);
    if (!rpcs || rpcs.length === 0) {
      throw new Error(`No RPC configured for chain ${chainId}`);
    }

    let lastError;
    const attempts = options.attempts ?? this.config.retryAttempts;

    for (const rpc of rpcs) {
      const key = `${chainId}:${rpc.url}`;
      const healthInfo = this.health.get(key);

      // Skip unhealthy providers (unless we've tried all)
      if (healthInfo?.state === HEALTH_STATE.UNHEALTHY && rpcs.indexOf(rpc) < rpcs.length - 1) {
        continue;
      }

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const startTime = Date.now();

          const provider = new ethers.providers.JsonRpcProvider({
            url: rpc.url,
            timeout: this.config.requestTimeout,
          });

          const result = await requestFn(provider);

          // Update metrics
          this.metrics.totalRequests++;
          this.metrics.successfulRequests++;
          const latency = Date.now() - startTime;
          this.metrics.averageLatency =
            (this.metrics.averageLatency * (this.metrics.successfulRequests - 1) + latency) /
            this.metrics.successfulRequests;

          // Update health
          this.updateHealth(chainId, rpc.url, true, null, latency);

          return result;

        } catch (error) {
          lastError = error;
          this.metrics.totalRequests++;
          this.metrics.failedRequests++;

          this.logger.warn(
            `[RpcManager] ${rpc.name} attempt ${attempt}/${attempts} failed: ${error.message}`
          );

          // Update health on final attempt
          if (attempt === attempts) {
            this.updateHealth(chainId, rpc.url, false, error);
          }

          // Wait before retry
          if (attempt < attempts) {
            await this.sleep(this.config.retryDelay * attempt);
          }
        }
      }

      // Failover to next RPC
      this.metrics.failovers++;
      this.logger.info(`[RpcManager] Failing over from ${rpc.name}`);
    }

    throw lastError || new Error('All RPCs failed');
  }

  /**
   * Check if provider is healthy
   *
   * @param {ethers.providers.Provider} provider - Provider instance
   * @param {number} chainId - Chain ID
   * @returns {Promise<boolean>}
   */
  async isProviderHealthy(provider, chainId) {
    try {
      const startTime = Date.now();

      // Get block number with timeout
      const blockPromise = provider.getBlockNumber();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), this.config.requestTimeout)
      );

      const blockNumber = await Promise.race([blockPromise, timeoutPromise]);

      const latency = Date.now() - startTime;

      // Check latency
      if (latency > this.config.maxLatency) {
        this.logger.warn(`[RpcManager] High latency: ${latency}ms`);
        return false;
      }

      // Check if we have reference block for staleness check
      const cachedProvider = this.providers.get(chainId);
      if (cachedProvider?.lastBlock) {
        const blockLag = cachedProvider.lastBlock - blockNumber;
        if (blockLag > this.config.maxBlockLag) {
          this.logger.warn(`[RpcManager] Block lag: ${blockLag} blocks behind`);
          return false;
        }
      }

      return true;

    } catch (error) {
      this.logger.warn(`[RpcManager] Health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Update health info for an RPC
   *
   * @param {number} chainId - Chain ID
   * @param {string} url - RPC URL
   * @param {boolean} success - Whether request succeeded
   * @param {Error|null} error - Error if failed
   * @param {number|null} latency - Request latency
   */
  updateHealth(chainId, url, success, error = null, latency = null) {
    const key = `${chainId}:${url}`;
    const health = this.health.get(key) || {
      state: HEALTH_STATE.UNKNOWN,
      latency: null,
      lastCheck: null,
      lastBlock: null,
      errorCount: 0,
      successCount: 0,
    };

    health.lastCheck = Date.now();

    if (success) {
      health.successCount++;
      health.errorCount = Math.max(0, health.errorCount - 1); // Decay errors
      health.latency = latency;

      // Determine state
      if (latency && latency > this.config.maxLatency * 0.8) {
        health.state = HEALTH_STATE.DEGRADED;
      } else {
        health.state = HEALTH_STATE.HEALTHY;
      }
    } else {
      health.errorCount++;
      health.lastError = error?.message;

      // Mark unhealthy after 3 consecutive failures
      if (health.errorCount >= 3) {
        health.state = HEALTH_STATE.UNHEALTHY;
      } else {
        health.state = HEALTH_STATE.DEGRADED;
      }
    }

    this.health.set(key, health);
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.healthCheckHandle) {
      return; // Already running
    }

    const runChecks = async () => {
      for (const [chainId, rpcs] of this.rpcConfigs) {
        for (const rpc of rpcs) {
          try {
            const provider = new ethers.providers.JsonRpcProvider({
              url: rpc.url,
              timeout: this.config.requestTimeout,
            });

            const startTime = Date.now();
            const blockNumber = await provider.getBlockNumber();
            const latency = Date.now() - startTime;

            // Update cached block
            const cached = this.providers.get(chainId);
            if (cached) {
              cached.lastBlock = Math.max(cached.lastBlock || 0, blockNumber);
            }

            this.updateHealth(chainId, rpc.url, true, null, latency);

          } catch (error) {
            this.updateHealth(chainId, rpc.url, false, error);
          }
        }
      }
    };

    // Run immediately
    runChecks();

    // Schedule periodic checks
    this.healthCheckHandle = setInterval(runChecks, this.config.healthCheckInterval);
    this.logger.info('[RpcManager] Health checks started');
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckHandle) {
      clearInterval(this.healthCheckHandle);
      this.healthCheckHandle = null;
      this.logger.info('[RpcManager] Health checks stopped');
    }
  }

  /**
   * Get health status for all RPCs
   *
   * @returns {object}
   */
  getHealthStatus() {
    const status = {};

    for (const [chainId, rpcs] of this.rpcConfigs) {
      status[chainId] = rpcs.map(rpc => {
        const key = `${chainId}:${rpc.url}`;
        const health = this.health.get(key);

        return {
          name: rpc.name,
          priority: rpc.priority,
          state: health?.state || HEALTH_STATE.UNKNOWN,
          latency: health?.latency,
          lastCheck: health?.lastCheck,
          errorCount: health?.errorCount || 0,
          successCount: health?.successCount || 0,
        };
      });
    }

    return status;
  }

  /**
   * Get healthy provider count for a chain
   *
   * @param {number} chainId - Chain ID
   * @returns {number}
   */
  getHealthyCount(chainId) {
    const rpcs = this.rpcConfigs.get(chainId);
    if (!rpcs) return 0;

    return rpcs.filter(rpc => {
      const key = `${chainId}:${rpc.url}`;
      const health = this.health.get(key);
      return health?.state === HEALTH_STATE.HEALTHY;
    }).length;
  }

  /**
   * Check if chain has minimum healthy providers
   *
   * @param {number} chainId - Chain ID
   * @returns {boolean}
   */
  hasMinimumHealthy(chainId) {
    return this.getHealthyCount(chainId) >= this.config.minHealthyProviders;
  }

  /**
   * Get metrics
   *
   * @returns {object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalRequests > 0
        ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : 'N/A',
    };
  }

  /**
   * Force reset health for an RPC
   *
   * @param {number} chainId - Chain ID
   * @param {string} url - RPC URL
   */
  resetHealth(chainId, url) {
    const key = `${chainId}:${url}`;
    this.health.set(key, {
      state: HEALTH_STATE.UNKNOWN,
      latency: null,
      lastCheck: null,
      lastBlock: null,
      errorCount: 0,
      successCount: 0,
    });
  }

  /**
   * Add custom RPC endpoint
   *
   * @param {number} chainId - Chain ID
   * @param {string} url - RPC URL
   * @param {number} priority - Priority (lower = higher priority)
   * @param {string} name - Display name
   */
  addRpc(chainId, url, priority, name) {
    const rpcs = this.rpcConfigs.get(chainId) || [];
    rpcs.push({ url, priority, name });
    rpcs.sort((a, b) => a.priority - b.priority);
    this.rpcConfigs.set(chainId, rpcs);

    // Initialize health
    const key = `${chainId}:${url}`;
    this.health.set(key, {
      state: HEALTH_STATE.UNKNOWN,
      latency: null,
      lastCheck: null,
      lastBlock: null,
      errorCount: 0,
      successCount: 0,
    });

    this.logger.info(`[RpcManager] Added RPC ${name} for chain ${chainId}`);
  }

  /**
   * Clear provider cache
   */
  clearCache() {
    this.providers.clear();
    this.logger.info('[RpcManager] Provider cache cleared');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

RpcManager.HEALTH_STATE = HEALTH_STATE;

module.exports = RpcManager;
