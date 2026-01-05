'use strict';

/**
 * Points Aggregation System
 *
 * Sprint 3.2: Points & Eligibility Tracking
 *
 * =============================================================================
 * THE 6 W's: POINTS AGGREGATION
 * =============================================================================
 *
 * WHO:
 * ----
 * WHO uses the points aggregator:
 *
 * - AIRDROP FARMERS: Track accumulated points across protocols
 *   - Need visibility into progress toward airdrop eligibility
 *   - Want to prioritize high-value protocols
 *   - Must optimize activity for maximum points per gas spent
 *
 * - MULTI-WALLET OPERATORS: Aggregate points across wallets
 *   - Track total expected value
 *   - Identify underperforming wallets
 *   - Balance activity distribution
 *
 * WHO assigns points:
 *
 * - PROTOCOL POINTS SYSTEMS:
 *   ```
 *   LayerZero:   Messages sent, unique chains, volume
 *   zkSync:      Transactions, volume, contract interactions, time
 *   EigenLayer:  Staked ETH amount, duration, restaking
 *   Scroll:      Bridge volume, dApp usage, transaction count
 *   Linea:       Bridge activity, DEX swaps, NFTs
 *   ```
 *
 * WHAT:
 * -----
 * WHAT the aggregator tracks:
 *
 * | Data Type | Description | Example |
 * |-----------|-------------|---------|
 * | Raw Points | Protocol-assigned points | 1,250 ZK points |
 * | Estimated Points | Calculated from activity | ~500 based on volume |
 * | Multipliers | Bonus factors | 1.5x early user |
 * | Tiers | Eligibility levels | Gold tier |
 * | Snapshots | Historical point values | Weekly snapshots |
 *
 * WHAT sources we aggregate from:
 *
 * | Source | Method | Reliability |
 * |--------|--------|-------------|
 * | Protocol APIs | Direct query | High (when available) |
 * | On-chain data | Transaction analysis | High |
 * | Dune Analytics | SQL queries | Medium |
 * | DeBank/Zapper | Portfolio APIs | Medium |
 * | Manual entry | User input | Low |
 *
 * WHAT calculations we perform:
 *
 * - Point estimation from activity patterns
 * - Multiplier application (early user, volume tiers)
 * - Cross-wallet aggregation
 * - Historical trend analysis
 * - Percentile ranking estimation
 *
 * WHEN:
 * -----
 * WHEN to fetch points:
 *
 * | Trigger | Frequency | Reason |
 * |---------|-----------|--------|
 * | Scheduled | Every 6 hours | Regular updates |
 * | Post-activity | After each action | Real-time tracking |
 * | On-demand | User request | Manual refresh |
 * | Pre-snapshot | Before known dates | Ensure accuracy |
 *
 * WHEN points data becomes stale:
 *
 * ```
 * Fresh:  < 1 hour old    → Use directly
 * Stale:  1-6 hours       → Use with warning
 * Old:    6-24 hours      → Refresh recommended
 * Expired: > 24 hours     → Must refresh
 * ```
 *
 * WHERE:
 * ------
 * WHERE points data is stored:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    POINTS DATA ARCHITECTURE                      │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                  │
 * │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
 * │  │   Protocol   │   │   On-Chain   │   │   External   │        │
 * │  │   APIs       │   │   Data       │   │   Oracles    │        │
 * │  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
 * │         │                  │                   │                 │
 * │         └──────────────────┼───────────────────┘                 │
 * │                            ▼                                     │
 * │                   ┌──────────────────┐                          │
 * │                   │  AGGREGATOR      │                          │
 * │                   │                  │                          │
 * │                   │  - Normalize     │                          │
 * │                   │  - Calculate     │                          │
 * │                   │  - Store         │                          │
 * │                   └────────┬─────────┘                          │
 * │                            │                                     │
 * │                            ▼                                     │
 * │                   ┌──────────────────┐                          │
 * │                   │  POINTS STORE    │                          │
 * │                   │                  │                          │
 * │                   │  Per-wallet      │                          │
 * │                   │  Per-protocol    │                          │
 * │                   │  Historical      │                          │
 * │                   └──────────────────┘                          │
 * │                                                                  │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * WHY:
 * ----
 * WHY points tracking matters:
 *
 * 1. OPTIMIZE ACTIVITY:
 *    - Know which actions give most points
 *    - Avoid wasting gas on low-value activities
 *    - Prioritize protocols with best ROI
 *
 * 2. PREDICT ELIGIBILITY:
 *    - Estimate airdrop allocation
 *    - Compare against known thresholds
 *    - Avoid missing eligibility cutoffs
 *
 * 3. PORTFOLIO MANAGEMENT:
 *    - Track total expected value
 *    - Balance across protocols
 *    - Identify underperforming wallets
 *
 * 4. HISTORICAL ANALYSIS:
 *    - Learn from past airdrops
 *    - Identify successful patterns
 *    - Refine strategy over time
 *
 * WHY estimation is necessary:
 *
 * - Most protocols don't expose points publicly
 * - Points calculations are often undisclosed
 * - Early tracking enables better planning
 * - Even estimates guide activity decisions
 *
 * HOW:
 * ----
 * HOW points are aggregated:
 *
 * 1. FETCH FROM SOURCES:
 *    ```javascript
 *    // Try protocol API first
 *    let points = await protocol.getPoints(wallet);
 *
 *    // Fall back to calculation
 *    if (!points) {
 *      const activity = await getOnChainActivity(wallet);
 *      points = calculateEstimatedPoints(activity);
 *    }
 *    ```
 *
 * 2. NORMALIZE DATA:
 *    ```javascript
 *    const normalized = {
 *      protocol: 'zksync',
 *      wallet: wallet,
 *      points: {
 *        raw: 1250,
 *        estimated: false,
 *        confidence: 0.95,
 *      },
 *      multipliers: [
 *        { type: 'early_user', value: 1.2 },
 *        { type: 'volume_tier', value: 1.5 },
 *      ],
 *      effectivePoints: 1250 * 1.2 * 1.5,
 *      timestamp: Date.now(),
 *    };
 *    ```
 *
 * 3. STORE & INDEX:
 *    ```javascript
 *    // Store by wallet + protocol
 *    store.set(`${wallet}:${protocol}`, normalized);
 *
 *    // Update aggregates
 *    aggregates.total += normalized.effectivePoints;
 *    aggregates.byProtocol[protocol] += normalized.effectivePoints;
 *    ```
 *
 * HOW estimation works:
 *
 * ```javascript
 * function estimatePoints(activity, protocol) {
 *   const weights = PROTOCOL_WEIGHTS[protocol];
 *
 *   let points = 0;
 *   points += activity.transactions * weights.txWeight;
 *   points += activity.volume * weights.volumeWeight;
 *   points += activity.uniqueContracts * weights.contractWeight;
 *   points += activity.bridgeVolume * weights.bridgeWeight;
 *   points += activity.daysActive * weights.timeWeight;
 *
 *   return points;
 * }
 * ```
 *
 * =============================================================================
 */

const EventEmitter = require('events');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Supported protocols with points systems
 */
const PROTOCOLS = {
  LAYERZERO: {
    id: 'layerzero',
    name: 'LayerZero',
    hasOfficialPoints: false,
    estimationSupported: true,
    chains: [1, 42161, 10, 137, 43114, 56, 250],
  },
  ZKSYNC: {
    id: 'zksync',
    name: 'zkSync Era',
    hasOfficialPoints: false,
    estimationSupported: true,
    chains: [324],
  },
  EIGENLAYER: {
    id: 'eigenlayer',
    name: 'EigenLayer',
    hasOfficialPoints: true,
    estimationSupported: true,
    chains: [1],
  },
  SCROLL: {
    id: 'scroll',
    name: 'Scroll',
    hasOfficialPoints: false,
    estimationSupported: true,
    chains: [534352],
  },
  LINEA: {
    id: 'linea',
    name: 'Linea',
    hasOfficialPoints: false,
    estimationSupported: true,
    chains: [59144],
  },
  BASE: {
    id: 'base',
    name: 'Base',
    hasOfficialPoints: false,
    estimationSupported: true,
    chains: [8453],
  },
  STARKNET: {
    id: 'starknet',
    name: 'StarkNet',
    hasOfficialPoints: false,
    estimationSupported: true,
    chains: ['starknet'],
  },
};

/**
 * Points estimation weights by protocol
 */
const ESTIMATION_WEIGHTS = {
  layerzero: {
    messagesSent: 10,
    uniqueChains: 50,
    volumeUSD: 0.001,
    daysActive: 5,
    uniqueContracts: 15,
  },
  zksync: {
    transactions: 2,
    volumeUSD: 0.0005,
    uniqueContracts: 20,
    bridgeVolume: 0.001,
    daysActive: 10,
    contractDeployments: 100,
  },
  eigenlayer: {
    stakedETH: 100,
    stakeDurationDays: 2,
    restakingEnabled: 500,
  },
  scroll: {
    transactions: 3,
    bridgeVolume: 0.001,
    dexVolume: 0.0005,
    daysActive: 8,
    uniqueContracts: 15,
  },
  linea: {
    transactions: 2.5,
    bridgeVolume: 0.001,
    dexVolume: 0.0005,
    nftMints: 5,
    daysActive: 7,
  },
  base: {
    transactions: 2,
    volumeUSD: 0.0005,
    uniqueContracts: 10,
    daysActive: 5,
  },
  starknet: {
    transactions: 3,
    volumeUSD: 0.001,
    uniqueContracts: 25,
    daysActive: 10,
  },
};

/**
 * Multiplier types
 */
const MULTIPLIER_TYPES = {
  EARLY_USER: 'early_user',
  VOLUME_TIER: 'volume_tier',
  LOYALTY: 'loyalty',
  TESTNET: 'testnet',
  REFERRAL: 'referral',
  NFT_HOLDER: 'nft_holder',
  GOVERNANCE: 'governance',
};

/**
 * Points data freshness
 */
const FRESHNESS = {
  FRESH: 60 * 60 * 1000,        // 1 hour
  STALE: 6 * 60 * 60 * 1000,    // 6 hours
  OLD: 24 * 60 * 60 * 1000,     // 24 hours
};

/**
 * Data source reliability
 */
const SOURCE_RELIABILITY = {
  PROTOCOL_API: { weight: 1.0, name: 'Protocol API' },
  ON_CHAIN: { weight: 0.9, name: 'On-Chain Analysis' },
  DUNE: { weight: 0.8, name: 'Dune Analytics' },
  DEBANK: { weight: 0.7, name: 'DeBank API' },
  ESTIMATION: { weight: 0.5, name: 'Estimation' },
  MANUAL: { weight: 0.3, name: 'Manual Entry' },
};

// =============================================================================
// POINTS RECORD CLASS
// =============================================================================

/**
 * Represents a points record for a wallet/protocol
 */
class PointsRecord {
  constructor(data) {
    this.id = data.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.walletAddress = data.walletAddress?.toLowerCase();
    this.protocol = data.protocol;

    // Points data
    this.rawPoints = data.rawPoints || 0;
    this.isEstimated = data.isEstimated ?? true;
    this.confidence = data.confidence || 0.5;
    this.source = data.source || SOURCE_RELIABILITY.ESTIMATION;

    // Multipliers
    this.multipliers = data.multipliers || [];

    // Calculated
    this.effectivePoints = this.calculateEffectivePoints();

    // Activity metrics used for estimation
    this.metrics = data.metrics || {};

    // Timestamps
    this.timestamp = data.timestamp || Date.now();
    this.activityPeriod = data.activityPeriod || {
      start: null,
      end: null,
    };

    // Tier/rank info
    this.tier = data.tier || null;
    this.estimatedRank = data.estimatedRank || null;
    this.estimatedPercentile = data.estimatedPercentile || null;
  }

  /**
   * Calculate effective points with multipliers
   */
  calculateEffectivePoints() {
    let multiplier = 1;
    for (const m of this.multipliers) {
      multiplier *= m.value;
    }
    return Math.round(this.rawPoints * multiplier);
  }

  /**
   * Add a multiplier
   */
  addMultiplier(type, value, reason = '') {
    this.multipliers.push({ type, value, reason, addedAt: Date.now() });
    this.effectivePoints = this.calculateEffectivePoints();
  }

  /**
   * Check if data is fresh
   */
  getFreshness() {
    const age = Date.now() - this.timestamp;

    if (age < FRESHNESS.FRESH) return 'fresh';
    if (age < FRESHNESS.STALE) return 'stale';
    if (age < FRESHNESS.OLD) return 'old';
    return 'expired';
  }

  /**
   * Check if refresh is needed
   */
  needsRefresh() {
    return this.getFreshness() !== 'fresh';
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      walletAddress: this.walletAddress,
      protocol: this.protocol,
      rawPoints: this.rawPoints,
      effectivePoints: this.effectivePoints,
      isEstimated: this.isEstimated,
      confidence: this.confidence,
      source: this.source.name,
      multipliers: this.multipliers,
      metrics: this.metrics,
      tier: this.tier,
      estimatedPercentile: this.estimatedPercentile,
      freshness: this.getFreshness(),
      timestamp: this.timestamp,
    };
  }
}

// =============================================================================
// POINTS AGGREGATOR CLASS
// =============================================================================

/**
 * Main points aggregation system
 */
class PointsAggregator extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      autoRefresh: config.autoRefresh ?? true,
      refreshInterval: config.refreshInterval || 6 * 60 * 60 * 1000, // 6 hours
      ...config,
    };

    // Points storage: wallet -> protocol -> PointsRecord
    this.pointsStore = new Map();

    // Snapshots for historical tracking
    this.snapshots = new Map(); // wallet -> Array<snapshot>

    // Protocol adapters for fetching
    this.adapters = new Map();

    // Statistics
    this.stats = {
      totalFetches: 0,
      successfulFetches: 0,
      estimations: 0,
      lastRefresh: null,
    };

    // Auto-refresh timer
    this.refreshTimer = null;

    // Register default adapters
    this.registerDefaultAdapters();
  }

  // ===========================================================================
  // ADAPTER MANAGEMENT
  // ===========================================================================

  /**
   * Register a protocol adapter
   */
  registerAdapter(protocolId, adapter) {
    this.adapters.set(protocolId, adapter);
    this.emit('adapterRegistered', { protocolId });
  }

  /**
   * Register default adapters (estimation-based)
   */
  registerDefaultAdapters() {
    for (const [, protocol] of Object.entries(PROTOCOLS)) {
      if (protocol.estimationSupported) {
        this.adapters.set(protocol.id, this.createEstimationAdapter(protocol.id));
      }
    }
  }

  /**
   * Create an estimation-based adapter
   */
  createEstimationAdapter(protocolId) {
    const weights = ESTIMATION_WEIGHTS[protocolId];

    return {
      protocolId,
      type: 'estimation',

      async fetchPoints(wallet, activityData) {
        if (!activityData) {
          return null;
        }

        let points = 0;
        const metrics = {};

        // Apply weights to activity metrics
        for (const [metric, weight] of Object.entries(weights)) {
          const value = activityData[metric] || 0;
          const contribution = value * weight;
          points += contribution;
          metrics[metric] = { value, weight, contribution };
        }

        return {
          rawPoints: Math.round(points),
          isEstimated: true,
          confidence: 0.5,
          source: SOURCE_RELIABILITY.ESTIMATION,
          metrics,
        };
      },
    };
  }

  // ===========================================================================
  // POINTS FETCHING
  // ===========================================================================

  /**
   * Fetch points for a wallet/protocol
   */
  async fetchPoints(walletAddress, protocolId, activityData = null) {
    const normalized = walletAddress.toLowerCase();

    this.stats.totalFetches++;

    const adapter = this.adapters.get(protocolId);
    if (!adapter) {
      throw new Error(`No adapter for protocol: ${protocolId}`);
    }

    try {
      const result = await adapter.fetchPoints(normalized, activityData);

      if (!result) {
        this.config.logger.warn?.(`No points data for ${normalized} on ${protocolId}`);
        return null;
      }

      // Create points record
      const record = new PointsRecord({
        walletAddress: normalized,
        protocol: protocolId,
        ...result,
      });

      // Store the record
      this.storePoints(record);

      this.stats.successfulFetches++;
      if (result.isEstimated) {
        this.stats.estimations++;
      }

      this.emit('pointsFetched', record.toJSON());

      return record;

    } catch (error) {
      this.config.logger.error?.(`Failed to fetch points: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch points for all protocols for a wallet
   */
  async fetchAllPoints(walletAddress, activityDataByProtocol = {}) {
    const results = {};

    for (const [protocolId] of this.adapters) {
      try {
        const activityData = activityDataByProtocol[protocolId] || null;
        const record = await this.fetchPoints(walletAddress, protocolId, activityData);
        if (record) {
          results[protocolId] = record;
        }
      } catch (error) {
        this.config.logger.warn?.(`Failed to fetch ${protocolId} points: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Refresh points for a wallet
   */
  async refreshPoints(walletAddress, protocolId = null, activityData = null) {
    if (protocolId) {
      return this.fetchPoints(walletAddress, protocolId, activityData);
    }
    return this.fetchAllPoints(walletAddress, activityData || {});
  }

  // ===========================================================================
  // POINTS STORAGE
  // ===========================================================================

  /**
   * Store points record
   */
  storePoints(record) {
    const key = `${record.walletAddress}:${record.protocol}`;

    // Get existing record for comparison
    const existing = this.getWalletProtocolPoints(record.walletAddress, record.protocol);

    // Store new record
    if (!this.pointsStore.has(record.walletAddress)) {
      this.pointsStore.set(record.walletAddress, new Map());
    }
    this.pointsStore.get(record.walletAddress).set(record.protocol, record);

    // Check for significant change
    if (existing && Math.abs(record.effectivePoints - existing.effectivePoints) > 100) {
      this.emit('significantChange', {
        wallet: record.walletAddress,
        protocol: record.protocol,
        oldPoints: existing.effectivePoints,
        newPoints: record.effectivePoints,
        change: record.effectivePoints - existing.effectivePoints,
      });
    }
  }

  /**
   * Get points for a wallet/protocol
   */
  getWalletProtocolPoints(walletAddress, protocolId) {
    const normalized = walletAddress.toLowerCase();
    const walletStore = this.pointsStore.get(normalized);

    if (!walletStore) return null;
    return walletStore.get(protocolId) || null;
  }

  /**
   * Get all points for a wallet
   */
  getWalletPoints(walletAddress) {
    const normalized = walletAddress.toLowerCase();
    const walletStore = this.pointsStore.get(normalized);

    if (!walletStore) return {};

    const result = {};
    for (const [protocol, record] of walletStore) {
      result[protocol] = record;
    }
    return result;
  }

  /**
   * Get total points for a wallet
   */
  getWalletTotalPoints(walletAddress) {
    const points = this.getWalletPoints(walletAddress);

    let total = 0;
    let totalRaw = 0;
    const breakdown = {};

    for (const [protocol, record] of Object.entries(points)) {
      total += record.effectivePoints;
      totalRaw += record.rawPoints;
      breakdown[protocol] = {
        raw: record.rawPoints,
        effective: record.effectivePoints,
        multipliers: record.multipliers.length,
      };
    }

    return {
      total,
      totalRaw,
      breakdown,
      protocolCount: Object.keys(points).length,
    };
  }

  // ===========================================================================
  // MULTIPLIERS
  // ===========================================================================

  /**
   * Add multiplier to a wallet/protocol
   */
  addMultiplier(walletAddress, protocolId, type, value, reason = '') {
    const record = this.getWalletProtocolPoints(walletAddress, protocolId);

    if (!record) {
      throw new Error(`No points record for ${walletAddress} on ${protocolId}`);
    }

    record.addMultiplier(type, value, reason);
    this.emit('multiplierAdded', {
      wallet: walletAddress,
      protocol: protocolId,
      type,
      value,
    });

    return record;
  }

  /**
   * Detect and apply multipliers based on activity
   */
  detectMultipliers(walletAddress, protocolId, activityData) {
    const record = this.getWalletProtocolPoints(walletAddress, protocolId);
    if (!record) return [];

    const detected = [];

    // Early user multiplier
    if (activityData.firstActivityDate) {
      const daysSinceFirst = (Date.now() - activityData.firstActivityDate) / (24 * 60 * 60 * 1000);
      if (daysSinceFirst > 180) {
        detected.push({
          type: MULTIPLIER_TYPES.EARLY_USER,
          value: 1.5,
          reason: 'Active for 6+ months',
        });
      } else if (daysSinceFirst > 90) {
        detected.push({
          type: MULTIPLIER_TYPES.EARLY_USER,
          value: 1.2,
          reason: 'Active for 3+ months',
        });
      }
    }

    // Volume tier multiplier
    if (activityData.totalVolumeUSD) {
      if (activityData.totalVolumeUSD > 100000) {
        detected.push({
          type: MULTIPLIER_TYPES.VOLUME_TIER,
          value: 2.0,
          reason: 'Volume > $100k',
        });
      } else if (activityData.totalVolumeUSD > 10000) {
        detected.push({
          type: MULTIPLIER_TYPES.VOLUME_TIER,
          value: 1.5,
          reason: 'Volume > $10k',
        });
      }
    }

    // Governance multiplier
    if (activityData.governanceVotes > 0) {
      detected.push({
        type: MULTIPLIER_TYPES.GOVERNANCE,
        value: 1.3,
        reason: `${activityData.governanceVotes} governance votes`,
      });
    }

    // Apply detected multipliers
    for (const m of detected) {
      // Check if already applied
      const existing = record.multipliers.find(x => x.type === m.type);
      if (!existing) {
        record.addMultiplier(m.type, m.value, m.reason);
      }
    }

    return detected;
  }

  // ===========================================================================
  // SNAPSHOTS
  // ===========================================================================

  /**
   * Take a snapshot of current points
   */
  takeSnapshot(walletAddress, reason = 'manual') {
    const normalized = walletAddress.toLowerCase();
    const points = this.getWalletPoints(normalized);

    const snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      reason,
      totalPoints: this.getWalletTotalPoints(normalized).total,
      byProtocol: {},
    };

    for (const [protocol, record] of Object.entries(points)) {
      snapshot.byProtocol[protocol] = {
        rawPoints: record.rawPoints,
        effectivePoints: record.effectivePoints,
        multipliers: record.multipliers.length,
      };
    }

    // Store snapshot
    if (!this.snapshots.has(normalized)) {
      this.snapshots.set(normalized, []);
    }
    this.snapshots.get(normalized).push(snapshot);

    this.emit('snapshotTaken', { wallet: normalized, snapshot });

    return snapshot;
  }

  /**
   * Get snapshots for a wallet
   */
  getSnapshots(walletAddress, limit = 10) {
    const normalized = walletAddress.toLowerCase();
    const snapshots = this.snapshots.get(normalized) || [];

    return snapshots
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get points trend for a wallet
   */
  getPointsTrend(walletAddress, protocolId = null) {
    const snapshots = this.getSnapshots(walletAddress, 30);

    if (snapshots.length < 2) {
      return { trend: 'insufficient_data', data: [] };
    }

    const data = snapshots.map(s => ({
      timestamp: s.timestamp,
      total: s.totalPoints,
      protocol: protocolId ? s.byProtocol[protocolId]?.effectivePoints : null,
    })).reverse();

    // Calculate trend
    const first = data[0].total;
    const last = data[data.length - 1].total;
    const change = last - first;
    const percentChange = first > 0 ? (change / first) * 100 : 0;

    return {
      trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
      change,
      percentChange,
      data,
    };
  }

  // ===========================================================================
  // AGGREGATION
  // ===========================================================================

  /**
   * Get aggregate points across multiple wallets
   */
  getAggregatePoints(walletAddresses) {
    const aggregate = {
      totalPoints: 0,
      totalRaw: 0,
      byProtocol: {},
      byWallet: {},
      walletCount: walletAddresses.length,
    };

    for (const wallet of walletAddresses) {
      const walletTotal = this.getWalletTotalPoints(wallet);

      aggregate.totalPoints += walletTotal.total;
      aggregate.totalRaw += walletTotal.totalRaw;
      aggregate.byWallet[wallet.toLowerCase()] = walletTotal;

      for (const [protocol, data] of Object.entries(walletTotal.breakdown)) {
        if (!aggregate.byProtocol[protocol]) {
          aggregate.byProtocol[protocol] = { raw: 0, effective: 0 };
        }
        aggregate.byProtocol[protocol].raw += data.raw;
        aggregate.byProtocol[protocol].effective += data.effective;
      }
    }

    return aggregate;
  }

  /**
   * Get leaderboard across wallets
   */
  getLeaderboard(walletAddresses, protocolId = null) {
    const entries = walletAddresses.map(wallet => {
      const points = protocolId
        ? this.getWalletProtocolPoints(wallet, protocolId)?.effectivePoints || 0
        : this.getWalletTotalPoints(wallet).total;

      return { wallet: wallet.toLowerCase(), points };
    });

    return entries
      .sort((a, b) => b.points - a.points)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  // ===========================================================================
  // ESTIMATION
  // ===========================================================================

  /**
   * Estimate points from activity data
   */
  estimatePoints(protocolId, activityData) {
    const weights = ESTIMATION_WEIGHTS[protocolId];
    if (!weights) {
      throw new Error(`No estimation weights for protocol: ${protocolId}`);
    }

    let points = 0;
    const breakdown = {};

    for (const [metric, weight] of Object.entries(weights)) {
      const value = activityData[metric] || 0;
      const contribution = value * weight;
      points += contribution;
      breakdown[metric] = { value, weight, contribution };
    }

    return {
      estimatedPoints: Math.round(points),
      breakdown,
      confidence: this.calculateConfidence(activityData, weights),
    };
  }

  /**
   * Calculate confidence score for estimation
   */
  calculateConfidence(activityData, weights) {
    // Higher confidence if more metrics are available
    const availableMetrics = Object.keys(weights).filter(k => activityData[k] !== undefined);
    const totalMetrics = Object.keys(weights).length;

    const metricCoverage = availableMetrics.length / totalMetrics;

    // Adjust for data quality indicators
    let qualityFactor = 1.0;
    if (activityData.isVerified) qualityFactor *= 1.2;
    if (activityData.dataSource === 'on_chain') qualityFactor *= 1.1;

    return Math.min(metricCoverage * qualityFactor, 1.0);
  }

  /**
   * Estimate percentile ranking
   */
  estimatePercentile(protocolId, points, benchmarkData = null) {
    // Use benchmark data if available, otherwise use defaults
    const benchmarks = benchmarkData || this.getDefaultBenchmarks(protocolId);

    // Find percentile
    for (const [percentile, threshold] of Object.entries(benchmarks).sort((a, b) => b[1] - a[1])) {
      if (points >= threshold) {
        return parseInt(percentile);
      }
    }

    return 1; // Bottom percentile
  }

  /**
   * Get default benchmark data for percentile estimation
   */
  getDefaultBenchmarks(protocolId) {
    // These are rough estimates based on historical data
    const defaults = {
      layerzero: { 99: 10000, 95: 5000, 90: 2500, 75: 1000, 50: 500, 25: 200 },
      zksync: { 99: 15000, 95: 8000, 90: 4000, 75: 2000, 50: 800, 25: 300 },
      eigenlayer: { 99: 50000, 95: 20000, 90: 10000, 75: 5000, 50: 2000, 25: 500 },
      scroll: { 99: 8000, 95: 4000, 90: 2000, 75: 1000, 50: 400, 25: 150 },
      linea: { 99: 6000, 95: 3000, 90: 1500, 75: 750, 50: 300, 25: 100 },
      base: { 99: 5000, 95: 2500, 90: 1200, 75: 600, 50: 250, 25: 80 },
    };

    return defaults[protocolId] || { 99: 10000, 95: 5000, 90: 2500, 75: 1000, 50: 500, 25: 200 };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Start auto-refresh
   */
  startAutoRefresh() {
    if (this.refreshTimer) return;

    this.refreshTimer = setInterval(() => {
      this.emit('autoRefreshTriggered');
    }, this.config.refreshInterval);

    this.config.logger.info?.('Points aggregator auto-refresh started');
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    let totalWallets = 0;
    let totalRecords = 0;

    for (const [, walletStore] of this.pointsStore) {
      totalWallets++;
      totalRecords += walletStore.size;
    }

    return {
      ...this.stats,
      totalWallets,
      totalRecords,
      adaptersRegistered: this.adapters.size,
      snapshotsStored: Array.from(this.snapshots.values()).reduce((sum, s) => sum + s.length, 0),
    };
  }

  /**
   * Generate report for a wallet
   */
  generateReport(walletAddress) {
    const normalized = walletAddress.toLowerCase();
    const points = this.getWalletPoints(normalized);
    const total = this.getWalletTotalPoints(normalized);
    const trend = this.getPointsTrend(normalized);
    const snapshots = this.getSnapshots(normalized, 5);

    const protocolDetails = {};
    for (const [protocol, record] of Object.entries(points)) {
      protocolDetails[protocol] = {
        ...record.toJSON(),
        percentile: this.estimatePercentile(protocol, record.effectivePoints),
      };
    }

    return {
      wallet: normalized,
      generatedAt: Date.now(),
      summary: {
        totalPoints: total.total,
        totalRaw: total.totalRaw,
        protocolCount: total.protocolCount,
        averageConfidence: Object.values(points).reduce((sum, r) => sum + r.confidence, 0) / Object.keys(points).length || 0,
      },
      protocols: protocolDetails,
      trend,
      recentSnapshots: snapshots,
    };
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  PointsAggregator,
  PointsRecord,
  PROTOCOLS,
  ESTIMATION_WEIGHTS,
  MULTIPLIER_TYPES,
  FRESHNESS,
  SOURCE_RELIABILITY,

  // Factory
  createPointsAggregator: (config = {}) => new PointsAggregator(config),
};
