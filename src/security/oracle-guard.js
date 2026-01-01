/**
 * Oracle Guard - Dual Oracle Protection with L2 Sequencer Health
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: Single oracle = single point of failure. Oracle manipulation is
 * a leading attack vector. $200M+ lost to oracle exploits in DeFi history.
 *
 * STATE-OF-THE-ART:
 * - Dual oracle: Chainlink + on-chain TWAP
 * - Deviation threshold: 2% warning, 5% reject
 * - Staleness detection with per-asset heartbeats
 * - L2 sequencer uptime verification (Arbitrum/Optimism)
 *
 * @module security/oracle-guard
 */

const { ethers } = require('ethers');

// Chainlink Aggregator V3 Interface
const CHAINLINK_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
];

// Uniswap V3 Pool for TWAP
const UNISWAP_V3_POOL_ABI = [
  'function observe(uint32[] calldata secondsAgos) view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

// L2 Sequencer Uptime Feed (Chainlink)
const SEQUENCER_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
];

class OracleGuard {
  constructor(config = {}) {
    this.logger = config.logger || console;

    // Deviation thresholds
    this.DEVIATION_WARNING = config.deviationWarning ?? 0.02;  // 2%
    this.DEVIATION_REJECT = config.deviationReject ?? 0.05;   // 5%

    // Staleness thresholds (seconds)
    this.DEFAULT_HEARTBEAT = config.defaultHeartbeat ?? 3600; // 1 hour
    this.ASSET_HEARTBEATS = {
      'ETH/USD': 3600,      // 1 hour
      'BTC/USD': 3600,      // 1 hour
      'USDC/USD': 86400,    // 24 hours (stables update less frequently)
      'USDT/USD': 86400,
      'DAI/USD': 3600,
      ...config.assetHeartbeats,
    };

    // L2 Sequencer grace period after coming back online
    this.SEQUENCER_GRACE_PERIOD = config.sequencerGracePeriod ?? 3600; // 1 hour

    // Chainlink price feed addresses by chain
    this.CHAINLINK_FEEDS = {
      // Mainnet
      1: {
        'ETH/USD': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
        'BTC/USD': '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
        'USDC/USD': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
        'USDT/USD': '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D',
        'DAI/USD': '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
        'LINK/USD': '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c',
      },
      // Arbitrum
      42161: {
        'ETH/USD': '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
        'BTC/USD': '0x6ce185860a4963106506C203335A526995e4e028',
        'USDC/USD': '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
        'USDT/USD': '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7',
        'ARB/USD': '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6',
        'SEQUENCER': '0xFdB631F5EE196F0ed6FAa767959853A9F217697D',
      },
      // Optimism
      10: {
        'ETH/USD': '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
        'BTC/USD': '0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593',
        'USDC/USD': '0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3',
        'OP/USD': '0x0D276FC14719f9292D5C1eA2198673d1f4269246',
        'SEQUENCER': '0x371EAD81c9102C9BF4874A9075FFFf170F2Ee389',
      },
      // Base
      8453: {
        'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
        'USDC/USD': '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
        'SEQUENCER': '0xBCF85224fc0756B9Fa45aA7892530B47e10b6433',
      },
    };

    // TWAP configuration
    this.TWAP_PERIOD = config.twapPeriod ?? 1800; // 30 minutes
  }

  /**
   * Get price from Chainlink oracle with validation
   *
   * @param {string} pair - Price pair (e.g., 'ETH/USD')
   * @param {number} chainId - Chain ID
   * @param {ethers.providers.Provider} provider - Provider instance
   * @returns {Promise<{price: number, decimals: number, updatedAt: number, isStale: boolean, roundId: string}>}
   */
  async getChainlinkPrice(pair, chainId, provider) {
    const feedAddress = this.CHAINLINK_FEEDS[chainId]?.[pair];
    if (!feedAddress) {
      throw new Error(`No Chainlink feed configured for ${pair} on chain ${chainId}`);
    }

    const feed = new ethers.Contract(feedAddress, CHAINLINK_ABI, provider);

    const [roundData, decimals] = await Promise.all([
      feed.latestRoundData(),
      feed.decimals(),
    ]);

    const { roundId, answer, updatedAt, answeredInRound } = roundData;

    // Validate round completeness
    if (answeredInRound.lt(roundId)) {
      throw new Error(`Chainlink round ${roundId} not complete for ${pair}`);
    }

    // Check for stale price
    const heartbeat = this.ASSET_HEARTBEATS[pair] || this.DEFAULT_HEARTBEAT;
    const age = Math.floor(Date.now() / 1000) - updatedAt.toNumber();
    const isStale = age > heartbeat;

    if (isStale) {
      this.logger.warn(
        `[OracleGuard] Stale Chainlink price for ${pair}: ` +
        `${age}s old (heartbeat: ${heartbeat}s)`
      );
    }

    // Validate price is positive
    if (answer.lte(0)) {
      throw new Error(`Invalid Chainlink price for ${pair}: ${answer.toString()}`);
    }

    const price = parseFloat(ethers.utils.formatUnits(answer, decimals));

    return {
      price,
      decimals: decimals,
      updatedAt: updatedAt.toNumber(),
      age,
      isStale,
      roundId: roundId.toString(),
      source: 'chainlink',
    };
  }

  /**
   * Get TWAP price from Uniswap V3 pool
   *
   * @param {string} poolAddress - Uniswap V3 pool address
   * @param {ethers.providers.Provider} provider - Provider instance
   * @param {number} period - TWAP period in seconds
   * @returns {Promise<{price: number, tick: number, period: number}>}
   */
  async getTwapPrice(poolAddress, provider, period = null) {
    const twapPeriod = period || this.TWAP_PERIOD;
    const pool = new ethers.Contract(poolAddress, UNISWAP_V3_POOL_ABI, provider);

    try {
      // Get tick cumulatives for TWAP calculation
      const [tickCumulatives] = await pool.observe([twapPeriod, 0]);

      // Calculate average tick over period
      const tickCumulativesDelta = tickCumulatives[1].sub(tickCumulatives[0]);
      const averageTick = Math.floor(tickCumulativesDelta.toNumber() / twapPeriod);

      // Convert tick to price
      // price = 1.0001^tick
      const price = Math.pow(1.0001, averageTick);

      return {
        price,
        tick: averageTick,
        period: twapPeriod,
        source: 'twap',
      };
    } catch (error) {
      // Pool might not have enough observations
      if (error.message.includes('OLD')) {
        this.logger.warn(`[OracleGuard] TWAP observation too old, falling back to spot`);

        // Fall back to current spot price
        const slot0 = await pool.slot0();
        const currentTick = slot0.tick;
        const price = Math.pow(1.0001, currentTick);

        return {
          price,
          tick: currentTick,
          period: 0, // Indicates spot price
          source: 'spot',
          warning: 'TWAP unavailable, using spot price',
        };
      }
      throw error;
    }
  }

  /**
   * Check L2 sequencer health (Arbitrum/Optimism/Base)
   *
   * @param {number} chainId - Chain ID
   * @param {ethers.providers.Provider} provider - Provider instance
   * @returns {Promise<{isUp: boolean, downtime: number|null, gracePeriodActive: boolean}>}
   */
  async checkSequencerHealth(chainId, provider) {
    const sequencerAddress = this.CHAINLINK_FEEDS[chainId]?.SEQUENCER;

    // Only L2s have sequencer feeds
    if (!sequencerAddress) {
      return { isUp: true, downtime: null, gracePeriodActive: false, isL1: true };
    }

    const sequencerFeed = new ethers.Contract(sequencerAddress, SEQUENCER_ABI, provider);

    const { answer, startedAt } = await sequencerFeed.latestRoundData();

    // answer: 0 = up, 1 = down
    const isUp = answer.toNumber() === 0;
    const startedAtTimestamp = startedAt.toNumber();
    const now = Math.floor(Date.now() / 1000);

    if (!isUp) {
      return {
        isUp: false,
        downtime: null,
        gracePeriodActive: false,
        message: 'Sequencer is down - DO NOT EXECUTE TRADES',
      };
    }

    // Check if within grace period after coming back up
    const timeSinceUp = now - startedAtTimestamp;
    const gracePeriodActive = timeSinceUp < this.SEQUENCER_GRACE_PERIOD;

    if (gracePeriodActive) {
      this.logger.warn(
        `[OracleGuard] Sequencer grace period active: ${timeSinceUp}s since recovery ` +
        `(grace period: ${this.SEQUENCER_GRACE_PERIOD}s)`
      );
    }

    return {
      isUp: true,
      upSince: startedAtTimestamp,
      timeSinceUp,
      gracePeriodActive,
      gracePeriodRemaining: gracePeriodActive ? this.SEQUENCER_GRACE_PERIOD - timeSinceUp : 0,
    };
  }

  /**
   * Get validated price with dual oracle comparison
   *
   * @param {string} pair - Price pair (e.g., 'ETH/USD')
   * @param {number} chainId - Chain ID
   * @param {ethers.providers.Provider} provider - Provider instance
   * @param {string|null} twapPoolAddress - Optional TWAP pool address
   * @returns {Promise<{price: number, confidence: string, sources: object, warnings: string[]}>}
   */
  async getValidatedPrice(pair, chainId, provider, twapPoolAddress = null) {
    const warnings = [];
    const sources = {};

    // Check L2 sequencer first
    const sequencerHealth = await this.checkSequencerHealth(chainId, provider);
    if (!sequencerHealth.isUp) {
      throw new Error('L2 sequencer is down - cannot get reliable price');
    }
    if (sequencerHealth.gracePeriodActive) {
      warnings.push(
        `Sequencer recently recovered (${sequencerHealth.timeSinceUp}s ago). ` +
        `Prices may be volatile.`
      );
    }

    // Get Chainlink price
    let chainlinkResult;
    try {
      chainlinkResult = await this.getChainlinkPrice(pair, chainId, provider);
      sources.chainlink = chainlinkResult;

      if (chainlinkResult.isStale) {
        warnings.push(`Chainlink price is stale (${chainlinkResult.age}s old)`);
      }
    } catch (error) {
      warnings.push(`Chainlink oracle failed: ${error.message}`);
    }

    // Get TWAP price if pool provided
    let twapResult;
    if (twapPoolAddress) {
      try {
        twapResult = await this.getTwapPrice(twapPoolAddress, provider);
        sources.twap = twapResult;

        if (twapResult.warning) {
          warnings.push(twapResult.warning);
        }
      } catch (error) {
        warnings.push(`TWAP oracle failed: ${error.message}`);
      }
    }

    // Determine final price and confidence
    let finalPrice;
    let confidence;

    if (chainlinkResult && twapResult) {
      // Compare oracles
      const deviation = Math.abs(chainlinkResult.price - twapResult.price) / chainlinkResult.price;

      if (deviation > this.DEVIATION_REJECT) {
        throw new Error(
          `Oracle deviation too high: ${(deviation * 100).toFixed(2)}% ` +
          `(Chainlink: ${chainlinkResult.price.toFixed(4)}, TWAP: ${twapResult.price.toFixed(4)}). ` +
          `Max allowed: ${(this.DEVIATION_REJECT * 100).toFixed(2)}%`
        );
      }

      if (deviation > this.DEVIATION_WARNING) {
        warnings.push(
          `Oracle deviation: ${(deviation * 100).toFixed(2)}% ` +
          `(warning threshold: ${(this.DEVIATION_WARNING * 100).toFixed(2)}%)`
        );
      }

      // Use Chainlink as primary (more reliable), TWAP as validation
      finalPrice = chainlinkResult.price;
      confidence = chainlinkResult.isStale ? 'medium' : 'high';

    } else if (chainlinkResult) {
      // Chainlink only
      finalPrice = chainlinkResult.price;
      confidence = chainlinkResult.isStale ? 'low' : 'medium';
      warnings.push('Single oracle mode (no TWAP validation)');

    } else if (twapResult) {
      // TWAP only (rare fallback)
      finalPrice = twapResult.price;
      confidence = 'low';
      warnings.push('TWAP-only mode (Chainlink unavailable)');

    } else {
      throw new Error('All oracles failed - cannot determine price');
    }

    return {
      price: finalPrice,
      confidence,
      sources,
      warnings,
      sequencerHealth,
    };
  }

  /**
   * Validate a price quote before execution
   *
   * @param {number} quotedPrice - Price from DEX quote
   * @param {string} pair - Price pair
   * @param {number} chainId - Chain ID
   * @param {ethers.providers.Provider} provider - Provider instance
   * @param {object} options - Additional options
   * @returns {Promise<{valid: boolean, deviation: number, oraclePrice: number, warnings: string[]}>}
   */
  async validateQuote(quotedPrice, pair, chainId, provider, options = {}) {
    const warnings = [];

    try {
      const oracleResult = await this.getValidatedPrice(
        pair,
        chainId,
        provider,
        options.twapPoolAddress
      );

      warnings.push(...oracleResult.warnings);

      const deviation = Math.abs(quotedPrice - oracleResult.price) / oracleResult.price;

      // Check deviation
      if (deviation > this.DEVIATION_REJECT) {
        return {
          valid: false,
          deviation,
          oraclePrice: oracleResult.price,
          quotedPrice,
          warnings,
          reason: `Quote deviates ${(deviation * 100).toFixed(2)}% from oracle (max: ${(this.DEVIATION_REJECT * 100).toFixed(2)}%)`,
        };
      }

      if (deviation > this.DEVIATION_WARNING) {
        warnings.push(
          `Quote deviates ${(deviation * 100).toFixed(2)}% from oracle - proceed with caution`
        );
      }

      return {
        valid: true,
        deviation,
        oraclePrice: oracleResult.price,
        quotedPrice,
        confidence: oracleResult.confidence,
        warnings,
      };

    } catch (error) {
      // Oracle failure - decide based on strictness
      if (options.requireOracle) {
        return {
          valid: false,
          deviation: null,
          oraclePrice: null,
          quotedPrice,
          warnings: [...warnings, error.message],
          reason: `Oracle validation failed: ${error.message}`,
        };
      }

      // Non-strict mode: allow with warning
      warnings.push(`Oracle unavailable: ${error.message}`);
      return {
        valid: true,
        deviation: null,
        oraclePrice: null,
        quotedPrice,
        warnings,
        bypassedValidation: true,
      };
    }
  }

  /**
   * Add custom Chainlink feed address
   *
   * @param {number} chainId - Chain ID
   * @param {string} pair - Price pair
   * @param {string} address - Feed address
   */
  addChainlinkFeed(chainId, pair, address) {
    if (!this.CHAINLINK_FEEDS[chainId]) {
      this.CHAINLINK_FEEDS[chainId] = {};
    }
    this.CHAINLINK_FEEDS[chainId][pair] = address;
    this.logger.info(`[OracleGuard] Added Chainlink feed: ${pair} on chain ${chainId}`);
  }

  /**
   * Set custom heartbeat for an asset
   *
   * @param {string} pair - Price pair
   * @param {number} heartbeat - Heartbeat in seconds
   */
  setAssetHeartbeat(pair, heartbeat) {
    this.ASSET_HEARTBEATS[pair] = heartbeat;
    this.logger.info(`[OracleGuard] Set heartbeat for ${pair}: ${heartbeat}s`);
  }

  /**
   * Get all supported pairs for a chain
   *
   * @param {number} chainId - Chain ID
   * @returns {string[]} Array of supported pairs
   */
  getSupportedPairs(chainId) {
    const feeds = this.CHAINLINK_FEEDS[chainId];
    if (!feeds) return [];
    return Object.keys(feeds).filter(key => key !== 'SEQUENCER');
  }

  /**
   * Check if chain is L2 with sequencer feed
   *
   * @param {number} chainId - Chain ID
   * @returns {boolean}
   */
  isL2WithSequencer(chainId) {
    return !!this.CHAINLINK_FEEDS[chainId]?.SEQUENCER;
  }
}

module.exports = OracleGuard;
