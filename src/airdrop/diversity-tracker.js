'use strict';

/**
 * Protocol Diversity Tracker
 *
 * Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * THE 6 W's: PROTOCOL DIVERSITY TRACKING
 * =============================================================================
 *
 * WHO:
 * ----
 * WHO cares about diversity:
 *
 * - AIRDROP PROTOCOLS: Use diversity as eligibility signal
 *   - LayerZero: Rewarded users who bridged to MULTIPLE chains
 *   - zkSync: Higher scores for users of multiple dApps
 *   - Arbitrum: Bonus for governance + DeFi + NFT activity
 *
 * - SYBIL HUNTERS: Use LACK of diversity as detection signal
 *   - Single-protocol farmers = likely Sybil
 *   - No NFT activity = possibly bot
 *   - No governance = not real user
 *
 * WHO benefits from tracking:
 * - Users: Know where to diversify
 * - System: Can suggest missing activities
 * - Analytics: Score wallet "realness"
 *
 * WHAT:
 * -----
 * WHAT we track:
 *
 * | Dimension | What It Measures | Why It Matters |
 * |-----------|------------------|----------------|
 * | Protocol Diversity | # unique protocols used | Real users use many dApps |
 * | Chain Diversity | # unique chains used | Cross-chain = real utility |
 * | Action Diversity | Types of activities | Not just swaps |
 * | Category Diversity | DEX, lending, NFT, etc. | Well-rounded user |
 * | Time Diversity | Activity spread over time | Not burst farming |
 * | Amount Diversity | Variety in tx values | Not identical amounts |
 *
 * WHAT metrics we calculate:
 *
 * 1. PROTOCOL COVERAGE:
 *    - % of major protocols used in each category
 *    - Depth (how much) vs Breadth (how many)
 *
 * 2. CHAIN COVERAGE:
 *    - L1 vs L2 distribution
 *    - Bridge usage patterns
 *
 * 3. ACTIVITY PROFILE:
 *    - Action type distribution
 *    - Governance participation
 *    - LP positions held
 *
 * 4. DIVERSITY SCORE:
 *    - Composite score 0-100
 *    - Weighted by airdrop importance
 *
 * WHEN:
 * -----
 * WHEN to check diversity:
 *
 * - BEFORE actions: Suggest underrepresented areas
 * - AFTER actions: Update scores
 * - PERIODICALLY: Generate diversity reports
 * - ON-DEMAND: User requests analysis
 *
 * WHEN diversity matters most:
 * - Pre-snapshot periods (optimize coverage)
 * - New protocol launches (early adopter bonus)
 * - Governance votes (participation signals)
 *
 * WHEN to AVOID low-value activities:
 * - NFT spam minting (negative signal)
 * - Dust transactions (looks like farming)
 * - Same-amount patterns (Sybil indicator)
 *
 * WHERE:
 * ------
 * WHERE we track (chains):
 *
 * | Chain | Category | Priority |
 * |-------|----------|----------|
 * | Ethereum | L1 | HIGH |
 * | Arbitrum | L2 Optimistic | HIGH |
 * | Optimism | L2 Optimistic | HIGH |
 * | Base | L2 Optimistic | HIGH |
 * | zkSync Era | L2 ZK | HIGH |
 * | Scroll | L2 ZK | MEDIUM |
 * | Linea | L2 ZK | MEDIUM |
 * | Polygon | L2 Plasma | MEDIUM |
 * | BSC | Alt L1 | LOW |
 * | Avalanche | Alt L1 | LOW |
 *
 * WHERE we track (protocol categories):
 *
 * | Category | Examples | Weight |
 * |----------|----------|--------|
 * | DEX | Uniswap, SyncSwap, Velodrome | 1.0 |
 * | Lending | Aave, Compound, Radiant | 1.2 |
 * | Bridge | Stargate, Across, Hop | 1.5 |
 * | Perps | GMX, dYdX, Synthetix | 1.2 |
 * | NFT | OpenSea, Blur, Element | 0.8 |
 * | Social | Lens, Farcaster, Mirror | 1.0 |
 * | Gaming | Treasure, Parallel | 0.8 |
 * | Governance | Snapshot, Tally | 1.5 |
 *
 * WHY:
 * ----
 * WHY diversity matters for airdrops:
 *
 * 1. REAL USERS ARE DIVERSE:
 *    ```
 *    Real User: Uses Uniswap, Aave, OpenSea, votes, bridges
 *    Farmer:    Only swaps on one DEX repeatedly
 *    ```
 *
 * 2. PROTOCOLS REWARD ECOSYSTEM USERS:
 *    - Want users who contribute broadly
 *    - Not single-protocol mercenaries
 *    - Governance participation = aligned interests
 *
 * 3. SYBIL DETECTION USES SIMILARITY:
 *    ```
 *    100 wallets all using ONLY SyncSwap = suspicious
 *    100 wallets with different protocol mixes = organic
 *    ```
 *
 * 4. HISTORICAL EVIDENCE:
 *    - LayerZero: Multi-chain users got 2-3x more
 *    - Arbitrum: Governance voters got bonus
 *    - Blur: NFT power users heavily weighted
 *
 * WHY track vs just diversify:
 * - Know what's missing
 * - Avoid over-concentration
 * - Optimize limited capital
 * - Generate evidence of "realness"
 *
 * HOW:
 * ----
 * HOW diversity score is calculated:
 *
 * ```
 * DIVERSITY SCORE =
 *   (Protocol Score × 0.25) +
 *   (Chain Score × 0.20) +
 *   (Action Score × 0.20) +
 *   (Category Score × 0.20) +
 *   (Time Score × 0.15)
 *
 * Each sub-score is 0-100
 * Final score is 0-100
 * ```
 *
 * HOW protocol score works:
 * ```javascript
 * // Count unique protocols in each category
 * const categoryProtocols = {
 *   dex: ['uniswap', 'sushiswap'],      // 2 protocols
 *   lending: ['aave'],                   // 1 protocol
 *   bridge: ['stargate', 'hop', 'across'], // 3 protocols
 * };
 *
 * // Score based on coverage
 * protocolScore = (totalProtocols / targetProtocols) × 100
 * ```
 *
 * HOW recommendations work:
 * ```javascript
 * // Find underrepresented areas
 * if (categoryScore.nft < 20) {
 *   recommend: "Consider NFT activity (mint, trade)"
 * }
 * if (chainScore.zksync < 30) {
 *   recommend: "Bridge to zkSync Era"
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
 * Protocol categories and their weights
 */
const PROTOCOL_CATEGORIES = {
  DEX: {
    name: 'dex',
    weight: 1.0,
    description: 'Decentralized exchanges',
    targetCount: 3, // Ideal number of DEXes to use
  },
  LENDING: {
    name: 'lending',
    weight: 1.2,
    description: 'Lending and borrowing protocols',
    targetCount: 2,
  },
  BRIDGE: {
    name: 'bridge',
    weight: 1.5,
    description: 'Cross-chain bridges',
    targetCount: 2,
  },
  PERPETUALS: {
    name: 'perpetuals',
    weight: 1.2,
    description: 'Perpetual trading platforms',
    targetCount: 1,
  },
  NFT: {
    name: 'nft',
    weight: 0.8,
    description: 'NFT marketplaces and collections',
    targetCount: 2,
  },
  SOCIAL: {
    name: 'social',
    weight: 1.0,
    description: 'Social protocols (Lens, Farcaster)',
    targetCount: 1,
  },
  GAMING: {
    name: 'gaming',
    weight: 0.8,
    description: 'Gaming and metaverse',
    targetCount: 1,
  },
  GOVERNANCE: {
    name: 'governance',
    weight: 1.5,
    description: 'DAO governance participation',
    targetCount: 2,
  },
  YIELD: {
    name: 'yield',
    weight: 1.0,
    description: 'Yield aggregators and vaults',
    targetCount: 1,
  },
  STAKING: {
    name: 'staking',
    weight: 1.2,
    description: 'Staking and liquid staking',
    targetCount: 2,
  },
};

/**
 * Known protocols by category
 */
const KNOWN_PROTOCOLS = {
  dex: [
    'uniswap', 'sushiswap', 'curve', 'balancer', 'pancakeswap',
    'syncswap', 'velocore', 'mute', 'spacefi', 'aerodrome',
    'velodrome', 'camelot', 'trader_joe', 'quickswap', 'baseswap',
  ],
  lending: [
    'aave', 'compound', 'radiant', 'euler', 'morpho',
    'spark', 'zerolend', 'layerbank', 'venus',
  ],
  bridge: [
    'stargate', 'hop', 'across', 'synapse', 'celer',
    'multichain', 'orbiter', 'layerzero', 'hyperlane',
  ],
  perpetuals: [
    'gmx', 'dydx', 'synthetix', 'kwenta', 'gains',
    'level', 'mux', 'vertex',
  ],
  nft: [
    'opensea', 'blur', 'element', 'looksrare', 'x2y2',
    'zora', 'foundation', 'rarible',
  ],
  social: [
    'lens', 'farcaster', 'mirror', 'paragraph', 'hey',
  ],
  gaming: [
    'treasure', 'illuvium', 'parallel', 'sorare', 'axie',
  ],
  governance: [
    'snapshot', 'tally', 'boardroom', 'aragon',
  ],
  yield: [
    'yearn', 'convex', 'beefy', 'harvest', 'sommelier',
  ],
  staking: [
    'lido', 'rocketpool', 'frax_eth', 'cbeth', 'ankr',
  ],
};

/**
 * Chain priorities and information
 */
const CHAIN_INFO = {
  1: { name: 'Ethereum', type: 'L1', priority: 'high', weight: 1.2 },
  42161: { name: 'Arbitrum', type: 'L2_optimistic', priority: 'high', weight: 1.0 },
  10: { name: 'Optimism', type: 'L2_optimistic', priority: 'high', weight: 1.0 },
  8453: { name: 'Base', type: 'L2_optimistic', priority: 'high', weight: 1.0 },
  324: { name: 'zkSync Era', type: 'L2_zk', priority: 'high', weight: 1.2 },
  534352: { name: 'Scroll', type: 'L2_zk', priority: 'medium', weight: 1.1 },
  59144: { name: 'Linea', type: 'L2_zk', priority: 'medium', weight: 1.1 },
  137: { name: 'Polygon', type: 'L2_plasma', priority: 'medium', weight: 0.9 },
  56: { name: 'BSC', type: 'alt_L1', priority: 'low', weight: 0.7 },
  43114: { name: 'Avalanche', type: 'alt_L1', priority: 'low', weight: 0.7 },
};

/**
 * Action types for tracking
 */
const ACTION_TYPES = {
  SWAP: { name: 'swap', weight: 1.0 },
  BRIDGE: { name: 'bridge', weight: 1.5 },
  LIQUIDITY_ADD: { name: 'liquidity_add', weight: 1.3 },
  LIQUIDITY_REMOVE: { name: 'liquidity_remove', weight: 0.8 },
  STAKE: { name: 'stake', weight: 1.2 },
  UNSTAKE: { name: 'unstake', weight: 0.8 },
  LEND: { name: 'lend', weight: 1.2 },
  BORROW: { name: 'borrow', weight: 1.2 },
  REPAY: { name: 'repay', weight: 0.8 },
  NFT_MINT: { name: 'nft_mint', weight: 0.6 },
  NFT_BUY: { name: 'nft_buy', weight: 0.8 },
  NFT_SELL: { name: 'nft_sell', weight: 0.8 },
  GOVERNANCE_VOTE: { name: 'governance_vote', weight: 1.5 },
  CONTRACT_DEPLOY: { name: 'contract_deploy', weight: 1.3 },
};

/**
 * Diversity score thresholds
 */
const DIVERSITY_THRESHOLDS = {
  EXCELLENT: 80,
  GOOD: 60,
  MODERATE: 40,
  LOW: 20,
  POOR: 0,
};

// =============================================================================
// DIVERSITY RECORD CLASS
// =============================================================================

/**
 * Represents an activity record for tracking
 */
class ActivityRecord {
  constructor(data) {
    this.id = data.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = data.timestamp || Date.now();
    this.chainId = data.chainId;
    this.protocol = data.protocol?.toLowerCase();
    this.category = data.category?.toLowerCase();
    this.action = data.action?.toLowerCase();
    this.amount = data.amount || 0;
    this.amountUSD = data.amountUSD || 0;
    this.txHash = data.txHash;
    this.metadata = data.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      chainId: this.chainId,
      protocol: this.protocol,
      category: this.category,
      action: this.action,
      amount: this.amount,
      amountUSD: this.amountUSD,
      txHash: this.txHash,
      metadata: this.metadata,
    };
  }
}

// =============================================================================
// DIVERSITY TRACKER CLASS
// =============================================================================

/**
 * Main diversity tracking class
 */
class DiversityTracker extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      historyRetentionDays: config.historyRetentionDays || 180, // 6 months
      minActivityForScore: config.minActivityForScore || 10,
    };

    // Activity storage per wallet
    this.walletActivities = new Map(); // walletAddress -> Array<ActivityRecord>

    // Cached scores
    this.cachedScores = new Map(); // walletAddress -> { score, timestamp }
    this.scoreCacheTTL = 60 * 60 * 1000; // 1 hour cache
  }

  // ===========================================================================
  // ACTIVITY TRACKING
  // ===========================================================================

  /**
   * Record a new activity
   */
  recordActivity(walletAddress, activityData) {
    const normalized = walletAddress.toLowerCase();

    // Create record
    const record = new ActivityRecord(activityData);

    // Get or create activity list
    let activities = this.walletActivities.get(normalized);
    if (!activities) {
      activities = [];
      this.walletActivities.set(normalized, activities);
    }

    // Add record
    activities.push(record);

    // Trim old activities
    const cutoff = Date.now() - this.config.historyRetentionDays * 24 * 60 * 60 * 1000;
    this.walletActivities.set(
      normalized,
      activities.filter(a => a.timestamp > cutoff)
    );

    // Invalidate cached score
    this.cachedScores.delete(normalized);

    // Emit event
    this.emit('activityRecorded', {
      wallet: normalized,
      activity: record.toJSON(),
    });

    return record;
  }

  /**
   * Get activities for wallet
   */
  getActivities(walletAddress, options = {}) {
    const normalized = walletAddress.toLowerCase();
    let activities = this.walletActivities.get(normalized) || [];

    // Filter by date range
    if (options.since) {
      activities = activities.filter(a => a.timestamp >= options.since);
    }
    if (options.until) {
      activities = activities.filter(a => a.timestamp <= options.until);
    }

    // Filter by chain
    if (options.chainId) {
      activities = activities.filter(a => a.chainId === options.chainId);
    }

    // Filter by category
    if (options.category) {
      activities = activities.filter(a => a.category === options.category.toLowerCase());
    }

    // Filter by protocol
    if (options.protocol) {
      activities = activities.filter(a => a.protocol === options.protocol.toLowerCase());
    }

    return activities;
  }

  // ===========================================================================
  // DIVERSITY SCORING
  // ===========================================================================

  /**
   * Calculate comprehensive diversity score
   */
  calculateDiversityScore(walletAddress, options = {}) {
    const normalized = walletAddress.toLowerCase();

    // Check cache
    if (!options.forceRefresh) {
      const cached = this.cachedScores.get(normalized);
      if (cached && Date.now() - cached.timestamp < this.scoreCacheTTL) {
        return cached.score;
      }
    }

    const activities = this.getActivities(normalized, {
      since: options.since || Date.now() - 90 * 24 * 60 * 60 * 1000, // Last 90 days
    });

    if (activities.length < this.config.minActivityForScore) {
      return {
        overall: 0,
        sufficient: false,
        message: `Insufficient activity (${activities.length}/${this.config.minActivityForScore})`,
        components: null,
      };
    }

    // Calculate component scores
    const protocolScore = this.calculateProtocolScore(activities);
    const chainScore = this.calculateChainScore(activities);
    const actionScore = this.calculateActionScore(activities);
    const categoryScore = this.calculateCategoryScore(activities);
    const timeScore = this.calculateTimeScore(activities);
    const amountScore = this.calculateAmountScore(activities);

    // Weighted average
    const weights = {
      protocol: 0.20,
      chain: 0.20,
      action: 0.15,
      category: 0.20,
      time: 0.15,
      amount: 0.10,
    };

    const overall = Math.round(
      protocolScore.score * weights.protocol +
      chainScore.score * weights.chain +
      actionScore.score * weights.action +
      categoryScore.score * weights.category +
      timeScore.score * weights.time +
      amountScore.score * weights.amount
    );

    const score = {
      overall,
      sufficient: true,
      level: this.getScoreLevel(overall),
      components: {
        protocol: protocolScore,
        chain: chainScore,
        action: actionScore,
        category: categoryScore,
        time: timeScore,
        amount: amountScore,
      },
      activityCount: activities.length,
      calculatedAt: Date.now(),
    };

    // Cache the score
    this.cachedScores.set(normalized, { score, timestamp: Date.now() });

    return score;
  }

  /**
   * Get score level label
   */
  getScoreLevel(score) {
    if (score >= DIVERSITY_THRESHOLDS.EXCELLENT) return 'excellent';
    if (score >= DIVERSITY_THRESHOLDS.GOOD) return 'good';
    if (score >= DIVERSITY_THRESHOLDS.MODERATE) return 'moderate';
    if (score >= DIVERSITY_THRESHOLDS.LOW) return 'low';
    return 'poor';
  }

  /**
   * Calculate protocol diversity score
   */
  calculateProtocolScore(activities) {
    const protocols = new Set();
    const protocolActivity = {};

    for (const activity of activities) {
      if (activity.protocol) {
        protocols.add(activity.protocol);
        protocolActivity[activity.protocol] = (protocolActivity[activity.protocol] || 0) + 1;
      }
    }

    const uniqueProtocols = protocols.size;
    const targetProtocols = 10; // Ideal number of protocols

    // Score based on count + distribution
    const countScore = Math.min(100, (uniqueProtocols / targetProtocols) * 100);

    // Distribution bonus (penalize if one protocol dominates)
    const totalActivity = activities.length;
    const maxConcentration = Math.max(...Object.values(protocolActivity)) / totalActivity;
    const distributionScore = (1 - maxConcentration) * 100;

    const score = Math.round(countScore * 0.7 + distributionScore * 0.3);

    return {
      score,
      uniqueProtocols,
      targetProtocols,
      protocols: Array.from(protocols),
      distribution: protocolActivity,
      maxConcentration: Math.round(maxConcentration * 100),
    };
  }

  /**
   * Calculate chain diversity score
   */
  calculateChainScore(activities) {
    const chains = new Map(); // chainId -> count

    for (const activity of activities) {
      if (activity.chainId) {
        chains.set(activity.chainId, (chains.get(activity.chainId) || 0) + 1);
      }
    }

    const uniqueChains = chains.size;
    const targetChains = 5;

    // Base score from count
    let score = Math.min(100, (uniqueChains / targetChains) * 100);

    // Bonus for high-priority chains
    let priorityBonus = 0;
    for (const [chainId] of chains) {
      const info = CHAIN_INFO[chainId];
      if (info?.priority === 'high') {
        priorityBonus += 10;
      }
    }
    score = Math.min(100, score + priorityBonus);

    // Bonus for L2 ZK chains (likely airdrops)
    const zkChains = Array.from(chains.keys()).filter(id =>
      CHAIN_INFO[id]?.type === 'L2_zk'
    );
    if (zkChains.length > 0) {
      score = Math.min(100, score + zkChains.length * 5);
    }

    return {
      score: Math.round(score),
      uniqueChains,
      targetChains,
      chains: Object.fromEntries(chains),
      chainNames: Array.from(chains.keys()).map(id =>
        CHAIN_INFO[id]?.name || `Chain ${id}`
      ),
      hasZkChains: zkChains.length > 0,
    };
  }

  /**
   * Calculate action type diversity score
   */
  calculateActionScore(activities) {
    const actions = new Map();

    for (const activity of activities) {
      if (activity.action) {
        actions.set(activity.action, (actions.get(activity.action) || 0) + 1);
      }
    }

    const uniqueActions = actions.size;
    const targetActions = 6;

    // Base score
    let score = Math.min(100, (uniqueActions / targetActions) * 100);

    // Bonus for high-value actions
    const highValueActions = ['bridge', 'governance_vote', 'liquidity_add', 'stake'];
    const hasHighValue = highValueActions.some(a => actions.has(a));
    if (hasHighValue) {
      score = Math.min(100, score + 15);
    }

    // Penalty for only doing swaps
    if (uniqueActions === 1 && actions.has('swap')) {
      score = Math.max(0, score - 30);
    }

    return {
      score: Math.round(score),
      uniqueActions,
      targetActions,
      actions: Object.fromEntries(actions),
      hasHighValueActions: hasHighValue,
    };
  }

  /**
   * Calculate category diversity score
   */
  calculateCategoryScore(activities) {
    const categories = new Map();

    for (const activity of activities) {
      if (activity.category) {
        categories.set(activity.category, (categories.get(activity.category) || 0) + 1);
      }
    }

    const uniqueCategories = categories.size;
    const targetCategories = 5;

    // Base score
    let score = Math.min(100, (uniqueCategories / targetCategories) * 100);

    // Bonus for governance participation
    if (categories.has('governance')) {
      score = Math.min(100, score + 20);
    }

    // Bonus for bridge usage
    if (categories.has('bridge')) {
      score = Math.min(100, score + 10);
    }

    return {
      score: Math.round(score),
      uniqueCategories,
      targetCategories,
      categories: Object.fromEntries(categories),
      hasGovernance: categories.has('governance'),
      hasBridge: categories.has('bridge'),
    };
  }

  /**
   * Calculate time distribution score
   */
  calculateTimeScore(activities) {
    if (activities.length < 2) {
      return { score: 0, message: 'Insufficient activities' };
    }

    // Sort by timestamp
    const sorted = [...activities].sort((a, b) => a.timestamp - b.timestamp);

    // Calculate time span
    const firstActivity = sorted[0].timestamp;
    const lastActivity = sorted[sorted.length - 1].timestamp;
    const spanDays = (lastActivity - firstActivity) / (24 * 60 * 60 * 1000);

    // Check for bursts (many activities in short period)
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].timestamp - sorted[i - 1].timestamp);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const minInterval = Math.min(...intervals);

    // Score based on span
    let score = Math.min(100, (spanDays / 90) * 100); // Target 90 days

    // Penalty for burst farming (many activities too close together)
    const burstThreshold = 1 * 60 * 60 * 1000; // 1 hour
    const burstCount = intervals.filter(i => i < burstThreshold).length;
    const burstRatio = burstCount / intervals.length;
    if (burstRatio > 0.3) {
      score = Math.max(0, score - 20);
    }

    // Bonus for consistent activity over time
    const weeklyActivity = this.calculateWeeklyDistribution(sorted);
    const activeWeeks = Object.values(weeklyActivity).filter(c => c > 0).length;
    const consistencyBonus = Math.min(20, activeWeeks * 2);
    score = Math.min(100, score + consistencyBonus);

    return {
      score: Math.round(score),
      spanDays: Math.round(spanDays),
      avgIntervalHours: Math.round(avgInterval / (60 * 60 * 1000)),
      burstRatio: Math.round(burstRatio * 100),
      activeWeeks,
      weeklyDistribution: weeklyActivity,
    };
  }

  /**
   * Calculate weekly distribution of activities
   */
  calculateWeeklyDistribution(activities) {
    const weekly = {};

    for (const activity of activities) {
      const date = new Date(activity.timestamp);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      weekly[weekKey] = (weekly[weekKey] || 0) + 1;
    }

    return weekly;
  }

  /**
   * Calculate amount diversity score
   */
  calculateAmountScore(activities) {
    const amounts = activities
      .filter(a => a.amountUSD > 0)
      .map(a => a.amountUSD);

    if (amounts.length < 2) {
      return { score: 50, message: 'Insufficient amount data' };
    }

    // Calculate coefficient of variation
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, a) =>
      sum + Math.pow(a - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;

    // Score based on variety (but not TOO varied)
    let score;
    if (cv < 0.1) {
      // Too uniform - suspicious
      score = 40;
    } else if (cv < 0.3) {
      // Good variety
      score = 80;
    } else if (cv < 0.5) {
      // High variety - organic
      score = 100;
    } else {
      // Very high variety - also good
      score = 90;
    }

    // Check for round number ratio
    const roundNumbers = amounts.filter(a =>
      a === Math.round(a) && a % 10 === 0
    ).length;
    const roundRatio = roundNumbers / amounts.length;

    if (roundRatio > 0.5) {
      score = Math.max(0, score - 20); // Penalty for too many round numbers
    }

    return {
      score: Math.round(score),
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      coefficientOfVariation: Math.round(cv * 100) / 100,
      roundNumberRatio: Math.round(roundRatio * 100),
    };
  }

  // ===========================================================================
  // RECOMMENDATIONS
  // ===========================================================================

  /**
   * Get recommendations for improving diversity
   */
  getRecommendations(walletAddress, options = {}) {
    const score = this.calculateDiversityScore(walletAddress, options);

    if (!score.sufficient) {
      return {
        score: score.overall,
        recommendations: [{
          priority: 'high',
          category: 'general',
          message: 'Build more activity history first',
        }],
      };
    }

    const recommendations = [];

    // Check protocol diversity
    if (score.components.protocol.score < 60) {
      const currentProtocols = new Set(score.components.protocol.protocols);
      const suggestedProtocols = [];

      // Suggest protocols from underrepresented categories
      for (const [category, protocols] of Object.entries(KNOWN_PROTOCOLS)) {
        const used = protocols.filter(p => currentProtocols.has(p));
        if (used.length === 0) {
          suggestedProtocols.push({
            category,
            protocol: protocols[0],
          });
        }
      }

      recommendations.push({
        priority: 'high',
        category: 'protocol',
        message: `Diversify protocols (currently ${score.components.protocol.uniqueProtocols})`,
        suggestions: suggestedProtocols.slice(0, 3),
      });
    }

    // Check chain diversity
    if (score.components.chain.score < 60) {
      const currentChains = Object.keys(score.components.chain.chains).map(Number);
      const missingHighPriority = Object.entries(CHAIN_INFO)
        .filter(([id, info]) =>
          info.priority === 'high' && !currentChains.includes(Number(id))
        )
        .map(([id, info]) => ({ chainId: Number(id), name: info.name }));

      recommendations.push({
        priority: 'high',
        category: 'chain',
        message: `Use more chains (currently ${score.components.chain.uniqueChains})`,
        suggestions: missingHighPriority.slice(0, 3),
      });
    }

    // Check for governance participation
    if (!score.components.category.hasGovernance) {
      recommendations.push({
        priority: 'medium',
        category: 'action',
        message: 'Participate in governance votes (high value signal)',
        suggestions: [
          { protocol: 'snapshot', action: 'vote' },
          { protocol: 'tally', action: 'vote' },
        ],
      });
    }

    // Check for bridge usage
    if (!score.components.category.hasBridge) {
      recommendations.push({
        priority: 'high',
        category: 'action',
        message: 'Use bridges for cross-chain activity',
        suggestions: [
          { protocol: 'stargate', chains: ['Arbitrum', 'Optimism'] },
          { protocol: 'orbiter', chains: ['zkSync', 'Linea'] },
        ],
      });
    }

    // Check time distribution
    if (score.components.time.score < 60) {
      recommendations.push({
        priority: 'medium',
        category: 'timing',
        message: score.components.time.burstRatio > 30
          ? 'Spread activities over time (avoid burst farming)'
          : 'Maintain consistent activity over weeks',
      });
    }

    // Check amount diversity
    if (score.components.amount.roundNumberRatio > 50) {
      recommendations.push({
        priority: 'low',
        category: 'amount',
        message: 'Vary transaction amounts (avoid round numbers)',
      });
    }

    return {
      score: score.overall,
      level: score.level,
      recommendations: recommendations.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }),
    };
  }

  // ===========================================================================
  // ANALYTICS
  // ===========================================================================

  /**
   * Generate diversity report for wallet
   */
  generateReport(walletAddress, options = {}) {
    const normalized = walletAddress.toLowerCase();
    const score = this.calculateDiversityScore(normalized, options);
    const recommendations = this.getRecommendations(normalized, options);
    const activities = this.getActivities(normalized, options);

    return {
      wallet: normalized,
      generatedAt: new Date().toISOString(),
      summary: {
        overallScore: score.overall,
        level: score.level,
        totalActivities: activities.length,
        uniqueProtocols: score.components?.protocol?.uniqueProtocols || 0,
        uniqueChains: score.components?.chain?.uniqueChains || 0,
        spanDays: score.components?.time?.spanDays || 0,
      },
      scores: score,
      recommendations: recommendations.recommendations,
      topProtocols: this.getTopProtocols(activities, 5),
      topChains: this.getTopChains(activities, 5),
      recentActivity: activities.slice(-10).reverse().map(a => a.toJSON()),
    };
  }

  /**
   * Get top protocols by activity
   */
  getTopProtocols(activities, limit = 5) {
    const protocols = {};
    for (const a of activities) {
      if (a.protocol) {
        protocols[a.protocol] = (protocols[a.protocol] || 0) + 1;
      }
    }

    return Object.entries(protocols)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([protocol, count]) => ({ protocol, count }));
  }

  /**
   * Get top chains by activity
   */
  getTopChains(activities, limit = 5) {
    const chains = {};
    for (const a of activities) {
      if (a.chainId) {
        chains[a.chainId] = (chains[a.chainId] || 0) + 1;
      }
    }

    return Object.entries(chains)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([chainId, count]) => ({
        chainId: Number(chainId),
        name: CHAIN_INFO[chainId]?.name || `Chain ${chainId}`,
        count,
      }));
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Get protocol category
   */
  getProtocolCategory(protocol) {
    const normalized = protocol.toLowerCase();

    for (const [category, protocols] of Object.entries(KNOWN_PROTOCOLS)) {
      if (protocols.includes(normalized)) {
        return category;
      }
    }

    return 'unknown';
  }

  /**
   * Get statistics
   */
  getStatistics() {
    let totalActivities = 0;
    for (const activities of this.walletActivities.values()) {
      totalActivities += activities.length;
    }

    return {
      walletsTracked: this.walletActivities.size,
      totalActivities,
      cachedScores: this.cachedScores.size,
    };
  }

  /**
   * Clear cache
   */
  clearCache(walletAddress = null) {
    if (walletAddress) {
      this.cachedScores.delete(walletAddress.toLowerCase());
    } else {
      this.cachedScores.clear();
    }
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  DiversityTracker,
  ActivityRecord,
  PROTOCOL_CATEGORIES,
  KNOWN_PROTOCOLS,
  CHAIN_INFO,
  ACTION_TYPES,
  DIVERSITY_THRESHOLDS,

  // Factory
  createDiversityTracker: (config = {}) => new DiversityTracker(config),
};
