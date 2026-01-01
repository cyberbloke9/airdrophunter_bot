/**
 * Slippage Guard - Tiered Slippage Protection with Hard Ceiling
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: Slippage tolerance = maximum extractable by MEV bots.
 * 3% max means worst case you lose 3%, not 20% or 50%.
 *
 * STATE-OF-THE-ART:
 * - Tiered by token class (stables vs volatile)
 * - Dynamic adjustment based on liquidity depth
 * - Hard ceiling that cannot be overridden
 *
 * @module security/slippage-guard
 */

const { ethers } = require('ethers');

class SlippageGuard {
  constructor(config = {}) {
    // Token classifications
    this.STABLECOINS = [
      'USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'TUSD', 'BUSD',
      'GUSD', 'USDP', 'SUSD', 'MIM', 'DOLA', 'CRVUSD'
    ];

    this.MAJOR_TOKENS = [
      'ETH', 'WETH', 'BTC', 'WBTC', 'UNI', 'AAVE', 'LINK',
      'CRV', 'LDO', 'ARB', 'OP', 'MATIC', 'MKR', 'SNX',
      'COMP', 'SUSHI', 'YFI', 'RPL', 'GMX', 'PENDLE'
    ];

    // Slippage tiers (in decimal: 0.005 = 0.5%)
    this.TIERS = {
      stablecoin: {
        default: config.stablecoinDefault ?? 0.001,  // 0.1% default
        max: config.stablecoinMax ?? 0.005           // 0.5% max
      },
      major: {
        default: config.majorDefault ?? 0.005,       // 0.5% default
        max: config.majorMax ?? 0.01                 // 1% max
      },
      volatile: {
        default: config.volatileDefault ?? 0.01,     // 1% default
        max: config.volatileMax ?? 0.03              // 3% max
      },
    };

    // HARD CEILING - absolutely never exceeded, cannot be overridden
    this.ABSOLUTE_MAX = 0.03; // 3%

    // Price impact thresholds
    this.IMPACT_WARNING = config.impactWarning ?? 0.01;   // Warn at 1% impact
    this.IMPACT_REJECT = config.impactReject ?? 0.05;    // Reject at 5% impact

    // Logging
    this.logger = config.logger || console;
  }

  /**
   * Get appropriate slippage for a token pair
   *
   * @param {string} fromToken - Source token symbol
   * @param {string} toToken - Destination token symbol
   * @param {number|null} userRequested - User-requested slippage (optional)
   * @returns {number} Slippage in decimal (0.01 = 1%)
   */
  getSlippage(fromToken, toToken, userRequested = null) {
    const fromTier = this.classifyToken(fromToken);
    const toTier = this.classifyToken(toToken);

    // Use stricter of the two tiers
    const tier = this.getStricterTier(fromTier, toTier);
    const limits = this.TIERS[tier];

    // If user requested specific slippage
    if (userRequested !== null && userRequested !== undefined) {
      // Enforce tier maximum
      if (userRequested > limits.max) {
        this.logger.warn(
          `[SlippageGuard] Requested slippage ${(userRequested * 100).toFixed(2)}% ` +
          `exceeds tier max ${(limits.max * 100).toFixed(2)}%. Using tier max.`
        );
        return Math.min(limits.max, this.ABSOLUTE_MAX);
      }

      // Enforce absolute ceiling
      if (userRequested > this.ABSOLUTE_MAX) {
        this.logger.error(
          `[SlippageGuard] Requested slippage ${(userRequested * 100).toFixed(2)}% ` +
          `exceeds absolute max ${(this.ABSOLUTE_MAX * 100).toFixed(2)}%. Using absolute max.`
        );
        return this.ABSOLUTE_MAX;
      }

      return userRequested;
    }

    return limits.default;
  }

  /**
   * Classify token into tier based on volatility/liquidity
   *
   * @param {string} symbol - Token symbol
   * @returns {'stablecoin'|'major'|'volatile'} Token tier
   */
  classifyToken(symbol) {
    const normalized = symbol.toUpperCase().trim();

    if (this.STABLECOINS.includes(normalized)) {
      return 'stablecoin';
    }

    if (this.MAJOR_TOKENS.includes(normalized)) {
      return 'major';
    }

    return 'volatile';
  }

  /**
   * Get the stricter tier between two (stablecoin > major > volatile)
   *
   * @param {string} tier1 - First tier
   * @param {string} tier2 - Second tier
   * @returns {string} Stricter tier
   */
  getStricterTier(tier1, tier2) {
    const priority = { stablecoin: 0, major: 1, volatile: 2 };
    return priority[tier1] < priority[tier2] ? tier1 : tier2;
  }

  /**
   * Calculate minimum output amount with slippage applied
   *
   * @param {ethers.BigNumber} expectedOutput - Expected output amount
   * @param {number} slippagePercent - Slippage as decimal (0.01 = 1%)
   * @returns {ethers.BigNumber} Minimum acceptable output
   */
  calculateMinOutput(expectedOutput, slippagePercent) {
    // Enforce hard ceiling even in calculation
    const safeSlippage = Math.min(slippagePercent, this.ABSOLUTE_MAX);

    // Convert slippage to basis points for precision
    const slippageBps = Math.floor(safeSlippage * 10000);

    // minOutput = expected * (1 - slippage)
    // Using BigNumber for precision
    const minOutput = expectedOutput.mul(10000 - slippageBps).div(10000);

    return minOutput;
  }

  /**
   * Get slippage with dynamic adjustment based on trade size vs liquidity
   *
   * @param {string} fromToken - Source token symbol
   * @param {string} toToken - Destination token symbol
   * @param {ethers.BigNumber} amountIn - Amount to swap
   * @param {ethers.BigNumber} poolLiquidity - Pool liquidity
   * @param {number|null} userRequested - User-requested slippage
   * @returns {Promise<{slippage: number, warnings: string[]}>}
   */
  async getAdjustedSlippage(fromToken, toToken, amountIn, poolLiquidity, userRequested = null) {
    const warnings = [];
    const baseSlippage = this.getSlippage(fromToken, toToken, userRequested);

    // Calculate trade size relative to pool
    if (!poolLiquidity || poolLiquidity.isZero()) {
      warnings.push('Could not determine pool liquidity, using base slippage');
      return { slippage: baseSlippage, warnings };
    }

    const tradeRatio = amountIn.mul(10000).div(poolLiquidity).toNumber() / 10000;

    // Reject if trade too large (would cause massive price impact)
    if (tradeRatio > this.IMPACT_REJECT) {
      throw new Error(
        `Trade size ${(tradeRatio * 100).toFixed(2)}% of pool is too large. ` +
        `Maximum allowed: ${(this.IMPACT_REJECT * 100).toFixed(2)}%. ` +
        `Consider splitting into smaller trades.`
      );
    }

    // Warn on significant impact
    if (tradeRatio > this.IMPACT_WARNING) {
      warnings.push(
        `Trade size ${(tradeRatio * 100).toFixed(2)}% of pool. ` +
        `Expect ${(tradeRatio * 100).toFixed(2)}%+ price impact.`
      );
    }

    // Dynamic adjustment: add trade ratio to slippage (capped at tier max)
    const tierMax = this.TIERS[this.classifyToken(toToken)].max;
    const dynamicSlippage = Math.min(
      baseSlippage + tradeRatio,
      tierMax
    );

    // Never exceed absolute max
    const finalSlippage = Math.min(dynamicSlippage, this.ABSOLUTE_MAX);

    if (finalSlippage > baseSlippage) {
      warnings.push(
        `Slippage adjusted from ${(baseSlippage * 100).toFixed(2)}% ` +
        `to ${(finalSlippage * 100).toFixed(2)}% due to trade size`
      );
    }

    return { slippage: finalSlippage, warnings };
  }

  /**
   * Validate swap result - detect if slippage was exceeded
   *
   * @param {ethers.BigNumber} expectedOutput - Expected output
   * @param {ethers.BigNumber} actualOutput - Actual output received
   * @param {number} slippageUsed - Slippage tolerance used
   * @returns {{valid: boolean, actualSlippage: number, message: string}}
   */
  validateSwapResult(expectedOutput, actualOutput, slippageUsed) {
    if (expectedOutput.isZero()) {
      return { valid: true, actualSlippage: 0, message: 'Zero expected output' };
    }

    // Calculate actual slippage
    const diff = expectedOutput.sub(actualOutput);
    const actualSlippage = diff.mul(10000).div(expectedOutput).toNumber() / 10000;

    // Negative slippage means we got MORE than expected (good!)
    if (actualSlippage < 0) {
      return {
        valid: true,
        actualSlippage,
        message: `Received ${(-actualSlippage * 100).toFixed(2)}% more than expected (positive slippage)`
      };
    }

    // Check if within tolerance
    if (actualSlippage <= slippageUsed) {
      return {
        valid: true,
        actualSlippage,
        message: `Slippage ${(actualSlippage * 100).toFixed(2)}% within tolerance ${(slippageUsed * 100).toFixed(2)}%`
      };
    }

    // Slippage exceeded - this shouldn't happen if minAmountOut was set correctly
    // If it does, something went wrong (possible sandwich attack that partially succeeded)
    this.logger.error(
      `[SlippageGuard] SLIPPAGE EXCEEDED: Expected max ${(slippageUsed * 100).toFixed(2)}%, ` +
      `got ${(actualSlippage * 100).toFixed(2)}%. Possible MEV extraction.`
    );

    return {
      valid: false,
      actualSlippage,
      message: `Slippage exceeded: ${(actualSlippage * 100).toFixed(2)}% > ${(slippageUsed * 100).toFixed(2)}%`
    };
  }

  /**
   * Get tier information for a token
   *
   * @param {string} symbol - Token symbol
   * @returns {{tier: string, default: number, max: number}}
   */
  getTokenTierInfo(symbol) {
    const tier = this.classifyToken(symbol);
    return {
      tier,
      default: this.TIERS[tier].default,
      max: this.TIERS[tier].max,
      absoluteMax: this.ABSOLUTE_MAX
    };
  }

  /**
   * Validate slippage value
   *
   * @param {number} slippage - Slippage to validate
   * @returns {{valid: boolean, adjusted: number, message: string}}
   */
  validateSlippage(slippage) {
    if (typeof slippage !== 'number' || isNaN(slippage)) {
      return {
        valid: false,
        adjusted: this.TIERS.volatile.default,
        message: 'Invalid slippage value, using default'
      };
    }

    if (slippage < 0) {
      return {
        valid: false,
        adjusted: this.TIERS.volatile.default,
        message: 'Negative slippage not allowed, using default'
      };
    }

    if (slippage > this.ABSOLUTE_MAX) {
      return {
        valid: false,
        adjusted: this.ABSOLUTE_MAX,
        message: `Slippage ${(slippage * 100).toFixed(2)}% exceeds maximum ${(this.ABSOLUTE_MAX * 100).toFixed(2)}%`
      };
    }

    return {
      valid: true,
      adjusted: slippage,
      message: 'Slippage valid'
    };
  }

  /**
   * Get recommended slippage for a swap
   *
   * @param {string} fromToken - Source token
   * @param {string} toToken - Destination token
   * @param {object} options - Additional options
   * @returns {{recommended: number, min: number, max: number, reason: string}}
   */
  getRecommendedSlippage(fromToken, toToken, options = {}) {
    const fromTier = this.classifyToken(fromToken);
    const toTier = this.classifyToken(toToken);
    const effectiveTier = this.getStricterTier(fromTier, toTier);
    const tierConfig = this.TIERS[effectiveTier];

    let recommended = tierConfig.default;
    let reason = `${effectiveTier} token pair`;

    // Adjust for known volatile conditions
    if (options.highVolatility) {
      recommended = Math.min(tierConfig.max, this.ABSOLUTE_MAX);
      reason += ' (high volatility mode)';
    }

    // Adjust for large trades
    if (options.largeTradeAdjustment) {
      recommended = Math.min(recommended * 1.5, tierConfig.max, this.ABSOLUTE_MAX);
      reason += ' (large trade adjustment)';
    }

    return {
      recommended,
      min: 0.001, // 0.1% minimum to avoid stuck transactions
      max: Math.min(tierConfig.max, this.ABSOLUTE_MAX),
      absoluteMax: this.ABSOLUTE_MAX,
      reason
    };
  }
}

module.exports = SlippageGuard;
