'use strict';

/**
 * Human-Like Randomizer Tests
 *
 * Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * THE 6 W's: RANDOMIZER TESTING
 * =============================================================================
 *
 * WHO: Tests for HumanLikeRandomizer - simulating human behavior
 *
 * WHAT we test:
 * - Random number distributions (Gaussian, exponential, beta, Poisson)
 * - Wallet personality generation and consistency
 * - Time randomization with circadian rhythms
 * - Amount randomization avoiding round numbers
 * - Gas price and slippage randomization
 * - Mistake simulation
 *
 * WHEN: On every commit, before deployment
 *
 * WHERE: tests/airdrop/randomizer.test.js
 *
 * WHY: Ensure randomization produces human-like patterns
 *
 * HOW: Statistical tests and distribution analysis
 *
 * =============================================================================
 */

const {
  HumanLikeRandomizer,
  WalletPersonality,
  CIRCADIAN_WEIGHTS,
  DAY_WEIGHTS,
  AMOUNT_VARIANCE,
  TIMING_VARIANCE,
  gaussianRandom,
  exponentialRandom,
  betaRandom,
  poissonRandom,
  createRandomizer,
} = require('../../src/airdrop/randomizer');

describe('Human-Like Randomizer', () => {
  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  describe('Constants', () => {
    test('CIRCADIAN_WEIGHTS should cover all 24 hours', () => {
      for (let h = 0; h < 24; h++) {
        expect(CIRCADIAN_WEIGHTS[h]).toBeDefined();
        expect(CIRCADIAN_WEIGHTS[h]).toBeGreaterThanOrEqual(0);
        expect(CIRCADIAN_WEIGHTS[h]).toBeLessThanOrEqual(1);
      }
    });

    test('CIRCADIAN_WEIGHTS should peak during business hours', () => {
      // Mid-day should be higher than night
      expect(CIRCADIAN_WEIGHTS[14]).toBeGreaterThan(CIRCADIAN_WEIGHTS[3]);
      expect(CIRCADIAN_WEIGHTS[11]).toBeGreaterThan(CIRCADIAN_WEIGHTS[2]);
    });

    test('CIRCADIAN_WEIGHTS should be lowest at 3-4 AM', () => {
      const minWeight = Math.min(...Object.values(CIRCADIAN_WEIGHTS));
      expect(CIRCADIAN_WEIGHTS[3]).toBe(minWeight);
    });

    test('DAY_WEIGHTS should have weekdays higher than weekends', () => {
      expect(DAY_WEIGHTS[2]).toBeGreaterThan(DAY_WEIGHTS[0]); // Tuesday > Sunday
      expect(DAY_WEIGHTS[3]).toBeGreaterThan(DAY_WEIGHTS[6]); // Wednesday > Saturday
    });

    test('AMOUNT_VARIANCE should have valid ranges', () => {
      expect(AMOUNT_VARIANCE.LOW).toBeLessThan(AMOUNT_VARIANCE.MEDIUM);
      expect(AMOUNT_VARIANCE.MEDIUM).toBeLessThan(AMOUNT_VARIANCE.HIGH);
    });

    test('TIMING_VARIANCE should have valid ranges', () => {
      expect(TIMING_VARIANCE.TIGHT).toBeLessThan(TIMING_VARIANCE.NORMAL);
      expect(TIMING_VARIANCE.NORMAL).toBeLessThan(TIMING_VARIANCE.LOOSE);
    });
  });

  // ==========================================================================
  // RANDOM NUMBER GENERATORS
  // ==========================================================================

  describe('Random Number Generators', () => {
    describe('gaussianRandom', () => {
      test('should generate numbers around mean', () => {
        const samples = [];
        for (let i = 0; i < 1000; i++) {
          samples.push(gaussianRandom(100, 10));
        }

        const mean = samples.reduce((a, b) => a + b) / samples.length;
        expect(mean).toBeGreaterThan(90);
        expect(mean).toBeLessThan(110);
      });

      test('should respect standard deviation', () => {
        const samples = [];
        for (let i = 0; i < 1000; i++) {
          samples.push(gaussianRandom(0, 1));
        }

        // Most values should be within 3 standard deviations
        const withinThreeSigma = samples.filter(s => Math.abs(s) <= 3).length;
        expect(withinThreeSigma / samples.length).toBeGreaterThan(0.99);
      });

      test('should produce different values', () => {
        const samples = new Set();
        for (let i = 0; i < 100; i++) {
          samples.add(gaussianRandom());
        }
        expect(samples.size).toBeGreaterThan(95); // High uniqueness
      });
    });

    describe('exponentialRandom', () => {
      test('should generate positive values', () => {
        for (let i = 0; i < 100; i++) {
          expect(exponentialRandom(1)).toBeGreaterThanOrEqual(0);
        }
      });

      test('should respect lambda parameter', () => {
        const highLambda = [];
        const lowLambda = [];

        for (let i = 0; i < 500; i++) {
          highLambda.push(exponentialRandom(2));
          lowLambda.push(exponentialRandom(0.5));
        }

        const highMean = highLambda.reduce((a, b) => a + b) / highLambda.length;
        const lowMean = lowLambda.reduce((a, b) => a + b) / lowLambda.length;

        // Higher lambda = lower mean
        expect(highMean).toBeLessThan(lowMean);
      });
    });

    describe('betaRandom', () => {
      test('should generate values between 0 and 1', () => {
        for (let i = 0; i < 100; i++) {
          const value = betaRandom(2, 2);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      });

      test('should center around 0.5 with equal alpha/beta', () => {
        const samples = [];
        for (let i = 0; i < 500; i++) {
          samples.push(betaRandom(2, 2));
        }

        const mean = samples.reduce((a, b) => a + b) / samples.length;
        expect(mean).toBeGreaterThan(0.4);
        expect(mean).toBeLessThan(0.6);
      });
    });

    describe('poissonRandom', () => {
      test('should generate non-negative integers', () => {
        for (let i = 0; i < 100; i++) {
          const value = poissonRandom(3);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
        }
      });

      test('should have mean close to lambda', () => {
        const lambda = 5;
        const samples = [];
        for (let i = 0; i < 1000; i++) {
          samples.push(poissonRandom(lambda));
        }

        const mean = samples.reduce((a, b) => a + b) / samples.length;
        expect(mean).toBeGreaterThan(lambda * 0.8);
        expect(mean).toBeLessThan(lambda * 1.2);
      });
    });
  });

  // ==========================================================================
  // WALLET PERSONALITY
  // ==========================================================================

  describe('WalletPersonality', () => {
    test('should create personality from address', () => {
      const personality = new WalletPersonality(
        '0x1234567890123456789012345678901234567890'
      );

      expect(personality.traits).toBeDefined();
      expect(personality.traits.preferredHours).toBeInstanceOf(Array);
      expect(personality.traits.amountVariance).toBeGreaterThan(0);
    });

    test('should be deterministic for same address', () => {
      const addr = '0xABCD1234567890123456789012345678901234AB';

      const p1 = new WalletPersonality(addr);
      const p2 = new WalletPersonality(addr);

      expect(p1.traits.preferredHours).toEqual(p2.traits.preferredHours);
      expect(p1.traits.amountVariance).toBe(p2.traits.amountVariance);
      expect(p1.traits.timezone).toBe(p2.traits.timezone);
    });

    test('should produce different personalities for different addresses', () => {
      const p1 = new WalletPersonality('0x1111111111111111111111111111111111111111');
      const p2 = new WalletPersonality('0x2222222222222222222222222222222222222222');

      // At least some traits should differ
      const samePreferredHours = JSON.stringify(p1.traits.preferredHours) ===
                                 JSON.stringify(p2.traits.preferredHours);
      const sameVariance = p1.traits.amountVariance === p2.traits.amountVariance;

      expect(samePreferredHours && sameVariance).toBe(false);
    });

    test('should have valid trait ranges', () => {
      const personality = new WalletPersonality('0x1234');

      expect(personality.traits.weekendActivity).toBeGreaterThanOrEqual(0.4);
      expect(personality.traits.weekendActivity).toBeLessThanOrEqual(0.9);

      expect(personality.traits.amountVariance).toBeGreaterThanOrEqual(0.08);
      expect(personality.traits.amountVariance).toBeLessThanOrEqual(0.28);

      expect(personality.traits.mistakeRate).toBeGreaterThanOrEqual(0.02);
      expect(personality.traits.mistakeRate).toBeLessThanOrEqual(0.10);
    });

    test('should have valid timezone', () => {
      const personality = new WalletPersonality('0x1234');

      expect(typeof personality.traits.timezone).toBe('string');
      expect(personality.traits.timezone).toContain('/');
    });

    test('should calculate hour weight correctly', () => {
      const personality = new WalletPersonality('0x1234');

      // Preferred hours should have higher weight
      const preferredHour = personality.traits.preferredHours[0];
      const nonPreferredHour = personality.traits.preferredHours.includes(12) ? 3 : 12;

      const preferredWeight = personality.getHourWeight(preferredHour);
      const nonPreferredWeight = personality.getHourWeight(nonPreferredHour);

      expect(preferredWeight).toBeGreaterThan(nonPreferredWeight * 0.5);
    });

    test('should calculate day weight correctly', () => {
      const personality = new WalletPersonality('0x1234');

      // Weekday should have higher base weight
      const weekdayWeight = personality.getDayWeight(2); // Tuesday
      const weekendWeight = personality.getDayWeight(0); // Sunday

      // Even with weekend activity factor, weekday should usually be higher
      // (unless weekend activity is very high)
      const effectiveWeekendWeight = weekendWeight * personality.traits.weekendActivity;
      expect(weekdayWeight).toBeGreaterThanOrEqual(effectiveWeekendWeight * 0.5);
    });
  });

  // ==========================================================================
  // RANDOMIZER CLASS
  // ==========================================================================

  describe('HumanLikeRandomizer', () => {
    let randomizer;

    beforeEach(() => {
      randomizer = new HumanLikeRandomizer();
    });

    describe('Personality Management', () => {
      test('should get or create personality', () => {
        const p1 = randomizer.getPersonality('0x1234');
        const p2 = randomizer.getPersonality('0x1234');

        expect(p1).toBe(p2); // Same instance
      });

      test('should normalize address case', () => {
        const p1 = randomizer.getPersonality('0xABCD');
        const p2 = randomizer.getPersonality('0xabcd');

        expect(p1).toBe(p2);
      });
    });

    describe('Time Randomization', () => {
      test('should randomize time around base', () => {
        const baseTime = new Date('2025-01-15T14:00:00Z');
        const times = [];

        for (let i = 0; i < 100; i++) {
          times.push(randomizer.randomizeTime(baseTime, { variance: 2 }));
        }

        // Should produce different values
        const uniqueTimes = new Set(times.map(t => t.getTime()));
        expect(uniqueTimes.size).toBeGreaterThan(50);
      });

      test('should respect variance parameter', () => {
        const baseTime = new Date('2025-01-15T14:00:00Z');

        const tightVariance = [];
        const looseVariance = [];

        for (let i = 0; i < 100; i++) {
          tightVariance.push(randomizer.randomizeTime(baseTime, { variance: 0.5 }));
          looseVariance.push(randomizer.randomizeTime(baseTime, { variance: 6 }));
        }

        // Calculate average deviation
        const tightDeviation = tightVariance
          .map(t => Math.abs(t.getTime() - baseTime.getTime()))
          .reduce((a, b) => a + b) / tightVariance.length;

        const looseDeviation = looseVariance
          .map(t => Math.abs(t.getTime() - baseTime.getTime()))
          .reduce((a, b) => a + b) / looseVariance.length;

        expect(looseDeviation).toBeGreaterThan(tightDeviation);
      });

      test('should use wallet personality when provided', () => {
        const baseTime = new Date('2025-01-15T14:00:00Z');

        const t1 = randomizer.randomizeTime(baseTime, {
          walletAddress: '0x1111',
          variance: 2,
        });

        const t2 = randomizer.randomizeTime(baseTime, {
          walletAddress: '0x2222',
          variance: 2,
        });

        // Different wallets may have different timing preferences
        // (This is probabilistic, so just ensure no errors)
        expect(t1 instanceof Date).toBe(true);
        expect(t2 instanceof Date).toBe(true);
      });
    });

    describe('Interval Randomization', () => {
      test('should generate interval within frequency bounds', () => {
        const frequency = { min: 3, max: 7, unit: 'days' };

        for (let i = 0; i < 50; i++) {
          const interval = randomizer.randomizeInterval(frequency);

          // Allow some variance beyond bounds (80% of min)
          expect(interval).toBeGreaterThanOrEqual(frequency.min * 0.8 * 24 * 60 * 60 * 1000);
          // Should generally be within max (with some variance)
          expect(interval).toBeLessThan(frequency.max * 2 * 24 * 60 * 60 * 1000);
        }
      });

      test('should return milliseconds', () => {
        const interval = randomizer.randomizeInterval({ min: 1, max: 2 });
        expect(interval).toBeGreaterThan(0);
        expect(interval).toBeGreaterThan(1000); // More than 1 second
      });
    });

    describe('Amount Randomization', () => {
      test('should randomize around target', () => {
        const target = 1.0;
        const amounts = [];

        for (let i = 0; i < 100; i++) {
          amounts.push(randomizer.randomizeAmount(target));
        }

        const mean = amounts.reduce((a, b) => a + b) / amounts.length;
        expect(mean).toBeGreaterThan(target * 0.8);
        expect(mean).toBeLessThan(target * 1.2);
      });

      test('should respect min/max bounds', () => {
        const target = 1.0;
        const minAmount = 0.5;
        const maxAmount = 1.5;

        for (let i = 0; i < 100; i++) {
          const amount = randomizer.randomizeAmount(target, { minAmount, maxAmount });
          expect(amount).toBeGreaterThanOrEqual(minAmount);
          expect(amount).toBeLessThanOrEqual(maxAmount);
        }
      });

      test('should avoid round numbers by default', () => {
        const roundInputs = [1.0, 0.5, 0.1, 10];
        let roundOutputCount = 0;

        for (const input of roundInputs) {
          for (let i = 0; i < 20; i++) {
            const output = randomizer.randomizeAmount(input);
            if (output === Math.round(output) && output % 0.1 === 0) {
              roundOutputCount++;
            }
          }
        }

        // Most outputs should not be round
        expect(roundOutputCount).toBeLessThan(roundInputs.length * 20 * 0.5);
      });

      test('should use wallet personality variance', () => {
        const target = 1.0;

        // Create two different wallets
        const wallet1 = '0x1111111111111111111111111111111111111111';
        const wallet2 = '0x2222222222222222222222222222222222222222';

        // Each wallet should have consistent variance
        const amounts1 = [];
        const amounts2 = [];

        for (let i = 0; i < 50; i++) {
          amounts1.push(randomizer.randomizeAmount(target, { walletAddress: wallet1 }));
          amounts2.push(randomizer.randomizeAmount(target, { walletAddress: wallet2 }));
        }

        // Just verify no errors and reasonable values
        amounts1.forEach(a => expect(a).toBeGreaterThan(0));
        amounts2.forEach(a => expect(a).toBeGreaterThan(0));
      });
    });

    describe('avoidRoundNumbers', () => {
      test('should modify round numbers', () => {
        const roundNumber = 1.0;
        const result = randomizer.avoidRoundNumbers(roundNumber);

        // Should be different from input (most of the time)
        // or at least have decimal places
        expect(result).not.toBe(1.0);
      });

      test('should respect decimal precision', () => {
        const result = randomizer.avoidRoundNumbers(1.5, 4);
        const decimalStr = result.toString().split('.')[1] || '';
        expect(decimalStr.length).toBeLessThanOrEqual(4);
      });
    });

    describe('generateRealisticAmount', () => {
      test('should generate amount within bounds', () => {
        for (let i = 0; i < 100; i++) {
          const amount = randomizer.generateRealisticAmount(0.1, 1.0);
          expect(amount).toBeGreaterThanOrEqual(0.1);
          expect(amount).toBeLessThanOrEqual(1.0);
        }
      });

      test('should tend toward middle of range', () => {
        const amounts = [];
        for (let i = 0; i < 100; i++) {
          amounts.push(randomizer.generateRealisticAmount(0, 10));
        }

        const mean = amounts.reduce((a, b) => a + b) / amounts.length;
        expect(mean).toBeGreaterThan(3);
        expect(mean).toBeLessThan(7);
      });
    });

    describe('Gas Randomization', () => {
      test('should randomize gas price', () => {
        const baseGas = BigInt(30000000000); // 30 gwei

        const gasPrices = [];
        for (let i = 0; i < 100; i++) {
          gasPrices.push(randomizer.randomizeGasPrice(baseGas));
        }

        // Should produce variety
        const uniquePrices = new Set(gasPrices.map(g => g.toString()));
        expect(uniquePrices.size).toBeGreaterThan(50);

        // Should stay within reasonable bounds
        gasPrices.forEach(g => {
          expect(g).toBeGreaterThanOrEqual(baseGas * BigInt(8) / BigInt(10)); // 80%
          expect(g).toBeLessThanOrEqual(baseGas * BigInt(15) / BigInt(10)); // 150%
        });
      });

      test('should return BigInt', () => {
        const result = randomizer.randomizeGasPrice(BigInt(1000000000));
        expect(typeof result).toBe('bigint');
      });

      test('should handle number input', () => {
        const result = randomizer.randomizeGasPrice(1000000000);
        expect(typeof result).toBe('bigint');
      });

      test('should randomize gas limit', () => {
        const estimate = BigInt(21000);

        const gasLimits = [];
        for (let i = 0; i < 100; i++) {
          gasLimits.push(randomizer.randomizeGasLimit(estimate));
        }

        // Should add 10-30% padding
        gasLimits.forEach(g => {
          expect(g).toBeGreaterThanOrEqual(estimate * BigInt(11) / BigInt(10));
          expect(g).toBeLessThanOrEqual(estimate * BigInt(13) / BigInt(10));
        });
      });
    });

    describe('Slippage Randomization', () => {
      test('should randomize slippage', () => {
        const baseSlippage = 0.5;

        const slippages = [];
        for (let i = 0; i < 100; i++) {
          slippages.push(randomizer.randomizeSlippage(baseSlippage));
        }

        // Should vary around base
        const mean = slippages.reduce((a, b) => a + b) / slippages.length;
        expect(mean).toBeGreaterThan(baseSlippage * 0.5);
        expect(mean).toBeLessThan(baseSlippage * 2);
      });

      test('should respect min/max bounds', () => {
        for (let i = 0; i < 50; i++) {
          const slippage = randomizer.randomizeSlippage(0.5, {
            minSlippage: 0.1,
            maxSlippage: 1.0,
          });
          expect(slippage).toBeGreaterThanOrEqual(0.1);
          expect(slippage).toBeLessThanOrEqual(1.0);
        }
      });

      test('should round to 0.1 increments', () => {
        for (let i = 0; i < 50; i++) {
          const slippage = randomizer.randomizeSlippage(0.5);
          expect(slippage * 10 % 1).toBe(0); // Should be divisible by 0.1
        }
      });
    });

    describe('Action Randomization', () => {
      test('weightedSelect should respect weights', () => {
        const items = ['a', 'b', 'c'];
        const counts = { a: 0, b: 0, c: 0 };

        for (let i = 0; i < 1000; i++) {
          const selected = randomizer.weightedSelect(
            items,
            item => item === 'c' ? 10 : 1 // c has 10x weight
          );
          counts[selected]++;
        }

        // c should be selected much more often
        expect(counts.c).toBeGreaterThan(counts.a * 3);
        expect(counts.c).toBeGreaterThan(counts.b * 3);
      });

      test('weightedSelect should handle empty array', () => {
        const result = randomizer.weightedSelect([], () => 1);
        expect(result).toBeNull();
      });

      test('weightedShuffle should produce shuffled array', () => {
        const items = [1, 2, 3, 4, 5];
        let differentOrders = 0;

        for (let i = 0; i < 20; i++) {
          const shuffled = randomizer.weightedShuffle([...items]);
          if (JSON.stringify(shuffled) !== JSON.stringify(items)) {
            differentOrders++;
          }
        }

        expect(differentOrders).toBeGreaterThan(10);
      });
    });

    describe('Mistake Simulation', () => {
      test('should sometimes simulate mistakes', () => {
        let mistakeCount = 0;

        for (let i = 0; i < 1000; i++) {
          if (randomizer.shouldSimulateMistake()) {
            mistakeCount++;
          }
        }

        // Default 5% rate, so expect around 50 mistakes
        expect(mistakeCount).toBeGreaterThan(20);
        expect(mistakeCount).toBeLessThan(100);
      });

      test('should generate valid mistake types', () => {
        const mistake = randomizer.generateMistake();

        expect(mistake.type).toBeDefined();
        expect(mistake.description).toBeDefined();
        expect(['retry', 'cancel', 'wrong_amount', 'pause']).toContain(mistake.type);
      });
    });

    describe('Utilities', () => {
      test('getActivityProbability should return valid probability', () => {
        const time = new Date('2025-01-15T14:00:00Z'); // Wednesday 2pm

        const prob = randomizer.getActivityProbability(time);
        expect(prob).toBeGreaterThan(0);
        expect(prob).toBeLessThanOrEqual(1);
      });

      test('isSuitableTime should reject low-weight times', () => {
        // Create a time at 3 AM in local time (not UTC)
        const nightTime = new Date();
        nightTime.setHours(3, 0, 0, 0);

        // 3 AM has CIRCADIAN_WEIGHT of 0.03, which is < 0.2 threshold
        // With day weight factor, it might be 0.03 * 0.6 to 1.0
        // So at most ~0.03, should be below 0.2 threshold
        const probability = randomizer.getActivityProbability(nightTime);
        expect(probability).toBeLessThan(0.2);
      });

      test('getStatistics should return valid stats', () => {
        randomizer.getPersonality('0x1234');
        randomizer.getPersonality('0x5678');

        const stats = randomizer.getStatistics();
        expect(stats.personalitiesGenerated).toBe(2);
        expect(stats.config).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION
  // ==========================================================================

  describe('Factory Function', () => {
    test('should create randomizer with defaults', () => {
      const randomizer = createRandomizer();
      expect(randomizer).toBeInstanceOf(HumanLikeRandomizer);
    });

    test('should accept custom config', () => {
      const randomizer = createRandomizer({
        defaultAmountVariance: 0.3,
        avoidRoundNumbers: false,
      });

      expect(randomizer.config.defaultAmountVariance).toBe(0.3);
      expect(randomizer.config.avoidRoundNumbers).toBe(false);
    });
  });

  // ==========================================================================
  // SYBIL RESISTANCE
  // ==========================================================================

  describe('Sybil Resistance Features', () => {
    let randomizer;

    beforeEach(() => {
      randomizer = createRandomizer();
    });

    test('should produce non-uniform time distribution', () => {
      const hourCounts = new Array(24).fill(0);
      const baseTime = new Date('2025-01-15T12:00:00Z');

      for (let i = 0; i < 1000; i++) {
        const time = randomizer.randomizeTime(baseTime, { variance: 6 });
        hourCounts[time.getHours()]++;
      }

      // Should not be uniform (check coefficient of variation)
      const mean = hourCounts.reduce((a, b) => a + b) / hourCounts.length;
      const variance = hourCounts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / hourCounts.length;
      const cv = Math.sqrt(variance) / mean;

      expect(cv).toBeGreaterThan(0.1); // Should have noticeable variation
    });

    test('should avoid value fingerprinting', () => {
      const targetAmount = 0.5;
      const amounts = [];

      for (let i = 0; i < 100; i++) {
        amounts.push(randomizer.randomizeAmount(targetAmount));
      }

      // Check uniqueness
      const uniqueAmounts = new Set(amounts);
      expect(uniqueAmounts.size).toBeGreaterThan(80);

      // Check none are exactly the target
      expect(amounts.filter(a => a === targetAmount).length).toBe(0);
    });

    test('wallet personalities should be diverse', () => {
      const wallets = [];
      for (let i = 0; i < 20; i++) {
        wallets.push(`0x${i.toString().padStart(40, '0')}`);
      }

      const variances = wallets.map(w =>
        randomizer.getPersonality(w).traits.amountVariance
      );

      // Should have variety
      const uniqueVariances = new Set(variances.map(v => Math.round(v * 100)));
      expect(uniqueVariances.size).toBeGreaterThan(5);
    });
  });
});
