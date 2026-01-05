'use strict';

/**
 * Eligibility Checker System
 *
 * Sprint 3.2: Points & Eligibility Tracking
 *
 * =============================================================================
 * THE 6 W's: ELIGIBILITY CHECKING
 * =============================================================================
 *
 * WHO:
 * ----
 * WHO uses the eligibility checker:
 *
 * - AIRDROP FARMERS: Verify they meet criteria before snapshot
 *   - Need to know if they qualify
 *   - Must understand what's missing
 *   - Want to optimize remaining time
 *
 * - MULTI-WALLET OPERATORS: Check eligibility across wallets
 *   - Identify wallets that need more activity
 *   - Prioritize wallets close to eligibility
 *   - Track overall portfolio eligibility
 *
 * WHO defines eligibility:
 *
 * - PROTOCOL TEAMS: Define airdrop criteria
 *   ```
 *   LayerZero: Messages, chains, volume, time
 *   zkSync:    Transactions, contracts, bridge, time
 *   Scroll:    Bridge, dApps, transactions
 *   ```
 *
 * - COMMUNITY RESEARCH: Speculated criteria from analysis
 *   - Historical airdrop analysis
 *   - On-chain pattern analysis
 *   - Insider/leaked information
 *
 * WHAT:
 * -----
 * WHAT eligibility criteria we check:
 *
 * | Category | Examples | Weight |
 * |----------|----------|--------|
 * | Transaction Count | Min 10 txs | High |
 * | Volume | Min $1000 | High |
 * | Time Active | Min 90 days | High |
 * | Contract Interactions | Min 5 dApps | Medium |
 * | Bridge Usage | Any bridge tx | Medium |
 * | Governance | Any vote | Low |
 * | NFT Activity | Any mint | Low |
 *
 * WHAT outputs we provide:
 *
 * | Output | Description |
 * |--------|-------------|
 * | Eligible | Boolean - meets all required criteria |
 * | Score | 0-100 - overall eligibility strength |
 * | Criteria Met | List of passed criteria |
 * | Criteria Missing | List of failed criteria |
 * | Recommendations | Actions to improve eligibility |
 * | Confidence | How certain we are |
 *
 * WHAT types of criteria:
 *
 * - HARD REQUIREMENTS: Must meet (e.g., min transactions)
 * - SOFT REQUIREMENTS: Improve chances (e.g., governance)
 * - EXCLUSIONS: Disqualify (e.g., Sybil detection)
 * - BONUS CRITERIA: Extra allocation (e.g., early user)
 *
 * WHEN:
 * -----
 * WHEN to check eligibility:
 *
 * | Trigger | Reason |
 * |---------|--------|
 * | Daily | Regular monitoring |
 * | Pre-snapshot | Ensure readiness |
 * | Post-activity | Verify improvement |
 * | On-demand | Manual check |
 *
 * WHEN eligibility matters most:
 *
 * ```
 * Timeline for typical airdrop:
 *
 * │ Activity Period │ Snapshot │ Announcement │ Claim │
 * ├─────────────────┼──────────┼──────────────┼───────┤
 * │  CRITICAL       │ DEADLINE │ TOO LATE     │ CLAIM │
 * │  Build history  │ Must be  │ Can't change │       │
 * │  and diversity  │ eligible │ eligibility  │       │
 * ```
 *
 * WHERE:
 * ------
 * WHERE eligibility data comes from:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    ELIGIBILITY CHECK FLOW                        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                  │
 * │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
 * │  │   On-Chain   │   │   Points     │   │   Protocol   │        │
 * │  │   Activity   │   │   Aggregator │   │   Criteria   │        │
 * │  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
 * │         │                  │                   │                 │
 * │         └──────────────────┼───────────────────┘                 │
 * │                            ▼                                     │
 * │                   ┌──────────────────┐                          │
 * │                   │  ELIGIBILITY     │                          │
 * │                   │  CHECKER         │                          │
 * │                   │                  │                          │
 * │                   │  - Check hard    │                          │
 * │                   │  - Check soft    │                          │
 * │                   │  - Calculate     │                          │
 * │                   │  - Recommend     │                          │
 * │                   └────────┬─────────┘                          │
 * │                            │                                     │
 * │                            ▼                                     │
 * │                   ┌──────────────────┐                          │
 * │                   │  ELIGIBILITY     │                          │
 * │                   │  RESULT          │                          │
 * │                   │                  │                          │
 * │                   │  - Status        │                          │
 * │                   │  - Score         │                          │
 * │                   │  - Actions       │                          │
 * │                   └──────────────────┘                          │
 * │                                                                  │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * WHY:
 * ----
 * WHY eligibility checking is essential:
 *
 * 1. AVOID MISSED AIRDROPS:
 *    - Know if you qualify before snapshot
 *    - Time to fix issues
 *    - Don't assume - verify
 *
 * 2. OPTIMIZE ACTIVITY:
 *    - Know exactly what's missing
 *    - Prioritize high-impact actions
 *    - Avoid wasting gas on unnecessary txs
 *
 * 3. PORTFOLIO MANAGEMENT:
 *    - Track which wallets qualify
 *    - Balance activity across wallets
 *    - Maximize total allocation
 *
 * 4. ROI TRACKING:
 *    - Only eligible wallets matter
 *    - Calculate expected value
 *    - Inform future strategy
 *
 * WHY criteria vary by protocol:
 *
 * - Each protocol values different behaviors
 * - Some prioritize volume, others diversity
 * - Criteria evolve to prevent gaming
 * - Must stay updated with research
 *
 * HOW:
 * ----
 * HOW eligibility is checked:
 *
 * 1. LOAD CRITERIA:
 *    ```javascript
 *    const criteria = getCriteria('zksync');
 *    // { hard: [...], soft: [...], exclusions: [...] }
 *    ```
 *
 * 2. FETCH ACTIVITY:
 *    ```javascript
 *    const activity = await getWalletActivity(wallet);
 *    // { transactions: 50, volume: 5000, ... }
 *    ```
 *
 * 3. CHECK EACH CRITERION:
 *    ```javascript
 *    const results = [];
 *    for (const criterion of criteria.hard) {
 *      const passed = evaluate(criterion, activity);
 *      results.push({ criterion, passed });
 *    }
 *    ```
 *
 * 4. CALCULATE SCORE:
 *    ```javascript
 *    const score = calculateScore(results, criteria.weights);
 *    // 0-100 score
 *    ```
 *
 * 5. GENERATE RECOMMENDATIONS:
 *    ```javascript
 *    const recommendations = [];
 *    for (const result of results) {
 *      if (!result.passed) {
 *        recommendations.push(getRecommendation(result.criterion));
 *      }
 *    }
 *    ```
 *
 * HOW scoring works:
 *
 * ```javascript
 * function calculateScore(activity, criteria) {
 *   let score = 0;
 *   let maxScore = 0;
 *
 *   for (const criterion of criteria) {
 *     maxScore += criterion.weight;
 *
 *     if (meetsMinimum(activity, criterion)) {
 *       // Base score for meeting minimum
 *       score += criterion.weight * 0.6;
 *
 *       // Bonus for exceeding
 *       const excess = getExcess(activity, criterion);
 *       score += criterion.weight * 0.4 * Math.min(excess, 1);
 *     }
 *   }
 *
 *   return (score / maxScore) * 100;
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
 * Criterion types
 */
const CRITERION_TYPE = {
  HARD: 'hard',           // Must meet for eligibility
  SOFT: 'soft',           // Improves allocation
  EXCLUSION: 'exclusion', // Disqualifies if true
  BONUS: 'bonus',         // Extra allocation
};

/**
 * Comparison operators
 */
const OPERATORS = {
  GTE: 'gte',       // Greater than or equal
  GT: 'gt',         // Greater than
  LTE: 'lte',       // Less than or equal
  LT: 'lt',         // Less than
  EQ: 'eq',         // Equal
  NEQ: 'neq',       // Not equal
  IN: 'in',         // In array
  NOT_IN: 'not_in', // Not in array
  EXISTS: 'exists', // Has value
  BETWEEN: 'between', // Between range
};

/**
 * Eligibility status
 */
const ELIGIBILITY_STATUS = {
  ELIGIBLE: 'eligible',
  NOT_ELIGIBLE: 'not_eligible',
  PARTIALLY_ELIGIBLE: 'partially_eligible',
  EXCLUDED: 'excluded',
  UNKNOWN: 'unknown',
};

/**
 * Protocol eligibility criteria
 */
const PROTOCOL_CRITERIA = {
  layerzero: {
    name: 'LayerZero',
    version: '2024-06',
    confidence: 0.7, // Based on community research
    criteria: [
      // Hard requirements
      {
        id: 'min_messages',
        name: 'Minimum Messages',
        type: CRITERION_TYPE.HARD,
        field: 'messagesSent',
        operator: OPERATORS.GTE,
        value: 5,
        weight: 20,
        description: 'Send at least 5 cross-chain messages',
      },
      {
        id: 'min_chains',
        name: 'Minimum Chains',
        type: CRITERION_TYPE.HARD,
        field: 'uniqueChains',
        operator: OPERATORS.GTE,
        value: 2,
        weight: 15,
        description: 'Use at least 2 different chains',
      },
      {
        id: 'min_volume',
        name: 'Minimum Volume',
        type: CRITERION_TYPE.HARD,
        field: 'volumeUSD',
        operator: OPERATORS.GTE,
        value: 100,
        weight: 15,
        description: 'Bridge at least $100 in volume',
      },
      // Soft requirements
      {
        id: 'active_months',
        name: 'Active Months',
        type: CRITERION_TYPE.SOFT,
        field: 'activeMonths',
        operator: OPERATORS.GTE,
        value: 3,
        weight: 20,
        description: 'Active for at least 3 months',
      },
      {
        id: 'diverse_protocols',
        name: 'Protocol Diversity',
        type: CRITERION_TYPE.SOFT,
        field: 'uniqueProtocols',
        operator: OPERATORS.GTE,
        value: 3,
        weight: 15,
        description: 'Use at least 3 different protocols',
      },
      // Exclusions
      {
        id: 'sybil_flag',
        name: 'Not Sybil',
        type: CRITERION_TYPE.EXCLUSION,
        field: 'sybilFlagged',
        operator: OPERATORS.NEQ,
        value: true,
        weight: 0,
        description: 'Not flagged as Sybil wallet',
      },
      // Bonus
      {
        id: 'early_user',
        name: 'Early User',
        type: CRITERION_TYPE.BONUS,
        field: 'firstActivityDate',
        operator: OPERATORS.LT,
        value: new Date('2023-06-01').getTime(),
        weight: 15,
        description: 'First activity before June 2023',
      },
    ],
  },

  zksync: {
    name: 'zkSync Era',
    version: '2024-06',
    confidence: 0.6,
    criteria: [
      {
        id: 'min_transactions',
        name: 'Minimum Transactions',
        type: CRITERION_TYPE.HARD,
        field: 'transactions',
        operator: OPERATORS.GTE,
        value: 10,
        weight: 15,
        description: 'Execute at least 10 transactions',
      },
      {
        id: 'min_contracts',
        name: 'Minimum Contracts',
        type: CRITERION_TYPE.HARD,
        field: 'uniqueContracts',
        operator: OPERATORS.GTE,
        value: 5,
        weight: 15,
        description: 'Interact with at least 5 different contracts',
      },
      {
        id: 'bridge_eth',
        name: 'Bridge ETH',
        type: CRITERION_TYPE.HARD,
        field: 'bridgeVolume',
        operator: OPERATORS.GTE,
        value: 50,
        weight: 10,
        description: 'Bridge at least $50 worth of ETH',
      },
      {
        id: 'active_weeks',
        name: 'Active Weeks',
        type: CRITERION_TYPE.SOFT,
        field: 'activeWeeks',
        operator: OPERATORS.GTE,
        value: 4,
        weight: 15,
        description: 'Active for at least 4 different weeks',
      },
      {
        id: 'active_months',
        name: 'Active Months',
        type: CRITERION_TYPE.SOFT,
        field: 'activeMonths',
        operator: OPERATORS.GTE,
        value: 2,
        weight: 15,
        description: 'Active for at least 2 different months',
      },
      {
        id: 'volume_tier',
        name: 'Volume',
        type: CRITERION_TYPE.SOFT,
        field: 'volumeUSD',
        operator: OPERATORS.GTE,
        value: 1000,
        weight: 15,
        description: 'Total volume of at least $1000',
      },
      {
        id: 'sybil_flag',
        name: 'Not Sybil',
        type: CRITERION_TYPE.EXCLUSION,
        field: 'sybilFlagged',
        operator: OPERATORS.NEQ,
        value: true,
        weight: 0,
        description: 'Not flagged as Sybil wallet',
      },
    ],
  },

  scroll: {
    name: 'Scroll',
    version: '2024-12',
    confidence: 0.5,
    criteria: [
      {
        id: 'min_transactions',
        name: 'Minimum Transactions',
        type: CRITERION_TYPE.HARD,
        field: 'transactions',
        operator: OPERATORS.GTE,
        value: 10,
        weight: 15,
        description: 'Execute at least 10 transactions',
      },
      {
        id: 'bridge_usage',
        name: 'Bridge Usage',
        type: CRITERION_TYPE.HARD,
        field: 'bridgeTransactions',
        operator: OPERATORS.GTE,
        value: 1,
        weight: 15,
        description: 'Use the official bridge at least once',
      },
      {
        id: 'dapp_usage',
        name: 'dApp Usage',
        type: CRITERION_TYPE.HARD,
        field: 'uniqueContracts',
        operator: OPERATORS.GTE,
        value: 3,
        weight: 15,
        description: 'Use at least 3 different dApps',
      },
      {
        id: 'volume',
        name: 'Volume',
        type: CRITERION_TYPE.SOFT,
        field: 'volumeUSD',
        operator: OPERATORS.GTE,
        value: 500,
        weight: 20,
        description: 'Total volume of at least $500',
      },
      {
        id: 'time_active',
        name: 'Time Active',
        type: CRITERION_TYPE.SOFT,
        field: 'daysActive',
        operator: OPERATORS.GTE,
        value: 30,
        weight: 20,
        description: 'Active for at least 30 days',
      },
    ],
  },

  linea: {
    name: 'Linea',
    version: '2024-12',
    confidence: 0.5,
    criteria: [
      {
        id: 'min_transactions',
        name: 'Minimum Transactions',
        type: CRITERION_TYPE.HARD,
        field: 'transactions',
        operator: OPERATORS.GTE,
        value: 15,
        weight: 15,
        description: 'Execute at least 15 transactions',
      },
      {
        id: 'bridge_usage',
        name: 'Bridge Usage',
        type: CRITERION_TYPE.HARD,
        field: 'bridgeVolume',
        operator: OPERATORS.GTE,
        value: 25,
        weight: 15,
        description: 'Bridge at least $25',
      },
      {
        id: 'dex_usage',
        name: 'DEX Usage',
        type: CRITERION_TYPE.SOFT,
        field: 'dexSwaps',
        operator: OPERATORS.GTE,
        value: 5,
        weight: 15,
        description: 'Execute at least 5 DEX swaps',
      },
      {
        id: 'nft_activity',
        name: 'NFT Activity',
        type: CRITERION_TYPE.SOFT,
        field: 'nftMints',
        operator: OPERATORS.GTE,
        value: 1,
        weight: 10,
        description: 'Mint at least 1 NFT',
      },
      {
        id: 'volume',
        name: 'Volume',
        type: CRITERION_TYPE.SOFT,
        field: 'volumeUSD',
        operator: OPERATORS.GTE,
        value: 250,
        weight: 20,
        description: 'Total volume of at least $250',
      },
      {
        id: 'time_active',
        name: 'Time Active',
        type: CRITERION_TYPE.SOFT,
        field: 'activeMonths',
        operator: OPERATORS.GTE,
        value: 2,
        weight: 15,
        description: 'Active for at least 2 months',
      },
    ],
  },

  base: {
    name: 'Base',
    version: '2024-12',
    confidence: 0.4,
    criteria: [
      {
        id: 'min_transactions',
        name: 'Minimum Transactions',
        type: CRITERION_TYPE.HARD,
        field: 'transactions',
        operator: OPERATORS.GTE,
        value: 10,
        weight: 15,
        description: 'Execute at least 10 transactions',
      },
      {
        id: 'dapp_usage',
        name: 'dApp Usage',
        type: CRITERION_TYPE.HARD,
        field: 'uniqueContracts',
        operator: OPERATORS.GTE,
        value: 3,
        weight: 15,
        description: 'Use at least 3 different dApps',
      },
      {
        id: 'bridge_from_eth',
        name: 'Bridge from Ethereum',
        type: CRITERION_TYPE.SOFT,
        field: 'bridgeFromEth',
        operator: OPERATORS.EQ,
        value: true,
        weight: 15,
        description: 'Bridge from Ethereum mainnet',
      },
      {
        id: 'volume',
        name: 'Volume',
        type: CRITERION_TYPE.SOFT,
        field: 'volumeUSD',
        operator: OPERATORS.GTE,
        value: 500,
        weight: 20,
        description: 'Total volume of at least $500',
      },
      {
        id: 'time_active',
        name: 'Time Active',
        type: CRITERION_TYPE.SOFT,
        field: 'daysActive',
        operator: OPERATORS.GTE,
        value: 30,
        weight: 20,
        description: 'Active for at least 30 days',
      },
    ],
  },

  eigenlayer: {
    name: 'EigenLayer',
    version: '2024-12',
    confidence: 0.8,
    criteria: [
      {
        id: 'restaked_eth',
        name: 'Restaked ETH',
        type: CRITERION_TYPE.HARD,
        field: 'stakedETH',
        operator: OPERATORS.GTE,
        value: 0.01,
        weight: 30,
        description: 'Have at least 0.01 ETH restaked',
      },
      {
        id: 'stake_duration',
        name: 'Stake Duration',
        type: CRITERION_TYPE.SOFT,
        field: 'stakeDurationDays',
        operator: OPERATORS.GTE,
        value: 30,
        weight: 25,
        description: 'Staked for at least 30 days',
      },
      {
        id: 'volume_tier',
        name: 'Volume Tier',
        type: CRITERION_TYPE.SOFT,
        field: 'stakedETH',
        operator: OPERATORS.GTE,
        value: 1,
        weight: 25,
        description: 'Have at least 1 ETH restaked',
      },
      {
        id: 'early_staker',
        name: 'Early Staker',
        type: CRITERION_TYPE.BONUS,
        field: 'firstStakeDate',
        operator: OPERATORS.LT,
        value: new Date('2024-01-01').getTime(),
        weight: 20,
        description: 'First stake before January 2024',
      },
    ],
  },
};

// =============================================================================
// ELIGIBILITY RESULT CLASS
// =============================================================================

/**
 * Represents an eligibility check result
 */
class EligibilityResult {
  constructor(data) {
    this.id = data.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.walletAddress = data.walletAddress?.toLowerCase();
    this.protocol = data.protocol;
    this.timestamp = data.timestamp || Date.now();

    // Status
    this.status = data.status || ELIGIBILITY_STATUS.UNKNOWN;
    this.score = data.score || 0;
    this.confidence = data.confidence || 0;

    // Criteria results
    this.criteriaResults = data.criteriaResults || [];
    this.hardRequirementsMet = data.hardRequirementsMet || 0;
    this.hardRequirementsTotal = data.hardRequirementsTotal || 0;
    this.softRequirementsMet = data.softRequirementsMet || 0;
    this.softRequirementsTotal = data.softRequirementsTotal || 0;

    // Exclusions
    this.exclusions = data.exclusions || [];
    this.isExcluded = data.isExcluded || false;

    // Bonuses
    this.bonuses = data.bonuses || [];

    // Recommendations
    this.recommendations = data.recommendations || [];

    // Activity data used
    this.activityData = data.activityData || {};
  }

  /**
   * Check if eligible
   */
  isEligible() {
    return this.status === ELIGIBILITY_STATUS.ELIGIBLE;
  }

  /**
   * Get progress toward eligibility
   */
  getProgress() {
    if (this.hardRequirementsTotal === 0) return 0;
    return Math.round((this.hardRequirementsMet / this.hardRequirementsTotal) * 100);
  }

  /**
   * Get missing criteria
   */
  getMissingCriteria() {
    return this.criteriaResults
      .filter(r => !r.passed && r.criterion.type === CRITERION_TYPE.HARD)
      .map(r => r.criterion);
  }

  /**
   * Get passed criteria
   */
  getPassedCriteria() {
    return this.criteriaResults
      .filter(r => r.passed)
      .map(r => r.criterion);
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      walletAddress: this.walletAddress,
      protocol: this.protocol,
      timestamp: this.timestamp,
      status: this.status,
      score: this.score,
      confidence: this.confidence,
      progress: this.getProgress(),
      hardRequirements: {
        met: this.hardRequirementsMet,
        total: this.hardRequirementsTotal,
      },
      softRequirements: {
        met: this.softRequirementsMet,
        total: this.softRequirementsTotal,
      },
      isExcluded: this.isExcluded,
      exclusions: this.exclusions,
      bonuses: this.bonuses,
      recommendations: this.recommendations,
      criteriaResults: this.criteriaResults.map(r => ({
        criterionId: r.criterion.id,
        criterionName: r.criterion.name,
        type: r.criterion.type,
        passed: r.passed,
        actualValue: r.actualValue,
        requiredValue: r.criterion.value,
        description: r.criterion.description,
      })),
    };
  }
}

// =============================================================================
// ELIGIBILITY CHECKER CLASS
// =============================================================================

/**
 * Main eligibility checking system
 */
class EligibilityChecker extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      strictMode: config.strictMode ?? false, // Require all hard criteria
      ...config,
    };

    // Custom criteria overrides
    this.customCriteria = new Map();

    // Results cache
    this.resultsCache = new Map();
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour

    // Statistics
    this.stats = {
      checksPerformed: 0,
      eligibleFound: 0,
      excludedFound: 0,
    };
  }

  // ===========================================================================
  // CRITERIA MANAGEMENT
  // ===========================================================================

  /**
   * Get criteria for a protocol
   */
  getCriteria(protocolId) {
    // Check for custom criteria first
    if (this.customCriteria.has(protocolId)) {
      return this.customCriteria.get(protocolId);
    }

    // Return default criteria
    return PROTOCOL_CRITERIA[protocolId] || null;
  }

  /**
   * Set custom criteria for a protocol
   */
  setCustomCriteria(protocolId, criteria) {
    this.customCriteria.set(protocolId, criteria);
    this.emit('criteriaUpdated', { protocolId });
  }

  /**
   * Add a criterion to a protocol
   */
  addCriterion(protocolId, criterion) {
    const existing = this.getCriteria(protocolId);
    if (!existing) {
      throw new Error(`Protocol not found: ${protocolId}`);
    }

    const updated = { ...existing };
    updated.criteria = [...updated.criteria, criterion];
    this.customCriteria.set(protocolId, updated);
  }

  /**
   * Get all supported protocols
   */
  getSupportedProtocols() {
    return Object.keys(PROTOCOL_CRITERIA);
  }

  // ===========================================================================
  // ELIGIBILITY CHECKING
  // ===========================================================================

  /**
   * Check eligibility for a wallet/protocol
   */
  async checkEligibility(walletAddress, protocolId, activityData) {
    const normalized = walletAddress.toLowerCase();

    this.stats.checksPerformed++;

    // Get criteria
    const protocolCriteria = this.getCriteria(protocolId);
    if (!protocolCriteria) {
      throw new Error(`Unsupported protocol: ${protocolId}`);
    }

    // Check cache
    const cacheKey = `${normalized}:${protocolId}`;
    const cached = this.resultsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached;
    }

    // Evaluate all criteria
    const criteriaResults = [];
    let hardMet = 0;
    let hardTotal = 0;
    let softMet = 0;
    let softTotal = 0;
    const exclusions = [];
    const bonuses = [];

    for (const criterion of protocolCriteria.criteria) {
      const result = this.evaluateCriterion(criterion, activityData);
      criteriaResults.push(result);

      switch (criterion.type) {
        case CRITERION_TYPE.HARD:
          hardTotal++;
          if (result.passed) hardMet++;
          break;
        case CRITERION_TYPE.SOFT:
          softTotal++;
          if (result.passed) softMet++;
          break;
        case CRITERION_TYPE.EXCLUSION:
          if (!result.passed) {
            exclusions.push({
              criterion: criterion.id,
              reason: criterion.description,
            });
          }
          break;
        case CRITERION_TYPE.BONUS:
          if (result.passed) {
            bonuses.push({
              criterion: criterion.id,
              description: criterion.description,
            });
          }
          break;
      }
    }

    // Determine status
    let status;
    const isExcluded = exclusions.length > 0;

    if (isExcluded) {
      status = ELIGIBILITY_STATUS.EXCLUDED;
      this.stats.excludedFound++;
    } else if (hardMet === hardTotal) {
      status = ELIGIBILITY_STATUS.ELIGIBLE;
      this.stats.eligibleFound++;
    } else if (hardMet > 0) {
      status = ELIGIBILITY_STATUS.PARTIALLY_ELIGIBLE;
    } else {
      status = ELIGIBILITY_STATUS.NOT_ELIGIBLE;
    }

    // Calculate score
    const score = this.calculateScore(criteriaResults, protocolCriteria.criteria);

    // Generate recommendations
    const recommendations = this.generateRecommendations(criteriaResults, activityData);

    // Create result
    const result = new EligibilityResult({
      walletAddress: normalized,
      protocol: protocolId,
      status,
      score,
      confidence: protocolCriteria.confidence,
      criteriaResults,
      hardRequirementsMet: hardMet,
      hardRequirementsTotal: hardTotal,
      softRequirementsMet: softMet,
      softRequirementsTotal: softTotal,
      exclusions,
      isExcluded,
      bonuses,
      recommendations,
      activityData,
    });

    // Cache result
    this.resultsCache.set(cacheKey, result);

    this.emit('eligibilityChecked', result.toJSON());

    return result;
  }

  /**
   * Evaluate a single criterion
   */
  evaluateCriterion(criterion, activityData) {
    const actualValue = activityData[criterion.field];
    let passed = false;

    switch (criterion.operator) {
      case OPERATORS.GTE:
        passed = actualValue >= criterion.value;
        break;
      case OPERATORS.GT:
        passed = actualValue > criterion.value;
        break;
      case OPERATORS.LTE:
        passed = actualValue <= criterion.value;
        break;
      case OPERATORS.LT:
        passed = actualValue < criterion.value;
        break;
      case OPERATORS.EQ:
        passed = actualValue === criterion.value;
        break;
      case OPERATORS.NEQ:
        passed = actualValue !== criterion.value;
        break;
      case OPERATORS.IN:
        passed = Array.isArray(criterion.value) && criterion.value.includes(actualValue);
        break;
      case OPERATORS.NOT_IN:
        passed = Array.isArray(criterion.value) && !criterion.value.includes(actualValue);
        break;
      case OPERATORS.EXISTS:
        passed = actualValue !== undefined && actualValue !== null;
        break;
      case OPERATORS.BETWEEN:
        passed = actualValue >= criterion.value[0] && actualValue <= criterion.value[1];
        break;
      default:
        this.config.logger.warn?.(`Unknown operator: ${criterion.operator}`);
    }

    // For exclusion criteria, the logic is inverted
    // (we want to pass if NOT excluded)
    if (criterion.type === CRITERION_TYPE.EXCLUSION) {
      passed = !passed || actualValue === undefined;
    }

    return {
      criterion,
      passed,
      actualValue,
      deficit: !passed ? this.calculateDeficit(criterion, actualValue) : 0,
    };
  }

  /**
   * Calculate deficit (how much is missing)
   */
  calculateDeficit(criterion, actualValue) {
    if ([OPERATORS.GTE, OPERATORS.GT].includes(criterion.operator)) {
      return Math.max(0, criterion.value - (actualValue || 0));
    }
    return 0;
  }

  /**
   * Calculate overall score
   */
  calculateScore(criteriaResults, criteria) {
    let totalScore = 0;
    let maxScore = 0;

    for (const result of criteriaResults) {
      const criterion = result.criterion;

      // Skip exclusions in scoring
      if (criterion.type === CRITERION_TYPE.EXCLUSION) continue;

      maxScore += criterion.weight;

      if (result.passed) {
        // Full weight for meeting criterion
        totalScore += criterion.weight;
      } else if (result.actualValue !== undefined && criterion.value > 0) {
        // Partial credit for progress toward criterion
        const progress = Math.min(result.actualValue / criterion.value, 1);
        totalScore += criterion.weight * progress * 0.5; // Max 50% for partial
      }
    }

    return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(criteriaResults, activityData) {
    const recommendations = [];

    // Find missing hard requirements first
    const missingHard = criteriaResults.filter(
      r => !r.passed && r.criterion.type === CRITERION_TYPE.HARD
    );

    for (const result of missingHard) {
      recommendations.push({
        priority: 'high',
        criterion: result.criterion.id,
        action: this.getRecommendedAction(result.criterion, result.actualValue),
        deficit: result.deficit,
        impact: 'Required for eligibility',
      });
    }

    // Then missing soft requirements
    const missingSoft = criteriaResults.filter(
      r => !r.passed && r.criterion.type === CRITERION_TYPE.SOFT
    );

    for (const result of missingSoft) {
      recommendations.push({
        priority: 'medium',
        criterion: result.criterion.id,
        action: this.getRecommendedAction(result.criterion, result.actualValue),
        deficit: result.deficit,
        impact: 'Improves allocation',
      });
    }

    // Sort by priority and impact
    recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  /**
   * Get recommended action for a criterion
   */
  getRecommendedAction(criterion, actualValue) {
    const current = actualValue || 0;
    const target = criterion.value;
    const deficit = Math.max(0, target - current);

    // Generate specific action based on field
    switch (criterion.field) {
      case 'transactions':
        return `Execute ${deficit} more transactions`;
      case 'volumeUSD':
        return `Increase volume by $${deficit.toFixed(2)}`;
      case 'bridgeVolume':
        return `Bridge $${deficit.toFixed(2)} more`;
      case 'uniqueContracts':
        return `Interact with ${deficit} more contracts`;
      case 'uniqueChains':
        return `Use ${deficit} more chains`;
      case 'messagesSent':
        return `Send ${deficit} more cross-chain messages`;
      case 'activeMonths':
        return `Stay active for ${deficit} more months`;
      case 'activeWeeks':
        return `Stay active for ${deficit} more weeks`;
      case 'daysActive':
        return `Be active on ${deficit} more days`;
      case 'dexSwaps':
        return `Execute ${deficit} more DEX swaps`;
      case 'nftMints':
        return `Mint ${deficit} more NFTs`;
      case 'stakedETH':
        return `Stake ${deficit.toFixed(4)} more ETH`;
      default:
        return `Increase ${criterion.field} from ${current} to ${target}`;
    }
  }

  // ===========================================================================
  // BATCH OPERATIONS
  // ===========================================================================

  /**
   * Check eligibility for multiple wallets
   */
  async checkMultipleWallets(walletAddresses, protocolId, activityDataByWallet) {
    const results = {};

    for (const wallet of walletAddresses) {
      try {
        const activityData = activityDataByWallet[wallet.toLowerCase()] || {};
        results[wallet.toLowerCase()] = await this.checkEligibility(wallet, protocolId, activityData);
      } catch (error) {
        this.config.logger.warn?.(`Failed to check ${wallet}: ${error.message}`);
        results[wallet.toLowerCase()] = null;
      }
    }

    return results;
  }

  /**
   * Check eligibility for multiple protocols
   */
  async checkMultipleProtocols(walletAddress, protocolIds, activityDataByProtocol) {
    const results = {};

    for (const protocolId of protocolIds) {
      try {
        const activityData = activityDataByProtocol[protocolId] || {};
        results[protocolId] = await this.checkEligibility(walletAddress, protocolId, activityData);
      } catch (error) {
        this.config.logger.warn?.(`Failed to check ${protocolId}: ${error.message}`);
        results[protocolId] = null;
      }
    }

    return results;
  }

  /**
   * Check all protocols for a wallet
   */
  async checkAllProtocols(walletAddress, activityDataByProtocol = {}) {
    const protocols = this.getSupportedProtocols();
    return this.checkMultipleProtocols(walletAddress, protocols, activityDataByProtocol);
  }

  // ===========================================================================
  // ANALYSIS
  // ===========================================================================

  /**
   * Get eligibility summary across wallets
   */
  getEligibilitySummary(results) {
    const summary = {
      total: 0,
      eligible: 0,
      partiallyEligible: 0,
      notEligible: 0,
      excluded: 0,
      averageScore: 0,
      byProtocol: {},
    };

    let totalScore = 0;

    for (const [wallet, protocolResults] of Object.entries(results)) {
      for (const [protocol, result] of Object.entries(protocolResults)) {
        if (!result) continue;

        summary.total++;
        totalScore += result.score;

        switch (result.status) {
          case ELIGIBILITY_STATUS.ELIGIBLE:
            summary.eligible++;
            break;
          case ELIGIBILITY_STATUS.PARTIALLY_ELIGIBLE:
            summary.partiallyEligible++;
            break;
          case ELIGIBILITY_STATUS.NOT_ELIGIBLE:
            summary.notEligible++;
            break;
          case ELIGIBILITY_STATUS.EXCLUDED:
            summary.excluded++;
            break;
        }

        if (!summary.byProtocol[protocol]) {
          summary.byProtocol[protocol] = { eligible: 0, total: 0 };
        }
        summary.byProtocol[protocol].total++;
        if (result.status === ELIGIBILITY_STATUS.ELIGIBLE) {
          summary.byProtocol[protocol].eligible++;
        }
      }
    }

    summary.averageScore = summary.total > 0 ? Math.round(totalScore / summary.total) : 0;

    return summary;
  }

  /**
   * Find wallets closest to eligibility
   */
  findClosestToEligible(results, limit = 5) {
    const candidates = [];

    for (const [wallet, protocolResults] of Object.entries(results)) {
      for (const [protocol, result] of Object.entries(protocolResults)) {
        if (!result) continue;
        if (result.status === ELIGIBILITY_STATUS.PARTIALLY_ELIGIBLE) {
          candidates.push({
            wallet,
            protocol,
            score: result.score,
            progress: result.getProgress(),
            missingCount: result.getMissingCriteria().length,
          });
        }
      }
    }

    return candidates
      .sort((a, b) => b.progress - a.progress)
      .slice(0, limit);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Clear cache
   */
  clearCache(walletAddress = null, protocolId = null) {
    if (walletAddress && protocolId) {
      this.resultsCache.delete(`${walletAddress.toLowerCase()}:${protocolId}`);
    } else if (walletAddress) {
      for (const key of this.resultsCache.keys()) {
        if (key.startsWith(walletAddress.toLowerCase())) {
          this.resultsCache.delete(key);
        }
      }
    } else {
      this.resultsCache.clear();
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      cachedResults: this.resultsCache.size,
      supportedProtocols: this.getSupportedProtocols().length,
      customCriteria: this.customCriteria.size,
    };
  }

  /**
   * Generate report for a wallet
   */
  generateReport(walletAddress, results) {
    const normalized = walletAddress.toLowerCase();

    const report = {
      wallet: normalized,
      generatedAt: Date.now(),
      summary: {
        totalProtocols: 0,
        eligibleCount: 0,
        overallScore: 0,
      },
      protocols: {},
      topRecommendations: [],
    };

    let totalScore = 0;

    for (const [protocol, result] of Object.entries(results)) {
      if (!result) continue;

      report.summary.totalProtocols++;
      totalScore += result.score;

      if (result.isEligible()) {
        report.summary.eligibleCount++;
      }

      report.protocols[protocol] = {
        status: result.status,
        score: result.score,
        progress: result.getProgress(),
        isEligible: result.isEligible(),
        recommendations: result.recommendations,
      };

      // Collect recommendations
      for (const rec of result.recommendations) {
        report.topRecommendations.push({
          protocol,
          ...rec,
        });
      }
    }

    report.summary.overallScore = report.summary.totalProtocols > 0
      ? Math.round(totalScore / report.summary.totalProtocols)
      : 0;

    // Sort and limit recommendations
    report.topRecommendations = report.topRecommendations
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, 10);

    return report;
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  EligibilityChecker,
  EligibilityResult,
  CRITERION_TYPE,
  OPERATORS,
  ELIGIBILITY_STATUS,
  PROTOCOL_CRITERIA,

  // Factory
  createEligibilityChecker: (config = {}) => new EligibilityChecker(config),
};
