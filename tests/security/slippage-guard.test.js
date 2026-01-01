/**
 * Slippage Guard Unit Tests
 *
 * Tests tiered slippage protection, hard ceiling enforcement,
 * and dynamic adjustment based on trade size.
 */

const { ethers } = require('ethers');
const SlippageGuard = require('../../src/security/slippage-guard');

describe('SlippageGuard', () => {
  let slippageGuard;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    slippageGuard = new SlippageGuard({ logger: mockLogger });
  });

  describe('Token Classification', () => {
    test('classifies stablecoins correctly', () => {
      expect(slippageGuard.classifyToken('USDC')).toBe('stablecoin');
      expect(slippageGuard.classifyToken('USDT')).toBe('stablecoin');
      expect(slippageGuard.classifyToken('DAI')).toBe('stablecoin');
      expect(slippageGuard.classifyToken('FRAX')).toBe('stablecoin');
    });

    test('classifies major tokens correctly', () => {
      expect(slippageGuard.classifyToken('ETH')).toBe('major');
      expect(slippageGuard.classifyToken('WETH')).toBe('major');
      expect(slippageGuard.classifyToken('BTC')).toBe('major');
      expect(slippageGuard.classifyToken('UNI')).toBe('major');
    });

    test('classifies unknown tokens as volatile', () => {
      expect(slippageGuard.classifyToken('SHIB')).toBe('volatile');
      expect(slippageGuard.classifyToken('PEPE')).toBe('volatile');
      expect(slippageGuard.classifyToken('RANDOM')).toBe('volatile');
    });

    test('handles case insensitivity', () => {
      expect(slippageGuard.classifyToken('usdc')).toBe('stablecoin');
      expect(slippageGuard.classifyToken('Eth')).toBe('major');
      expect(slippageGuard.classifyToken('WETH')).toBe('major');
    });
  });

  describe('Default Slippage Values', () => {
    test('returns correct default for stablecoin pairs', () => {
      const slippage = slippageGuard.getSlippage('USDC', 'USDT');
      expect(slippage).toBe(0.001); // 0.1%
    });

    test('returns correct default for major token pairs', () => {
      const slippage = slippageGuard.getSlippage('ETH', 'WETH');
      expect(slippage).toBe(0.005); // 0.5%
    });

    test('returns correct default for volatile tokens', () => {
      const slippage = slippageGuard.getSlippage('SHIB', 'PEPE');
      expect(slippage).toBe(0.01); // 1%
    });

    test('uses stricter tier when swapping between tiers', () => {
      // Stablecoin to major should use stablecoin tier (stricter)
      const slippage1 = slippageGuard.getSlippage('USDC', 'ETH');
      expect(slippage1).toBe(0.001); // 0.1% (stablecoin default)

      // Major to volatile should use major tier (stricter)
      const slippage2 = slippageGuard.getSlippage('ETH', 'SHIB');
      expect(slippage2).toBe(0.005); // 0.5% (major default)
    });
  });

  describe('User Requested Slippage', () => {
    test('accepts user slippage within tier limits', () => {
      const slippage = slippageGuard.getSlippage('ETH', 'WETH', 0.008);
      expect(slippage).toBe(0.008);
    });

    test('caps user slippage at tier maximum', () => {
      // Major tier max is 1%, requesting 2%
      const slippage = slippageGuard.getSlippage('ETH', 'WETH', 0.02);
      expect(slippage).toBe(0.01); // Capped at 1%
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('caps all slippage at absolute maximum (3%)', () => {
      // Volatile tier max is 3%, but requesting 5%
      const slippage = slippageGuard.getSlippage('SHIB', 'PEPE', 0.05);
      expect(slippage).toBe(0.03); // Capped at 3%
      // Tier max (3%) is reached before absolute max check triggers error
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Hard Ceiling Enforcement', () => {
    test('never exceeds 3% regardless of tier', () => {
      // Test with custom config trying to set higher limits
      const customGuard = new SlippageGuard({
        volatileMax: 0.10, // Try to set 10% max
        logger: mockLogger,
      });

      // Even with volatile token pair and high requested slippage
      const slippage = customGuard.getSlippage('RANDOM', 'RANDOM2', 0.10);
      expect(slippage).toBeLessThanOrEqual(0.03);
    });

    test('ABSOLUTE_MAX constant is 3%', () => {
      expect(slippageGuard.ABSOLUTE_MAX).toBe(0.03);
    });
  });

  describe('Min Output Calculation', () => {
    test('calculates correct min output with slippage', () => {
      const expectedOutput = ethers.utils.parseUnits('1000', 18);
      const slippage = 0.01; // 1%

      const minOutput = slippageGuard.calculateMinOutput(expectedOutput, slippage);

      // 1000 * (1 - 0.01) = 990
      expect(minOutput.toString()).toBe(ethers.utils.parseUnits('990', 18).toString());
    });

    test('enforces hard ceiling in calculation', () => {
      const expectedOutput = ethers.utils.parseUnits('1000', 18);
      const slippage = 0.10; // 10% (exceeds max)

      const minOutput = slippageGuard.calculateMinOutput(expectedOutput, slippage);

      // Should use 3% max, not 10%
      // 1000 * (1 - 0.03) = 970
      expect(minOutput.toString()).toBe(ethers.utils.parseUnits('970', 18).toString());
    });

    test('handles zero slippage', () => {
      const expectedOutput = ethers.utils.parseUnits('1000', 18);
      const minOutput = slippageGuard.calculateMinOutput(expectedOutput, 0);
      expect(minOutput.toString()).toBe(expectedOutput.toString());
    });
  });

  describe('Swap Result Validation', () => {
    test('validates successful swap within tolerance', () => {
      const expected = ethers.utils.parseUnits('1000', 18);
      const actual = ethers.utils.parseUnits('995', 18); // 0.5% slippage
      const slippageUsed = 0.01; // 1% tolerance

      const result = slippageGuard.validateSwapResult(expected, actual, slippageUsed);

      expect(result.valid).toBe(true);
      expect(result.actualSlippage).toBeCloseTo(0.005, 4);
    });

    test('validates positive slippage (got more than expected)', () => {
      const expected = ethers.utils.parseUnits('1000', 18);
      const actual = ethers.utils.parseUnits('1010', 18); // Got 1% more

      const result = slippageGuard.validateSwapResult(expected, actual, 0.01);

      expect(result.valid).toBe(true);
      expect(result.actualSlippage).toBeLessThan(0);
      expect(result.message).toContain('positive slippage');
    });

    test('flags exceeded slippage', () => {
      const expected = ethers.utils.parseUnits('1000', 18);
      const actual = ethers.utils.parseUnits('940', 18); // 6% slippage
      const slippageUsed = 0.03; // 3% tolerance

      const result = slippageGuard.validateSwapResult(expected, actual, slippageUsed);

      expect(result.valid).toBe(false);
      expect(result.actualSlippage).toBeCloseTo(0.06, 4);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Token Tier Info', () => {
    test('returns complete tier info for stablecoin', () => {
      const info = slippageGuard.getTokenTierInfo('USDC');

      expect(info.tier).toBe('stablecoin');
      expect(info.default).toBe(0.001);
      expect(info.max).toBe(0.005);
      expect(info.absoluteMax).toBe(0.03);
    });

    test('returns complete tier info for volatile', () => {
      const info = slippageGuard.getTokenTierInfo('SHIB');

      expect(info.tier).toBe('volatile');
      expect(info.default).toBe(0.01);
      expect(info.max).toBe(0.03);
    });
  });

  describe('Slippage Validation', () => {
    test('validates correct slippage values', () => {
      const result = slippageGuard.validateSlippage(0.02);
      expect(result.valid).toBe(true);
      expect(result.adjusted).toBe(0.02);
    });

    test('rejects negative slippage', () => {
      const result = slippageGuard.validateSlippage(-0.01);
      expect(result.valid).toBe(false);
      expect(result.adjusted).toBe(0.01); // Default
    });

    test('rejects NaN slippage', () => {
      const result = slippageGuard.validateSlippage(NaN);
      expect(result.valid).toBe(false);
    });

    test('caps slippage exceeding maximum', () => {
      const result = slippageGuard.validateSlippage(0.10);
      expect(result.valid).toBe(false);
      expect(result.adjusted).toBe(0.03);
    });
  });

  describe('Recommended Slippage', () => {
    test('returns recommended slippage for token pair', () => {
      const rec = slippageGuard.getRecommendedSlippage('ETH', 'USDC');

      expect(rec.recommended).toBeDefined();
      expect(rec.min).toBe(0.001);
      expect(rec.max).toBeDefined();
      expect(rec.absoluteMax).toBe(0.03);
      expect(rec.reason).toBeDefined();
    });

    test('adjusts for high volatility mode', () => {
      const normal = slippageGuard.getRecommendedSlippage('ETH', 'UNI');
      const highVol = slippageGuard.getRecommendedSlippage('ETH', 'UNI', { highVolatility: true });

      expect(highVol.recommended).toBeGreaterThan(normal.recommended);
    });

    test('adjusts for large trades', () => {
      const normal = slippageGuard.getRecommendedSlippage('ETH', 'UNI');
      const large = slippageGuard.getRecommendedSlippage('ETH', 'UNI', { largeTradeAdjustment: true });

      expect(large.recommended).toBeGreaterThanOrEqual(normal.recommended);
    });
  });

  describe('Dynamic Adjustment', () => {
    test('rejects trade too large for pool', async () => {
      const amountIn = ethers.utils.parseUnits('100', 18);
      const poolLiquidity = ethers.utils.parseUnits('1000', 18); // 10% of pool

      await expect(
        slippageGuard.getAdjustedSlippage('ETH', 'UNI', amountIn, poolLiquidity)
      ).rejects.toThrow('too large');
    });

    test('warns on significant price impact', async () => {
      const amountIn = ethers.utils.parseUnits('20', 18);
      const poolLiquidity = ethers.utils.parseUnits('1000', 18); // 2% of pool

      const result = await slippageGuard.getAdjustedSlippage('ETH', 'UNI', amountIn, poolLiquidity);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('impact');
    });

    test('handles zero liquidity gracefully', async () => {
      const amountIn = ethers.utils.parseUnits('1', 18);
      const poolLiquidity = ethers.BigNumber.from(0);

      const result = await slippageGuard.getAdjustedSlippage('ETH', 'UNI', amountIn, poolLiquidity);

      expect(result.warnings).toContain('Could not determine pool liquidity, using base slippage');
    });
  });

  describe('Stricter Tier Logic', () => {
    test('stablecoin is stricter than major', () => {
      const tier = slippageGuard.getStricterTier('stablecoin', 'major');
      expect(tier).toBe('stablecoin');
    });

    test('major is stricter than volatile', () => {
      const tier = slippageGuard.getStricterTier('major', 'volatile');
      expect(tier).toBe('major');
    });

    test('same tier returns itself', () => {
      expect(slippageGuard.getStricterTier('major', 'major')).toBe('major');
    });
  });
});
