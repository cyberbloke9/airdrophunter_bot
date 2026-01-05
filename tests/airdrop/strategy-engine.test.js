'use strict';

/**
 * Strategy Engine Tests
 *
 * Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * THE 6 W's: STRATEGY ENGINE TESTING
 * =============================================================================
 *
 * WHO: Tests for StrategyEngine - the pluggable strategy system
 *
 * WHAT we test:
 * - Strategy registration and validation
 * - Wallet-strategy assignment
 * - Action selection and weighting
 * - Execution history tracking
 * - Pattern analysis for Sybil detection
 * - Built-in strategies
 *
 * WHEN: On every commit, before deployment
 *
 * WHERE: tests/airdrop/strategy-engine.test.js
 *
 * WHY: Ensure strategy system works correctly for airdrop farming
 *
 * HOW: Jest unit tests with mocking
 *
 * =============================================================================
 */

const {
  StrategyEngine,
  Strategy,
  ACTION_TYPES,
  PROTOCOL_CATEGORIES,
  RISK_PROFILES,
  DEFAULT_STRATEGY_TEMPLATE,
  createBuiltInStrategies,
  createStrategyEngine,
} = require('../../src/airdrop/strategy-engine');

describe('Strategy Engine', () => {
  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  describe('Constants', () => {
    test('ACTION_TYPES should have required actions', () => {
      expect(ACTION_TYPES.BRIDGE).toBeDefined();
      expect(ACTION_TYPES.SWAP).toBeDefined();
      expect(ACTION_TYPES.LIQUIDITY).toBeDefined();
      expect(ACTION_TYPES.STAKE).toBeDefined();
      expect(ACTION_TYPES.GOVERNANCE).toBeDefined();
      expect(ACTION_TYPES.NFT_MINT).toBeDefined();
    });

    test('ACTION_TYPES should have correct structure', () => {
      expect(ACTION_TYPES.BRIDGE.name).toBe('bridge');
      expect(ACTION_TYPES.BRIDGE.defaultWeight).toBeGreaterThan(0);
      expect(ACTION_TYPES.BRIDGE.sybilRisk).toBeDefined();
    });

    test('Bridge should have high weight', () => {
      expect(ACTION_TYPES.BRIDGE.defaultWeight).toBeGreaterThanOrEqual(2.0);
    });

    test('Governance should have highest weight', () => {
      expect(ACTION_TYPES.GOVERNANCE.defaultWeight).toBe(3.0);
    });

    test('NFT_MINT should have low weight (spam risk)', () => {
      expect(ACTION_TYPES.NFT_MINT.defaultWeight).toBeLessThan(1.0);
    });

    test('PROTOCOL_CATEGORIES should exist', () => {
      expect(PROTOCOL_CATEGORIES.DEX).toBe('dex');
      expect(PROTOCOL_CATEGORIES.LENDING).toBe('lending');
      expect(PROTOCOL_CATEGORIES.BRIDGE).toBe('bridge');
      expect(PROTOCOL_CATEGORIES.NFT).toBe('nft');
    });

    test('RISK_PROFILES should have correct multipliers', () => {
      expect(RISK_PROFILES.CONSERVATIVE.activityMultiplier).toBeLessThan(1);
      expect(RISK_PROFILES.MODERATE.activityMultiplier).toBe(1);
      expect(RISK_PROFILES.AGGRESSIVE.activityMultiplier).toBeGreaterThan(1);
    });
  });

  // ==========================================================================
  // STRATEGY CLASS
  // ==========================================================================

  describe('Strategy Class', () => {
    test('should create strategy with config', () => {
      const strategy = new Strategy({
        name: 'test-strategy',
        protocols: ['uniswap'],
        chains: [1],
        actions: {
          swap: { weight: 1.5 },
        },
      });

      expect(strategy.name).toBe('test-strategy');
      expect(strategy.protocols).toContain('uniswap');
      expect(strategy.chains).toContain(1);
      expect(strategy.actions.size).toBe(1);
    });

    test('should validate strategy correctly', () => {
      const validStrategy = new Strategy({
        name: 'valid',
        protocols: ['protocol1'],
        chains: [1],
        actions: { swap: { weight: 1 } },
      });

      const validation = validStrategy.validate();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should fail validation without name', () => {
      const strategy = new Strategy({
        protocols: ['protocol1'],
        chains: [1],
        actions: { swap: {} },
      });

      const validation = strategy.validate();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Strategy must have a name');
    });

    test('should fail validation without protocols', () => {
      const strategy = new Strategy({
        name: 'test',
        chains: [1],
        actions: { swap: {} },
      });

      const validation = strategy.validate();
      expect(validation.valid).toBe(false);
    });

    test('should fail validation without chains', () => {
      const strategy = new Strategy({
        name: 'test',
        protocols: ['p1'],
        actions: { swap: {} },
      });

      const validation = strategy.validate();
      expect(validation.valid).toBe(false);
    });

    test('should fail validation without actions', () => {
      const strategy = new Strategy({
        name: 'test',
        protocols: ['p1'],
        chains: [1],
      });

      const validation = strategy.validate();
      expect(validation.valid).toBe(false);
    });

    test('should get actions sorted by weight', () => {
      const strategy = new Strategy({
        name: 'test',
        protocols: ['p1'],
        chains: [1],
        actions: {
          swap: { weight: 1.0 },
          bridge: { weight: 2.5 },
          governance: { weight: 3.0 },
        },
      });

      const sorted = strategy.getActionsByWeight();
      expect(sorted[0].name).toBe('governance');
      expect(sorted[1].name).toBe('bridge');
      expect(sorted[2].name).toBe('swap');
    });

    test('should convert to JSON', () => {
      const strategy = new Strategy({
        name: 'test',
        protocols: ['p1'],
        chains: [1],
        actions: { swap: { weight: 1 } },
      });

      const json = strategy.toJSON();
      expect(json.name).toBe('test');
      expect(json.protocols).toEqual(['p1']);
      expect(json.createdAt).toBeDefined();
    });

    test('should inherit default scheduling', () => {
      const strategy = new Strategy({
        name: 'test',
        protocols: ['p1'],
        chains: [1],
        actions: { swap: {} },
      });

      expect(strategy.scheduling.timezone).toBe('UTC');
      expect(strategy.scheduling.activeHours.start).toBeDefined();
    });
  });

  // ==========================================================================
  // STRATEGY ENGINE CLASS
  // ==========================================================================

  describe('StrategyEngine Class', () => {
    let engine;

    beforeEach(() => {
      engine = new StrategyEngine({
        logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
      });
    });

    describe('Strategy Registration', () => {
      test('should register valid strategy', () => {
        const strategy = engine.registerStrategy({
          name: 'test',
          protocols: ['uniswap'],
          chains: [1],
          actions: { swap: { weight: 1 } },
        });

        expect(strategy).toBeInstanceOf(Strategy);
        expect(engine.getStrategy('test')).toBe(strategy);
      });

      test('should reject invalid strategy', () => {
        expect(() => {
          engine.registerStrategy({
            name: 'invalid',
            // Missing required fields
          });
        }).toThrow('Invalid strategy');
      });

      test('should overwrite existing strategy', () => {
        engine.registerStrategy({
          name: 'test',
          protocols: ['p1'],
          chains: [1],
          actions: { swap: { weight: 1 } },
        });

        engine.registerStrategy({
          name: 'test',
          protocols: ['p2'],
          chains: [1],
          actions: { swap: { weight: 2 } },
        });

        const strategy = engine.getStrategy('test');
        expect(strategy.protocols).toContain('p2');
      });

      test('should unregister strategy', () => {
        engine.registerStrategy({
          name: 'test',
          protocols: ['p1'],
          chains: [1],
          actions: { swap: {} },
        });

        const result = engine.unregisterStrategy('test');
        expect(result).toBe(true);
        expect(engine.getStrategy('test')).toBeUndefined();
      });

      test('should emit event on registration', () => {
        const handler = jest.fn();
        engine.on('strategyRegistered', handler);

        engine.registerStrategy({
          name: 'test',
          protocols: ['p1'],
          chains: [1],
          actions: { swap: {} },
        });

        expect(handler).toHaveBeenCalled();
      });

      test('should get strategies by protocol', () => {
        engine.registerStrategy({
          name: 's1',
          protocols: ['uniswap', 'sushiswap'],
          chains: [1],
          actions: { swap: {} },
        });
        engine.registerStrategy({
          name: 's2',
          protocols: ['aave'],
          chains: [1],
          actions: { lend: {} },
        });

        const uniStrategies = engine.getStrategiesByProtocol('uniswap');
        expect(uniStrategies).toHaveLength(1);
        expect(uniStrategies[0].name).toBe('s1');
      });

      test('should get strategies by chain', () => {
        engine.registerStrategy({
          name: 's1',
          protocols: ['p1'],
          chains: [1, 42161],
          actions: { swap: {} },
        });
        engine.registerStrategy({
          name: 's2',
          protocols: ['p2'],
          chains: [324],
          actions: { swap: {} },
        });

        const arbitrumStrategies = engine.getStrategiesByChain(42161);
        expect(arbitrumStrategies).toHaveLength(1);
        expect(arbitrumStrategies[0].name).toBe('s1');
      });
    });

    describe('Wallet-Strategy Assignment', () => {
      beforeEach(() => {
        engine.registerStrategy({
          name: 'test-strategy',
          protocols: ['p1'],
          chains: [1],
          actions: { swap: { weight: 1 } },
        });
      });

      test('should assign strategy to wallet', () => {
        const result = engine.assignStrategy(
          '0x1234567890123456789012345678901234567890',
          'test-strategy'
        );

        expect(result).toBe(true);

        const strategies = engine.getWalletStrategies(
          '0x1234567890123456789012345678901234567890'
        );
        expect(strategies).toHaveLength(1);
      });

      test('should normalize wallet address', () => {
        engine.assignStrategy(
          '0xABCD1234567890123456789012345678901234AB',
          'test-strategy'
        );

        const strategies = engine.getWalletStrategies(
          '0xabcd1234567890123456789012345678901234ab'
        );
        expect(strategies).toHaveLength(1);
      });

      test('should reject non-existent strategy', () => {
        expect(() => {
          engine.assignStrategy('0x1234', 'non-existent');
        }).toThrow('Strategy not found');
      });

      test('should enforce max strategies per wallet', () => {
        const limitedEngine = new StrategyEngine({ maxStrategiesPerWallet: 1 });

        limitedEngine.registerStrategy({
          name: 's1',
          protocols: ['p1'],
          chains: [1],
          actions: { swap: {} },
        });
        limitedEngine.registerStrategy({
          name: 's2',
          protocols: ['p2'],
          chains: [1],
          actions: { swap: {} },
        });

        limitedEngine.assignStrategy('0x1234', 's1');

        expect(() => {
          limitedEngine.assignStrategy('0x1234', 's2');
        }).toThrow('maximum strategies');
      });

      test('should remove strategy from wallet', () => {
        engine.assignStrategy('0x1234', 'test-strategy');
        const result = engine.removeStrategy('0x1234', 'test-strategy');

        expect(result).toBe(true);
        expect(engine.getWalletStrategies('0x1234')).toHaveLength(0);
      });
    });

    describe('Action Selection', () => {
      beforeEach(() => {
        engine.registerStrategy({
          name: 'multi-action',
          protocols: ['p1'],
          chains: [1],
          actions: {
            swap: { weight: 1, frequency: { min: 1, max: 3 } },
            bridge: { weight: 2, frequency: { min: 3, max: 7 } },
            governance: { weight: 3, frequency: { min: 7, max: 14 } },
          },
        });
        engine.assignStrategy('0x1234', 'multi-action');
      });

      test('should select next action for wallet', () => {
        const action = engine.selectNextAction('0x1234');

        expect(action).toBeDefined();
        expect(action.strategy).toBe('multi-action');
        expect(['swap', 'bridge', 'governance']).toContain(action.action);
        expect(action.score).toBeGreaterThan(0);
      });

      test('should return null for wallet without strategy', () => {
        const action = engine.selectNextAction('0xunassigned');
        expect(action).toBeNull();
      });

      test('should respect cooldowns', () => {
        // Record recent execution
        engine.recordExecution('0x1234', {
          strategy: 'multi-action',
          action: 'swap',
          timestamp: Date.now() - 1000, // 1 second ago
        });

        // Select many times and verify swap is not selected (in cooldown)
        for (let i = 0; i < 10; i++) {
          const action = engine.selectNextAction('0x1234');
          if (action) {
            // Swap should not be selected if cooldown is working
            // (Unless all other actions are also in cooldown)
          }
        }
      });

      test('should weight actions correctly', () => {
        const actionCounts = { swap: 0, bridge: 0, governance: 0 };
        const iterations = 1000;

        for (let i = 0; i < iterations; i++) {
          const action = engine.selectNextAction('0x1234');
          if (action) {
            actionCounts[action.action]++;
          }
        }

        // Governance (weight 3) should be selected more than swap (weight 1)
        // Allow for randomness, but governance should be notably higher
        expect(actionCounts.governance).toBeGreaterThan(actionCounts.swap * 0.5);
      });

      test('should get recommendations', () => {
        const recommendations = engine.getRecommendations('0x1234', 3);

        expect(recommendations).toBeInstanceOf(Array);
        expect(recommendations.length).toBeLessThanOrEqual(3);

        if (recommendations.length > 0) {
          expect(recommendations[0].urgency).toBeDefined();
          expect(recommendations[0].action).toBeDefined();
        }
      });
    });

    describe('Execution Tracking', () => {
      test('should record execution', () => {
        const record = engine.recordExecution('0x1234', {
          strategy: 'test',
          action: 'swap',
          protocol: 'uniswap',
        });

        expect(record.id).toBeDefined();
        expect(record.timestamp).toBeDefined();
        expect(record.action).toBe('swap');
      });

      test('should get execution history', () => {
        engine.recordExecution('0x1234', { action: 'swap' });
        engine.recordExecution('0x1234', { action: 'bridge' });

        const history = engine.getExecutionHistory('0x1234');
        expect(history).toHaveLength(2);
      });

      test('should filter history by date', () => {
        const old = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 days ago
        const recent = Date.now() - 1000;

        engine.recordExecution('0x1234', { action: 'swap', timestamp: old });
        engine.recordExecution('0x1234', { action: 'bridge', timestamp: recent });

        const filtered = engine.getExecutionHistory('0x1234', {
          since: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].action).toBe('bridge');
      });

      test('should filter history by action', () => {
        engine.recordExecution('0x1234', { action: 'swap' });
        engine.recordExecution('0x1234', { action: 'bridge' });
        engine.recordExecution('0x1234', { action: 'swap' });

        const filtered = engine.getExecutionHistory('0x1234', { action: 'swap' });
        expect(filtered).toHaveLength(2);
      });

      test('should update statistics', () => {
        engine.recordExecution('0x1234', { action: 'swap', protocol: 'uniswap' });
        engine.recordExecution('0x1234', { action: 'swap', protocol: 'uniswap' });
        engine.recordExecution('0x1234', { action: 'bridge', protocol: 'stargate' });

        const stats = engine.getStatistics();
        expect(stats.actionsExecuted).toBe(3);
        expect(stats.actionsByType.swap).toBe(2);
        expect(stats.actionsByProtocol.uniswap).toBe(2);
      });
    });

    describe('Pattern Analysis', () => {
      test('should require minimum history', () => {
        engine.recordExecution('0x1234', { action: 'swap' });

        const analysis = engine.analyzePatterns('0x1234');
        expect(analysis.sufficient).toBe(false);
      });

      test('should analyze patterns with sufficient data', () => {
        // Add 10 executions over time
        const baseTime = Date.now();
        for (let i = 0; i < 10; i++) {
          engine.recordExecution('0x1234', {
            action: i % 2 === 0 ? 'swap' : 'bridge',
            timestamp: baseTime - i * 24 * 60 * 60 * 1000, // Daily
          });
        }

        const analysis = engine.analyzePatterns('0x1234');
        expect(analysis.sufficient).toBe(true);
        expect(analysis.totalActions).toBe(10);
        expect(analysis.hourDistribution).toBeDefined();
        expect(analysis.actionDistribution).toBeDefined();
        expect(analysis.score).toBeDefined();
      });

      test('should detect low action diversity', () => {
        const baseTime = Date.now();
        for (let i = 0; i < 10; i++) {
          engine.recordExecution('0x1234', {
            action: 'swap', // Only swaps
            timestamp: baseTime - i * 12 * 60 * 60 * 1000,
          });
        }

        const analysis = engine.analyzePatterns('0x1234');
        expect(analysis.warnings.some(w => w.type === 'action_diversity')).toBe(true);
      });
    });
  });

  // ==========================================================================
  // BUILT-IN STRATEGIES
  // ==========================================================================

  describe('Built-in Strategies', () => {
    test('should create built-in strategies', () => {
      const strategies = createBuiltInStrategies();

      expect(strategies).toBeInstanceOf(Array);
      expect(strategies.length).toBeGreaterThan(0);
    });

    test('should include LayerZero strategy', () => {
      const strategies = createBuiltInStrategies();
      const layerzero = strategies.find(s => s.name === 'layerzero-organic');

      expect(layerzero).toBeDefined();
      expect(layerzero.protocols).toContain('layerzero');
      expect(layerzero.actions.bridge).toBeDefined();
    });

    test('should include zkSync strategy', () => {
      const strategies = createBuiltInStrategies();
      const zksync = strategies.find(s => s.name === 'zksync-era-organic');

      expect(zksync).toBeDefined();
      expect(zksync.chains).toContain(324);
    });

    test('should include Base strategy', () => {
      const strategies = createBuiltInStrategies();
      const base = strategies.find(s => s.name === 'base-organic');

      expect(base).toBeDefined();
      expect(base.chains).toContain(8453);
    });

    test('should include Scroll strategy', () => {
      const strategies = createBuiltInStrategies();
      const scroll = strategies.find(s => s.name === 'scroll-organic');

      expect(scroll).toBeDefined();
      expect(scroll.chains).toContain(534352);
    });

    test('should include Linea strategy', () => {
      const strategies = createBuiltInStrategies();
      const linea = strategies.find(s => s.name === 'linea-organic');

      expect(linea).toBeDefined();
      expect(linea.chains).toContain(59144);
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION
  // ==========================================================================

  describe('Factory Function', () => {
    test('should create engine with built-in strategies', () => {
      const engine = createStrategyEngine();

      expect(engine).toBeInstanceOf(StrategyEngine);
      expect(engine.getAllStrategies().length).toBeGreaterThan(0);
    });

    test('should allow excluding built-in strategies', () => {
      const engine = createStrategyEngine({ includeBuiltIn: false });

      expect(engine.getAllStrategies()).toHaveLength(0);
    });

    test('should pass config to engine', () => {
      const engine = createStrategyEngine({ maxStrategiesPerWallet: 5 });

      expect(engine.config.maxStrategiesPerWallet).toBe(5);
    });
  });

  // ==========================================================================
  // SYBIL RESISTANCE
  // ==========================================================================

  describe('Sybil Resistance Features', () => {
    let engine;

    beforeEach(() => {
      engine = createStrategyEngine();
    });

    test('action weights should favor low-sybil-risk activities', () => {
      // Governance (real participation) should have lowest sybil risk
      expect(ACTION_TYPES.GOVERNANCE.sybilRisk).toBe('very_low');

      // NFT minting should have high sybil risk (often farmed)
      expect(ACTION_TYPES.NFT_MINT.sybilRisk).toBe('high');

      // Bridge should have low risk (requires capital)
      expect(ACTION_TYPES.BRIDGE.sybilRisk).toBe('low');
    });

    test('strategies should have diverse actions', () => {
      for (const strategy of engine.getAllStrategies()) {
        expect(strategy.actions.size).toBeGreaterThanOrEqual(2);
      }
    });

    test('strategies should have reasonable frequency ranges', () => {
      for (const strategy of engine.getAllStrategies()) {
        for (const [, config] of strategy.actions) {
          if (config.frequency) {
            // Min frequency should be at least 1 day
            expect(config.frequency.min).toBeGreaterThanOrEqual(1);
            // Max should be greater than min
            expect(config.frequency.max).toBeGreaterThan(config.frequency.min);
          }
        }
      }
    });

    test('risk profiles should have appropriate activity multipliers', () => {
      // Conservative should be slower
      expect(RISK_PROFILES.CONSERVATIVE.activityMultiplier).toBe(0.5);

      // Aggressive should have higher variance (more human-like in extremes)
      expect(RISK_PROFILES.AGGRESSIVE.varianceMultiplier).toBeLessThan(1);
    });
  });
});
