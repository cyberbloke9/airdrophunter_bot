'use strict';

/**
 * Reorg Protection - Chain Reorganization Safety
 *
 * Sprint 2.2: Contract Safety & Simulation
 *
 * Problem: Ethereum had 7-block reorg in May 2022. L2 reorgs can invalidate state.
 *
 * Features:
 * - Chain-specific confirmation requirements
 * - Cross-chain finality verification
 * - Transaction re-verification after confirmation
 * - Automatic reorg detection and retry
 * - State snapshot comparison
 */

const EventEmitter = require('events');
const crypto = require('crypto');

// ============ Constants ============

/**
 * Chain-specific confirmation requirements
 * Based on historical reorg data and chain characteristics
 */
const CONFIRMATION_REQUIREMENTS = {
  // Ethereum Mainnet - 12 blocks (~3 minutes)
  // Based on May 2022 7-block reorg incident
  1: {
    name: 'Ethereum',
    confirmations: 12,
    blockTime: 12000, // 12 seconds
    finalityType: 'probabilistic',
    reorgRisk: 'low',
  },

  // Arbitrum One - relies on L1 finality
  42161: {
    name: 'Arbitrum',
    confirmations: 0, // Sequencer provides ordering
    blockTime: 250, // ~0.25 seconds
    finalityType: 'l1_dependent',
    l1Confirmations: 12,
    reorgRisk: 'very_low',
  },

  // Optimism - relies on L1 finality
  10: {
    name: 'Optimism',
    confirmations: 0,
    blockTime: 2000, // 2 seconds
    finalityType: 'l1_dependent',
    l1Confirmations: 12,
    reorgRisk: 'very_low',
  },

  // Base - relies on L1 finality
  8453: {
    name: 'Base',
    confirmations: 0,
    blockTime: 2000,
    finalityType: 'l1_dependent',
    l1Confirmations: 12,
    reorgRisk: 'very_low',
  },

  // Polygon PoS - 128 blocks recommended
  // Has experienced longer reorgs due to consensus mechanism
  137: {
    name: 'Polygon',
    confirmations: 128,
    blockTime: 2000,
    finalityType: 'probabilistic',
    reorgRisk: 'medium',
  },

  // BSC - 15 blocks
  56: {
    name: 'BSC',
    confirmations: 15,
    blockTime: 3000,
    finalityType: 'probabilistic',
    reorgRisk: 'low',
  },

  // Avalanche C-Chain - instant finality
  43114: {
    name: 'Avalanche',
    confirmations: 1,
    blockTime: 2000,
    finalityType: 'instant',
    reorgRisk: 'very_low',
  },

  // zkSync Era
  324: {
    name: 'zkSync Era',
    confirmations: 0,
    blockTime: 1000,
    finalityType: 'l1_dependent',
    l1Confirmations: 12,
    reorgRisk: 'very_low',
  },

  // Scroll
  534352: {
    name: 'Scroll',
    confirmations: 0,
    blockTime: 3000,
    finalityType: 'l1_dependent',
    l1Confirmations: 12,
    reorgRisk: 'very_low',
  },

  // Linea
  59144: {
    name: 'Linea',
    confirmations: 0,
    blockTime: 2000,
    finalityType: 'l1_dependent',
    l1Confirmations: 12,
    reorgRisk: 'very_low',
  },
};

// L1 finality for cross-chain operations
const L1_FINALITY_BLOCKS = 64; // ~13 minutes on Ethereum
const L1_FINALITY_TIME = 64 * 12 * 1000; // milliseconds

// Verification timing
const VERIFICATION_DELAY = 30000; // 30 seconds after confirmation
const MAX_REORG_CHECK_ATTEMPTS = 3;
const REORG_CHECK_INTERVAL = 10000; // 10 seconds between checks

// Transaction states
const TX_STATE = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FINALIZED: 'finalized',
  REORGED: 'reorged',
  FAILED: 'failed',
};

// ============ Transaction Tracker ============

class TrackedTransaction {
  constructor(txHash, chainId, options = {}) {
    this.txHash = txHash.toLowerCase();
    this.chainId = chainId;
    this.state = TX_STATE.PENDING;
    this.submittedAt = Date.now();
    this.confirmedAt = null;
    this.finalizedAt = null;
    this.blockNumber = null;
    this.blockHash = null;
    this.confirmations = 0;
    this.reorgCount = 0;
    this.lastVerifiedAt = null;
    this.metadata = options.metadata || {};

    // Snapshot for verification
    this.snapshot = null;
  }

  toJSON() {
    return {
      txHash: this.txHash,
      chainId: this.chainId,
      state: this.state,
      submittedAt: this.submittedAt,
      confirmedAt: this.confirmedAt,
      finalizedAt: this.finalizedAt,
      blockNumber: this.blockNumber,
      blockHash: this.blockHash,
      confirmations: this.confirmations,
      reorgCount: this.reorgCount,
      lastVerifiedAt: this.lastVerifiedAt,
      metadata: this.metadata,
    };
  }
}

// ============ State Snapshot ============

class StateSnapshot {
  constructor(data = {}) {
    this.blockNumber = data.blockNumber;
    this.blockHash = data.blockHash;
    this.txIndex = data.txIndex;
    this.status = data.status; // 0 = failed, 1 = success
    this.gasUsed = data.gasUsed;
    this.logs = data.logs || [];
    this.timestamp = Date.now();
    this.hash = this.computeHash();
  }

  computeHash() {
    const content = JSON.stringify({
      blockNumber: this.blockNumber,
      blockHash: this.blockHash,
      txIndex: this.txIndex,
      status: this.status,
      gasUsed: this.gasUsed,
      logsHash: this.logs.map(l => l.transactionHash + l.logIndex).join(','),
    });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  equals(other) {
    if (!other) return false;
    return this.hash === other.hash;
  }

  toJSON() {
    return {
      blockNumber: this.blockNumber,
      blockHash: this.blockHash,
      txIndex: this.txIndex,
      status: this.status,
      gasUsed: this.gasUsed,
      logsCount: this.logs.length,
      timestamp: this.timestamp,
      hash: this.hash,
    };
  }
}

// ============ Reorg Protection ============

class ReorgProtection extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      providers: config.providers || {}, // chainId -> provider
      customConfirmations: config.customConfirmations || {},
      verificationDelay: config.verificationDelay || VERIFICATION_DELAY,
      autoVerify: config.autoVerify !== false,
      strictMode: config.strictMode ?? true,
    };

    // Tracked transactions
    this.transactions = new Map(); // txHash -> TrackedTransaction
    this.pendingVerifications = new Map(); // txHash -> timeoutId

    // Chain configs (merge defaults with custom)
    this.chainConfigs = { ...CONFIRMATION_REQUIREMENTS };
    for (const [chainId, confirmations] of Object.entries(this.config.customConfirmations)) {
      if (this.chainConfigs[chainId]) {
        this.chainConfigs[chainId].confirmations = confirmations;
      }
    }

    // Statistics
    this.stats = {
      tracked: 0,
      confirmed: 0,
      finalized: 0,
      reorged: 0,
      verificationsPassed: 0,
      verificationsFailed: 0,
    };

    // Cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  // ============ Core Methods ============

  /**
   * Track a transaction for reorg protection
   */
  trackTransaction(txHash, chainId, options = {}) {
    const normalizedHash = txHash.toLowerCase();

    if (this.transactions.has(normalizedHash)) {
      return this.transactions.get(normalizedHash);
    }

    const tracked = new TrackedTransaction(normalizedHash, chainId, options);
    this.transactions.set(normalizedHash, tracked);
    this.stats.tracked++;

    this.emit('tracked', { txHash: normalizedHash, chainId });
    this.config.logger.debug?.(`Tracking transaction ${normalizedHash} on chain ${chainId}`);

    return tracked;
  }

  /**
   * Get required confirmations for a chain
   */
  getRequiredConfirmations(chainId) {
    const config = this.chainConfigs[chainId];
    if (!config) {
      // Default to conservative 12 confirmations for unknown chains
      this.config.logger.warn?.(`Unknown chain ${chainId}, using default 12 confirmations`);
      return 12;
    }
    return config.confirmations;
  }

  /**
   * Get chain configuration
   */
  getChainConfig(chainId) {
    return this.chainConfigs[chainId] || {
      name: `Chain ${chainId}`,
      confirmations: 12,
      blockTime: 12000,
      finalityType: 'probabilistic',
      reorgRisk: 'unknown',
    };
  }

  /**
   * Check if transaction has sufficient confirmations
   */
  async checkConfirmations(txHash, provider) {
    const normalizedHash = txHash.toLowerCase();
    const tracked = this.transactions.get(normalizedHash);

    if (!tracked) {
      throw new Error(`Transaction ${txHash} not being tracked`);
    }

    try {
      // Get transaction receipt
      const receipt = await provider.getTransactionReceipt(normalizedHash);

      if (!receipt) {
        // Transaction not yet mined
        return {
          confirmed: false,
          confirmations: 0,
          required: this.getRequiredConfirmations(tracked.chainId),
          state: TX_STATE.PENDING,
        };
      }

      // Get current block
      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber + 1;
      const required = this.getRequiredConfirmations(tracked.chainId);

      // Update tracked transaction
      tracked.blockNumber = receipt.blockNumber;
      tracked.blockHash = receipt.blockHash;
      tracked.confirmations = confirmations;

      // Create snapshot for verification
      if (!tracked.snapshot) {
        tracked.snapshot = new StateSnapshot({
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          txIndex: receipt.transactionIndex,
          status: receipt.status,
          gasUsed: receipt.gasUsed?.toString(),
          logs: receipt.logs,
        });
      }

      const isConfirmed = confirmations >= required;

      if (isConfirmed && tracked.state === TX_STATE.PENDING) {
        tracked.state = TX_STATE.CONFIRMED;
        tracked.confirmedAt = Date.now();
        this.stats.confirmed++;

        this.emit('confirmed', {
          txHash: normalizedHash,
          chainId: tracked.chainId,
          confirmations,
          blockNumber: receipt.blockNumber,
        });

        // Schedule verification if auto-verify enabled
        if (this.config.autoVerify) {
          this.scheduleVerification(normalizedHash, provider);
        }
      }

      return {
        confirmed: isConfirmed,
        confirmations,
        required,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        state: tracked.state,
        status: receipt.status,
      };
    } catch (err) {
      this.config.logger.error?.(`Error checking confirmations for ${txHash}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Wait for transaction to be confirmed with required confirmations
   */
  async waitForConfirmation(txHash, provider, options = {}) {
    const normalizedHash = txHash.toLowerCase();
    const timeout = options.timeout || 300000; // 5 minutes default
    const pollInterval = options.pollInterval || 5000;

    let tracked = this.transactions.get(normalizedHash);
    if (!tracked) {
      // Auto-track if not tracked
      const receipt = await provider.getTransactionReceipt(normalizedHash);
      const chainId = receipt ? (await provider.getNetwork()).chainId : options.chainId || 1;
      tracked = this.trackTransaction(normalizedHash, chainId, options);
    }

    const startTime = Date.now();
    const required = this.getRequiredConfirmations(tracked.chainId);

    return new Promise((resolve, reject) => {
      const check = async () => {
        try {
          const result = await this.checkConfirmations(normalizedHash, provider);

          if (result.confirmed) {
            resolve(result);
            return;
          }

          if (Date.now() - startTime > timeout) {
            reject(new Error(`Timeout waiting for ${required} confirmations`));
            return;
          }

          setTimeout(check, pollInterval);
        } catch (err) {
          if (Date.now() - startTime > timeout) {
            reject(err);
          } else {
            setTimeout(check, pollInterval);
          }
        }
      };

      check();
    });
  }

  // ============ Verification ============

  /**
   * Schedule post-confirmation verification
   */
  scheduleVerification(txHash, provider) {
    const normalizedHash = txHash.toLowerCase();

    // Cancel existing verification
    if (this.pendingVerifications.has(normalizedHash)) {
      clearTimeout(this.pendingVerifications.get(normalizedHash));
    }

    const timeoutId = setTimeout(async () => {
      await this.verifyTransaction(normalizedHash, provider);
      this.pendingVerifications.delete(normalizedHash);
    }, this.config.verificationDelay);

    this.pendingVerifications.set(normalizedHash, timeoutId);
  }

  /**
   * Verify transaction hasn't been reorged
   */
  async verifyTransaction(txHash, provider, attempt = 1) {
    const normalizedHash = txHash.toLowerCase();
    const tracked = this.transactions.get(normalizedHash);

    if (!tracked) {
      throw new Error(`Transaction ${txHash} not being tracked`);
    }

    if (!tracked.snapshot) {
      throw new Error(`No snapshot available for ${txHash}`);
    }

    try {
      // Get fresh receipt
      const receipt = await provider.getTransactionReceipt(normalizedHash);

      if (!receipt) {
        // Transaction disappeared - REORG DETECTED
        this.handleReorg(tracked, 'transaction_disappeared');
        return {
          verified: false,
          reorged: true,
          reason: 'Transaction no longer in chain',
        };
      }

      // Create new snapshot and compare
      const newSnapshot = new StateSnapshot({
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        txIndex: receipt.transactionIndex,
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString(),
        logs: receipt.logs,
      });

      if (!tracked.snapshot.equals(newSnapshot)) {
        // State changed - possible reorg
        if (tracked.snapshot.blockHash !== newSnapshot.blockHash) {
          // Block hash changed - REORG DETECTED
          this.handleReorg(tracked, 'block_hash_changed');
          return {
            verified: false,
            reorged: true,
            reason: 'Block hash changed - transaction moved to different block',
            originalBlock: tracked.snapshot.blockNumber,
            newBlock: newSnapshot.blockNumber,
          };
        }

        // Other state change (unusual but possible)
        this.config.logger.warn?.(`State mismatch for ${txHash} but block unchanged`);
      }

      // Update tracking
      tracked.lastVerifiedAt = Date.now();
      tracked.state = TX_STATE.FINALIZED;
      tracked.finalizedAt = Date.now();
      this.stats.verificationsPassed++;
      this.stats.finalized++;

      this.emit('finalized', {
        txHash: normalizedHash,
        chainId: tracked.chainId,
        blockNumber: receipt.blockNumber,
      });

      return {
        verified: true,
        reorged: false,
        state: TX_STATE.FINALIZED,
        blockNumber: receipt.blockNumber,
      };
    } catch (err) {
      this.config.logger.error?.(`Verification error for ${txHash}: ${err.message}`);

      if (attempt < MAX_REORG_CHECK_ATTEMPTS) {
        // Retry after delay
        await new Promise(resolve => setTimeout(resolve, REORG_CHECK_INTERVAL));
        return this.verifyTransaction(txHash, provider, attempt + 1);
      }

      this.stats.verificationsFailed++;
      throw err;
    }
  }

  /**
   * Handle detected reorg
   */
  handleReorg(tracked, reason) {
    tracked.state = TX_STATE.REORGED;
    tracked.reorgCount++;
    this.stats.reorged++;

    const event = {
      txHash: tracked.txHash,
      chainId: tracked.chainId,
      reason,
      originalBlock: tracked.blockNumber,
      originalBlockHash: tracked.blockHash,
      reorgCount: tracked.reorgCount,
      timestamp: Date.now(),
    };

    this.emit('reorg', event);
    this.config.logger.error?.(`REORG DETECTED for ${tracked.txHash}: ${reason}`);

    return event;
  }

  // ============ Cross-Chain Finality ============

  /**
   * Wait for L1 finality (for cross-chain operations)
   */
  async waitForL1Finality(txHash, l1Provider, options = {}) {
    const timeout = options.timeout || L1_FINALITY_TIME * 1.5;

    // First wait for L1 confirmations
    const result = await this.waitForConfirmation(txHash, l1Provider, {
      ...options,
      timeout,
    });

    // Then wait for additional finality blocks
    const tracked = this.transactions.get(txHash.toLowerCase());
    if (!tracked) {
      throw new Error(`Transaction ${txHash} not tracked`);
    }

    const currentBlock = await l1Provider.getBlockNumber();
    const blocksToFinality = L1_FINALITY_BLOCKS - (currentBlock - tracked.blockNumber);

    if (blocksToFinality > 0) {
      const chainConfig = this.getChainConfig(1); // Ethereum
      const waitTime = blocksToFinality * chainConfig.blockTime;

      this.config.logger.info?.(`Waiting ${blocksToFinality} more blocks for L1 finality`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Final verification
    return this.verifyTransaction(txHash, l1Provider);
  }

  /**
   * Check if L2 transaction is safe based on L1 finality
   */
  async checkL2Safety(l2TxHash, l2Provider, l1Provider, options = {}) {
    const l2Receipt = await l2Provider.getTransactionReceipt(l2TxHash);
    if (!l2Receipt) {
      return { safe: false, reason: 'Transaction not found' };
    }

    const chainId = (await l2Provider.getNetwork()).chainId;
    const chainConfig = this.getChainConfig(chainId);

    if (chainConfig.finalityType !== 'l1_dependent') {
      // Not an L2, use regular confirmation
      const result = await this.checkConfirmations(l2TxHash, l2Provider);
      return { safe: result.confirmed, ...result };
    }

    // For L1-dependent chains, check L1 finality
    // In production, would need to query the L2's batch/state root submission to L1
    // For now, use time-based estimation

    const l2BlockTime = chainConfig.blockTime;
    const l1ConfirmationsNeeded = chainConfig.l1Confirmations || 12;
    const estimatedL1Delay = l1ConfirmationsNeeded * 12000; // Ethereum block time

    const l2BlockAge = Date.now() - (l2Receipt.blockNumber * l2BlockTime); // Rough estimate

    if (l2BlockAge < estimatedL1Delay) {
      return {
        safe: false,
        reason: 'Waiting for L1 finality',
        estimatedWait: estimatedL1Delay - l2BlockAge,
      };
    }

    return {
      safe: true,
      chainConfig,
      blockNumber: l2Receipt.blockNumber,
    };
  }

  // ============ Utility ============

  /**
   * Get transaction status
   */
  getTransactionStatus(txHash) {
    const tracked = this.transactions.get(txHash.toLowerCase());
    if (!tracked) {
      return null;
    }
    return tracked.toJSON();
  }

  /**
   * Get all tracked transactions
   */
  getTrackedTransactions(filter = {}) {
    const results = [];

    for (const tracked of this.transactions.values()) {
      if (filter.chainId && tracked.chainId !== filter.chainId) continue;
      if (filter.state && tracked.state !== filter.state) continue;
      results.push(tracked.toJSON());
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      activeTracking: this.transactions.size,
      pendingVerifications: this.pendingVerifications.size,
      supportedChains: Object.keys(this.chainConfigs).map(id => ({
        chainId: parseInt(id),
        ...this.chainConfigs[id],
      })),
    };
  }

  /**
   * Check if chain has high reorg risk
   */
  isHighReorgRisk(chainId) {
    const config = this.chainConfigs[chainId];
    return config?.reorgRisk === 'medium' || config?.reorgRisk === 'high';
  }

  /**
   * Get estimated finality time for chain
   */
  getEstimatedFinalityTime(chainId) {
    const config = this.chainConfigs[chainId];
    if (!config) return 180000; // Default 3 minutes

    if (config.finalityType === 'instant') {
      return config.blockTime;
    }

    if (config.finalityType === 'l1_dependent') {
      const l1Confirmations = config.l1Confirmations || 12;
      return l1Confirmations * 12000 + config.blockTime;
    }

    return config.confirmations * config.blockTime;
  }

  /**
   * Remove old tracked transactions
   */
  cleanup() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    let removed = 0;

    for (const [txHash, tracked] of this.transactions) {
      if (tracked.finalizedAt && tracked.finalizedAt < cutoff) {
        this.transactions.delete(txHash);
        removed++;
      }
    }

    if (removed > 0) {
      this.config.logger.debug?.(`Cleaned up ${removed} old tracked transactions`);
    }
  }

  /**
   * Stop the protection system
   */
  stop() {
    // Clear verification timeouts
    for (const timeoutId of this.pendingVerifications.values()) {
      clearTimeout(timeoutId);
    }
    this.pendingVerifications.clear();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.stop();
    this.transactions.clear();
    this.removeAllListeners();
  }
}

// ============ Module Exports ============

module.exports = {
  ReorgProtection,
  TrackedTransaction,
  StateSnapshot,
  CONFIRMATION_REQUIREMENTS,
  L1_FINALITY_BLOCKS,
  L1_FINALITY_TIME,
  TX_STATE,

  // Factory function
  createReorgProtection: (config = {}) => new ReorgProtection(config),
};
