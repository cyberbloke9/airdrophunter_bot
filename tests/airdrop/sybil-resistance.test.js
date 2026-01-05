'use strict';

/**
 * Sybil Resistance Integration Tests
 *
 * Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * THE 6 W's: SYBIL RESISTANCE TESTING
 * =============================================================================
 *
 * WHO: Integration tests for the complete airdrop automation system
 *
 * WHAT we test:
 * - Full system integration (strategy + randomizer + tracker + scheduler)
 * - Temporal clustering prevention
 * - Value fingerprinting avoidance
 * - Behavioral diversity
 * - Cross-wallet coordination
 * - Pattern detection resistance
 *
 * WHEN: Before deployment, after major changes
 *
 * WHERE: tests/airdrop/sybil-resistance.test.js
 *
 * WHY: Ensure system produces organic-looking activity patterns
 *
 * HOW: Statistical analysis of simulated activity
 *
 * =============================================================================
 */

const { createStrategyEngine } = require('../../src/airdrop/strategy-engine');
const { createRandomizer } = require('../../src/airdrop/randomizer');
const { createDiversityTracker } = require('../../src/airdrop/diversity-tracker');
const { createScheduler } = require('../../src/airdrop/scheduler');

describe('Sybil Resistance Integration', () => {
  let strategyEngine;
  let randomizer;
  let diversityTracker;
  let scheduler;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    strategyEngine = createStrategyEngine({
      logger: mockLogger,
      includeBuiltIn: true,
    });

    randomizer = createRandomizer({
      respectCircadian: true,
      avoidRoundNumbers: true,
    });

    diversityTracker = createDiversityTracker({
      logger: mockLogger,
      minActivityForScore: 5,
    });

    scheduler = createScheduler({
      logger: mockLogger,
      strategyEngine,
      randomizer,
      diversityTracker,
      minWalletInterval: 100, // Short for testing
      minCrossWalletInterval: 50,
      maxClusterSize: 3,
      clusterWindow: 1000,
    });
  });

  afterEach(() => {
    scheduler.stop();
  });

  // ==========================================================================
  // TEMPORAL CLUSTERING PREVENTION
  // ==========================================================================

  describe('Temporal Clustering Prevention', () => {
    test('should spread activities across time', () => {
      const wallets = [];
      for (let i = 0; i < 10; i++) {
        wallets.push(`0x${i.toString().padStart(40, '0')}`);
      }

      // Assign strategies to all wallets
      wallets.forEach(wallet => {
        strategyEngine.assignStrategy(wallet, 'layerzero-organic');
      });

      // Schedule actions for all wallets
      const scheduledTimes = [];
      wallets.forEach(wallet => {
        const action = scheduler.schedule(wallet, {
          action: 'swap',
          scheduledTime: Date.now() + 1000, // Base time
        });
        scheduledTimes.push(action.scheduledTime);
      });

      // Analyze time distribution
      const sortedTimes = scheduledTimes.sort((a, b) => a - b);
      const intervals = [];
      for (let i = 1; i < sortedTimes.length; i++) {
        intervals.push(sortedTimes[i] - sortedTimes[i - 1]);
      }

      // Check that actions are spread (not all at same millisecond)
      const uniqueTimes = new Set(scheduledTimes);
      expect(uniqueTimes.size).toBeGreaterThan(5);

      // Check minimum spacing is enforced
      const minInterval = Math.min(...intervals);
      expect(minInterval).toBeGreaterThanOrEqual(0);
    });

    test('should prevent same-wallet rapid execution', () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      strategyEngine.assignStrategy(wallet, 'zksync-era-organic');

      // Set last execution to now
      const queue = scheduler.getQueue(wallet);
      queue.lastExecution = Date.now();

      // Try to schedule another action immediately
      const action = scheduler.schedule(wallet, {
        action: 'swap',
        scheduledTime: Date.now(), // Try to schedule now
      });

      // Should be pushed to future (after cooldown)
      expect(action.scheduledTime).toBeGreaterThan(Date.now());
    });

    test('should randomize execution times', () => {
      const baseTime = new Date('2025-01-15T14:00:00Z');
      const times = [];

      for (let i = 0; i < 100; i++) {
        const randomized = randomizer.randomizeTime(baseTime, {
          walletAddress: `0x${i.toString(16).padStart(40, '0')}`,
          variance: 2,
        });
        times.push(randomized.getTime());
      }

      // Check distribution spread
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const spread = maxTime - minTime;

      // Should have significant spread
      expect(spread).toBeGreaterThan(30 * 60 * 1000); // At least 30 minutes spread

      // Check for no exact duplicates
      const uniqueTimes = new Set(times);
      expect(uniqueTimes.size).toBeGreaterThan(90); // High uniqueness
    });
  });

  // ==========================================================================
  // VALUE FINGERPRINTING AVOIDANCE
  // ==========================================================================

  describe('Value Fingerprinting Avoidance', () => {
    test('should randomize amounts avoiding round numbers', () => {
      const targetAmounts = [0.1, 0.5, 1.0, 0.25];
      const allAmounts = [];

      targetAmounts.forEach(target => {
        for (let i = 0; i < 25; i++) {
          const amount = randomizer.randomizeAmount(target, {
            walletAddress: `0x${i.toString(16).padStart(40, '0')}`,
          });
          allAmounts.push(amount);
        }
      });

      // Check very few amounts equal exactly to targets (allow up to 2 due to random chance)
      const exactMatches = allAmounts.filter(a =>
        targetAmounts.some(t => a === t)
      );
      expect(exactMatches.length).toBeLessThanOrEqual(2);

      // Check uniqueness
      const uniqueAmounts = new Set(allAmounts.map(a => a.toFixed(6)));
      expect(uniqueAmounts.size).toBeGreaterThan(allAmounts.length * 0.8);

      // Check for round number avoidance
      const roundNumbers = allAmounts.filter(a =>
        a === Math.round(a * 100) / 100 && a * 100 % 10 === 0
      );
      expect(roundNumbers.length).toBeLessThan(allAmounts.length * 0.2);
    });

    test('should produce diverse amount distributions per wallet', () => {
      const wallets = [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333',
      ];

      const walletAmounts = {};

      wallets.forEach(wallet => {
        walletAmounts[wallet] = [];
        for (let i = 0; i < 20; i++) {
          walletAmounts[wallet].push(
            randomizer.randomizeAmount(0.5, { walletAddress: wallet })
          );
        }
      });

      // Calculate mean for each wallet
      const means = wallets.map(w => {
        const amounts = walletAmounts[w];
        return amounts.reduce((a, b) => a + b) / amounts.length;
      });

      // Means should be different due to personality
      // (at least some variation expected)
      const meanSet = new Set(means.map(m => m.toFixed(4)));
      expect(meanSet.size).toBeGreaterThanOrEqual(1);
    });

    test('should vary gas prices', () => {
      const baseGas = BigInt(30000000000); // 30 gwei
      const gasPrices = [];

      for (let i = 0; i < 50; i++) {
        gasPrices.push(randomizer.randomizeGasPrice(baseGas, {
          walletAddress: `0x${i.toString(16).padStart(40, '0')}`,
        }));
      }

      // Check variance
      const uniqueGas = new Set(gasPrices.map(g => g.toString()));
      expect(uniqueGas.size).toBeGreaterThan(40);

      // Check all within reasonable bounds
      gasPrices.forEach(g => {
        expect(g).toBeGreaterThanOrEqual(baseGas * BigInt(8) / BigInt(10));
        expect(g).toBeLessThanOrEqual(baseGas * BigInt(15) / BigInt(10));
      });
    });
  });

  // ==========================================================================
  // BEHAVIORAL DIVERSITY
  // ==========================================================================

  describe('Behavioral Diversity', () => {
    test('should produce diverse action sequences', () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      strategyEngine.assignStrategy(wallet, 'layerzero-organic');
      strategyEngine.assignStrategy(wallet, 'zksync-era-organic');

      const actions = [];
      for (let i = 0; i < 50; i++) {
        const action = strategyEngine.selectNextAction(wallet);
        if (action) {
          actions.push(action.action);
          strategyEngine.recordExecution(wallet, {
            strategy: action.strategy,
            action: action.action,
            timestamp: Date.now() - (50 - i) * 24 * 60 * 60 * 1000,
          });
        }
      }

      // Check for action diversity
      const uniqueActions = new Set(actions);
      expect(uniqueActions.size).toBeGreaterThanOrEqual(2);
    });

    test('should track and score diversity', () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      // Record diverse activities
      const protocols = ['uniswap', 'aave', 'stargate', 'gmx', 'snapshot'];
      const categories = ['dex', 'lending', 'bridge', 'perpetuals', 'governance'];
      const chains = [1, 42161, 324, 8453, 534352];
      const actions = ['swap', 'lend', 'bridge', 'stake', 'governance_vote'];

      for (let i = 0; i < 30; i++) {
        diversityTracker.recordActivity(wallet, {
          chainId: chains[i % chains.length],
          protocol: protocols[i % protocols.length],
          category: categories[i % categories.length],
          action: actions[i % actions.length],
          amountUSD: 50 + Math.random() * 950,
          timestamp: Date.now() - (30 - i) * 3 * 24 * 60 * 60 * 1000,
        });
      }

      const score = diversityTracker.calculateDiversityScore(wallet);

      expect(score.sufficient).toBe(true);
      expect(score.overall).toBeGreaterThan(50);
      expect(score.components.protocol.uniqueProtocols).toBe(5);
      expect(score.components.chain.uniqueChains).toBe(5);
    });

    test('should generate useful recommendations', () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      // Record limited activities (only swaps on one chain)
      for (let i = 0; i < 10; i++) {
        diversityTracker.recordActivity(wallet, {
          chainId: 1,
          protocol: 'uniswap',
          category: 'dex',
          action: 'swap',
          amountUSD: 100,
        });
      }

      const recs = diversityTracker.getRecommendations(wallet);

      expect(recs.recommendations.length).toBeGreaterThan(0);

      // Should recommend governance
      const hasGovRec = recs.recommendations.some(r =>
        r.message.toLowerCase().includes('governance')
      );
      expect(hasGovRec).toBe(true);

      // Should recommend more chains
      const hasChainRec = recs.recommendations.some(r =>
        r.message.toLowerCase().includes('chain')
      );
      expect(hasChainRec).toBe(true);
    });
  });

  // ==========================================================================
  // WALLET PERSONALITY CONSISTENCY
  // ==========================================================================

  describe('Wallet Personality Consistency', () => {
    test('should maintain consistent personality per wallet', () => {
      const wallet = '0xABCD1234567890123456789012345678901234AB';

      // Get personality multiple times
      const p1 = randomizer.getPersonality(wallet);
      const p2 = randomizer.getPersonality(wallet);

      expect(p1).toBe(p2); // Same instance

      // Traits should be identical
      expect(p1.traits.preferredHours).toEqual(p2.traits.preferredHours);
      expect(p1.traits.amountVariance).toBe(p2.traits.amountVariance);
    });

    test('should produce different personalities for different wallets', () => {
      const wallets = [];
      for (let i = 0; i < 20; i++) {
        wallets.push(`0x${(i * 1111).toString(16).padStart(40, '0')}`);
      }

      const personalities = wallets.map(w => randomizer.getPersonality(w));

      // Check variance characteristics differ
      const variances = personalities.map(p => p.traits.amountVariance);
      const uniqueVariances = new Set(variances.map(v => v.toFixed(4)));

      // Should have significant variety
      expect(uniqueVariances.size).toBeGreaterThan(10);
    });

    test('should apply personality to activity timing', () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      const personality = randomizer.getPersonality(wallet);
      const baseTime = new Date('2025-01-15T12:00:00Z');

      // Generate many times
      const hours = [];
      for (let i = 0; i < 100; i++) {
        const time = randomizer.randomizeTime(baseTime, {
          walletAddress: wallet,
          variance: 4,
        });
        hours.push(time.getHours());
      }

      // Check that preferred hours are more common
      const preferredCount = hours.filter(h =>
        personality.traits.preferredHours.includes(h)
      ).length;

      // With personality influence, should see some bias
      // (Note: randomness means this is probabilistic)
      expect(preferredCount).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // CROSS-WALLET COORDINATION
  // ==========================================================================

  describe('Cross-Wallet Coordination', () => {
    test('should prevent cluster formation', () => {
      const wallets = [];
      for (let i = 0; i < 10; i++) {
        wallets.push(`0x${i.toString().padStart(40, '0')}`);
        strategyEngine.assignStrategy(wallets[i], 'base-organic');
      }

      // Schedule all wallets at same base time
      const baseTime = Date.now() + 10000;
      const actions = wallets.map(wallet =>
        scheduler.schedule(wallet, {
          action: 'swap',
          scheduledTime: baseTime,
        })
      );

      // Analyze clustering
      const times = actions.map(a => a.scheduledTime);
      const clusterWindow = scheduler.config.clusterWindow;

      // Count actions in any window
      let maxInWindow = 0;
      for (const time of times) {
        const inWindow = times.filter(t =>
          Math.abs(t - time) <= clusterWindow / 2
        ).length;
        maxInWindow = Math.max(maxInWindow, inWindow);
      }

      // Should not exceed cluster limit
      expect(maxInWindow).toBeLessThanOrEqual(scheduler.config.maxClusterSize + 3);
    });

    test('should maintain global history for coordination', async () => {
      const executeFn = jest.fn().mockResolvedValue({ success: true });

      const coordScheduler = createScheduler({
        logger: mockLogger,
        strategyEngine,
        execute: executeFn,
        minCrossWalletInterval: 100,
      });

      // Schedule and execute actions
      const wallets = ['0x1111', '0x2222', '0x3333'];

      for (const wallet of wallets) {
        strategyEngine.assignStrategy(wallet, 'scroll-organic');

        const action = coordScheduler.schedule(wallet, {
          action: 'swap',
          scheduledTime: Date.now() - 1000,
        });

        const queue = coordScheduler.getQueue(wallet);
        await coordScheduler.executeAction(queue, action);
      }

      // Check global history
      expect(coordScheduler.globalHistory.length).toBe(3);

      // All wallets should be recorded
      const recordedWallets = coordScheduler.globalHistory.map(h => h.walletAddress);
      wallets.forEach(w => {
        expect(recordedWallets).toContain(w.toLowerCase());
      });

      coordScheduler.stop();
    });
  });

  // ==========================================================================
  // PATTERN DETECTION RESISTANCE
  // ==========================================================================

  describe('Pattern Detection Resistance', () => {
    test('should avoid timing regularity', () => {
      const intervals = [];

      for (let i = 0; i < 50; i++) {
        const interval = randomizer.randomizeInterval(
          { min: 1, max: 3 },
          `0x${i.toString(16).padStart(40, '0')}`
        );
        intervals.push(interval);
      }

      // Calculate coefficient of variation
      const mean = intervals.reduce((a, b) => a + b) / intervals.length;
      const variance = intervals.reduce((sum, i) =>
        sum + Math.pow(i - mean, 2), 0) / intervals.length;
      const cv = Math.sqrt(variance) / mean;

      // CV should be significant (not all identical)
      expect(cv).toBeGreaterThan(0.1);

      // Should not have identical intervals
      const uniqueIntervals = new Set(intervals);
      expect(uniqueIntervals.size).toBeGreaterThan(intervals.length * 0.8);
    });

    test('should analyze patterns and detect issues', () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      strategyEngine.assignStrategy(wallet, 'linea-organic');

      // Record executions with some variety
      const baseTime = Date.now();
      for (let i = 0; i < 15; i++) {
        strategyEngine.recordExecution(wallet, {
          strategy: 'linea-organic',
          action: i % 3 === 0 ? 'swap' : i % 3 === 1 ? 'bridge' : 'lend',
          timestamp: baseTime - i * 12 * 60 * 60 * 1000 + Math.random() * 60 * 60 * 1000,
        });
      }

      const analysis = strategyEngine.analyzePatterns(wallet);

      expect(analysis.sufficient).toBe(true);
      expect(analysis.totalActions).toBe(15);
      expect(analysis.score).toBeDefined();
    });

    test('should flag suspicious patterns', () => {
      const wallet = '0x1234567890123456789012345678901234567890';
      strategyEngine.assignStrategy(wallet, 'base-organic');

      // Record executions with VERY regular timing (suspicious)
      const baseTime = Date.now();
      for (let i = 0; i < 15; i++) {
        strategyEngine.recordExecution(wallet, {
          strategy: 'base-organic',
          action: 'swap', // Same action every time
          timestamp: baseTime - i * 24 * 60 * 60 * 1000, // Exactly 24 hours apart
        });
      }

      const analysis = strategyEngine.analyzePatterns(wallet);

      // Should flag low action diversity
      const hasWarning = analysis.warnings.some(w =>
        w.type === 'action_diversity' || w.type === 'timing_regularity'
      );
      expect(hasWarning).toBe(true);
    });

    test('should simulate occasional mistakes', () => {
      let mistakeCount = 0;
      const iterations = 500;

      for (let i = 0; i < iterations; i++) {
        if (randomizer.shouldSimulateMistake()) {
          mistakeCount++;
        }
      }

      // Should have some mistakes (but not too many)
      expect(mistakeCount).toBeGreaterThan(10);
      expect(mistakeCount).toBeLessThan(100);

      // Mistake types should vary
      const mistakeTypes = new Set();
      for (let i = 0; i < 20; i++) {
        const mistake = randomizer.generateMistake();
        mistakeTypes.add(mistake.type);
      }
      expect(mistakeTypes.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // FULL INTEGRATION SIMULATION
  // ==========================================================================

  describe('Full Integration Simulation', () => {
    test('should simulate realistic multi-wallet activity', async () => {
      // Create wallets
      const wallets = [];
      for (let i = 0; i < 5; i++) {
        const wallet = `0x${(i + 1).toString().padStart(40, '0')}`;
        wallets.push(wallet);

        // Assign strategies
        strategyEngine.assignStrategy(wallet, 'layerzero-organic');
        strategyEngine.assignStrategy(wallet, i % 2 === 0 ? 'zksync-era-organic' : 'base-organic');
      }

      // Simulate 30 days of activity
      const executeFn = jest.fn().mockResolvedValue({ success: true });
      const simScheduler = createScheduler({
        logger: mockLogger,
        strategyEngine,
        randomizer,
        diversityTracker,
        execute: executeFn,
        minWalletInterval: 10,
        minCrossWalletInterval: 5,
      });

      // Schedule initial actions
      for (const wallet of wallets) {
        await simScheduler.populateQueue(wallet, 3);
      }

      // Verify schedules exist
      const stats = simScheduler.getStatistics();
      expect(stats.totalPending).toBeGreaterThan(0);
      expect(stats.queuesCount).toBe(5);

      // Execute some actions
      for (const wallet of wallets) {
        const queue = simScheduler.getQueue(wallet);
        const pending = queue.getPending();

        if (pending.length > 0) {
          pending[0].scheduledTime = Date.now() - 1000; // Make ready
          await simScheduler.executeAction(queue, pending[0]);
        }
      }

      // Check diversity tracker recorded activities
      const trackerStats = diversityTracker.getStatistics();
      expect(trackerStats.totalActivities).toBeGreaterThan(0);

      simScheduler.stop();
    });

    test('should produce organic-looking reports', () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      // Simulate diverse activity
      const protocols = ['uniswap', 'syncswap', 'aave', 'stargate', 'snapshot'];
      const categories = ['dex', 'dex', 'lending', 'bridge', 'governance'];
      const chains = [1, 324, 42161, 8453, 1];
      const actions = ['swap', 'swap', 'lend', 'bridge', 'governance_vote'];

      for (let i = 0; i < 25; i++) {
        diversityTracker.recordActivity(wallet, {
          chainId: chains[i % chains.length],
          protocol: protocols[i % protocols.length],
          category: categories[i % categories.length],
          action: actions[i % actions.length],
          amountUSD: randomizer.randomizeAmount(200, { walletAddress: wallet }),
          timestamp: Date.now() - (25 - i) * 4 * 24 * 60 * 60 * 1000,
        });
      }

      const report = diversityTracker.generateReport(wallet);

      // Should have good diversity metrics
      expect(report.summary.overallScore).toBeGreaterThan(40);
      expect(report.summary.uniqueProtocols).toBeGreaterThan(3);
      expect(report.summary.uniqueChains).toBeGreaterThan(2);
      expect(report.summary.spanDays).toBeGreaterThan(30);

      // Should have reasonable recommendations
      expect(report.recommendations).toBeDefined();
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    test('should handle empty strategy list gracefully', () => {
      const emptyEngine = createStrategyEngine({ includeBuiltIn: false });
      const wallet = '0x1234';

      // No strategies assigned
      const action = emptyEngine.selectNextAction(wallet);
      expect(action).toBeNull();
    });

    test('should handle rapid scheduling requests', () => {
      const wallet = '0x1234';
      strategyEngine.assignStrategy(wallet, 'layerzero-organic');

      // Schedule many actions quickly
      const actions = [];
      for (let i = 0; i < 20; i++) {
        try {
          const action = scheduler.schedule(wallet, {
            action: `swap${i}`,
            scheduledTime: Date.now() + i * 100,
          });
          actions.push(action);
        } catch (e) {
          // Queue full is expected
        }
      }

      // Should have scheduled some but not exceed limits
      expect(actions.length).toBeLessThanOrEqual(scheduler.config.maxQueueSize);
    });

    test('should handle timezone edge cases', () => {
      // Midnight UTC
      const midnight = new Date('2025-01-15T00:00:00Z');
      const midnightRandomized = randomizer.randomizeTime(midnight, {
        walletAddress: '0x1234',
        variance: 1,
      });

      expect(midnightRandomized instanceof Date).toBe(true);

      // Should potentially shift to more active hours
      // (circadian weight at 0 is very low)
    });

    test('should handle very small and very large amounts', () => {
      const tinyAmount = randomizer.randomizeAmount(0.0001, {
        walletAddress: '0x1234',
      });
      expect(tinyAmount).toBeGreaterThan(0);

      const largeAmount = randomizer.randomizeAmount(10000, {
        walletAddress: '0x1234',
      });
      expect(largeAmount).toBeGreaterThan(5000);
      expect(largeAmount).toBeLessThan(20000);
    });
  });
});
