'use strict';

/**
 * Diversity Tracker Tests
 *
 * Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * THE 6 W's: DIVERSITY TRACKER TESTING
 * =============================================================================
 *
 * WHO: Tests for DiversityTracker - protocol diversity analysis
 *
 * WHAT we test:
 * - Activity recording and storage
 * - Protocol diversity scoring
 * - Chain diversity scoring
 * - Action type diversity
 * - Time distribution analysis
 * - Recommendation generation
 *
 * WHEN: On every commit, before deployment
 *
 * WHERE: tests/airdrop/diversity-tracker.test.js
 *
 * WHY: Ensure diversity tracking works for airdrop optimization
 *
 * HOW: Jest unit tests with mock activity data
 *
 * =============================================================================
 */

const {
  DiversityTracker,
  ActivityRecord,
  PROTOCOL_CATEGORIES,
  KNOWN_PROTOCOLS,
  CHAIN_INFO,
  ACTION_TYPES,
  DIVERSITY_THRESHOLDS,
  createDiversityTracker,
} = require('../../src/airdrop/diversity-tracker');

describe('Diversity Tracker', () => {
  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  describe('Constants', () => {
    test('PROTOCOL_CATEGORIES should have required categories', () => {
      expect(PROTOCOL_CATEGORIES.DEX).toBeDefined();
      expect(PROTOCOL_CATEGORIES.LENDING).toBeDefined();
      expect(PROTOCOL_CATEGORIES.BRIDGE).toBeDefined();
      expect(PROTOCOL_CATEGORIES.GOVERNANCE).toBeDefined();
    });

    test('PROTOCOL_CATEGORIES should have weights', () => {
      expect(PROTOCOL_CATEGORIES.BRIDGE.weight).toBeGreaterThan(1);
      expect(PROTOCOL_CATEGORIES.GOVERNANCE.weight).toBeGreaterThan(1);
    });

    test('KNOWN_PROTOCOLS should have major protocols', () => {
      expect(KNOWN_PROTOCOLS.dex).toContain('uniswap');
      expect(KNOWN_PROTOCOLS.lending).toContain('aave');
      expect(KNOWN_PROTOCOLS.bridge).toContain('stargate');
    });

    test('CHAIN_INFO should have major chains', () => {
      expect(CHAIN_INFO[1]).toBeDefined(); // Ethereum
      expect(CHAIN_INFO[42161]).toBeDefined(); // Arbitrum
      expect(CHAIN_INFO[324]).toBeDefined(); // zkSync
      expect(CHAIN_INFO[8453]).toBeDefined(); // Base
    });

    test('CHAIN_INFO should have correct types', () => {
      expect(CHAIN_INFO[1].type).toBe('L1');
      expect(CHAIN_INFO[42161].type).toBe('L2_optimistic');
      expect(CHAIN_INFO[324].type).toBe('L2_zk');
    });

    test('ACTION_TYPES should have correct weights', () => {
      expect(ACTION_TYPES.BRIDGE.weight).toBeGreaterThan(ACTION_TYPES.SWAP.weight);
      expect(ACTION_TYPES.GOVERNANCE_VOTE.weight).toBeGreaterThan(1);
    });

    test('DIVERSITY_THRESHOLDS should be ordered', () => {
      expect(DIVERSITY_THRESHOLDS.EXCELLENT).toBeGreaterThan(DIVERSITY_THRESHOLDS.GOOD);
      expect(DIVERSITY_THRESHOLDS.GOOD).toBeGreaterThan(DIVERSITY_THRESHOLDS.MODERATE);
      expect(DIVERSITY_THRESHOLDS.MODERATE).toBeGreaterThan(DIVERSITY_THRESHOLDS.LOW);
    });
  });

  // ==========================================================================
  // ACTIVITY RECORD CLASS
  // ==========================================================================

  describe('ActivityRecord', () => {
    test('should create record with data', () => {
      const record = new ActivityRecord({
        chainId: 1,
        protocol: 'uniswap',
        category: 'dex',
        action: 'swap',
        amount: 0.5,
        amountUSD: 1500,
      });

      expect(record.chainId).toBe(1);
      expect(record.protocol).toBe('uniswap');
      expect(record.action).toBe('swap');
      expect(record.id).toBeDefined();
      expect(record.timestamp).toBeDefined();
    });

    test('should normalize protocol name', () => {
      const record = new ActivityRecord({
        protocol: 'UniSwap',
        category: 'DEX',
        action: 'SWAP',
      });

      expect(record.protocol).toBe('uniswap');
      expect(record.category).toBe('dex');
      expect(record.action).toBe('swap');
    });

    test('should convert to JSON', () => {
      const record = new ActivityRecord({
        chainId: 1,
        protocol: 'aave',
        action: 'lend',
        txHash: '0x123',
      });

      const json = record.toJSON();
      expect(json.chainId).toBe(1);
      expect(json.protocol).toBe('aave');
      expect(json.txHash).toBe('0x123');
    });
  });

  // ==========================================================================
  // DIVERSITY TRACKER CLASS
  // ==========================================================================

  describe('DiversityTracker', () => {
    let tracker;

    beforeEach(() => {
      tracker = new DiversityTracker({
        logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
        minActivityForScore: 5,
      });
    });

    describe('Activity Recording', () => {
      test('should record activity', () => {
        const record = tracker.recordActivity('0x1234', {
          chainId: 1,
          protocol: 'uniswap',
          action: 'swap',
        });

        expect(record).toBeInstanceOf(ActivityRecord);

        const activities = tracker.getActivities('0x1234');
        expect(activities).toHaveLength(1);
      });

      test('should normalize wallet address', () => {
        tracker.recordActivity('0xABCD', { protocol: 'aave', action: 'lend' });

        const activities = tracker.getActivities('0xabcd');
        expect(activities).toHaveLength(1);
      });

      test('should emit event on record', () => {
        const handler = jest.fn();
        tracker.on('activityRecorded', handler);

        tracker.recordActivity('0x1234', { protocol: 'curve', action: 'swap' });

        expect(handler).toHaveBeenCalled();
      });

      test('should filter activities by chain', () => {
        tracker.recordActivity('0x1234', { chainId: 1, action: 'swap' });
        tracker.recordActivity('0x1234', { chainId: 42161, action: 'swap' });
        tracker.recordActivity('0x1234', { chainId: 1, action: 'bridge' });

        const ethereumActivities = tracker.getActivities('0x1234', { chainId: 1 });
        expect(ethereumActivities).toHaveLength(2);
      });

      test('should filter activities by category', () => {
        tracker.recordActivity('0x1234', { category: 'dex', action: 'swap' });
        tracker.recordActivity('0x1234', { category: 'lending', action: 'lend' });
        tracker.recordActivity('0x1234', { category: 'dex', action: 'swap' });

        const dexActivities = tracker.getActivities('0x1234', { category: 'dex' });
        expect(dexActivities).toHaveLength(2);
      });

      test('should filter activities by date range', () => {
        const now = Date.now();
        const oldTime = now - 100 * 24 * 60 * 60 * 1000;

        tracker.recordActivity('0x1234', { action: 'swap', timestamp: oldTime });
        tracker.recordActivity('0x1234', { action: 'bridge', timestamp: now });

        const recentActivities = tracker.getActivities('0x1234', {
          since: now - 7 * 24 * 60 * 60 * 1000,
        });
        expect(recentActivities).toHaveLength(1);
        expect(recentActivities[0].action).toBe('bridge');
      });
    });

    describe('Diversity Scoring', () => {
      function addDiverseActivities(wallet, count = 20) {
        const protocols = ['uniswap', 'aave', 'stargate', 'gmx', 'opensea'];
        const categories = ['dex', 'lending', 'bridge', 'perpetuals', 'nft'];
        const chains = [1, 42161, 324, 8453, 534352];
        const actions = ['swap', 'lend', 'bridge', 'stake', 'nft_mint'];

        for (let i = 0; i < count; i++) {
          tracker.recordActivity(wallet, {
            chainId: chains[i % chains.length],
            protocol: protocols[i % protocols.length],
            category: categories[i % categories.length],
            action: actions[i % actions.length],
            amountUSD: 100 + Math.random() * 900,
            timestamp: Date.now() - (count - i) * 24 * 60 * 60 * 1000,
          });
        }
      }

      test('should require minimum activities', () => {
        tracker.recordActivity('0x1234', { action: 'swap' });
        tracker.recordActivity('0x1234', { action: 'bridge' });

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.sufficient).toBe(false);
      });

      test('should calculate score with sufficient activities', () => {
        addDiverseActivities('0x1234', 20);

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.sufficient).toBe(true);
        expect(score.overall).toBeGreaterThan(0);
        expect(score.overall).toBeLessThanOrEqual(100);
      });

      test('should have all score components', () => {
        addDiverseActivities('0x1234', 20);

        const score = tracker.calculateDiversityScore('0x1234');

        expect(score.components.protocol).toBeDefined();
        expect(score.components.chain).toBeDefined();
        expect(score.components.action).toBeDefined();
        expect(score.components.category).toBeDefined();
        expect(score.components.time).toBeDefined();
        expect(score.components.amount).toBeDefined();
      });

      test('should assign score level', () => {
        addDiverseActivities('0x1234', 30);

        const score = tracker.calculateDiversityScore('0x1234');

        expect(['excellent', 'good', 'moderate', 'low', 'poor']).toContain(score.level);
      });

      test('should cache scores', () => {
        addDiverseActivities('0x1234', 20);

        const score1 = tracker.calculateDiversityScore('0x1234');
        const score2 = tracker.calculateDiversityScore('0x1234');

        expect(score1).toBe(score2); // Same reference
      });

      test('should invalidate cache on new activity', () => {
        addDiverseActivities('0x1234', 20);

        const score1 = tracker.calculateDiversityScore('0x1234');

        tracker.recordActivity('0x1234', { action: 'governance_vote' });

        const score2 = tracker.calculateDiversityScore('0x1234');
        expect(score1).not.toBe(score2);
      });

      test('should force refresh when requested', () => {
        addDiverseActivities('0x1234', 20);

        const score1 = tracker.calculateDiversityScore('0x1234');
        const score2 = tracker.calculateDiversityScore('0x1234', { forceRefresh: true });

        expect(score1).not.toBe(score2);
      });
    });

    describe('Protocol Score', () => {
      test('should score higher for more protocols', () => {
        const wallet1 = '0x1111';
        const wallet2 = '0x2222';

        // Wallet 1: uses 2 protocols
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity(wallet1, {
            protocol: i % 2 === 0 ? 'uniswap' : 'aave',
            action: 'swap',
          });
        }

        // Wallet 2: uses 5 protocols
        const protocols = ['uniswap', 'aave', 'stargate', 'gmx', 'curve'];
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity(wallet2, {
            protocol: protocols[i % 5],
            action: 'swap',
          });
        }

        const score1 = tracker.calculateDiversityScore(wallet1);
        const score2 = tracker.calculateDiversityScore(wallet2);

        expect(score2.components.protocol.score)
          .toBeGreaterThan(score1.components.protocol.score);
      });

      test('should penalize concentration in one protocol', () => {
        // All activities on one protocol
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            protocol: 'uniswap',
            action: 'swap',
          });
        }

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.protocol.maxConcentration).toBe(100);
      });
    });

    describe('Chain Score', () => {
      test('should score higher for more chains', () => {
        // Wallet with multiple chains
        const chains = [1, 42161, 324, 8453, 534352];
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            chainId: chains[i % chains.length],
            protocol: 'protocol',
            action: 'swap',
          });
        }

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.chain.uniqueChains).toBe(5);
        expect(score.components.chain.score).toBeGreaterThan(50);
      });

      test('should give bonus for ZK chains', () => {
        // Only non-ZK chains
        for (let i = 0; i < 6; i++) {
          tracker.recordActivity('0x1111', {
            chainId: [1, 42161, 10][i % 3],
            action: 'swap',
          });
        }

        // Include ZK chains
        for (let i = 0; i < 6; i++) {
          tracker.recordActivity('0x2222', {
            chainId: [324, 534352, 59144][i % 3],
            action: 'swap',
          });
        }

        const score1 = tracker.calculateDiversityScore('0x1111');
        const score2 = tracker.calculateDiversityScore('0x2222');

        expect(score2.components.chain.hasZkChains).toBe(true);
        expect(score1.components.chain.hasZkChains).toBe(false);
      });
    });

    describe('Action Score', () => {
      test('should score higher for diverse actions', () => {
        const actions = ['swap', 'bridge', 'lend', 'stake', 'governance_vote'];

        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            action: actions[i % actions.length],
            protocol: 'protocol',
          });
        }

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.action.uniqueActions).toBe(5);
        expect(score.components.action.hasHighValueActions).toBe(true);
      });

      test('should penalize only doing swaps', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            action: 'swap',
            protocol: 'uniswap',
          });
        }

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.action.uniqueActions).toBe(1);
      });
    });

    describe('Category Score', () => {
      test('should give bonus for governance', () => {
        const categories = ['dex', 'lending', 'governance'];

        for (let i = 0; i < 9; i++) {
          tracker.recordActivity('0x1234', {
            category: categories[i % 3],
            action: 'action',
          });
        }

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.category.hasGovernance).toBe(true);
      });

      test('should give bonus for bridge usage', () => {
        tracker.recordActivity('0x1234', { category: 'dex', action: 'swap' });
        tracker.recordActivity('0x1234', { category: 'bridge', action: 'bridge' });
        tracker.recordActivity('0x1234', { category: 'lending', action: 'lend' });
        tracker.recordActivity('0x1234', { category: 'dex', action: 'swap' });
        tracker.recordActivity('0x1234', { category: 'bridge', action: 'bridge' });

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.category.hasBridge).toBe(true);
      });
    });

    describe('Time Score', () => {
      test('should score higher for longer activity span', () => {
        // Short span (all in one week)
        const now = Date.now();
        for (let i = 0; i < 5; i++) {
          tracker.recordActivity('0x1111', {
            action: 'swap',
            timestamp: now - i * 24 * 60 * 60 * 1000,
          });
        }

        // Long span (90 days)
        for (let i = 0; i < 5; i++) {
          tracker.recordActivity('0x2222', {
            action: 'swap',
            timestamp: now - i * 20 * 24 * 60 * 60 * 1000,
          });
        }

        const score1 = tracker.calculateDiversityScore('0x1111');
        const score2 = tracker.calculateDiversityScore('0x2222');

        expect(score2.components.time.spanDays)
          .toBeGreaterThan(score1.components.time.spanDays);
      });

      test('should penalize burst farming', () => {
        const now = Date.now();

        // All activities within 30 minutes
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            action: 'swap',
            timestamp: now - i * 3 * 60 * 1000, // 3 minutes apart
          });
        }

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.time.burstRatio).toBeGreaterThan(50);
      });
    });

    describe('Amount Score', () => {
      test('should penalize uniform amounts', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            action: 'swap',
            amountUSD: 100, // Same amount every time
          });
        }

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.amount.coefficientOfVariation).toBe(0);
      });

      test('should reward varied amounts', () => {
        const amounts = [50, 150, 75, 200, 125, 300, 80, 175, 250, 100];

        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            action: 'swap',
            amountUSD: amounts[i],
          });
        }

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.amount.coefficientOfVariation).toBeGreaterThan(0);
        expect(score.components.amount.score).toBeGreaterThan(50);
      });

      test('should penalize round numbers', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            action: 'swap',
            amountUSD: (i + 1) * 100, // 100, 200, 300, etc.
          });
        }

        const score = tracker.calculateDiversityScore('0x1234');
        expect(score.components.amount.roundNumberRatio).toBeGreaterThan(50);
      });
    });

    describe('Recommendations', () => {
      test('should generate recommendations for low score', () => {
        // Minimal activity with low diversity
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            chainId: 1,
            protocol: 'uniswap',
            category: 'dex',
            action: 'swap',
          });
        }

        const recs = tracker.getRecommendations('0x1234');
        expect(recs.recommendations.length).toBeGreaterThan(0);
      });

      test('should recommend governance if missing', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            chainId: 1,
            protocol: 'uniswap',
            category: 'dex',
            action: 'swap',
          });
        }

        const recs = tracker.getRecommendations('0x1234');
        const govRec = recs.recommendations.find(r =>
          r.message.includes('governance')
        );

        expect(govRec).toBeDefined();
      });

      test('should recommend bridges if missing', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            chainId: 1,
            protocol: 'uniswap',
            category: 'dex',
            action: 'swap',
          });
        }

        const recs = tracker.getRecommendations('0x1234');
        const bridgeRec = recs.recommendations.find(r =>
          r.message.includes('bridge')
        );

        expect(bridgeRec).toBeDefined();
      });

      test('should prioritize recommendations', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            action: 'swap',
            protocol: 'uniswap',
          });
        }

        const recs = tracker.getRecommendations('0x1234');

        // Should be sorted by priority
        const priorities = recs.recommendations.map(r => r.priority);
        const priorityOrder = { high: 0, medium: 1, low: 2 };

        for (let i = 1; i < priorities.length; i++) {
          expect(priorityOrder[priorities[i]])
            .toBeGreaterThanOrEqual(priorityOrder[priorities[i - 1]]);
        }
      });
    });

    describe('Analytics', () => {
      test('should generate report', () => {
        for (let i = 0; i < 15; i++) {
          tracker.recordActivity('0x1234', {
            chainId: [1, 42161, 324][i % 3],
            protocol: ['uniswap', 'aave', 'stargate'][i % 3],
            category: ['dex', 'lending', 'bridge'][i % 3],
            action: ['swap', 'lend', 'bridge'][i % 3],
          });
        }

        const report = tracker.generateReport('0x1234');

        expect(report.wallet).toBe('0x1234');
        expect(report.summary).toBeDefined();
        expect(report.summary.overallScore).toBeGreaterThanOrEqual(0);
        expect(report.topProtocols).toBeInstanceOf(Array);
        expect(report.topChains).toBeInstanceOf(Array);
        expect(report.recentActivity).toBeInstanceOf(Array);
      });

      test('should get top protocols', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            protocol: i < 5 ? 'uniswap' : 'aave',
            action: 'swap',
          });
        }

        const activities = tracker.getActivities('0x1234');
        const top = tracker.getTopProtocols(activities, 2);

        expect(top).toHaveLength(2);
        expect(top[0].protocol).toBe('uniswap');
        expect(top[0].count).toBe(5);
      });

      test('should get top chains', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', {
            chainId: i < 7 ? 1 : 42161,
            action: 'swap',
          });
        }

        const activities = tracker.getActivities('0x1234');
        const top = tracker.getTopChains(activities, 2);

        expect(top).toHaveLength(2);
        expect(top[0].chainId).toBe(1);
        expect(top[0].count).toBe(7);
        expect(top[0].name).toBe('Ethereum');
      });
    });

    describe('Utilities', () => {
      test('should get protocol category', () => {
        expect(tracker.getProtocolCategory('uniswap')).toBe('dex');
        expect(tracker.getProtocolCategory('aave')).toBe('lending');
        expect(tracker.getProtocolCategory('stargate')).toBe('bridge');
        expect(tracker.getProtocolCategory('unknown_protocol')).toBe('unknown');
      });

      test('should get statistics', () => {
        tracker.recordActivity('0x1234', { action: 'swap' });
        tracker.recordActivity('0x5678', { action: 'bridge' });
        tracker.recordActivity('0x1234', { action: 'lend' });

        const stats = tracker.getStatistics();
        expect(stats.walletsTracked).toBe(2);
        expect(stats.totalActivities).toBe(3);
      });

      test('should clear cache', () => {
        for (let i = 0; i < 10; i++) {
          tracker.recordActivity('0x1234', { action: 'swap' });
        }

        tracker.calculateDiversityScore('0x1234');
        expect(tracker.cachedScores.size).toBe(1);

        tracker.clearCache();
        expect(tracker.cachedScores.size).toBe(0);
      });
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION
  // ==========================================================================

  describe('Factory Function', () => {
    test('should create tracker with defaults', () => {
      const tracker = createDiversityTracker();
      expect(tracker).toBeInstanceOf(DiversityTracker);
    });

    test('should accept custom config', () => {
      const tracker = createDiversityTracker({
        historyRetentionDays: 365,
        minActivityForScore: 3,
      });

      expect(tracker.config.historyRetentionDays).toBe(365);
      expect(tracker.config.minActivityForScore).toBe(3);
    });
  });

  // ==========================================================================
  // SYBIL RESISTANCE
  // ==========================================================================

  describe('Sybil Resistance Features', () => {
    let tracker;

    beforeEach(() => {
      tracker = createDiversityTracker();
    });

    test('low diversity should indicate Sybil risk', () => {
      // Single-protocol farmer pattern
      for (let i = 0; i < 20; i++) {
        tracker.recordActivity('0x1234', {
          chainId: 1,
          protocol: 'uniswap',
          category: 'dex',
          action: 'swap',
          timestamp: Date.now() - i * 4 * 60 * 60 * 1000,
        });
      }

      const score = tracker.calculateDiversityScore('0x1234');
      // Low or poor both indicate Sybil risk - single protocol farming pattern
      expect(['low', 'poor']).toContain(score.level);
    });

    test('high diversity should indicate organic user', () => {
      const protocols = ['uniswap', 'aave', 'stargate', 'gmx', 'snapshot'];
      const categories = ['dex', 'lending', 'bridge', 'perpetuals', 'governance'];
      const chains = [1, 42161, 324, 8453, 534352];
      const actions = ['swap', 'lend', 'bridge', 'stake', 'governance_vote'];

      for (let i = 0; i < 30; i++) {
        tracker.recordActivity('0x1234', {
          chainId: chains[i % chains.length],
          protocol: protocols[i % protocols.length],
          category: categories[i % categories.length],
          action: actions[i % actions.length],
          amountUSD: 100 + Math.random() * 900,
          timestamp: Date.now() - i * 3 * 24 * 60 * 60 * 1000,
        });
      }

      const score = tracker.calculateDiversityScore('0x1234');
      expect(score.overall).toBeGreaterThan(60);
    });

    test('governance participation should boost score', () => {
      // Without governance
      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('0x1111', {
          category: 'dex',
          action: 'swap',
          protocol: `p${i}`,
        });
      }

      // With governance
      for (let i = 0; i < 8; i++) {
        tracker.recordActivity('0x2222', {
          category: 'dex',
          action: 'swap',
          protocol: `p${i}`,
        });
      }
      tracker.recordActivity('0x2222', { category: 'governance', action: 'vote' });
      tracker.recordActivity('0x2222', { category: 'governance', action: 'vote' });

      const score1 = tracker.calculateDiversityScore('0x1111');
      const score2 = tracker.calculateDiversityScore('0x2222');

      expect(score2.components.category.hasGovernance).toBe(true);
    });
  });
});
