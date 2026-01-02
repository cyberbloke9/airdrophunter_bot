/**
 * Reorg Protection Module Tests
 *
 * Tests for chain reorganization safety including:
 * - Confirmation requirements per chain
 * - Transaction tracking
 * - Chain configuration
 */

const {
  ReorgProtection,
  createReorgProtection,
  TrackedTransaction,
  StateSnapshot,
  CONFIRMATION_REQUIREMENTS,
  L1_FINALITY_BLOCKS,
  TX_STATE,
  REORG_SEVERITY,
} = require('../../src/security/reorg-protection');

describe('Reorg Protection Module', () => {
  let reorgProtection;

  beforeEach(() => {
    reorgProtection = createReorgProtection();
  });

  afterEach(() => {
    if (reorgProtection) {
      reorgProtection.stop();
    }
  });

  describe('Constants', () => {
    test('should have confirmation requirements for major chains', () => {
      expect(CONFIRMATION_REQUIREMENTS[1]).toBeDefined(); // Ethereum
      expect(CONFIRMATION_REQUIREMENTS[137]).toBeDefined(); // Polygon
      expect(CONFIRMATION_REQUIREMENTS[42161]).toBeDefined(); // Arbitrum
      expect(CONFIRMATION_REQUIREMENTS[10]).toBeDefined(); // Optimism
      expect(CONFIRMATION_REQUIREMENTS[8453]).toBeDefined(); // Base
      expect(CONFIRMATION_REQUIREMENTS[56]).toBeDefined(); // BSC
    });

    test('Ethereum should require 12 confirmations', () => {
      expect(CONFIRMATION_REQUIREMENTS[1].confirmations).toBe(12);
      expect(CONFIRMATION_REQUIREMENTS[1].finalityType).toBe('probabilistic');
    });

    test('L2 chains should be L1-dependent', () => {
      expect(CONFIRMATION_REQUIREMENTS[42161].finalityType).toBe('l1_dependent');
      expect(CONFIRMATION_REQUIREMENTS[10].finalityType).toBe('l1_dependent');
      expect(CONFIRMATION_REQUIREMENTS[8453].finalityType).toBe('l1_dependent');
    });

    test('L1 finality should be 64 blocks', () => {
      expect(L1_FINALITY_BLOCKS).toBe(64);
    });

    test('Polygon should require 128 confirmations', () => {
      expect(CONFIRMATION_REQUIREMENTS[137].confirmations).toBe(128);
    });

    test('should have TX_STATE enum', () => {
      expect(TX_STATE.PENDING).toBeDefined();
      expect(TX_STATE.CONFIRMED).toBeDefined();
      expect(TX_STATE.FINALIZED).toBeDefined();
    });
  });

  describe('TrackedTransaction', () => {
    test('should create tracked transaction', () => {
      const tx = new TrackedTransaction('0x123', 1);
      expect(tx.txHash).toBe('0x123');
      expect(tx.chainId).toBe(1);
      expect(tx.state).toBe(TX_STATE.PENDING);
    });

    test('should create with options', () => {
      const tx = new TrackedTransaction('0x123', 1, {
        blockNumber: 1000,
        from: '0xSender',
      });
      expect(tx.blockNumber).toBe(1000);
      expect(tx.metadata.from).toBe('0xSender');
    });

    test('should serialize to JSON', () => {
      const tx = new TrackedTransaction('0x123', 1);
      const json = tx.toJSON();
      expect(json.txHash).toBe('0x123');
      expect(json.chainId).toBe(1);
    });
  });

  describe('StateSnapshot', () => {
    test('should create snapshot with state data', () => {
      const snapshot = new StateSnapshot({
        blockNumber: 1000,
        blockHash: '0xabc',
        status: 1,
      });

      expect(snapshot.blockNumber).toBe(1000);
      expect(snapshot.hash).toBeDefined();
    });

    test('should generate deterministic hash', () => {
      const state1 = new StateSnapshot({
        blockNumber: 1000,
        blockHash: '0xabc',
        status: 1,
      });

      const state2 = new StateSnapshot({
        blockNumber: 1000,
        blockHash: '0xabc',
        status: 1,
      });

      expect(state1.hash).toBe(state2.hash);
    });

    test('should detect state changes', () => {
      const state1 = new StateSnapshot({
        blockNumber: 1000,
        blockHash: '0xabc',
      });

      const state2 = new StateSnapshot({
        blockNumber: 1000,
        blockHash: '0xdef',
      });

      expect(state1.hash).not.toBe(state2.hash);
    });

    test('should serialize to JSON', () => {
      const snapshot = new StateSnapshot({
        blockNumber: 1000,
        blockHash: '0xabc',
      });

      const json = snapshot.toJSON();
      expect(json.blockNumber).toBe(1000);
      expect(json.hash).toBeDefined();
    });
  });

  describe('ReorgProtection', () => {
    describe('Initialization', () => {
      test('should create with default options', () => {
        const rp = new ReorgProtection();
        expect(rp).toBeDefined();
      });

      test('should accept custom confirmation requirements', () => {
        const rp = new ReorgProtection({
          customConfirmations: {
            1: 24, // Double Ethereum confirmations
          },
        });

        const req = rp.getRequiredConfirmations(1);
        expect(req).toBe(24);
      });
    });

    describe('Transaction Tracking', () => {
      test('should track a new transaction', () => {
        const tx = reorgProtection.trackTransaction('0xabc123', 1);

        expect(tx).toBeDefined();
        expect(tx.txHash).toBe('0xabc123');
        expect(tx.chainId).toBe(1);
      });

      test('should track with options', () => {
        const tx = reorgProtection.trackTransaction('0xabc123', 1, {
          blockNumber: 15000000,
          from: '0xSender',
        });

        expect(tx.blockNumber).toBe(15000000);
      });

      test('should retrieve tracked transaction', () => {
        reorgProtection.trackTransaction('0xabc123', 1);

        const tx = reorgProtection.getTransaction('0xabc123');
        expect(tx).toBeDefined();
        expect(tx.txHash).toBe('0xabc123');
      });

      test('should return null for unknown transaction', () => {
        const tx = reorgProtection.getTransaction('0xunknown');
        expect(tx).toBeNull();
      });

      test('should track multiple transactions', () => {
        reorgProtection.trackTransaction('0x1', 1);
        reorgProtection.trackTransaction('0x2', 1);
        reorgProtection.trackTransaction('0x3', 137);

        expect(reorgProtection.getTransaction('0x1')).toBeDefined();
        expect(reorgProtection.getTransaction('0x2')).toBeDefined();
        expect(reorgProtection.getTransaction('0x3')).toBeDefined();
      });

      test('should not duplicate tracked transactions', () => {
        const tx1 = reorgProtection.trackTransaction('0xabc', 1);
        const tx2 = reorgProtection.trackTransaction('0xabc', 1);

        expect(tx1).toBe(tx2);
      });
    });

    describe('Chain Configuration', () => {
      test('should get required confirmations for Ethereum', () => {
        const req = reorgProtection.getRequiredConfirmations(1);
        expect(req).toBe(12);
      });

      test('should get required confirmations for Polygon', () => {
        const req = reorgProtection.getRequiredConfirmations(137);
        expect(req).toBe(128);
      });

      test('should return default for unknown chain', () => {
        const req = reorgProtection.getRequiredConfirmations(99999);
        expect(req).toBe(12); // Default
      });

      test('should get chain config', () => {
        const config = reorgProtection.getChainConfig(1);
        expect(config.name).toBe('Ethereum');
        expect(config.confirmations).toBe(12);
        expect(config.finalityType).toBe('probabilistic');
      });

      test('should return default config for unknown chain', () => {
        const config = reorgProtection.getChainConfig(99999);
        expect(config.confirmations).toBe(12);
        expect(config.finalityType).toBe('probabilistic');
      });
    });

    describe('L1 Finality', () => {
      test('should identify L1-dependent chains', () => {
        const arbConfig = reorgProtection.getChainConfig(42161);
        expect(arbConfig.finalityType).toBe('l1_dependent');

        const opConfig = reorgProtection.getChainConfig(10);
        expect(opConfig.finalityType).toBe('l1_dependent');

        const baseConfig = reorgProtection.getChainConfig(8453);
        expect(baseConfig.finalityType).toBe('l1_dependent');
      });

      test('should not require L1 finality for Ethereum', () => {
        const config = reorgProtection.getChainConfig(1);
        expect(config.finalityType).not.toBe('l1_dependent');
      });
    });

    describe('Statistics', () => {
      test('should track statistics', () => {
        reorgProtection.trackTransaction('0x1', 1);
        reorgProtection.trackTransaction('0x2', 1);

        const stats = reorgProtection.getStats();
        expect(stats.tracked).toBe(2);
      });
    });

    describe('Status', () => {
      test('should return status', () => {
        const status = reorgProtection.getStatus();
        expect(status.running).toBeDefined();
        expect(status.stats).toBeDefined();
      });
    });

    describe('Cleanup', () => {
      test('should have cleanup method', () => {
        expect(typeof reorgProtection.cleanup).toBe('function');
      });
    });

    describe('Stop', () => {
      test('should stop cleanly', () => {
        reorgProtection.stop();
        expect(true).toBe(true); // No error thrown
      });
    });
  });

  describe('Factory Function', () => {
    test('should create instance with default options', () => {
      const rp = createReorgProtection();
      expect(rp).toBeInstanceOf(ReorgProtection);
    });

    test('should create instance with custom options', () => {
      const rp = createReorgProtection({
        customConfirmations: { 1: 24 },
      });
      expect(rp).toBeInstanceOf(ReorgProtection);
      expect(rp.getRequiredConfirmations(1)).toBe(24);
    });
  });

  describe('Events', () => {
    test('should emit tracked event', (done) => {
      reorgProtection.on('tracked', (event) => {
        expect(event.txHash).toBe('0xtest');
        expect(event.chainId).toBe(1);
        done();
      });

      reorgProtection.trackTransaction('0xtest', 1);
    });
  });
});

describe('Integration Tests', () => {
  test('track multiple transactions on different chains', () => {
    const rp = createReorgProtection();

    // Track on Ethereum
    const ethTx = rp.trackTransaction('0xeth', 1, { blockNumber: 15000000 });
    expect(ethTx.chainId).toBe(1);
    expect(rp.getRequiredConfirmations(1)).toBe(12);

    // Track on Polygon
    const polyTx = rp.trackTransaction('0xpoly', 137, { blockNumber: 50000000 });
    expect(polyTx.chainId).toBe(137);
    expect(rp.getRequiredConfirmations(137)).toBe(128);

    // Track on Arbitrum (L2)
    const arbTx = rp.trackTransaction('0xarb', 42161, { blockNumber: 100000000 });
    expect(arbTx.chainId).toBe(42161);
    expect(rp.getChainConfig(42161).finalityType).toBe('l1_dependent');

    // Check stats
    const stats = rp.getStats();
    expect(stats.tracked).toBe(3);

    rp.stop();
  });
});
