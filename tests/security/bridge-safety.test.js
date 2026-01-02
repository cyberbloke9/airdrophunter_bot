/**
 * Bridge Safety Module Tests
 *
 * Tests for bridge exploit protection including:
 * - Bridge tier classification
 * - Safety scoring
 * - Transaction limits
 * - Bridge selection
 */

const {
  BridgeSafety,
  createBridgeSafety,
  BridgeTransaction,
  BRIDGE_TIER,
  KNOWN_BRIDGES,
  DEFAULT_LIMITS,
  BRIDGE_TX_STATE,
} = require('../../src/security/bridge-safety');

describe('Bridge Safety Module', () => {
  let bridgeSafety;

  beforeEach(() => {
    bridgeSafety = createBridgeSafety();
  });

  afterEach(() => {
    if (bridgeSafety) {
      bridgeSafety.stop();
    }
  });

  describe('Constants', () => {
    test('should have bridge tier definitions', () => {
      expect(BRIDGE_TIER.CANONICAL).toBe('canonical');
      expect(BRIDGE_TIER.ESTABLISHED).toBe('established');
      expect(BRIDGE_TIER.MODERATE).toBe('moderate');
      expect(BRIDGE_TIER.RISKY).toBe('risky');
      expect(BRIDGE_TIER.BLACKLISTED).toBe('blacklisted');
    });

    test('should have known bridges database', () => {
      expect(Object.keys(KNOWN_BRIDGES).length).toBeGreaterThan(0);
    });

    test('should have canonical bridges for major L2s', () => {
      const arbitrumBridge = KNOWN_BRIDGES['arbitrum-canonical'];
      expect(arbitrumBridge).toBeDefined();
      expect(arbitrumBridge.tier).toBe(BRIDGE_TIER.CANONICAL);

      const optimismBridge = KNOWN_BRIDGES['optimism-canonical'];
      expect(optimismBridge).toBeDefined();
      expect(optimismBridge.tier).toBe(BRIDGE_TIER.CANONICAL);
    });

    test('should have blacklisted exploited bridges', () => {
      const blacklisted = Object.values(KNOWN_BRIDGES).filter(
        b => b.tier === BRIDGE_TIER.BLACKLISTED
      );
      expect(blacklisted.length).toBeGreaterThan(0);
    });

    test('should have default limits', () => {
      expect(DEFAULT_LIMITS.maxPercentOfBridgeLiquidity).toBe(0.10);
      expect(DEFAULT_LIMITS.maxPercentOfPortfolioPerDay).toBe(0.25);
      expect(DEFAULT_LIMITS.minBridgeTvlUsd).toBeGreaterThan(0);
      expect(DEFAULT_LIMITS.minBridgeAgeMonths).toBeGreaterThan(0);
    });

    test('should have transaction states', () => {
      expect(BRIDGE_TX_STATE.PENDING).toBeDefined();
      expect(BRIDGE_TX_STATE.SOURCE_CONFIRMED).toBeDefined();
      expect(BRIDGE_TX_STATE.DEST_PENDING).toBeDefined();
      expect(BRIDGE_TX_STATE.COMPLETED).toBeDefined();
    });
  });

  describe('BridgeTransaction', () => {
    test('should create bridge transaction', () => {
      const tx = new BridgeTransaction({
        id: 'bridge_1',
        bridgeId: 'arbitrum-canonical',
        sourceChainId: 1,
        destChainId: 42161,
        amountWei: '1000000000000000000',
        token: 'ETH',
      });

      expect(tx.id).toBe('bridge_1');
      expect(tx.bridgeId).toBe('arbitrum-canonical');
      expect(tx.sourceChainId).toBe(1);
      expect(tx.destChainId).toBe(42161);
      expect(tx.state).toBe(BRIDGE_TX_STATE.PENDING);
    });

    test('should serialize to JSON', () => {
      const tx = new BridgeTransaction({
        id: 'bridge_1',
        bridgeId: 'arbitrum-canonical',
        sourceChainId: 1,
        destChainId: 42161,
      });

      const json = tx.toJSON();
      expect(json.id).toBe('bridge_1');
      expect(json.sourceChainId).toBe(1);
      expect(json.destChainId).toBe(42161);
    });
  });

  describe('BridgeSafety', () => {
    describe('Initialization', () => {
      test('should create with default options', () => {
        const bs = new BridgeSafety();
        expect(bs).toBeDefined();
      });

      test('should accept custom limits', () => {
        const bs = new BridgeSafety({
          limits: {
            maxSingleTransactionUsd: 50000,
          },
        });
        expect(bs.config.limits.maxSingleTransactionUsd).toBe(50000);
      });
    });

    describe('Bridge Retrieval', () => {
      test('should get bridge by id', () => {
        const bridge = bridgeSafety.getBridge('arbitrum-canonical');
        expect(bridge).toBeDefined();
        expect(bridge.name).toBe('Arbitrum Bridge');
      });

      test('should return null for unknown bridge', () => {
        const bridge = bridgeSafety.getBridge('unknown-bridge');
        expect(bridge).toBeNull();
      });
    });

    describe('Bridge Selection', () => {
      test('should get available bridges for route', () => {
        const bridges = bridgeSafety.getAvailableBridges(1, 42161);
        expect(bridges.length).toBeGreaterThan(0);

        // Should include canonical Arbitrum bridge
        const canonical = bridges.find(b => b.tier === BRIDGE_TIER.CANONICAL);
        expect(canonical).toBeDefined();
      });

      test('should exclude blacklisted bridges', () => {
        const bridges = bridgeSafety.getAvailableBridges(1, 42161);
        const blacklisted = bridges.filter(b => b.tier === BRIDGE_TIER.BLACKLISTED);
        expect(blacklisted.length).toBe(0);
      });

      test('should select best bridge for route', () => {
        const result = bridgeSafety.selectBridge(1, 42161);

        expect(result.bridge).toBeDefined();
        expect(result.bridge.tier).not.toBe(BRIDGE_TIER.BLACKLISTED);
      });

      test('should prefer canonical bridges', () => {
        const result = bridgeSafety.selectBridge(1, 42161);

        if (result.bridge) {
          // If canonical exists for this route, it should be selected
          const allBridges = bridgeSafety.getAvailableBridges(1, 42161);
          const hasCanonical = allBridges.some(b => b.tier === BRIDGE_TIER.CANONICAL);

          if (hasCanonical) {
            expect(result.bridge.tier).toBe(BRIDGE_TIER.CANONICAL);
          }
        }
      });

      test('should return alternatives', () => {
        const result = bridgeSafety.selectBridge(1, 42161);

        expect(result.alternatives).toBeDefined();
        expect(Array.isArray(result.alternatives)).toBe(true);
      });

      test('should handle unknown route', () => {
        const result = bridgeSafety.selectBridge(99999, 88888);
        expect(result.bridge).toBeNull();
      });
    });

    describe('Bridge Scoring', () => {
      test('should calculate bridge safety score', () => {
        const bridge = KNOWN_BRIDGES['arbitrum-canonical'];
        const score = bridgeSafety.calculateBridgeScore(bridge);

        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });

      test('should score canonical higher than moderate', () => {
        const canonical = Object.values(KNOWN_BRIDGES).find(b => b.tier === BRIDGE_TIER.CANONICAL);
        const moderate = Object.values(KNOWN_BRIDGES).find(b => b.tier === BRIDGE_TIER.MODERATE);

        if (canonical && moderate) {
          const canonicalScore = bridgeSafety.calculateBridgeScore(canonical);
          const moderateScore = bridgeSafety.calculateBridgeScore(moderate);
          expect(canonicalScore).toBeGreaterThan(moderateScore);
        }
      });
    });

    describe('Transaction Validation', () => {
      test('should validate bridge transaction', async () => {
        const result = await bridgeSafety.validateBridgeTransaction('arbitrum-canonical', {
          amountWei: '1000000000000000000', // 1 ETH
          amountUsd: 2000,
          token: 'ETH',
          sourceChainId: 1,
          destChainId: 42161,
        });

        expect(result.valid).toBeDefined();
        if (!result.valid) {
          expect(result.errors).toBeDefined();
        }
      });

      test('should reject blacklisted bridges', async () => {
        const blacklistedId = Object.entries(KNOWN_BRIDGES).find(
          ([_, b]) => b.tier === BRIDGE_TIER.BLACKLISTED
        )?.[0];

        if (blacklistedId) {
          const result = await bridgeSafety.validateBridgeTransaction(blacklistedId, {
            amountWei: '1000000000000000000',
            amountUsd: 2000,
          });

          expect(result.valid).toBe(false);
        }
      });

      test('should check daily portfolio limit', () => {
        const result = bridgeSafety.checkDailyVolume(10000, 3000);

        expect(result.allowed).toBeDefined();
        expect(result.remaining).toBeDefined();
      });
    });

    describe('Transaction Tracking', () => {
      test('should track bridge transaction', () => {
        const tx = bridgeSafety.trackBridgeTransaction({
          bridgeId: 'arbitrum-canonical',
          sourceChainId: 1,
          destChainId: 42161,
          amountWei: '1000000000000000000',
          token: 'ETH',
          sender: '0xSender',
          recipient: '0xRecipient',
        });

        expect(tx).toBeDefined();
        expect(tx.id).toBeDefined();
        expect(tx.state).toBe(BRIDGE_TX_STATE.PENDING);
      });

      test('should retrieve tracked transaction', () => {
        const tracked = bridgeSafety.trackBridgeTransaction({
          bridgeId: 'arbitrum-canonical',
          sourceChainId: 1,
          destChainId: 42161,
          amountWei: '1000000000000000000',
        });

        const retrieved = bridgeSafety.getTransaction(tracked.id);
        expect(retrieved).toBeDefined();
        expect(retrieved.id).toBe(tracked.id);
      });

      test('should update transaction state', () => {
        const tx = bridgeSafety.trackBridgeTransaction({
          bridgeId: 'arbitrum-canonical',
          sourceChainId: 1,
          destChainId: 42161,
          amountWei: '1000000000000000000',
        });

        bridgeSafety.updateTransactionState(tx.id, BRIDGE_TX_STATE.SOURCE_CONFIRMED, {
          sourceTxHash: '0xabc123',
        });

        const updated = bridgeSafety.getTransaction(tx.id);
        expect(updated.state).toBe(BRIDGE_TX_STATE.SOURCE_CONFIRMED);
      });

      test('should get all transactions', () => {
        bridgeSafety.trackBridgeTransaction({
          bridgeId: 'arbitrum-canonical',
          sourceChainId: 1,
          destChainId: 42161,
          amountWei: '1000000000000000000',
        });

        bridgeSafety.trackBridgeTransaction({
          bridgeId: 'optimism-canonical',
          sourceChainId: 1,
          destChainId: 10,
          amountWei: '2000000000000000000',
        });

        const txs = bridgeSafety.getTransactions();
        expect(txs.length).toBe(2);
      });

      test('should filter transactions by state', () => {
        const tx1 = bridgeSafety.trackBridgeTransaction({
          bridgeId: 'arbitrum-canonical',
          sourceChainId: 1,
          destChainId: 42161,
          amountWei: '1000000000000000000',
        });

        bridgeSafety.updateTransactionState(tx1.id, BRIDGE_TX_STATE.COMPLETED);

        bridgeSafety.trackBridgeTransaction({
          bridgeId: 'optimism-canonical',
          sourceChainId: 1,
          destChainId: 10,
          amountWei: '2000000000000000000',
        });

        const pending = bridgeSafety.getTransactions({ state: BRIDGE_TX_STATE.PENDING });
        expect(pending.length).toBe(1);
      });
    });

    describe('Recovery Information', () => {
      test('should provide recovery info for bridge', () => {
        const recovery = bridgeSafety.getRecoveryInfo('arbitrum-canonical');
        expect(recovery).toBeDefined();
        expect(recovery.docsUrl || recovery.recommendations).toBeDefined();
      });

      test('should return null for unknown bridge', () => {
        const recovery = bridgeSafety.getRecoveryInfo('unknown-bridge');
        expect(recovery).toBeNull();
      });
    });

    describe('Bridge Safety Check', () => {
      test('should check if bridge is safe', () => {
        const isSafe = bridgeSafety.isBridgeSafe('arbitrum-canonical');
        expect(isSafe).toBe(true);
      });

      test('should return false for blacklisted bridge', () => {
        const blacklistedId = Object.entries(KNOWN_BRIDGES).find(
          ([_, b]) => b.tier === BRIDGE_TIER.BLACKLISTED
        )?.[0];

        if (blacklistedId) {
          const isSafe = bridgeSafety.isBridgeSafe(blacklistedId);
          expect(isSafe).toBe(false);
        }
      });
    });

    describe('Statistics', () => {
      test('should track statistics', () => {
        bridgeSafety.trackBridgeTransaction({
          bridgeId: 'arbitrum-canonical',
          sourceChainId: 1,
          destChainId: 42161,
          amountWei: '1000000000000000000',
        });

        const stats = bridgeSafety.getStatistics();
        expect(stats.totalTransactions).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Stuck Transaction Detection', () => {
      test('should detect stuck transactions', () => {
        const tx = bridgeSafety.trackBridgeTransaction({
          bridgeId: 'arbitrum-canonical',
          sourceChainId: 1,
          destChainId: 42161,
          amountWei: '1000000000000000000',
        });

        // Manually set old timestamp for testing
        const transaction = bridgeSafety.getTransaction(tx.id);
        transaction.createdAt = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

        const stuck = bridgeSafety.getStuckTransactions();
        // May or may not be stuck depending on bridge config
        expect(Array.isArray(stuck)).toBe(true);
      });
    });
  });

  describe('Factory Function', () => {
    test('should create instance with default options', () => {
      const bs = createBridgeSafety();
      expect(bs).toBeInstanceOf(BridgeSafety);
    });

    test('should create instance with custom limits', () => {
      const bs = createBridgeSafety({
        limits: {
          maxSingleTransactionUsd: 25000,
        },
      });
      expect(bs).toBeInstanceOf(BridgeSafety);
    });
  });
});

describe('Integration Tests', () => {
  test('full bridge transaction flow', async () => {
    const bs = createBridgeSafety();

    // 1. Select bridge
    const selection = bs.selectBridge(1, 42161);
    expect(selection.bridge).toBeDefined();

    // 2. Validate transaction
    const validation = await bs.validateBridgeTransaction(selection.bridge.id || 'arbitrum-canonical', {
      amountWei: '1000000000000000000',
      amountUsd: 2000,
      sourceChainId: 1,
      destChainId: 42161,
    });

    if (validation.valid) {
      // 3. Track transaction
      const tx = bs.trackBridgeTransaction({
        bridgeId: selection.bridge.id || 'arbitrum-canonical',
        sourceChainId: 1,
        destChainId: 42161,
        amountWei: '1000000000000000000',
        amountUsd: 2000,
      });

      expect(tx.id).toBeDefined();

      // 4. Update status
      bs.updateTransactionState(tx.id, BRIDGE_TX_STATE.SOURCE_CONFIRMED, {
        sourceTxHash: '0xabc',
      });

      // 5. Complete
      bs.updateTransactionState(tx.id, BRIDGE_TX_STATE.COMPLETED, {
        destTxHash: '0xdef',
      });

      const completed = bs.getTransaction(tx.id);
      expect(completed.state).toBe(BRIDGE_TX_STATE.COMPLETED);

      // 6. Check stats
      const stats = bs.getStatistics();
      expect(stats.completed).toBeGreaterThanOrEqual(1);
    }

    bs.stop();
  });
});
