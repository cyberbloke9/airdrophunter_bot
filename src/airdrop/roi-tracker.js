'use strict';

/**
 * ROI Tracker Module - Sprint 3.2: Points & Eligibility Tracking
 *
 * =============================================================================
 * 6 W's DOCUMENTATION
 * =============================================================================
 *
 * WHO:
 * ----
 * - Primary Users: Wallet owners tracking airdrop farming profitability
 * - Secondary Users: Portfolio managers optimizing multi-wallet strategies
 * - System Components: Scheduler, ClaimAutomation, PointsAggregator
 * - Stakeholders: Anyone wanting to understand airdrop farming economics
 *
 * WHAT:
 * -----
 * This module provides comprehensive ROI (Return on Investment) tracking for
 * airdrop farming activities. It calculates and monitors:
 *
 * 1. GAS COSTS: Track all gas spent on farming activities per wallet/protocol
 * 2. ESTIMATED VALUE: Project potential airdrop value based on points/activity
 * 3. REALIZED VALUE: Track actual claimed airdrop values
 * 4. NET ROI: Calculate profit/loss including all costs
 * 5. PERFORMANCE METRICS: Compare wallet/protocol performance
 * 6. HISTORICAL ANALYSIS: Track ROI trends over time
 *
 * Key Features:
 * - Multi-chain gas tracking with USD conversion
 * - Token price integration for value calculations
 * - Protocol-specific ROI benchmarking
 * - Break-even analysis and projections
 * - Risk-adjusted return calculations
 *
 * WHEN:
 * -----
 * - On Every Transaction: Record gas costs immediately
 * - On Points Update: Recalculate estimated values
 * - On Claim: Record realized value and finalize ROI
 * - Daily: Generate summary reports and projections
 * - On Demand: Generate detailed ROI analysis
 *
 * Usage Timeline:
 * 1. Initialize tracker with wallet addresses
 * 2. Record costs as transactions occur
 * 3. Update estimated values as points accumulate
 * 4. Record actual values when airdrops are claimed
 * 5. Generate reports for analysis and optimization
 *
 * WHERE:
 * ------
 * - Data Sources:
 *   - On-chain transaction receipts (gas costs)
 *   - Price feeds (CoinGecko, Chainlink)
 *   - PointsAggregator (estimated points)
 *   - ClaimAutomation (realized values)
 *
 * - Data Storage:
 *   - In-memory for active tracking
 *   - JSON export for persistence
 *   - Database integration optional
 *
 * - Integration Points:
 *   - Scheduler (cost recording hooks)
 *   - ClaimAutomation (value recording)
 *   - PointsAggregator (estimation data)
 *
 * WHY:
 * ----
 * Problems Solved:
 * 1. VISIBILITY: Farming without tracking leads to unknown profitability
 * 2. OPTIMIZATION: Can't optimize what you don't measure
 * 3. RISK MANAGEMENT: Understand when farming becomes unprofitable
 * 4. COMPARISON: Evaluate which protocols/strategies perform best
 * 5. TAX REPORTING: Track cost basis and realized gains
 *
 * Business Value:
 * - Maximize airdrop farming profitability
 * - Cut losses on unprofitable farming early
 * - Allocate resources to highest-performing strategies
 * - Provide clear financial reporting
 *
 * HOW:
 * ----
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                       ROI TRACKER                               │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
 * │  │ Cost Tracker │  │ Value Tracker│  │   Reporter   │          │
 * │  │              │  │              │  │              │          │
 * │  │ - Gas costs  │  │ - Estimated  │  │ - Summaries  │          │
 * │  │ - Fees       │  │ - Realized   │  │ - Trends     │          │
 * │  │ - USD convert│  │ - Projected  │  │ - Benchmarks │          │
 * │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
 * │         │                 │                 │                   │
 * │         └─────────────────┼─────────────────┘                   │
 * │                           │                                     │
 * │                    ┌──────▼──────┐                              │
 * │                    │ ROI Engine  │                              │
 * │                    │             │                              │
 * │                    │ - Net ROI   │                              │
 * │                    │ - Per-wallet│                              │
 * │                    │ - Per-proto │                              │
 * │                    └─────────────┘                              │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ROI Calculation:
 * ```
 * Net ROI = (Realized Value + Estimated Unrealized) - Total Costs
 *
 * Total Costs = Gas Costs (USD) + Protocol Fees + Opportunity Cost
 *
 * ROI Percentage = (Net ROI / Total Costs) * 100
 *
 * Risk-Adjusted ROI = Net ROI * Confidence Factor
 * ```
 *
 * Usage Examples:
 * ```javascript
 * const { createROITracker } = require('./roi-tracker');
 *
 * // Initialize tracker
 * const tracker = createROITracker({
 *   priceProvider: myPriceProvider,
 *   logger: console,
 * });
 *
 * // Record gas cost
 * tracker.recordCost({
 *   wallet: '0x123...',
 *   protocol: 'layerzero',
 *   chain: 1,
 *   txHash: '0xabc...',
 *   gasUsed: 150000,
 *   gasPrice: 30e9,
 *   type: 'swap',
 * });
 *
 * // Update estimated value
 * tracker.updateEstimatedValue({
 *   wallet: '0x123...',
 *   protocol: 'layerzero',
 *   estimatedTokens: 1500,
 *   tokenPriceUSD: 2.50,
 *   confidence: 0.7,
 * });
 *
 * // Record realized value after claim
 * tracker.recordRealizedValue({
 *   wallet: '0x123...',
 *   protocol: 'layerzero',
 *   tokensReceived: 1200,
 *   tokenPriceUSD: 3.00,
 *   claimTxHash: '0xdef...',
 * });
 *
 * // Get ROI report
 * const report = tracker.getROIReport('0x123...');
 * console.log(report);
 * // {
 * //   wallet: '0x123...',
 * //   totalCostsUSD: 450.00,
 * //   realizedValueUSD: 3600.00,
 * //   estimatedUnrealizedUSD: 0,
 * //   netROI: 3150.00,
 * //   roiPercentage: 700,
 * //   breakdown: { layerzero: { ... } }
 * // }
 * ```
 *
 * =============================================================================
 * IMPLEMENTATION
 * =============================================================================
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Cost entry types
 */
const COST_TYPE = {
  GAS: 'gas',
  PROTOCOL_FEE: 'protocol_fee',
  BRIDGE_FEE: 'bridge_fee',
  SLIPPAGE: 'slippage',
  OTHER: 'other',
};

/**
 * Value entry types
 */
const VALUE_TYPE = {
  ESTIMATED: 'estimated',
  REALIZED: 'realized',
  VESTING: 'vesting',
};

/**
 * Report time periods
 */
const REPORT_PERIOD = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  ALL_TIME: 'all_time',
};

/**
 * Chain native token info for gas cost conversion
 */
const CHAIN_NATIVE_TOKENS = {
  1: { symbol: 'ETH', decimals: 18, coingeckoId: 'ethereum' },
  42161: { symbol: 'ETH', decimals: 18, coingeckoId: 'ethereum' },
  10: { symbol: 'ETH', decimals: 18, coingeckoId: 'ethereum' },
  324: { symbol: 'ETH', decimals: 18, coingeckoId: 'ethereum' },
  8453: { symbol: 'ETH', decimals: 18, coingeckoId: 'ethereum' },
  59144: { symbol: 'ETH', decimals: 18, coingeckoId: 'ethereum' },
  534352: { symbol: 'ETH', decimals: 18, coingeckoId: 'ethereum' },
  137: { symbol: 'MATIC', decimals: 18, coingeckoId: 'matic-network' },
  56: { symbol: 'BNB', decimals: 18, coingeckoId: 'binancecoin' },
  43114: { symbol: 'AVAX', decimals: 18, coingeckoId: 'avalanche-2' },
  250: { symbol: 'FTM', decimals: 18, coingeckoId: 'fantom' },
};

/**
 * Default price cache TTL (5 minutes)
 */
const PRICE_CACHE_TTL = 5 * 60 * 1000;

/**
 * Confidence levels for estimated values
 */
const CONFIDENCE_LEVELS = {
  HIGH: { min: 0.8, label: 'High', multiplier: 0.9 },
  MEDIUM: { min: 0.5, label: 'Medium', multiplier: 0.7 },
  LOW: { min: 0.2, label: 'Low', multiplier: 0.5 },
  SPECULATIVE: { min: 0, label: 'Speculative', multiplier: 0.3 },
};

// =============================================================================
// COST RECORD CLASS
// =============================================================================

/**
 * Represents a single cost entry
 */
class CostRecord {
  constructor({
    id,
    wallet,
    protocol,
    chain,
    type = COST_TYPE.GAS,
    txHash,
    gasUsed,
    gasPrice,
    nativeAmount,
    usdAmount,
    timestamp = Date.now(),
    activityType,
    metadata = {},
  }) {
    this.id = id || `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.wallet = wallet?.toLowerCase();
    this.protocol = protocol;
    this.chain = chain;
    this.type = type;
    this.txHash = txHash;
    this.gasUsed = gasUsed;
    this.gasPrice = gasPrice;
    this.nativeAmount = nativeAmount;
    this.usdAmount = usdAmount;
    this.timestamp = timestamp;
    this.activityType = activityType;
    this.metadata = metadata;
  }

  toJSON() {
    return {
      id: this.id,
      wallet: this.wallet,
      protocol: this.protocol,
      chain: this.chain,
      type: this.type,
      txHash: this.txHash,
      gasUsed: this.gasUsed,
      gasPrice: this.gasPrice,
      nativeAmount: this.nativeAmount,
      usdAmount: this.usdAmount,
      timestamp: this.timestamp,
      activityType: this.activityType,
      metadata: this.metadata,
    };
  }
}

// =============================================================================
// VALUE RECORD CLASS
// =============================================================================

/**
 * Represents a value entry (estimated or realized)
 */
class ValueRecord {
  constructor({
    id,
    wallet,
    protocol,
    type = VALUE_TYPE.ESTIMATED,
    tokenSymbol,
    tokenAmount,
    tokenPriceUSD,
    totalValueUSD,
    confidence = 1.0,
    vestingSchedule,
    claimTxHash,
    timestamp = Date.now(),
    metadata = {},
  }) {
    this.id = id || `value_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.wallet = wallet?.toLowerCase();
    this.protocol = protocol;
    this.type = type;
    this.tokenSymbol = tokenSymbol;
    this.tokenAmount = tokenAmount;
    this.tokenPriceUSD = tokenPriceUSD;
    this.totalValueUSD = totalValueUSD || (tokenAmount * tokenPriceUSD);
    this.confidence = confidence;
    this.vestingSchedule = vestingSchedule;
    this.claimTxHash = claimTxHash;
    this.timestamp = timestamp;
    this.metadata = metadata;
  }

  /**
   * Calculate risk-adjusted value
   */
  getRiskAdjustedValue() {
    if (this.type === VALUE_TYPE.REALIZED) {
      return this.totalValueUSD;
    }
    const confidenceLevel = Object.values(CONFIDENCE_LEVELS).find(
      level => this.confidence >= level.min
    ) || CONFIDENCE_LEVELS.SPECULATIVE;
    return this.totalValueUSD * confidenceLevel.multiplier;
  }

  toJSON() {
    return {
      id: this.id,
      wallet: this.wallet,
      protocol: this.protocol,
      type: this.type,
      tokenSymbol: this.tokenSymbol,
      tokenAmount: this.tokenAmount,
      tokenPriceUSD: this.tokenPriceUSD,
      totalValueUSD: this.totalValueUSD,
      confidence: this.confidence,
      vestingSchedule: this.vestingSchedule,
      claimTxHash: this.claimTxHash,
      timestamp: this.timestamp,
      metadata: this.metadata,
    };
  }
}

// =============================================================================
// ROI TRACKER CLASS
// =============================================================================

/**
 * Main ROI tracking system
 */
class ROITracker {
  constructor(config = {}) {
    this.logger = config.logger || console;
    this.priceProvider = config.priceProvider;

    // Storage
    this.costs = new Map(); // wallet -> CostRecord[]
    this.values = new Map(); // wallet -> ValueRecord[]
    this.priceCache = new Map(); // tokenId -> { price, timestamp }

    // Statistics
    this.statistics = {
      totalCostsRecorded: 0,
      totalValuesRecorded: 0,
      totalWalletsTracked: 0,
      totalProtocolsTracked: new Set(),
      lastUpdated: null,
    };

    this.logger.info?.('[ROITracker] Initialized');
  }

  // ===========================================================================
  // COST TRACKING
  // ===========================================================================

  /**
   * Record a cost entry
   *
   * @param {Object} params - Cost parameters
   * @returns {CostRecord} The created cost record
   */
  async recordCost({
    wallet,
    protocol,
    chain,
    type = COST_TYPE.GAS,
    txHash,
    gasUsed,
    gasPrice,
    nativeAmount,
    activityType,
    metadata = {},
  }) {
    // Calculate native amount if gas params provided
    let calculatedNativeAmount = nativeAmount;
    if (!calculatedNativeAmount && gasUsed && gasPrice) {
      calculatedNativeAmount = (gasUsed * gasPrice) / 1e18;
    }

    // Get USD value
    let usdAmount = 0;
    const chainInfo = CHAIN_NATIVE_TOKENS[chain];
    if (chainInfo && calculatedNativeAmount) {
      const price = await this.getTokenPrice(chainInfo.coingeckoId);
      usdAmount = calculatedNativeAmount * price;
    }

    const record = new CostRecord({
      wallet,
      protocol,
      chain,
      type,
      txHash,
      gasUsed,
      gasPrice,
      nativeAmount: calculatedNativeAmount,
      usdAmount,
      activityType,
      metadata,
    });

    // Store record
    const walletKey = wallet.toLowerCase();
    if (!this.costs.has(walletKey)) {
      this.costs.set(walletKey, []);
    }
    this.costs.get(walletKey).push(record);

    // Update statistics
    this.statistics.totalCostsRecorded++;
    this.statistics.totalProtocolsTracked.add(protocol);
    this.statistics.lastUpdated = Date.now();

    this.logger.debug?.(`[ROITracker] Recorded cost: $${usdAmount.toFixed(2)} for ${protocol}`);

    return record;
  }

  /**
   * Get total costs for a wallet
   *
   * @param {string} wallet - Wallet address
   * @param {Object} filters - Optional filters
   * @returns {Object} Cost summary
   */
  getCosts(wallet, filters = {}) {
    const walletKey = wallet.toLowerCase();
    let records = this.costs.get(walletKey) || [];

    // Apply filters
    if (filters.protocol) {
      records = records.filter(r => r.protocol === filters.protocol);
    }
    if (filters.chain) {
      records = records.filter(r => r.chain === filters.chain);
    }
    if (filters.type) {
      records = records.filter(r => r.type === filters.type);
    }
    if (filters.startTime) {
      records = records.filter(r => r.timestamp >= filters.startTime);
    }
    if (filters.endTime) {
      records = records.filter(r => r.timestamp <= filters.endTime);
    }

    const totalUSD = records.reduce((sum, r) => sum + (r.usdAmount || 0), 0);
    const byProtocol = {};
    const byChain = {};
    const byType = {};

    records.forEach(record => {
      // By protocol
      if (!byProtocol[record.protocol]) {
        byProtocol[record.protocol] = { count: 0, totalUSD: 0 };
      }
      byProtocol[record.protocol].count++;
      byProtocol[record.protocol].totalUSD += record.usdAmount || 0;

      // By chain
      if (!byChain[record.chain]) {
        byChain[record.chain] = { count: 0, totalUSD: 0 };
      }
      byChain[record.chain].count++;
      byChain[record.chain].totalUSD += record.usdAmount || 0;

      // By type
      if (!byType[record.type]) {
        byType[record.type] = { count: 0, totalUSD: 0 };
      }
      byType[record.type].count++;
      byType[record.type].totalUSD += record.usdAmount || 0;
    });

    return {
      wallet,
      totalRecords: records.length,
      totalUSD,
      byProtocol,
      byChain,
      byType,
      records,
    };
  }

  // ===========================================================================
  // VALUE TRACKING
  // ===========================================================================

  /**
   * Update estimated value for a wallet/protocol
   *
   * @param {Object} params - Value parameters
   * @returns {ValueRecord} The created value record
   */
  updateEstimatedValue({
    wallet,
    protocol,
    tokenSymbol,
    estimatedTokens,
    tokenPriceUSD,
    confidence = 0.5,
    metadata = {},
  }) {
    const record = new ValueRecord({
      wallet,
      protocol,
      type: VALUE_TYPE.ESTIMATED,
      tokenSymbol,
      tokenAmount: estimatedTokens,
      tokenPriceUSD,
      confidence,
      metadata,
    });

    const walletKey = wallet.toLowerCase();
    if (!this.values.has(walletKey)) {
      this.values.set(walletKey, []);
    }

    // Remove old estimated value for same protocol
    const existingValues = this.values.get(walletKey);
    const filtered = existingValues.filter(
      v => !(v.protocol === protocol && v.type === VALUE_TYPE.ESTIMATED)
    );
    filtered.push(record);
    this.values.set(walletKey, filtered);

    // Update statistics
    this.statistics.totalValuesRecorded++;
    this.statistics.totalProtocolsTracked.add(protocol);
    this.statistics.lastUpdated = Date.now();

    this.logger.debug?.(
      `[ROITracker] Updated estimated value: ${estimatedTokens} ${tokenSymbol} ($${record.totalValueUSD.toFixed(2)}) for ${protocol}`
    );

    return record;
  }

  /**
   * Record realized value from claim
   *
   * @param {Object} params - Value parameters
   * @returns {ValueRecord} The created value record
   */
  recordRealizedValue({
    wallet,
    protocol,
    tokenSymbol,
    tokensReceived,
    tokenPriceUSD,
    claimTxHash,
    vestingSchedule,
    metadata = {},
  }) {
    const type = vestingSchedule ? VALUE_TYPE.VESTING : VALUE_TYPE.REALIZED;

    const record = new ValueRecord({
      wallet,
      protocol,
      type,
      tokenSymbol,
      tokenAmount: tokensReceived,
      tokenPriceUSD,
      confidence: 1.0, // Realized value is certain
      claimTxHash,
      vestingSchedule,
      metadata,
    });

    const walletKey = wallet.toLowerCase();
    if (!this.values.has(walletKey)) {
      this.values.set(walletKey, []);
    }
    this.values.get(walletKey).push(record);

    // Update statistics
    this.statistics.totalValuesRecorded++;
    this.statistics.lastUpdated = Date.now();

    this.logger.info?.(
      `[ROITracker] Recorded realized value: ${tokensReceived} ${tokenSymbol} ($${record.totalValueUSD.toFixed(2)}) for ${protocol}`
    );

    return record;
  }

  /**
   * Get values for a wallet
   *
   * @param {string} wallet - Wallet address
   * @param {Object} filters - Optional filters
   * @returns {Object} Value summary
   */
  getValues(wallet, filters = {}) {
    const walletKey = wallet.toLowerCase();
    let records = this.values.get(walletKey) || [];

    // Apply filters
    if (filters.protocol) {
      records = records.filter(r => r.protocol === filters.protocol);
    }
    if (filters.type) {
      records = records.filter(r => r.type === filters.type);
    }

    const estimated = records.filter(r => r.type === VALUE_TYPE.ESTIMATED);
    const realized = records.filter(r => r.type === VALUE_TYPE.REALIZED);
    const vesting = records.filter(r => r.type === VALUE_TYPE.VESTING);

    const totalEstimatedUSD = estimated.reduce((sum, r) => sum + r.totalValueUSD, 0);
    const totalRealizedUSD = realized.reduce((sum, r) => sum + r.totalValueUSD, 0);
    const totalVestingUSD = vesting.reduce((sum, r) => sum + r.totalValueUSD, 0);
    const riskAdjustedEstimated = estimated.reduce((sum, r) => sum + r.getRiskAdjustedValue(), 0);

    const byProtocol = {};
    records.forEach(record => {
      if (!byProtocol[record.protocol]) {
        byProtocol[record.protocol] = {
          estimated: 0,
          realized: 0,
          vesting: 0,
          riskAdjusted: 0,
        };
      }
      if (record.type === VALUE_TYPE.ESTIMATED) {
        byProtocol[record.protocol].estimated += record.totalValueUSD;
        byProtocol[record.protocol].riskAdjusted += record.getRiskAdjustedValue();
      } else if (record.type === VALUE_TYPE.REALIZED) {
        byProtocol[record.protocol].realized += record.totalValueUSD;
      } else if (record.type === VALUE_TYPE.VESTING) {
        byProtocol[record.protocol].vesting += record.totalValueUSD;
      }
    });

    return {
      wallet,
      totalRecords: records.length,
      totalEstimatedUSD,
      totalRealizedUSD,
      totalVestingUSD,
      riskAdjustedEstimated,
      totalValueUSD: totalRealizedUSD + totalVestingUSD + totalEstimatedUSD,
      byProtocol,
      records,
    };
  }

  // ===========================================================================
  // ROI CALCULATIONS
  // ===========================================================================

  /**
   * Get comprehensive ROI report for a wallet
   *
   * @param {string} wallet - Wallet address
   * @param {Object} options - Report options
   * @returns {Object} ROI report
   */
  getROIReport(wallet, options = {}) {
    const costs = this.getCosts(wallet, options);
    const values = this.getValues(wallet, options);

    const totalCostsUSD = costs.totalUSD;
    const realizedValueUSD = values.totalRealizedUSD + values.totalVestingUSD;
    const estimatedUnrealizedUSD = values.totalEstimatedUSD;
    const riskAdjustedUnrealized = values.riskAdjustedEstimated;

    // Calculate different ROI metrics
    const realizedROI = realizedValueUSD - totalCostsUSD;
    const realizedROIPercent = totalCostsUSD > 0 ? (realizedROI / totalCostsUSD) * 100 : 0;

    const projectedROI = realizedValueUSD + estimatedUnrealizedUSD - totalCostsUSD;
    const projectedROIPercent = totalCostsUSD > 0 ? (projectedROI / totalCostsUSD) * 100 : 0;

    const riskAdjustedROI = realizedValueUSD + riskAdjustedUnrealized - totalCostsUSD;
    const riskAdjustedROIPercent = totalCostsUSD > 0 ? (riskAdjustedROI / totalCostsUSD) * 100 : 0;

    // Break-even analysis
    const breakEvenTokenPrice = totalCostsUSD > realizedValueUSD
      ? (totalCostsUSD - realizedValueUSD) / (values.records.find(r => r.type === VALUE_TYPE.ESTIMATED)?.tokenAmount || 1)
      : 0;

    // Protocol breakdown
    const protocolBreakdown = {};
    const allProtocols = new Set([
      ...Object.keys(costs.byProtocol),
      ...Object.keys(values.byProtocol),
    ]);

    allProtocols.forEach(protocol => {
      const protoCost = costs.byProtocol[protocol]?.totalUSD || 0;
      const protoRealized = values.byProtocol[protocol]?.realized || 0;
      const protoVesting = values.byProtocol[protocol]?.vesting || 0;
      const protoEstimated = values.byProtocol[protocol]?.estimated || 0;
      const protoRiskAdj = values.byProtocol[protocol]?.riskAdjusted || 0;

      const protoRealizedROI = protoRealized + protoVesting - protoCost;
      const protoProjectedROI = protoRealized + protoVesting + protoEstimated - protoCost;

      protocolBreakdown[protocol] = {
        costs: protoCost,
        realized: protoRealized,
        vesting: protoVesting,
        estimated: protoEstimated,
        riskAdjusted: protoRiskAdj,
        realizedROI: protoRealizedROI,
        projectedROI: protoProjectedROI,
        roiPercent: protoCost > 0 ? (protoProjectedROI / protoCost) * 100 : 0,
      };
    });

    return {
      wallet,
      generatedAt: Date.now(),

      // Costs
      totalCostsUSD,
      costBreakdown: costs.byProtocol,

      // Values
      realizedValueUSD,
      estimatedUnrealizedUSD,
      riskAdjustedUnrealized,

      // ROI Metrics
      realizedROI,
      realizedROIPercent,
      projectedROI,
      projectedROIPercent,
      riskAdjustedROI,
      riskAdjustedROIPercent,

      // Analysis
      breakEvenTokenPrice,
      isProfitable: realizedROI > 0,
      isProjectedProfitable: projectedROI > 0,

      // Breakdown
      protocolBreakdown,

      // Summary
      summary: this.generateSummary({
        totalCostsUSD,
        realizedROI,
        projectedROI,
        riskAdjustedROI,
        protocolBreakdown,
      }),
    };
  }

  /**
   * Generate human-readable summary
   */
  generateSummary({ totalCostsUSD, realizedROI, projectedROI, riskAdjustedROI, protocolBreakdown }) {
    const lines = [];

    lines.push(`Total invested: $${totalCostsUSD.toFixed(2)}`);

    if (realizedROI !== 0) {
      const realizedStatus = realizedROI >= 0 ? 'profit' : 'loss';
      lines.push(`Realized ${realizedStatus}: $${Math.abs(realizedROI).toFixed(2)}`);
    }

    if (projectedROI !== realizedROI) {
      const projectedStatus = projectedROI >= 0 ? 'profit' : 'loss';
      lines.push(`Projected ${projectedStatus}: $${Math.abs(projectedROI).toFixed(2)}`);
    }

    lines.push(`Risk-adjusted: $${riskAdjustedROI.toFixed(2)}`);

    // Best performing protocol
    const protocols = Object.entries(protocolBreakdown);
    if (protocols.length > 0) {
      const best = protocols.sort((a, b) => b[1].roiPercent - a[1].roiPercent)[0];
      lines.push(`Best performing: ${best[0]} (${best[1].roiPercent.toFixed(0)}% ROI)`);
    }

    return lines.join('\n');
  }

  /**
   * Get aggregate report across all wallets
   *
   * @param {Object} options - Report options
   * @returns {Object} Aggregate report
   */
  getAggregateReport(options = {}) {
    const wallets = [...new Set([...this.costs.keys(), ...this.values.keys()])];

    let totalCosts = 0;
    let totalRealized = 0;
    let totalEstimated = 0;
    let totalRiskAdjusted = 0;
    const protocolTotals = {};
    const walletReports = [];

    wallets.forEach(wallet => {
      const report = this.getROIReport(wallet, options);
      walletReports.push(report);

      totalCosts += report.totalCostsUSD;
      totalRealized += report.realizedValueUSD;
      totalEstimated += report.estimatedUnrealizedUSD;
      totalRiskAdjusted += report.riskAdjustedUnrealized;

      Object.entries(report.protocolBreakdown).forEach(([protocol, data]) => {
        if (!protocolTotals[protocol]) {
          protocolTotals[protocol] = { costs: 0, realized: 0, estimated: 0 };
        }
        protocolTotals[protocol].costs += data.costs;
        protocolTotals[protocol].realized += data.realized + data.vesting;
        protocolTotals[protocol].estimated += data.estimated;
      });
    });

    const netROI = totalRealized + totalEstimated - totalCosts;
    const riskAdjustedROI = totalRealized + totalRiskAdjusted - totalCosts;

    return {
      generatedAt: Date.now(),
      walletsTracked: wallets.length,

      totalCostsUSD: totalCosts,
      totalRealizedUSD: totalRealized,
      totalEstimatedUSD: totalEstimated,
      totalRiskAdjustedUSD: totalRiskAdjusted,

      netROI,
      netROIPercent: totalCosts > 0 ? (netROI / totalCosts) * 100 : 0,
      riskAdjustedROI,
      riskAdjustedROIPercent: totalCosts > 0 ? (riskAdjustedROI / totalCosts) * 100 : 0,

      protocolTotals,
      walletReports,
    };
  }

  // ===========================================================================
  // PRICE UTILITIES
  // ===========================================================================

  /**
   * Get token price (with caching)
   *
   * @param {string} tokenId - CoinGecko token ID
   * @returns {Promise<number>} USD price
   */
  async getTokenPrice(tokenId) {
    // Check cache
    const cached = this.priceCache.get(tokenId);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
      return cached.price;
    }

    // Use provider if available
    if (this.priceProvider) {
      try {
        const price = await this.priceProvider.getPrice(tokenId);
        this.priceCache.set(tokenId, { price, timestamp: Date.now() });
        return price;
      } catch (error) {
        this.logger.warn?.(`[ROITracker] Failed to get price for ${tokenId}: ${error.message}`);
      }
    }

    // Return cached value even if stale, or default
    return cached?.price || this.getDefaultPrice(tokenId);
  }

  /**
   * Get default/fallback price for common tokens
   */
  getDefaultPrice(tokenId) {
    const defaults = {
      ethereum: 2000,
      'matic-network': 0.8,
      binancecoin: 300,
      'avalanche-2': 25,
      fantom: 0.4,
    };
    return defaults[tokenId] || 0;
  }

  // ===========================================================================
  // DATA MANAGEMENT
  // ===========================================================================

  /**
   * Export all data for persistence
   *
   * @returns {Object} Serialized data
   */
  exportData() {
    const costsData = {};
    this.costs.forEach((records, wallet) => {
      costsData[wallet] = records.map(r => r.toJSON());
    });

    const valuesData = {};
    this.values.forEach((records, wallet) => {
      valuesData[wallet] = records.map(r => r.toJSON());
    });

    return {
      version: '1.0.0',
      exportedAt: Date.now(),
      costs: costsData,
      values: valuesData,
      statistics: {
        ...this.statistics,
        totalProtocolsTracked: [...this.statistics.totalProtocolsTracked],
      },
    };
  }

  /**
   * Import data from persistence
   *
   * @param {Object} data - Previously exported data
   */
  importData(data) {
    if (!data || data.version !== '1.0.0') {
      throw new Error('Invalid or unsupported data format');
    }

    // Import costs
    Object.entries(data.costs || {}).forEach(([wallet, records]) => {
      this.costs.set(wallet, records.map(r => new CostRecord(r)));
    });

    // Import values
    Object.entries(data.values || {}).forEach(([wallet, records]) => {
      this.values.set(wallet, records.map(r => new ValueRecord(r)));
    });

    // Import statistics
    if (data.statistics) {
      this.statistics = {
        ...data.statistics,
        totalProtocolsTracked: new Set(data.statistics.totalProtocolsTracked || []),
      };
    }

    this.logger.info?.(`[ROITracker] Imported data for ${this.costs.size} wallets`);
  }

  /**
   * Clear all data
   */
  clear() {
    this.costs.clear();
    this.values.clear();
    this.priceCache.clear();
    this.statistics = {
      totalCostsRecorded: 0,
      totalValuesRecorded: 0,
      totalWalletsTracked: 0,
      totalProtocolsTracked: new Set(),
      lastUpdated: null,
    };
    this.logger.info?.('[ROITracker] Cleared all data');
  }

  /**
   * Get tracker statistics
   *
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      totalProtocolsTracked: [...this.statistics.totalProtocolsTracked],
      totalWalletsTracked: Math.max(this.costs.size, this.values.size),
      totalCostRecords: [...this.costs.values()].reduce((sum, arr) => sum + arr.length, 0),
      totalValueRecords: [...this.values.values()].reduce((sum, arr) => sum + arr.length, 0),
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new ROI tracker instance
 *
 * @param {Object} config - Configuration options
 * @returns {ROITracker} ROI tracker instance
 */
function createROITracker(config = {}) {
  return new ROITracker(config);
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Classes
  ROITracker,
  CostRecord,
  ValueRecord,

  // Constants
  COST_TYPE,
  VALUE_TYPE,
  REPORT_PERIOD,
  CHAIN_NATIVE_TOKENS,
  CONFIDENCE_LEVELS,
  PRICE_CACHE_TTL,

  // Factory
  createROITracker,
};
