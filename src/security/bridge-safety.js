'use strict';

/**
 * Bridge Safety - Bridge Exploit Protection
 *
 * Sprint 2.2: Contract Safety & Simulation
 *
 * Problem: Ronin ($625M), Wormhole ($326M), Nomad ($190M) - bridges are high-risk.
 *
 * Features:
 * - Bridge selection and scoring (TVL, audits, track record)
 * - Per-transaction and per-day limits
 * - Destination receipt verification
 * - Stuck/failed transaction tracking
 * - Manual recovery procedure documentation
 */

const EventEmitter = require('events');

// ============ Constants ============

/**
 * Bridge risk tiers
 */
const BRIDGE_TIER = {
  CANONICAL: 'canonical', // Native L2 bridges (safest)
  ESTABLISHED: 'established', // Well-audited, high TVL
  MODERATE: 'moderate', // Audited, decent TVL
  RISKY: 'risky', // Low TVL, new, or questionable
  BLACKLISTED: 'blacklisted', // Known exploited or dangerous
};

/**
 * Known bridge configurations
 * In production, this would be fetched from a maintained database
 */
const KNOWN_BRIDGES = {
  // Canonical L2 Bridges (Safest)
  'arbitrum-canonical': {
    name: 'Arbitrum Bridge',
    tier: BRIDGE_TIER.CANONICAL,
    supportedChains: [1, 42161],
    tvlUsd: 3500000000, // $3.5B
    audits: ['Trail of Bits', 'OpenZeppelin'],
    launchDate: '2021-08-31',
    exploits: [],
    contractAddresses: {
      1: '0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a', // L1 Gateway Router
      42161: '0x5288c571Fd7aD117beA99bF60FE0846C4E84F933', // L2 Gateway Router
    },
    recoveryDocs: 'https://docs.arbitrum.io/bridge-recovery',
    avgBridgeTime: 600, // ~10 minutes
  },

  'optimism-canonical': {
    name: 'Optimism Bridge',
    tier: BRIDGE_TIER.CANONICAL,
    supportedChains: [1, 10],
    tvlUsd: 800000000, // $800M
    audits: ['OpenZeppelin', 'Sigma Prime'],
    launchDate: '2021-07-01',
    exploits: [],
    contractAddresses: {
      1: '0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1', // L1StandardBridge
      10: '0x4200000000000000000000000000000000000010', // L2StandardBridge
    },
    recoveryDocs: 'https://docs.optimism.io/bridge-recovery',
    avgBridgeTime: 1200, // ~20 minutes (7-day withdrawal)
  },

  'base-canonical': {
    name: 'Base Bridge',
    tier: BRIDGE_TIER.CANONICAL,
    supportedChains: [1, 8453],
    tvlUsd: 1200000000, // $1.2B
    audits: ['OpenZeppelin'],
    launchDate: '2023-07-13',
    exploits: [],
    contractAddresses: {
      1: '0x3154Cf16ccdb4C6d922629664174b904d80F2C35', // L1StandardBridge
      8453: '0x4200000000000000000000000000000000000010', // L2StandardBridge
    },
    recoveryDocs: 'https://docs.base.org/bridge-recovery',
    avgBridgeTime: 1200,
  },

  'polygon-pos-bridge': {
    name: 'Polygon PoS Bridge',
    tier: BRIDGE_TIER.CANONICAL,
    supportedChains: [1, 137],
    tvlUsd: 2000000000, // $2B
    audits: ['Matic Team', 'ChainSecurity'],
    launchDate: '2020-05-30',
    exploits: [],
    contractAddresses: {
      1: '0xA0c68C638235ee32657e8f720a23ceC1bFc77C77', // RootChainManager
      137: '0x0000000000000000000000000000000000001001', // ChildChain
    },
    recoveryDocs: 'https://wiki.polygon.technology/docs/pos/bridge-recovery',
    avgBridgeTime: 1800, // ~30 minutes
  },

  // Established Third-Party Bridges
  'stargate': {
    name: 'Stargate Finance',
    tier: BRIDGE_TIER.ESTABLISHED,
    supportedChains: [1, 10, 42161, 137, 43114, 56, 250],
    tvlUsd: 400000000, // $400M
    audits: ['Quantstamp', 'Zellic'],
    launchDate: '2022-03-17',
    exploits: [],
    contractAddresses: {
      1: '0x8731d54E9D02c286767d56ac03e8037C07e01e98', // Router
    },
    recoveryDocs: 'https://stargateprotocol.gitbook.io/stargate/recovery',
    avgBridgeTime: 60, // ~1 minute (LayerZero)
  },

  'across': {
    name: 'Across Protocol',
    tier: BRIDGE_TIER.ESTABLISHED,
    supportedChains: [1, 10, 42161, 137, 324],
    tvlUsd: 150000000, // $150M
    audits: ['OpenZeppelin'],
    launchDate: '2021-11-01',
    exploits: [],
    contractAddresses: {
      1: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5', // SpokePool
    },
    recoveryDocs: 'https://docs.across.to/recovery',
    avgBridgeTime: 120, // ~2 minutes
  },

  // Moderate Risk Bridges
  'hop-protocol': {
    name: 'Hop Protocol',
    tier: BRIDGE_TIER.MODERATE,
    supportedChains: [1, 10, 42161, 137, 100],
    tvlUsd: 50000000, // $50M
    audits: ['Consensys Diligence'],
    launchDate: '2021-07-12',
    exploits: [],
    contractAddresses: {
      1: '0xb8901acB165ed027E32754E0FFe830802919727f', // L1_ETH_Bridge
    },
    recoveryDocs: 'https://docs.hop.exchange/recovery',
    avgBridgeTime: 300, // ~5 minutes
  },

  // Blacklisted (Historical exploits)
  'ronin-bridge': {
    name: 'Ronin Bridge',
    tier: BRIDGE_TIER.BLACKLISTED,
    supportedChains: [1, 2020], // Ronin chain
    tvlUsd: 0,
    audits: [],
    launchDate: '2021-01-27',
    exploits: [{
      date: '2022-03-23',
      amount: 625000000,
      description: 'Private key compromise - $625M stolen',
    }],
    contractAddresses: {},
    recoveryDocs: null,
    avgBridgeTime: null,
  },

  'nomad-bridge': {
    name: 'Nomad Bridge',
    tier: BRIDGE_TIER.BLACKLISTED,
    supportedChains: [1, 1284, 1285], // Moonbeam, Moonriver
    tvlUsd: 0,
    audits: ['Quantstamp'],
    launchDate: '2022-01-01',
    exploits: [{
      date: '2022-08-01',
      amount: 190000000,
      description: 'Smart contract vulnerability - $190M drained',
    }],
    contractAddresses: {},
    recoveryDocs: null,
    avgBridgeTime: null,
  },
};

/**
 * Default safety limits
 */
const DEFAULT_LIMITS = {
  maxPercentOfBridgeLiquidity: 0.10, // 10% of bridge TVL
  maxPercentOfPortfolioPerDay: 0.25, // 25% of portfolio per day
  maxSingleTransactionUsd: 100000, // $100k per transaction
  minBridgeTvlUsd: 10000000, // $10M minimum TVL
  minBridgeAgeMonths: 6, // 6 months minimum age
  requireAudit: true,
};

/**
 * Bridge transaction states
 */
const BRIDGE_TX_STATE = {
  INITIATED: 'initiated',
  SOURCE_CONFIRMED: 'source_confirmed',
  IN_TRANSIT: 'in_transit',
  DESTINATION_PENDING: 'destination_pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STUCK: 'stuck',
};

// ============ Bridge Transaction Tracker ============

class BridgeTransaction {
  constructor(data) {
    this.id = data.id || `bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.bridgeId = data.bridgeId;
    this.sourceChainId = data.sourceChainId;
    this.destChainId = data.destChainId;
    this.sourceTxHash = data.sourceTxHash;
    this.destTxHash = null;
    this.token = data.token;
    this.amount = data.amount;
    this.amountUsd = data.amountUsd;
    this.sender = data.sender;
    this.recipient = data.recipient;
    this.state = BRIDGE_TX_STATE.INITIATED;
    this.initiatedAt = Date.now();
    this.sourceConfirmedAt = null;
    this.completedAt = null;
    this.expectedArrival = null;
    this.error = null;
    this.retryCount = 0;
  }

  toJSON() {
    return {
      id: this.id,
      bridgeId: this.bridgeId,
      sourceChainId: this.sourceChainId,
      destChainId: this.destChainId,
      sourceTxHash: this.sourceTxHash,
      destTxHash: this.destTxHash,
      token: this.token,
      amount: this.amount,
      amountUsd: this.amountUsd,
      sender: this.sender,
      recipient: this.recipient,
      state: this.state,
      initiatedAt: this.initiatedAt,
      sourceConfirmedAt: this.sourceConfirmedAt,
      completedAt: this.completedAt,
      expectedArrival: this.expectedArrival,
      error: this.error,
      retryCount: this.retryCount,
    };
  }
}

// ============ Bridge Safety ============

class BridgeSafety extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      limits: { ...DEFAULT_LIMITS, ...config.limits },
      customBridges: config.customBridges || {},
      strictMode: config.strictMode ?? true,
      stuckThreshold: config.stuckThreshold || 3600000, // 1 hour
    };

    // Merge known bridges with custom
    this.bridges = { ...KNOWN_BRIDGES, ...this.config.customBridges };

    // Transaction tracking
    this.transactions = new Map(); // id -> BridgeTransaction
    this.dailyVolume = new Map(); // date -> { totalUsd, byBridge }

    // Statistics
    this.stats = {
      totalBridged: 0,
      totalVolumeUsd: 0,
      successfulBridges: 0,
      failedBridges: 0,
      stuckBridges: 0,
      rejectedByLimits: 0,
      rejectedByTier: 0,
    };

    // Stuck transaction checker
    this.stuckCheckInterval = setInterval(() => this.checkStuckTransactions(), 60000);
  }

  // ============ Bridge Selection ============

  /**
   * Get bridge information
   */
  getBridge(bridgeId) {
    return this.bridges[bridgeId] || null;
  }

  /**
   * Get all available bridges for a route
   */
  getAvailableBridges(sourceChainId, destChainId) {
    const available = [];

    for (const [id, bridge] of Object.entries(this.bridges)) {
      if (bridge.tier === BRIDGE_TIER.BLACKLISTED) continue;

      if (
        bridge.supportedChains.includes(sourceChainId) &&
        bridge.supportedChains.includes(destChainId)
      ) {
        available.push({
          id,
          ...bridge,
          score: this.calculateBridgeScore(bridge),
        });
      }
    }

    // Sort by score (highest first)
    return available.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate bridge safety score (0-100)
   */
  calculateBridgeScore(bridge) {
    let score = 0;

    // Tier score (0-40)
    const tierScores = {
      [BRIDGE_TIER.CANONICAL]: 40,
      [BRIDGE_TIER.ESTABLISHED]: 30,
      [BRIDGE_TIER.MODERATE]: 20,
      [BRIDGE_TIER.RISKY]: 5,
      [BRIDGE_TIER.BLACKLISTED]: 0,
    };
    score += tierScores[bridge.tier] || 0;

    // TVL score (0-25)
    if (bridge.tvlUsd >= 1000000000) score += 25; // $1B+
    else if (bridge.tvlUsd >= 500000000) score += 20; // $500M+
    else if (bridge.tvlUsd >= 100000000) score += 15; // $100M+
    else if (bridge.tvlUsd >= 50000000) score += 10; // $50M+
    else if (bridge.tvlUsd >= 10000000) score += 5; // $10M+

    // Audit score (0-15)
    const auditCount = bridge.audits?.length || 0;
    score += Math.min(auditCount * 5, 15);

    // Age score (0-10)
    if (bridge.launchDate) {
      const ageMonths = (Date.now() - new Date(bridge.launchDate).getTime()) / (30 * 24 * 60 * 60 * 1000);
      if (ageMonths >= 24) score += 10;
      else if (ageMonths >= 12) score += 7;
      else if (ageMonths >= 6) score += 4;
    }

    // Exploit penalty (-20 per exploit)
    const exploitCount = bridge.exploits?.length || 0;
    score -= exploitCount * 20;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Select best bridge for a route
   */
  selectBridge(sourceChainId, destChainId, options = {}) {
    const available = this.getAvailableBridges(sourceChainId, destChainId);

    if (available.length === 0) {
      return {
        selected: null,
        reason: 'No bridges available for this route',
      };
    }

    // Filter by minimum score if specified
    const minScore = options.minScore || 30;
    const qualified = available.filter(b => b.score >= minScore);

    if (qualified.length === 0) {
      return {
        selected: null,
        reason: `No bridges meet minimum safety score of ${minScore}`,
        available: available.map(b => ({ id: b.id, name: b.name, score: b.score })),
      };
    }

    // Prefer canonical bridges
    const canonical = qualified.filter(b => b.tier === BRIDGE_TIER.CANONICAL);
    if (canonical.length > 0) {
      return {
        selected: canonical[0],
        alternatives: qualified.slice(1),
        reason: 'Selected canonical bridge',
      };
    }

    return {
      selected: qualified[0],
      alternatives: qualified.slice(1),
      reason: 'Selected highest-scoring bridge',
    };
  }

  // ============ Safety Validation ============

  /**
   * Validate a bridge transaction before execution
   */
  async validateBridgeTransaction(bridgeId, params) {
    const bridge = this.getBridge(bridgeId);
    const errors = [];
    const warnings = [];

    // Check bridge exists
    if (!bridge) {
      return {
        valid: false,
        errors: [`Unknown bridge: ${bridgeId}`],
        warnings: [],
      };
    }

    // Check bridge tier
    if (bridge.tier === BRIDGE_TIER.BLACKLISTED) {
      this.stats.rejectedByTier++;
      return {
        valid: false,
        errors: ['Bridge is blacklisted due to security incidents'],
        warnings: [],
        exploits: bridge.exploits,
      };
    }

    if (bridge.tier === BRIDGE_TIER.RISKY && this.config.strictMode) {
      warnings.push('Bridge is classified as risky');
    }

    // Check TVL limit
    const percentOfTvl = params.amountUsd / bridge.tvlUsd;
    if (percentOfTvl > this.config.limits.maxPercentOfBridgeLiquidity) {
      errors.push(
        `Amount exceeds ${this.config.limits.maxPercentOfBridgeLiquidity * 100}% of bridge liquidity ` +
        `(${(percentOfTvl * 100).toFixed(2)}%)`
      );
    } else if (percentOfTvl > this.config.limits.maxPercentOfBridgeLiquidity * 0.5) {
      warnings.push(`Amount is ${(percentOfTvl * 100).toFixed(2)}% of bridge liquidity`);
    }

    // Check minimum TVL
    if (bridge.tvlUsd < this.config.limits.minBridgeTvlUsd) {
      if (this.config.strictMode) {
        errors.push(`Bridge TVL ($${bridge.tvlUsd.toLocaleString()}) below minimum ($${this.config.limits.minBridgeTvlUsd.toLocaleString()})`);
      } else {
        warnings.push(`Bridge TVL is low: $${bridge.tvlUsd.toLocaleString()}`);
      }
    }

    // Check single transaction limit
    if (params.amountUsd > this.config.limits.maxSingleTransactionUsd) {
      errors.push(
        `Amount ($${params.amountUsd.toLocaleString()}) exceeds single transaction limit ` +
        `($${this.config.limits.maxSingleTransactionUsd.toLocaleString()})`
      );
    }

    // Check daily volume limit
    const dailyVolumeCheck = this.checkDailyVolume(params.portfolioValueUsd, params.amountUsd);
    if (!dailyVolumeCheck.allowed) {
      errors.push(dailyVolumeCheck.reason);
    } else if (dailyVolumeCheck.warning) {
      warnings.push(dailyVolumeCheck.warning);
    }

    // Check audit requirement
    if (this.config.limits.requireAudit && (!bridge.audits || bridge.audits.length === 0)) {
      if (this.config.strictMode) {
        errors.push('Bridge has no security audits');
      } else {
        warnings.push('Bridge has no security audits');
      }
    }

    // Check bridge age
    if (bridge.launchDate) {
      const ageMonths = (Date.now() - new Date(bridge.launchDate).getTime()) / (30 * 24 * 60 * 60 * 1000);
      if (ageMonths < this.config.limits.minBridgeAgeMonths) {
        if (this.config.strictMode) {
          errors.push(`Bridge is too new (${ageMonths.toFixed(1)} months, minimum ${this.config.limits.minBridgeAgeMonths})`);
        } else {
          warnings.push(`Bridge is relatively new (${ageMonths.toFixed(1)} months)`);
        }
      }
    }

    // Check route support
    if (
      !bridge.supportedChains.includes(params.sourceChainId) ||
      !bridge.supportedChains.includes(params.destChainId)
    ) {
      errors.push('Bridge does not support this route');
    }

    if (errors.length > 0) {
      this.stats.rejectedByLimits++;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      bridgeScore: this.calculateBridgeScore(bridge),
      estimatedTime: bridge.avgBridgeTime,
    };
  }

  /**
   * Check daily volume limits
   */
  checkDailyVolume(portfolioValueUsd, amountUsd) {
    const today = new Date().toISOString().split('T')[0];
    const dailyData = this.dailyVolume.get(today) || { totalUsd: 0, byBridge: {} };

    const projectedTotal = dailyData.totalUsd + amountUsd;
    const maxDaily = portfolioValueUsd * this.config.limits.maxPercentOfPortfolioPerDay;

    if (projectedTotal > maxDaily) {
      return {
        allowed: false,
        reason: `Daily bridge volume limit exceeded. Used: $${dailyData.totalUsd.toLocaleString()}, ` +
                `Limit: $${maxDaily.toLocaleString()}`,
      };
    }

    if (projectedTotal > maxDaily * 0.8) {
      return {
        allowed: true,
        warning: `Approaching daily bridge limit (${((projectedTotal / maxDaily) * 100).toFixed(0)}% used)`,
      };
    }

    return { allowed: true };
  }

  // ============ Transaction Tracking ============

  /**
   * Track a bridge transaction
   */
  trackBridgeTransaction(params) {
    const tx = new BridgeTransaction(params);
    const bridge = this.getBridge(params.bridgeId);

    if (bridge?.avgBridgeTime) {
      tx.expectedArrival = Date.now() + (bridge.avgBridgeTime * 1000);
    }

    this.transactions.set(tx.id, tx);
    this.stats.totalBridged++;

    // Update daily volume
    const today = new Date().toISOString().split('T')[0];
    const dailyData = this.dailyVolume.get(today) || { totalUsd: 0, byBridge: {} };
    dailyData.totalUsd += params.amountUsd || 0;
    dailyData.byBridge[params.bridgeId] = (dailyData.byBridge[params.bridgeId] || 0) + (params.amountUsd || 0);
    this.dailyVolume.set(today, dailyData);

    this.emit('transaction:initiated', tx.toJSON());
    this.config.logger.info?.(`Bridge transaction initiated: ${tx.id}`);

    return tx;
  }

  /**
   * Update transaction state
   */
  updateTransactionState(txId, state, data = {}) {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Bridge transaction ${txId} not found`);
    }

    const previousState = tx.state;
    tx.state = state;

    switch (state) {
      case BRIDGE_TX_STATE.SOURCE_CONFIRMED:
        tx.sourceConfirmedAt = Date.now();
        break;
      case BRIDGE_TX_STATE.COMPLETED:
        tx.completedAt = Date.now();
        tx.destTxHash = data.destTxHash;
        this.stats.successfulBridges++;
        this.stats.totalVolumeUsd += tx.amountUsd || 0;
        break;
      case BRIDGE_TX_STATE.FAILED:
        tx.error = data.error;
        this.stats.failedBridges++;
        break;
      case BRIDGE_TX_STATE.STUCK:
        this.stats.stuckBridges++;
        break;
    }

    this.emit(`transaction:${state}`, { ...tx.toJSON(), previousState });

    if (state === BRIDGE_TX_STATE.STUCK || state === BRIDGE_TX_STATE.FAILED) {
      this.emit('alert', {
        level: state === BRIDGE_TX_STATE.FAILED ? 'high' : 'medium',
        message: `Bridge transaction ${state}: ${tx.id}`,
        transaction: tx.toJSON(),
      });
    }

    return tx;
  }

  /**
   * Verify destination receipt
   */
  async verifyDestinationReceipt(txId, destProvider) {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Bridge transaction ${txId} not found`);
    }

    if (!tx.destTxHash) {
      return { verified: false, reason: 'No destination transaction hash' };
    }

    try {
      const receipt = await destProvider.getTransactionReceipt(tx.destTxHash);

      if (!receipt) {
        return { verified: false, reason: 'Destination transaction not found' };
      }

      if (receipt.status === 0) {
        return { verified: false, reason: 'Destination transaction failed' };
      }

      // Update state to completed
      this.updateTransactionState(txId, BRIDGE_TX_STATE.COMPLETED, {
        destTxHash: tx.destTxHash,
      });

      return {
        verified: true,
        receipt,
        blockNumber: receipt.blockNumber,
      };
    } catch (err) {
      this.config.logger.error?.(`Error verifying destination: ${err.message}`);
      return { verified: false, reason: err.message };
    }
  }

  /**
   * Check for stuck transactions
   */
  checkStuckTransactions() {
    const now = Date.now();

    for (const tx of this.transactions.values()) {
      if (
        tx.state === BRIDGE_TX_STATE.IN_TRANSIT ||
        tx.state === BRIDGE_TX_STATE.DESTINATION_PENDING
      ) {
        const elapsed = now - (tx.sourceConfirmedAt || tx.initiatedAt);

        if (elapsed > this.config.stuckThreshold) {
          this.updateTransactionState(tx.id, BRIDGE_TX_STATE.STUCK, {
            error: 'Transaction exceeded expected time',
          });
        }
      }
    }
  }

  // ============ Recovery ============

  /**
   * Get recovery information for a bridge
   */
  getRecoveryInfo(bridgeId) {
    const bridge = this.getBridge(bridgeId);
    if (!bridge) {
      return null;
    }

    return {
      bridgeName: bridge.name,
      recoveryDocs: bridge.recoveryDocs,
      supportedChains: bridge.supportedChains,
      contractAddresses: bridge.contractAddresses,
      recommendations: this.getRecoveryRecommendations(bridge),
    };
  }

  /**
   * Get recovery recommendations
   */
  getRecoveryRecommendations(bridge) {
    const recommendations = [];

    if (bridge.tier === BRIDGE_TIER.CANONICAL) {
      recommendations.push('Check official bridge status page');
      recommendations.push('Use official recovery tools if available');
      recommendations.push('Wait for L1 finality before assuming stuck');
    } else {
      recommendations.push('Contact bridge support via Discord/Telegram');
      recommendations.push('Document all transaction hashes');
      recommendations.push('Do NOT interact with unofficial recovery tools');
    }

    recommendations.push('Check block explorer on both chains');
    recommendations.push('Verify recipient address received funds');

    return recommendations;
  }

  /**
   * Get stuck transactions
   */
  getStuckTransactions() {
    return Array.from(this.transactions.values())
      .filter(tx => tx.state === BRIDGE_TX_STATE.STUCK)
      .map(tx => ({
        ...tx.toJSON(),
        recoveryInfo: this.getRecoveryInfo(tx.bridgeId),
      }));
  }

  // ============ Utility ============

  /**
   * Get transaction by ID
   */
  getTransaction(txId) {
    const tx = this.transactions.get(txId);
    return tx ? tx.toJSON() : null;
  }

  /**
   * Get all transactions
   */
  getTransactions(filter = {}) {
    const results = [];

    for (const tx of this.transactions.values()) {
      if (filter.state && tx.state !== filter.state) continue;
      if (filter.bridgeId && tx.bridgeId !== filter.bridgeId) continue;
      if (filter.sourceChainId && tx.sourceChainId !== filter.sourceChainId) continue;
      results.push(tx.toJSON());
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const today = new Date().toISOString().split('T')[0];
    const dailyData = this.dailyVolume.get(today) || { totalUsd: 0, byBridge: {} };

    return {
      ...this.stats,
      activeTransactions: this.transactions.size,
      todayVolumeUsd: dailyData.totalUsd,
      todayByBridge: dailyData.byBridge,
      supportedBridges: Object.keys(this.bridges).length,
      blacklistedBridges: Object.values(this.bridges).filter(b => b.tier === BRIDGE_TIER.BLACKLISTED).length,
    };
  }

  /**
   * Check if bridge is safe
   */
  isBridgeSafe(bridgeId) {
    const bridge = this.getBridge(bridgeId);
    if (!bridge) return false;
    return bridge.tier !== BRIDGE_TIER.BLACKLISTED && bridge.tier !== BRIDGE_TIER.RISKY;
  }

  // ============ Lifecycle ============

  /**
   * Stop the safety system
   */
  stop() {
    if (this.stuckCheckInterval) {
      clearInterval(this.stuckCheckInterval);
      this.stuckCheckInterval = null;
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.stop();
    this.transactions.clear();
    this.dailyVolume.clear();
    this.removeAllListeners();
  }
}

// ============ Module Exports ============

module.exports = {
  BridgeSafety,
  BridgeTransaction,
  BRIDGE_TIER,
  BRIDGE_TX_STATE,
  KNOWN_BRIDGES,
  DEFAULT_LIMITS,

  // Factory function
  createBridgeSafety: (config = {}) => new BridgeSafety(config),
};
