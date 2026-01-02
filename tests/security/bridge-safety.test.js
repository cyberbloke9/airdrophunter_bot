/**
 * Bridge Safety Module Tests
 *
 * Tests for bridge exploit protection including:
 * - Bridge tier classification
 * - Safety scoring
 * - Transaction limits
 * - Bridge selection
 * - Transaction tracking and verification
 */

const {
  BridgeSafety,
  createBridgeSafety,
  BridgeTransaction,
  BRIDGE_TIER,
  KNOWN_BRIDGES,
  DEFAULT_LIMITS,
} = require('../../src/security/bridge-safety');

describe('Bridge Safety Module', () => {
  let bridgeSafety;

  beforeEach(() => {
    bridgeSafety = createBridgeSafety();
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
      const arbitrumBridge = Object.values(KNOWN_BRIDGES).find(
        b => b.name.toLowerCase().includes('arbitrum') && b.tier === BRIDGE_TIER.CANONICAL
      );
      expect(arbitrumBridge).toBeDefined();

      const optimismBridge = Object.values(KNOWN_BRIDGES).find(
        b => b.name.toLowerCase().includes('optimism') && b.tier === BRIDGE_TIER.CANONICAL
      );
      expect(optimismBridge).toBeDefined();
    });

    test('should have blacklisted exploited bridges', () => {
      const blacklisted = Object.values(KNOWN_BRIDGES).filter(
        b => b.tier === BRIDGE_TIER.BLACKLISTED
      );
      expect(blacklisted.length).toBeGreaterThan(0);

      // Should include known exploited bridges
      const roninBridge = Object.values(KNOWN_BRIDGES).find(
        b => b.name.toLowerCase().includes('ronin')
      );
      if (roninBridge) {
        expect(roninBridge.tier).toBe(BRIDGE_TIER.BLACKLISTED);
      }
    });

    test('should have default limits', () => {
      expect(DEFAULT_LIMITS.maxPercentOfBridgeLiquidity).toBe(0.10);
      expect(DEFAULT_LIMITS.maxPercentOfPortfolioPerDay).toBe(0.25);
      expect(DEFAULT_LIMITS.minBridgeTvlUsd).toBe(10000000);
      expect(DEFAULT_LIMITS.minBridgeAgeMonths).toBe(6);
      expect(DEFAULT_LIMITS.requireAudit).toBe(true);
    });
  });

  describe('BridgeTransaction', () => {
    test('should create bridge transaction', () => {
      const tx = new BridgeTransaction({
        id: 'bridge_1',
        bridge: 'arbitrum_canonical',
        sourceChain: 1,
        destChain: 42161,
        amount: '1000000000000000000',
        token: 'ETH',
        sender: '0xSender',
        recipient: '0xRecipient',
      });

      expect(tx.id).toBe('bridge_1');
      expect(tx.bridge).toBe('arbitrum_canonical');
      expect(tx.sourceChain).toBe(1);
      expect(tx.destChain).toBe(42161);
      expect(tx.status).toBe('pending');
    });

    test('should track transaction status changes', () => {
      const tx = new BridgeTransaction({
        id: 'bridge_1',
        bridge: 'arbitrum_canonical',
        sourceChain: 1,
        destChain: 42161,
        amount: '1000000000000000000',
      });

      tx.updateStatus('submitted');
      expect(tx.status).toBe('submitted');
      expect(tx.statusHistory.length).toBe(1);

      tx.updateStatus('confirmed_source');
      expect(tx.status).toBe('confirmed_source');
      expect(tx.statusHistory.length).toBe(2);

      tx.updateStatus('completed');
      expect(tx.status).toBe('completed');
      expect(tx.completedAt).toBeDefined();
    });

    test('should detect stuck transactions', () => {
      const tx = new BridgeTransaction({
        id: 'bridge_stuck',
        bridge: 'test_bridge',
        sourceChain: 1,
        destChain: 42161,
        amount: '1000000000000000000',
      });

      // Fresh transaction is not stuck
      expect(tx.isStuck()).toBe(false);

      // Simulate old timestamp
      tx.submittedAt = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      expect(tx.isStuck(1)).toBe(true); // 1 hour threshold
    });

    test('should serialize to JSON', () => {
      const tx = new BridgeTransaction({
        id: 'bridge_1',
        bridge: 'arbitrum_canonical',
        sourceChain: 1,
        destChain: 42161,
        amount: '1000000000000000000',
        token: 'ETH',
      });

      const json = tx.toJSON();
      expect(json.id).toBe('bridge_1');
      expect(json.sourceChain).toBe(1);
      expect(json.destChain).toBe(42161);
    });
  });

  describe('BridgeSafety', () => {
    describe('Initialization', () => {
      test('should create with default options', () => {
        const bs = new BridgeSafety();
        expect(bs).toBeDefined();
        expect(bs.getStatus().healthy).toBe(true);
      });

      test('should accept custom limits', () => {
        const bs = new BridgeSafety({
          limits: {
            maxSingleTransactionUsd: 50000,
          },
        });

        const limits = bs.getLimits();
        expect(limits.maxSingleTransactionUsd).toBe(50000);
      });
    });

    describe('Bridge Selection', () => {
      test('should get available bridges for route', () => {
        const bridges = bridgeSafety.getAvailableBridges(1, 42161);
        expect(bridges.length).toBeGreaterThan(0);

        // Should prefer canonical
        const canonical = bridges.filter(b => b.tier === BRIDGE_TIER.CANONICAL);
        expect(canonical.length).toBeGreaterThan(0);
      });

      test('should exclude blacklisted bridges', () => {
        const bridges = bridgeSafety.getAvailableBridges(1, 42161);
        const blacklisted = bridges.filter(b => b.tier === BRIDGE_TIER.BLACKLISTED);
        expect(blacklisted.length).toBe(0);
      });

      test('should select best bridge for route', () => {
        const result = bridgeSafety.selectBridge({
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
          token: 'ETH',
        });

        expect(result.selected).toBeDefined();
        expect(result.selected.tier).not.toBe(BRIDGE_TIER.BLACKLISTED);
        expect(result.reason).toBeDefined();
      });

      test('should prefer canonical bridges', () => {
        const result = bridgeSafety.selectBridge({
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
          token: 'ETH',
        });

        if (result.selected) {
          // If canonical exists, it should be selected
          const allBridges = bridgeSafety.getAvailableBridges(1, 42161);
          const hasCanonical = allBridges.some(b => b.tier === BRIDGE_TIER.CANONICAL);

          if (hasCanonical) {
            expect(result.selected.tier).toBe(BRIDGE_TIER.CANONICAL);
          }
        }
      });

      test('should return alternates', () => {
        const result = bridgeSafety.selectBridge({
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
        });

        expect(result.alternates).toBeDefined();
        expect(Array.isArray(result.alternates)).toBe(true);
      });
    });

    describe('Bridge Scoring', () => {
      test('should calculate bridge safety score', () => {
        const bridge = KNOWN_BRIDGES['arbitrum_canonical'] || Object.values(KNOWN_BRIDGES)[0];
        const score = bridgeSafety.calculateBridgeScore(bridge);

        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });

      test('should score canonical higher than moderate', () => {
        const bridges = Object.values(KNOWN_BRIDGES);
        const canonical = bridges.find(b => b.tier === BRIDGE_TIER.CANONICAL);
        const moderate = bridges.find(b => b.tier === BRIDGE_TIER.MODERATE);

        if (canonical && moderate) {
          const canonicalScore = bridgeSafety.calculateBridgeScore(canonical);
          const moderateScore = bridgeSafety.calculateBridgeScore(moderate);
          expect(canonicalScore).toBeGreaterThan(moderateScore);
        }
      });

      test('should penalize low TVL', () => {
        const highTvl = { ...Object.values(KNOWN_BRIDGES)[0], tvl: 1000000000 };
        const lowTvl = { ...Object.values(KNOWN_BRIDGES)[0], tvl: 1000000 };

        const highScore = bridgeSafety.calculateBridgeScore(highTvl);
        const lowScore = bridgeSafety.calculateBridgeScore(lowTvl);

        expect(highScore).toBeGreaterThan(lowScore);
      });

      test('should reward audits', () => {
        const audited = { ...Object.values(KNOWN_BRIDGES)[0], audited: true };
        const unaudited = { ...Object.values(KNOWN_BRIDGES)[0], audited: false };

        const auditedScore = bridgeSafety.calculateBridgeScore(audited);
        const unauditedScore = bridgeSafety.calculateBridgeScore(unaudited);

        expect(auditedScore).toBeGreaterThan(unauditedScore);
      });
    });

    describe('Transaction Validation', () => {
      test('should validate bridge transaction', async () => {
        const result = await bridgeSafety.validateBridgeTransaction({
          bridge: 'arbitrum_canonical',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000', // 1 ETH
          amountUsd: 2000,
          token: 'ETH',
        });

        expect(result.valid).toBeDefined();
        if (!result.valid) {
          expect(result.reason).toBeDefined();
        }
      });

      test('should reject transactions exceeding limits', async () => {
        const result = await bridgeSafety.validateBridgeTransaction({
          bridge: 'test_bridge',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000000', // 1000 ETH
          amountUsd: 2000000, // $2M - exceeds default limit
          token: 'ETH',
        });

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('exceeds');
      });

      test('should reject blacklisted bridges', async () => {
        const blacklisted = Object.entries(KNOWN_BRIDGES).find(
          ([_, b]) => b.tier === BRIDGE_TIER.BLACKLISTED
        );

        if (blacklisted) {
          const result = await bridgeSafety.validateBridgeTransaction({
            bridge: blacklisted[0],
            sourceChain: 1,
            destChain: 42161,
            amount: '1000000000000000000',
            amountUsd: 2000,
          });

          expect(result.valid).toBe(false);
          expect(result.reason.toLowerCase()).toContain('blacklist');
        }
      });

      test('should check daily portfolio limit', async () => {
        // Simulate previous transactions today
        const portfolioValue = 10000; // $10k portfolio

        // Try to bridge more than 25% of portfolio
        const result = await bridgeSafety.validateBridgeTransaction({
          bridge: 'arbitrum_canonical',
          sourceChain: 1,
          destChain: 42161,
          amount: '5000000000000000000',
          amountUsd: 3000, // 30% of portfolio
          portfolioValue,
        });

        expect(result.valid).toBe(false);
      });
    });

    describe('Transaction Tracking', () => {
      test('should track bridge transaction', () => {
        const tx = bridgeSafety.trackBridgeTransaction({
          bridge: 'arbitrum_canonical',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
          token: 'ETH',
          sender: '0xSender',
          recipient: '0xRecipient',
        });

        expect(tx).toBeDefined();
        expect(tx.id).toBeDefined();
        expect(tx.status).toBe('pending');
      });

      test('should retrieve tracked transaction', () => {
        const tracked = bridgeSafety.trackBridgeTransaction({
          bridge: 'test_bridge',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
        });

        const retrieved = bridgeSafety.getTransaction(tracked.id);
        expect(retrieved).toBeDefined();
        expect(retrieved.id).toBe(tracked.id);
      });

      test('should update transaction status', () => {
        const tx = bridgeSafety.trackBridgeTransaction({
          bridge: 'test_bridge',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
        });

        bridgeSafety.updateTransactionStatus(tx.id, 'confirmed_source', {
          sourceTxHash: '0xabc123',
        });

        const updated = bridgeSafety.getTransaction(tx.id);
        expect(updated.status).toBe('confirmed_source');
        expect(updated.sourceTxHash).toBe('0xabc123');
      });

      test('should mark transaction as completed', () => {
        const tx = bridgeSafety.trackBridgeTransaction({
          bridge: 'test_bridge',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
        });

        bridgeSafety.completeTransaction(tx.id, {
          destTxHash: '0xdef456',
        });

        const completed = bridgeSafety.getTransaction(tx.id);
        expect(completed.status).toBe('completed');
        expect(completed.completedAt).toBeDefined();
      });

      test('should detect stuck transactions', () => {
        const tx = bridgeSafety.trackBridgeTransaction({
          bridge: 'test_bridge',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
        });

        // Simulate old transaction
        const transaction = bridgeSafety.getTransaction(tx.id);
        transaction.submittedAt = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

        const stuck = bridgeSafety.getStuckTransactions();
        expect(stuck.some(t => t.id === tx.id)).toBe(true);
      });
    });

    describe('Destination Verification', () => {
      test('should verify destination receipt', async () => {
        const tx = bridgeSafety.trackBridgeTransaction({
          bridge: 'arbitrum_canonical',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
        });

        // Mark source as confirmed
        bridgeSafety.updateTransactionStatus(tx.id, 'confirmed_source');

        // Simulate verification (would actually check chain)
        const result = await bridgeSafety.verifyDestinationReceipt(tx.id);
        expect(result).toBeDefined();
      });
    });

    describe('Recovery Information', () => {
      test('should provide recovery info for stuck transaction', () => {
        const tx = bridgeSafety.trackBridgeTransaction({
          bridge: 'arbitrum_canonical',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
        });

        const recovery = bridgeSafety.getRecoveryInfo(tx.id);
        expect(recovery).toBeDefined();
        expect(recovery.supportUrl || recovery.manualSteps).toBeDefined();
      });
    });

    describe('Daily Limits', () => {
      test('should track daily bridged amount', () => {
        bridgeSafety.trackBridgeTransaction({
          bridge: 'test_bridge',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
          amountUsd: 2000,
        });

        bridgeSafety.trackBridgeTransaction({
          bridge: 'test_bridge',
          sourceChain: 1,
          destChain: 137,
          amount: '500000000000000000',
          amountUsd: 1000,
        });

        const dailyTotal = bridgeSafety.getDailyBridgedAmount();
        expect(dailyTotal).toBeGreaterThanOrEqual(3000);
      });

      test('should reset daily limit at midnight', () => {
        // Track transaction
        bridgeSafety.trackBridgeTransaction({
          bridge: 'test_bridge',
          sourceChain: 1,
          destChain: 42161,
          amountUsd: 5000,
        });

        // Simulate day change
        bridgeSafety.resetDailyLimits();

        const dailyTotal = bridgeSafety.getDailyBridgedAmount();
        expect(dailyTotal).toBe(0);
      });
    });

    describe('Statistics', () => {
      test('should track bridge statistics', () => {
        bridgeSafety.trackBridgeTransaction({
          bridge: 'test_bridge',
          sourceChain: 1,
          destChain: 42161,
          amount: '1000000000000000000',
        });

        const stats = bridgeSafety.getStatistics();
        expect(stats.totalTransactions).toBeGreaterThanOrEqual(1);
        expect(stats.pendingTransactions).toBeDefined();
      });
    });

    describe('Status', () => {
      test('should return healthy status', () => {
        const status = bridgeSafety.getStatus();
        expect(status.healthy).toBe(true);
        expect(status.knownBridges).toBeDefined();
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

  describe('Edge Cases', () => {
    test('should handle unknown route', () => {
      const bridges = bridgeSafety.getAvailableBridges(99999, 88888);
      expect(Array.isArray(bridges)).toBe(true);
    });

    test('should handle very small amounts', async () => {
      const result = await bridgeSafety.validateBridgeTransaction({
        bridge: 'arbitrum_canonical',
        sourceChain: 1,
        destChain: 42161,
        amount: '1000', // Very small
        amountUsd: 0.01,
      });

      expect(result).toBeDefined();
    });

    test('should handle missing bridge info', () => {
      const score = bridgeSafety.calculateBridgeScore({
        id: 'unknown',
        name: 'Unknown Bridge',
      });

      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Integration Tests', () => {
  test('full bridge transaction flow', async () => {
    const bs = createBridgeSafety();

    // 1. Select bridge
    const selection = bs.selectBridge({
      sourceChain: 1,
      destChain: 42161,
      amount: '1000000000000000000',
      token: 'ETH',
    });

    expect(selection.selected).toBeDefined();

    // 2. Validate transaction
    const validation = await bs.validateBridgeTransaction({
      bridge: selection.selected.id,
      sourceChain: 1,
      destChain: 42161,
      amount: '1000000000000000000',
      amountUsd: 2000,
    });

    expect(validation.valid).toBe(true);

    // 3. Track transaction
    const tx = bs.trackBridgeTransaction({
      bridge: selection.selected.id,
      sourceChain: 1,
      destChain: 42161,
      amount: '1000000000000000000',
      amountUsd: 2000,
    });

    expect(tx.id).toBeDefined();

    // 4. Update status
    bs.updateTransactionStatus(tx.id, 'confirmed_source', {
      sourceTxHash: '0xabc',
    });

    // 5. Complete
    bs.completeTransaction(tx.id, {
      destTxHash: '0xdef',
    });

    const completed = bs.getTransaction(tx.id);
    expect(completed.status).toBe('completed');

    // 6. Check stats
    const stats = bs.getStatistics();
    expect(stats.completedTransactions).toBeGreaterThanOrEqual(1);
  });
});
