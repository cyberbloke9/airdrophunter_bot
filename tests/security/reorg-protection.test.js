/**
 * Reorg Protection Module Tests
 *
 * Tests for chain reorganization safety including:
 * - Confirmation requirements per chain
 * - Transaction tracking and verification
 * - L1 finality for L2 chains
 * - State snapshot verification
 * - Reorg detection and handling
 */

const {
  ReorgProtection,
  createReorgProtection,
  TrackedTransaction,
  StateSnapshot,
  CONFIRMATION_REQUIREMENTS,
  L1_FINALITY_BLOCKS,
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
  });

  describe('TrackedTransaction', () => {
    test('should create tracked transaction with required fields', () => {
      const tx = new TrackedTransaction({
        hash: '0x123',
        chainId: 1,
        blockNumber: 1000,
        from: '0xSender',
        to: '0xReceiver',
        value: '1000000000000000000',
      });

      expect(tx.hash).toBe('0x123');
      expect(tx.chainId).toBe(1);
      expect(tx.blockNumber).toBe(1000);
      expect(tx.from).toBe('0xSender');
      expect(tx.confirmed).toBe(false);
      expect(tx.reorged).toBe(false);
      expect(tx.confirmations).toBe(0);
    });

    test('should track confirmation updates', () => {
      const tx = new TrackedTransaction({
        hash: '0x123',
        chainId: 1,
        blockNumber: 1000,
      });

      tx.updateConfirmations(5);
      expect(tx.confirmations).toBe(5);

      tx.updateConfirmations(12);
      expect(tx.confirmations).toBe(12);
    });

    test('should mark as confirmed when threshold reached', () => {
      const tx = new TrackedTransaction({
        hash: '0x123',
        chainId: 1,
        blockNumber: 1000,
      });

      tx.markConfirmed();
      expect(tx.confirmed).toBe(true);
      expect(tx.confirmedAt).toBeDefined();
    });

    test('should mark as reorged', () => {
      const tx = new TrackedTransaction({
        hash: '0x123',
        chainId: 1,
        blockNumber: 1000,
      });

      tx.markReorged('Transaction not found after reorg');
      expect(tx.reorged).toBe(true);
      expect(tx.reorgReason).toBe('Transaction not found after reorg');
    });

    test('should serialize to JSON', () => {
      const tx = new TrackedTransaction({
        hash: '0x123',
        chainId: 1,
        blockNumber: 1000,
      });

      const json = tx.toJSON();
      expect(json.hash).toBe('0x123');
      expect(json.chainId).toBe(1);
      expect(json.blockNumber).toBe(1000);
    });
  });

  describe('StateSnapshot', () => {
    test('should create snapshot with state data', () => {
      const snapshot = new StateSnapshot({
        chainId: 1,
        blockNumber: 1000,
        balances: { '0xAddr': '1000000' },
        nonces: { '0xAddr': 5 },
      });

      expect(snapshot.chainId).toBe(1);
      expect(snapshot.blockNumber).toBe(1000);
      expect(snapshot.state.balances['0xAddr']).toBe('1000000');
      expect(snapshot.hash).toBeDefined();
    });

    test('should generate deterministic hash', () => {
      const state1 = new StateSnapshot({
        chainId: 1,
        blockNumber: 1000,
        data: 'test',
      });

      const state2 = new StateSnapshot({
        chainId: 1,
        blockNumber: 1000,
        data: 'test',
      });

      expect(state1.hash).toBe(state2.hash);
    });

    test('should detect state changes', () => {
      const state1 = new StateSnapshot({
        chainId: 1,
        blockNumber: 1000,
        data: 'test1',
      });

      const state2 = new StateSnapshot({
        chainId: 1,
        blockNumber: 1000,
        data: 'test2',
      });

      expect(state1.hash).not.toBe(state2.hash);
    });

    test('should verify state integrity', () => {
      const snapshot = new StateSnapshot({
        chainId: 1,
        blockNumber: 1000,
        data: 'test',
      });

      expect(snapshot.verify()).toBe(true);
    });
  });

  describe('ReorgProtection', () => {
    describe('Initialization', () => {
      test('should create with default options', () => {
        const rp = new ReorgProtection();
        expect(rp).toBeDefined();
        expect(rp.getStatus().healthy).toBe(true);
      });

      test('should accept custom confirmation requirements', () => {
        const rp = new ReorgProtection({
          customConfirmations: {
            1: 24, // Double Ethereum confirmations
          },
        });

        const req = rp.getConfirmationRequirement(1);
        expect(req).toBe(24);
      });
    });

    describe('Transaction Tracking', () => {
      test('should track a new transaction', () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0xabc123',
          chainId: 1,
          blockNumber: 15000000,
          from: '0xSender',
          to: '0xReceiver',
          value: '1000000000000000000',
        });

        expect(tx).toBeDefined();
        expect(tx.hash).toBe('0xabc123');
        expect(tx.chainId).toBe(1);
      });

      test('should retrieve tracked transaction', () => {
        reorgProtection.trackTransaction({
          hash: '0xabc123',
          chainId: 1,
          blockNumber: 15000000,
        });

        const tx = reorgProtection.getTransaction('0xabc123');
        expect(tx).toBeDefined();
        expect(tx.hash).toBe('0xabc123');
      });

      test('should return null for unknown transaction', () => {
        const tx = reorgProtection.getTransaction('0xunknown');
        expect(tx).toBeNull();
      });

      test('should track multiple transactions', () => {
        reorgProtection.trackTransaction({ hash: '0x1', chainId: 1, blockNumber: 1000 });
        reorgProtection.trackTransaction({ hash: '0x2', chainId: 1, blockNumber: 1001 });
        reorgProtection.trackTransaction({ hash: '0x3', chainId: 137, blockNumber: 5000 });

        expect(reorgProtection.getTransaction('0x1')).toBeDefined();
        expect(reorgProtection.getTransaction('0x2')).toBeDefined();
        expect(reorgProtection.getTransaction('0x3')).toBeDefined();
      });
    });

    describe('Confirmation Checking', () => {
      test('should check confirmations for Ethereum', async () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0xeth',
          chainId: 1,
          blockNumber: 15000000,
        });

        // Simulate current block
        const result = await reorgProtection.checkConfirmations(tx, 15000006);
        expect(result.confirmations).toBe(6);
        expect(result.confirmed).toBe(false); // Need 12
        expect(result.remaining).toBe(6);
      });

      test('should confirm after reaching threshold', async () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0xeth',
          chainId: 1,
          blockNumber: 15000000,
        });

        const result = await reorgProtection.checkConfirmations(tx, 15000012);
        expect(result.confirmations).toBe(12);
        expect(result.confirmed).toBe(true);
        expect(result.remaining).toBe(0);
      });

      test('should handle L2 transactions differently', async () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0xarb',
          chainId: 42161, // Arbitrum
          blockNumber: 100000000,
        });

        const result = await reorgProtection.checkConfirmations(tx, 100000001);
        // L2s have 0 confirmations needed on L2, but depend on L1
        expect(result.l1Dependent).toBe(true);
      });

      test('should handle Polygon confirmations', async () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0xpoly',
          chainId: 137,
          blockNumber: 50000000,
        });

        const result = await reorgProtection.checkConfirmations(tx, 50000064);
        expect(result.confirmations).toBe(64);
        expect(result.confirmed).toBe(false); // Need 128
        expect(result.remaining).toBe(64);
      });
    });

    describe('L1 Finality', () => {
      test('should wait for L1 finality on L2 chains', async () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0xopt',
          chainId: 10, // Optimism
          blockNumber: 100000000,
        });

        const status = reorgProtection.getL1FinalityStatus(tx);
        expect(status.requiresL1Finality).toBe(true);
        expect(status.l1BlocksRequired).toBe(64);
      });

      test('should not require L1 finality for Ethereum', () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0xeth',
          chainId: 1,
          blockNumber: 15000000,
        });

        const status = reorgProtection.getL1FinalityStatus(tx);
        expect(status.requiresL1Finality).toBe(false);
      });
    });

    describe('State Snapshots', () => {
      test('should create state snapshot', () => {
        const snapshot = reorgProtection.createSnapshot({
          chainId: 1,
          blockNumber: 15000000,
          balances: {
            '0xWallet1': '1000000000000000000',
            '0xWallet2': '2000000000000000000',
          },
          nonces: {
            '0xWallet1': 10,
            '0xWallet2': 5,
          },
        });

        expect(snapshot).toBeDefined();
        expect(snapshot.hash).toBeDefined();
        expect(snapshot.chainId).toBe(1);
      });

      test('should store and retrieve snapshot', () => {
        const snapshot = reorgProtection.createSnapshot({
          chainId: 1,
          blockNumber: 15000000,
          data: 'test',
        });

        const retrieved = reorgProtection.getSnapshot(snapshot.id);
        expect(retrieved).toBeDefined();
        expect(retrieved.hash).toBe(snapshot.hash);
      });

      test('should verify snapshot integrity', () => {
        const snapshot = reorgProtection.createSnapshot({
          chainId: 1,
          blockNumber: 15000000,
          data: 'test',
        });

        const result = reorgProtection.verifySnapshot(snapshot.id);
        expect(result.valid).toBe(true);
        expect(result.hashMatch).toBe(true);
      });
    });

    describe('Reorg Detection', () => {
      test('should detect when transaction disappears', async () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0xreorged',
          chainId: 1,
          blockNumber: 15000000,
        });

        // Simulate reorg detection
        const reorgDetected = await reorgProtection.handleReorg({
          chainId: 1,
          oldBlock: 15000005,
          newBlock: 15000003,
          affectedTransactions: ['0xreorged'],
        });

        expect(reorgDetected.affected).toContain('0xreorged');
      });

      test('should emit event on reorg', (done) => {
        reorgProtection.on('reorg', (event) => {
          expect(event.chainId).toBe(1);
          expect(event.depth).toBe(3);
          done();
        });

        reorgProtection.handleReorg({
          chainId: 1,
          oldBlock: 15000005,
          newBlock: 15000002,
          depth: 3,
          affectedTransactions: [],
        });
      });

      test('should classify reorg severity', () => {
        const shallow = reorgProtection.classifyReorgSeverity(2, 1);
        expect(shallow).toBe(REORG_SEVERITY.LOW);

        const medium = reorgProtection.classifyReorgSeverity(5, 1);
        expect(medium).toBe(REORG_SEVERITY.MEDIUM);

        const deep = reorgProtection.classifyReorgSeverity(10, 1);
        expect(deep).toBe(REORG_SEVERITY.HIGH);
      });
    });

    describe('Transaction Verification', () => {
      test('should verify confirmed transaction', async () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0xverify',
          chainId: 1,
          blockNumber: 15000000,
        });

        // Mark as confirmed
        tx.markConfirmed();

        const result = await reorgProtection.verifyTransaction('0xverify');
        expect(result.found).toBe(true);
        expect(result.confirmed).toBe(true);
      });

      test('should detect missing transaction', async () => {
        const result = await reorgProtection.verifyTransaction('0xmissing');
        expect(result.found).toBe(false);
      });
    });

    describe('Statistics', () => {
      test('should track statistics', () => {
        reorgProtection.trackTransaction({ hash: '0x1', chainId: 1, blockNumber: 1000 });
        reorgProtection.trackTransaction({ hash: '0x2', chainId: 1, blockNumber: 1001 });

        const stats = reorgProtection.getStatistics();
        expect(stats.trackedTransactions).toBe(2);
        expect(stats.confirmedTransactions).toBe(0);
      });

      test('should increment confirmed count', () => {
        const tx = reorgProtection.trackTransaction({
          hash: '0x1',
          chainId: 1,
          blockNumber: 1000,
        });

        tx.markConfirmed();

        const stats = reorgProtection.getStatistics();
        expect(stats.confirmedTransactions).toBe(1);
      });
    });

    describe('Status', () => {
      test('should return healthy status', () => {
        const status = reorgProtection.getStatus();
        expect(status.healthy).toBe(true);
        expect(status.trackedChains).toBeDefined();
      });

      test('should list tracked chains', () => {
        reorgProtection.trackTransaction({ hash: '0x1', chainId: 1, blockNumber: 1000 });
        reorgProtection.trackTransaction({ hash: '0x2', chainId: 137, blockNumber: 5000 });

        const status = reorgProtection.getStatus();
        expect(status.trackedChains).toContain(1);
        expect(status.trackedChains).toContain(137);
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
        verificationDelay: 60000,
        autoVerify: false,
      });
      expect(rp).toBeInstanceOf(ReorgProtection);
    });
  });

  describe('Edge Cases', () => {
    test('should handle unknown chain gracefully', async () => {
      const tx = reorgProtection.trackTransaction({
        hash: '0xunknown',
        chainId: 99999, // Unknown chain
        blockNumber: 1000,
      });

      const result = await reorgProtection.checkConfirmations(tx, 1012);
      expect(result.confirmations).toBe(12);
      // Should use default confirmations
    });

    test('should handle zero block number', () => {
      const tx = reorgProtection.trackTransaction({
        hash: '0xzero',
        chainId: 1,
        blockNumber: 0,
      });

      expect(tx.blockNumber).toBe(0);
    });

    test('should cleanup old transactions', () => {
      // Add old transaction
      const tx = reorgProtection.trackTransaction({
        hash: '0xold',
        chainId: 1,
        blockNumber: 1000,
      });

      // Mark as confirmed long ago
      tx.markConfirmed();
      tx.confirmedAt = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago

      reorgProtection.cleanup();

      // Old confirmed transactions should be cleaned up
      expect(reorgProtection.getTransaction('0xold')).toBeNull();
    });
  });
});

describe('Integration Tests', () => {
  test('full transaction lifecycle', async () => {
    const rp = createReorgProtection();

    // 1. Track transaction
    const tx = rp.trackTransaction({
      hash: '0xlifecycle',
      chainId: 1,
      blockNumber: 15000000,
      from: '0xSender',
      to: '0xReceiver',
      value: '1000000000000000000',
    });

    // 2. Check initial confirmations
    let result = await rp.checkConfirmations(tx, 15000005);
    expect(result.confirmed).toBe(false);
    expect(result.confirmations).toBe(5);

    // 3. Wait for more confirmations
    result = await rp.checkConfirmations(tx, 15000012);
    expect(result.confirmed).toBe(true);

    // 4. Verify transaction
    tx.markConfirmed();
    const verify = await rp.verifyTransaction('0xlifecycle');
    expect(verify.confirmed).toBe(true);

    // 5. Check statistics
    const stats = rp.getStatistics();
    expect(stats.confirmedTransactions).toBe(1);

    rp.stop();
  });

  test('cross-chain transaction safety', async () => {
    const rp = createReorgProtection();

    // Track L2 transaction (Arbitrum)
    const l2Tx = rp.trackTransaction({
      hash: '0xl2',
      chainId: 42161,
      blockNumber: 100000000,
    });

    // L2 requires L1 finality
    const l1Status = rp.getL1FinalityStatus(l2Tx);
    expect(l1Status.requiresL1Finality).toBe(true);
    expect(l1Status.l1BlocksRequired).toBe(64);

    // Create state snapshot for verification
    const snapshot = rp.createSnapshot({
      chainId: 42161,
      blockNumber: 100000000,
      state: { balance: '1000000' },
    });

    expect(snapshot.hash).toBeDefined();

    rp.stop();
  });
});
