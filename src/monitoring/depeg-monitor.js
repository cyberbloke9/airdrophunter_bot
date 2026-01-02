/**
 * Stablecoin Depeg Monitor
 *
 * Monitors stablecoin prices for depegging events and triggers alerts/actions.
 * Learned from UST collapse (100% depeg) and USDC depeg (12% in March 2023).
 *
 * Features:
 * - Multi-source price monitoring (Chainlink, CoinGecko, DEX pools)
 * - Tiered alert thresholds (2% warning, 5% critical)
 * - Automatic operation pause on critical depeg
 * - Portfolio exposure tracking and diversification
 *
 * @module monitoring/depeg-monitor
 */

const { EventEmitter } = require('events');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Stablecoin risk tiers
 */
const STABLE_TIER = {
  SAFEST: 'safest',
  MODERATE: 'moderate',
  RISKY: 'risky',
  ALGORITHMIC: 'algorithmic',
  UNKNOWN: 'unknown',
};

/**
 * Known stablecoins with risk classifications
 */
const KNOWN_STABLES = {
  // Safest - fully backed, multiple audits, long track record
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    tier: STABLE_TIER.SAFEST,
    issuer: 'Circle',
    backing: 'fiat',
    pegTarget: 1.0,
    addresses: {
      1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
    chainlinkFeeds: {
      1: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
      137: '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
    },
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether',
    tier: STABLE_TIER.SAFEST,
    issuer: 'Tether',
    backing: 'fiat',
    pegTarget: 1.0,
    addresses: {
      1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      10: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    },
    chainlinkFeeds: {
      1: '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D',
    },
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    tier: STABLE_TIER.SAFEST,
    issuer: 'MakerDAO',
    backing: 'crypto-collateralized',
    pegTarget: 1.0,
    addresses: {
      1: '0x6B175474E89094C44Da98b954EesigndC5038D',
      137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    },
    chainlinkFeeds: {
      1: '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
    },
  },

  // Moderate - solid but less established or more complex backing
  FRAX: {
    symbol: 'FRAX',
    name: 'Frax',
    tier: STABLE_TIER.MODERATE,
    issuer: 'Frax Finance',
    backing: 'hybrid',
    pegTarget: 1.0,
    addresses: {
      1: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
      137: '0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89',
      42161: '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
    },
    chainlinkFeeds: {
      1: '0xB9E1E3A9fEFF48998E45Fa90847ed4D467E8BcfD',
    },
  },
  LUSD: {
    symbol: 'LUSD',
    name: 'Liquity USD',
    tier: STABLE_TIER.MODERATE,
    issuer: 'Liquity',
    backing: 'crypto-collateralized',
    pegTarget: 1.0,
    addresses: {
      1: '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',
    },
    chainlinkFeeds: {
      1: '0x3D7aE7E594f2f2091Ad8798313450130d0Aba3a0',
    },
  },
  crvUSD: {
    symbol: 'crvUSD',
    name: 'Curve USD',
    tier: STABLE_TIER.MODERATE,
    issuer: 'Curve Finance',
    backing: 'crypto-collateralized',
    pegTarget: 1.0,
    addresses: {
      1: '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E',
    },
  },
  GHO: {
    symbol: 'GHO',
    name: 'Aave GHO',
    tier: STABLE_TIER.MODERATE,
    issuer: 'Aave',
    backing: 'crypto-collateralized',
    pegTarget: 1.0,
    addresses: {
      1: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
    },
  },

  // Risky - newer or less battle-tested
  USDP: {
    symbol: 'USDP',
    name: 'Pax Dollar',
    tier: STABLE_TIER.RISKY,
    issuer: 'Paxos',
    backing: 'fiat',
    pegTarget: 1.0,
    addresses: {
      1: '0x8E870D67F660D95d5be530380D0eC0bd388289E1',
    },
  },
  TUSD: {
    symbol: 'TUSD',
    name: 'TrueUSD',
    tier: STABLE_TIER.RISKY,
    issuer: 'TrustToken',
    backing: 'fiat',
    pegTarget: 1.0,
    addresses: {
      1: '0x0000000000085d4780B73119b644AE5ecd22b376',
    },
  },

  // Algorithmic - AVOID (learned from UST collapse)
  USTC: {
    symbol: 'USTC',
    name: 'TerraClassicUSD',
    tier: STABLE_TIER.ALGORITHMIC,
    issuer: 'Terra',
    backing: 'algorithmic',
    pegTarget: 1.0,
    warning: 'COLLAPSED - DO NOT USE',
    addresses: {},
  },
};

/**
 * Monitoring thresholds
 */
const THRESHOLDS = {
  // Alert thresholds (percentage from peg)
  alertThreshold: 0.02, // 2% - trigger warning alert
  criticalThreshold: 0.05, // 5% - trigger critical alert, pause operations
  emergencyThreshold: 0.10, // 10% - emergency protocol

  // Timing
  checkInterval: 60000, // 1 minute
  minCheckInterval: 10000, // 10 seconds (for critical monitoring)
  alertCooldown: 300000, // 5 minutes between repeated alerts

  // Price source requirements
  minSourcesForValidity: 2, // Need at least 2 sources agreeing
  maxSourceDeviation: 0.01, // 1% max deviation between sources
};

/**
 * Diversification limits
 */
const DIVERSIFICATION_LIMITS = {
  maxSingleStableExposure: 0.50, // 50% max in any single stablecoin
  maxTierExposure: {
    [STABLE_TIER.SAFEST]: 1.0, // 100% allowed
    [STABLE_TIER.MODERATE]: 0.30, // 30% max
    [STABLE_TIER.RISKY]: 0.10, // 10% max
    [STABLE_TIER.ALGORITHMIC]: 0.0, // 0% - never use
    [STABLE_TIER.UNKNOWN]: 0.05, // 5% max
  },
  recommendedMix: {
    [STABLE_TIER.SAFEST]: 0.70, // 70% in safest
    [STABLE_TIER.MODERATE]: 0.25, // 25% in moderate
    [STABLE_TIER.RISKY]: 0.05, // 5% in risky
  },
};

/**
 * Price source types
 */
const PRICE_SOURCE = {
  CHAINLINK: 'chainlink',
  COINGECKO: 'coingecko',
  DEX_POOL: 'dex_pool',
  CUSTOM: 'custom',
};

/**
 * Alert severity levels
 */
const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
  EMERGENCY: 'emergency',
};

// =============================================================================
// PRICE SOURCE ADAPTERS
// =============================================================================

/**
 * Base price source adapter
 */
class PriceSourceAdapter {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.lastFetch = null;
    this.lastPrice = null;
    this.errorCount = 0;
  }

  async fetchPrice(stable) {
    throw new Error('fetchPrice must be implemented by subclass');
  }

  getStatus() {
    return {
      name: this.name,
      lastFetch: this.lastFetch,
      lastPrice: this.lastPrice,
      errorCount: this.errorCount,
      healthy: this.errorCount < 3,
    };
  }
}

/**
 * Chainlink price feed adapter
 */
class ChainlinkAdapter extends PriceSourceAdapter {
  constructor(config = {}) {
    super(PRICE_SOURCE.CHAINLINK, config);
    this.provider = config.provider;
  }

  async fetchPrice(stable) {
    const stableConfig = KNOWN_STABLES[stable.symbol];
    if (!stableConfig?.chainlinkFeeds) {
      return null;
    }

    const chainId = this.config.chainId || 1;
    const feedAddress = stableConfig.chainlinkFeeds[chainId];

    if (!feedAddress) {
      return null;
    }

    try {
      // In production, would call Chainlink aggregator
      // const aggregator = new ethers.Contract(feedAddress, AGGREGATOR_ABI, this.provider);
      // const latestRound = await aggregator.latestRoundData();
      // const decimals = await aggregator.decimals();
      // return Number(latestRound.answer) / (10 ** decimals);

      // Simulated response for testing
      this.lastFetch = Date.now();
      this.lastPrice = 1.0 + (Math.random() - 0.5) * 0.002; // Simulate small variance
      this.errorCount = 0;
      return this.lastPrice;
    } catch (error) {
      this.errorCount++;
      throw error;
    }
  }
}

/**
 * CoinGecko API adapter
 */
class CoinGeckoAdapter extends PriceSourceAdapter {
  constructor(config = {}) {
    super(PRICE_SOURCE.COINGECKO, config);
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.coingecko.com/api/v3';

    // CoinGecko ID mapping
    this.idMapping = {
      USDC: 'usd-coin',
      USDT: 'tether',
      DAI: 'dai',
      FRAX: 'frax',
      LUSD: 'liquity-usd',
      crvUSD: 'crvusd',
      GHO: 'gho',
      USDP: 'paxos-standard',
      TUSD: 'true-usd',
    };
  }

  async fetchPrice(stable) {
    const coinId = this.idMapping[stable.symbol];
    if (!coinId) {
      return null;
    }

    try {
      // In production, would fetch from CoinGecko API
      // const response = await fetch(`${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd`);
      // const data = await response.json();
      // return data[coinId].usd;

      // Simulated response for testing
      this.lastFetch = Date.now();
      this.lastPrice = 1.0 + (Math.random() - 0.5) * 0.003;
      this.errorCount = 0;
      return this.lastPrice;
    } catch (error) {
      this.errorCount++;
      throw error;
    }
  }
}

/**
 * DEX pool price adapter (using Uniswap V3 TWAP)
 */
class DEXPoolAdapter extends PriceSourceAdapter {
  constructor(config = {}) {
    super(PRICE_SOURCE.DEX_POOL, config);
    this.provider = config.provider;
    this.twapInterval = config.twapInterval || 1800; // 30 minutes default
  }

  async fetchPrice(stable) {
    try {
      // In production, would fetch TWAP from Uniswap V3 pool
      // const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
      // const observations = await pool.observe([this.twapInterval, 0]);
      // Calculate TWAP from tick cumulatives

      // Simulated response for testing
      this.lastFetch = Date.now();
      this.lastPrice = 1.0 + (Math.random() - 0.5) * 0.004;
      this.errorCount = 0;
      return this.lastPrice;
    } catch (error) {
      this.errorCount++;
      throw error;
    }
  }
}

// =============================================================================
// DEPEG EVENT
// =============================================================================

/**
 * Represents a depeg event
 */
class DepegEvent {
  constructor(stable, data) {
    this.id = `depeg_${stable.symbol}_${Date.now()}`;
    this.symbol = stable.symbol;
    this.detectedAt = Date.now();
    this.price = data.price;
    this.pegTarget = stable.pegTarget || 1.0;
    this.deviation = data.deviation;
    this.deviationPercent = data.deviationPercent;
    this.severity = data.severity;
    this.sources = data.sources;
    this.resolved = false;
    this.resolvedAt = null;
    this.peakDeviation = data.deviation;
    this.duration = 0;
    this.actions = [];
  }

  update(price, deviation) {
    this.price = price;
    this.deviation = deviation;
    this.deviationPercent = Math.abs(deviation) * 100;

    if (Math.abs(deviation) > this.peakDeviation) {
      this.peakDeviation = Math.abs(deviation);
    }

    this.duration = Date.now() - this.detectedAt;
  }

  resolve() {
    this.resolved = true;
    this.resolvedAt = Date.now();
    this.duration = this.resolvedAt - this.detectedAt;
  }

  addAction(action) {
    this.actions.push({
      ...action,
      timestamp: Date.now(),
    });
  }

  toJSON() {
    return {
      id: this.id,
      symbol: this.symbol,
      detectedAt: this.detectedAt,
      price: this.price,
      pegTarget: this.pegTarget,
      deviationPercent: this.deviationPercent,
      severity: this.severity,
      resolved: this.resolved,
      resolvedAt: this.resolvedAt,
      peakDeviation: this.peakDeviation,
      duration: this.duration,
      actionsCount: this.actions.length,
    };
  }
}

// =============================================================================
// DEPEG MONITOR
// =============================================================================

/**
 * Main depeg monitoring class
 */
class DepegMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      checkInterval: options.checkInterval || THRESHOLDS.checkInterval,
      alertThreshold: options.alertThreshold || THRESHOLDS.alertThreshold,
      criticalThreshold: options.criticalThreshold || THRESHOLDS.criticalThreshold,
      emergencyThreshold: options.emergencyThreshold || THRESHOLDS.emergencyThreshold,
      autoSwapOnDepeg: options.autoSwapOnDepeg || false, // Default false - too risky
      pauseOnCritical: options.pauseOnCritical !== false,
      alertCooldown: options.alertCooldown || THRESHOLDS.alertCooldown,
    };

    // Price sources
    this.priceSources = new Map();
    this.setupDefaultSources(options);

    // Monitoring state
    this.monitoredStables = new Map();
    this.latestPrices = new Map();
    this.activeEvents = new Map();
    this.eventHistory = [];
    this.lastAlerts = new Map();

    // System state
    this.running = false;
    this.paused = false;
    this.intervalId = null;

    // Statistics
    this.stats = {
      checksPerformed: 0,
      alertsTriggered: 0,
      eventsDetected: 0,
      eventsResolved: 0,
      operationsPaused: 0,
      lastCheck: null,
    };
  }

  /**
   * Setup default price sources
   * @private
   */
  setupDefaultSources(options) {
    this.priceSources.set(PRICE_SOURCE.CHAINLINK, new ChainlinkAdapter({
      provider: options.provider,
      chainId: options.chainId || 1,
    }));

    this.priceSources.set(PRICE_SOURCE.COINGECKO, new CoinGeckoAdapter({
      apiKey: options.coingeckoApiKey,
    }));

    this.priceSources.set(PRICE_SOURCE.DEX_POOL, new DEXPoolAdapter({
      provider: options.provider,
      twapInterval: options.twapInterval,
    }));
  }

  /**
   * Add a stablecoin to monitor
   * @param {string} symbol - Stablecoin symbol
   * @param {Object} config - Optional custom configuration
   */
  addStable(symbol, config = {}) {
    const knownConfig = KNOWN_STABLES[symbol];

    if (!knownConfig && !config.address) {
      throw new Error(`Unknown stablecoin ${symbol} - provide configuration`);
    }

    const stableConfig = {
      symbol,
      ...knownConfig,
      ...config,
      tier: config.tier || knownConfig?.tier || STABLE_TIER.UNKNOWN,
      pegTarget: config.pegTarget || knownConfig?.pegTarget || 1.0,
    };

    // Warn about algorithmic stables
    if (stableConfig.tier === STABLE_TIER.ALGORITHMIC) {
      this.emit('warning', {
        type: 'algorithmic_stable',
        symbol,
        message: 'Algorithmic stablecoins are extremely high risk. Avoid usage.',
      });
    }

    this.monitoredStables.set(symbol, stableConfig);

    return stableConfig;
  }

  /**
   * Remove a stablecoin from monitoring
   * @param {string} symbol - Stablecoin symbol
   */
  removeStable(symbol) {
    this.monitoredStables.delete(symbol);
    this.latestPrices.delete(symbol);

    // Resolve any active events
    const event = this.activeEvents.get(symbol);
    if (event) {
      event.resolve();
      this.eventHistory.push(event);
      this.activeEvents.delete(symbol);
    }
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.paused = false;

    // Initial check
    this.checkAll();

    // Setup interval
    this.intervalId = setInterval(() => {
      if (!this.paused) {
        this.checkAll();
      }
    }, this.config.checkInterval);

    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.emit('stopped');
  }

  /**
   * Pause monitoring (keep running but skip checks)
   */
  pause() {
    this.paused = true;
    this.emit('paused');
  }

  /**
   * Resume monitoring
   */
  resume() {
    this.paused = false;
    this.emit('resumed');
  }

  /**
   * Check all monitored stablecoins
   */
  async checkAll() {
    const results = [];

    for (const [symbol, config] of this.monitoredStables) {
      try {
        const result = await this.checkStable(symbol, config);
        results.push(result);
      } catch (error) {
        this.emit('error', {
          type: 'check_failed',
          symbol,
          error: error.message,
        });
      }
    }

    this.stats.checksPerformed++;
    this.stats.lastCheck = Date.now();

    return results;
  }

  /**
   * Check a single stablecoin
   * @param {string} symbol - Stablecoin symbol
   * @param {Object} config - Stable configuration
   */
  async checkStable(symbol, config) {
    // Fetch prices from all sources
    const prices = await this.fetchPrices(config);

    if (prices.length === 0) {
      throw new Error(`No price sources available for ${symbol}`);
    }

    // Calculate consensus price
    const consensusPrice = this.calculateConsensusPrice(prices);
    const pegTarget = config.pegTarget || 1.0;
    const deviation = (consensusPrice - pegTarget) / pegTarget;
    const absDeviation = Math.abs(deviation);

    // Store latest price
    this.latestPrices.set(symbol, {
      price: consensusPrice,
      deviation,
      deviationPercent: absDeviation * 100,
      sources: prices,
      timestamp: Date.now(),
    });

    // Determine severity
    const severity = this.determineSeverity(absDeviation);

    // Handle depeg event
    if (severity !== ALERT_SEVERITY.INFO) {
      await this.handleDepeg(symbol, config, {
        price: consensusPrice,
        deviation,
        deviationPercent: absDeviation * 100,
        severity,
        sources: prices,
      });
    } else {
      // Check if we need to resolve an active event
      await this.checkResolve(symbol);
    }

    return {
      symbol,
      price: consensusPrice,
      pegTarget,
      deviation,
      deviationPercent: absDeviation * 100,
      severity,
      healthy: severity === ALERT_SEVERITY.INFO,
    };
  }

  /**
   * Fetch prices from all sources
   * @private
   */
  async fetchPrices(stable) {
    const prices = [];

    for (const [sourceType, adapter] of this.priceSources) {
      try {
        const price = await adapter.fetchPrice(stable);
        if (price !== null) {
          prices.push({
            source: sourceType,
            price,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        // Continue with other sources
      }
    }

    return prices;
  }

  /**
   * Calculate consensus price from multiple sources
   * @private
   */
  calculateConsensusPrice(prices) {
    if (prices.length === 0) {
      throw new Error('No prices available');
    }

    if (prices.length === 1) {
      return prices[0].price;
    }

    // Check for outliers
    const priceValues = prices.map(p => p.price);
    const median = this.calculateMedian(priceValues);

    // Filter out prices that deviate too much from median
    const validPrices = prices.filter(p =>
      Math.abs(p.price - median) / median <= THRESHOLDS.maxSourceDeviation
    );

    if (validPrices.length < THRESHOLDS.minSourcesForValidity) {
      // Not enough agreeing sources - use median of all
      return median;
    }

    // Return average of valid prices
    return validPrices.reduce((sum, p) => sum + p.price, 0) / validPrices.length;
  }

  /**
   * Calculate median of array
   * @private
   */
  calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Determine severity from deviation
   * @private
   */
  determineSeverity(absDeviation) {
    if (absDeviation >= this.config.emergencyThreshold) {
      return ALERT_SEVERITY.EMERGENCY;
    }
    if (absDeviation >= this.config.criticalThreshold) {
      return ALERT_SEVERITY.CRITICAL;
    }
    if (absDeviation >= this.config.alertThreshold) {
      return ALERT_SEVERITY.WARNING;
    }
    return ALERT_SEVERITY.INFO;
  }

  /**
   * Handle a depeg event
   * @private
   */
  async handleDepeg(symbol, config, data) {
    // Check for existing event
    let event = this.activeEvents.get(symbol);

    if (event) {
      // Update existing event
      event.update(data.price, data.deviation);

      // Check if severity increased
      if (this.severityOrder(data.severity) > this.severityOrder(event.severity)) {
        event.severity = data.severity;
        await this.triggerAlert(event, 'escalated');
      }
    } else {
      // Create new event
      event = new DepegEvent(config, data);
      this.activeEvents.set(symbol, event);
      this.stats.eventsDetected++;

      await this.triggerAlert(event, 'detected');
    }

    // Take action based on severity
    if (data.severity === ALERT_SEVERITY.CRITICAL || data.severity === ALERT_SEVERITY.EMERGENCY) {
      await this.handleCriticalDepeg(event);
    }

    return event;
  }

  /**
   * Handle critical/emergency depeg
   * @private
   */
  async handleCriticalDepeg(event) {
    // Pause operations if configured
    if (this.config.pauseOnCritical) {
      this.stats.operationsPaused++;
      event.addAction({
        type: 'operations_paused',
        reason: `${event.severity} depeg detected`,
      });

      this.emit('operationsPaused', {
        symbol: event.symbol,
        severity: event.severity,
        deviation: event.deviationPercent,
      });
    }

    // Auto-swap is disabled by default - too risky during depeg
    // This learned from UST collapse where selling accelerated the depeg
    if (this.config.autoSwapOnDepeg) {
      // Would implement swap logic here
      // NOT RECOMMENDED
    }

    // Emit emergency event
    this.emit('criticalDepeg', event.toJSON());
  }

  /**
   * Check if active event should be resolved
   * @private
   */
  async checkResolve(symbol) {
    const event = this.activeEvents.get(symbol);
    if (!event) {
      return;
    }

    const latestPrice = this.latestPrices.get(symbol);
    if (!latestPrice) {
      return;
    }

    const absDeviation = Math.abs(latestPrice.deviation);

    // Resolve if back within normal range
    if (absDeviation < this.config.alertThreshold) {
      event.resolve();
      this.activeEvents.delete(symbol);
      this.eventHistory.push(event);
      this.stats.eventsResolved++;

      this.emit('depegResolved', event.toJSON());

      // Resume operations if paused
      if (this.config.pauseOnCritical) {
        this.emit('operationsResumed', { symbol: event.symbol });
      }
    }
  }

  /**
   * Trigger an alert
   * @private
   */
  async triggerAlert(event, type) {
    const alertKey = `${event.symbol}_${event.severity}`;
    const lastAlert = this.lastAlerts.get(alertKey);

    // Check cooldown
    if (lastAlert && Date.now() - lastAlert < this.config.alertCooldown) {
      return;
    }

    this.lastAlerts.set(alertKey, Date.now());
    this.stats.alertsTriggered++;

    const alert = {
      type,
      event: event.toJSON(),
      timestamp: Date.now(),
    };

    this.emit('alert', alert);

    // Emit severity-specific event
    this.emit(`alert:${event.severity}`, alert);
  }

  /**
   * Get severity order for comparison
   * @private
   */
  severityOrder(severity) {
    const order = {
      [ALERT_SEVERITY.INFO]: 0,
      [ALERT_SEVERITY.WARNING]: 1,
      [ALERT_SEVERITY.CRITICAL]: 2,
      [ALERT_SEVERITY.EMERGENCY]: 3,
    };
    return order[severity] || 0;
  }

  /**
   * Add a custom price source
   * @param {string} name - Source name
   * @param {PriceSourceAdapter} adapter - Price source adapter
   */
  addPriceSource(name, adapter) {
    this.priceSources.set(name, adapter);
  }

  /**
   * Remove a price source
   * @param {string} name - Source name
   */
  removePriceSource(name) {
    this.priceSources.delete(name);
  }

  /**
   * Check portfolio exposure to stablecoins
   * @param {Object} holdings - Map of symbol to amount
   */
  checkExposure(holdings) {
    const totalValue = Object.values(holdings).reduce((sum, v) => sum + v, 0);
    const warnings = [];
    const tierExposure = {};

    for (const [symbol, value] of Object.entries(holdings)) {
      const config = this.monitoredStables.get(symbol) || KNOWN_STABLES[symbol];
      if (!config) continue;

      const exposure = value / totalValue;
      const tier = config.tier || STABLE_TIER.UNKNOWN;

      // Check single stable exposure
      if (exposure > DIVERSIFICATION_LIMITS.maxSingleStableExposure) {
        warnings.push({
          type: 'single_exposure',
          symbol,
          exposure: exposure * 100,
          limit: DIVERSIFICATION_LIMITS.maxSingleStableExposure * 100,
          message: `${symbol} exposure (${(exposure * 100).toFixed(1)}%) exceeds recommended limit`,
        });
      }

      // Track tier exposure
      tierExposure[tier] = (tierExposure[tier] || 0) + exposure;
    }

    // Check tier exposure limits
    for (const [tier, exposure] of Object.entries(tierExposure)) {
      const limit = DIVERSIFICATION_LIMITS.maxTierExposure[tier];
      if (exposure > limit) {
        warnings.push({
          type: 'tier_exposure',
          tier,
          exposure: exposure * 100,
          limit: limit * 100,
          message: `${tier} tier exposure (${(exposure * 100).toFixed(1)}%) exceeds limit`,
        });
      }
    }

    return {
      totalValue,
      tierExposure,
      warnings,
      healthy: warnings.length === 0,
      diversified: Object.keys(tierExposure).length > 1,
    };
  }

  /**
   * Get current price for a stablecoin
   * @param {string} symbol - Stablecoin symbol
   */
  getPrice(symbol) {
    return this.latestPrices.get(symbol);
  }

  /**
   * Get all active depeg events
   */
  getActiveEvents() {
    return Array.from(this.activeEvents.values()).map(e => e.toJSON());
  }

  /**
   * Get event history
   * @param {Object} options - Filter options
   */
  getEventHistory(options = {}) {
    let events = [...this.eventHistory];

    if (options.symbol) {
      events = events.filter(e => e.symbol === options.symbol);
    }

    if (options.severity) {
      events = events.filter(e => e.severity === options.severity);
    }

    if (options.limit) {
      events = events.slice(-options.limit);
    }

    return events.map(e => e.toJSON());
  }

  /**
   * Get stablecoin information
   * @param {string} symbol - Stablecoin symbol
   */
  getStableInfo(symbol) {
    const config = this.monitoredStables.get(symbol) || KNOWN_STABLES[symbol];
    if (!config) {
      return null;
    }

    const latestPrice = this.latestPrices.get(symbol);
    const activeEvent = this.activeEvents.get(symbol);

    return {
      ...config,
      price: latestPrice?.price,
      deviation: latestPrice?.deviation,
      deviationPercent: latestPrice?.deviationPercent,
      lastUpdate: latestPrice?.timestamp,
      hasActiveEvent: !!activeEvent,
      eventSeverity: activeEvent?.severity,
    };
  }

  /**
   * Get all known stablecoins
   */
  getKnownStables() {
    return { ...KNOWN_STABLES };
  }

  /**
   * Get monitor statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      running: this.running,
      paused: this.paused,
      monitoredCount: this.monitoredStables.size,
      activeEventsCount: this.activeEvents.size,
      priceSources: Array.from(this.priceSources.values()).map(s => s.getStatus()),
    };
  }

  /**
   * Get monitor status
   */
  getStatus() {
    const activeEvents = this.getActiveEvents();
    const hasEmergency = activeEvents.some(e => e.severity === ALERT_SEVERITY.EMERGENCY);
    const hasCritical = activeEvents.some(e => e.severity === ALERT_SEVERITY.CRITICAL);

    return {
      running: this.running,
      paused: this.paused,
      healthy: !hasEmergency && !hasCritical,
      monitoredStables: Array.from(this.monitoredStables.keys()),
      activeEvents: activeEvents.length,
      severity: hasEmergency ? ALERT_SEVERITY.EMERGENCY :
        hasCritical ? ALERT_SEVERITY.CRITICAL :
          activeEvents.length > 0 ? ALERT_SEVERITY.WARNING :
            ALERT_SEVERITY.INFO,
      stats: this.getStatistics(),
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a depeg monitor instance
 * @param {Object} options - Configuration options
 */
function createDepegMonitor(options = {}) {
  const monitor = new DepegMonitor(options);

  // Add default stables to monitor
  if (options.defaultStables !== false) {
    const defaultStables = options.defaultStables || ['USDC', 'USDT', 'DAI'];
    for (const symbol of defaultStables) {
      if (KNOWN_STABLES[symbol]) {
        monitor.addStable(symbol);
      }
    }
  }

  return monitor;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Main class
  DepegMonitor,
  createDepegMonitor,

  // Adapters
  PriceSourceAdapter,
  ChainlinkAdapter,
  CoinGeckoAdapter,
  DEXPoolAdapter,

  // Event class
  DepegEvent,

  // Constants
  KNOWN_STABLES,
  STABLE_TIER,
  THRESHOLDS,
  DIVERSIFICATION_LIMITS,
  PRICE_SOURCE,
  ALERT_SEVERITY,
};
