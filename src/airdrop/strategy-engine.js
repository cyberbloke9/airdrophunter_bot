'use strict';

/**
 * Airdrop Strategy Engine - Pluggable Strategy System
 *
 * Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * THE 6 W's: PLUGGABLE STRATEGY SYSTEM
 * =============================================================================
 *
 * WHO:
 * ----
 * WHO uses this system:
 * - AIRDROP FARMERS: Users farming multiple protocols for potential airdrops
 *   - Need to maintain activity across LayerZero, zkSync, Scroll, etc.
 *   - Want to maximize eligibility while minimizing detection
 *   - Require automation due to number of wallets/protocols
 *
 * - PROTOCOL TEAMS: Those analyzing airdrop eligibility
 *   - LayerZero: Used on-chain clustering to identify 1.1M+ Sybil wallets
 *   - zkSync: Faced backlash for poor filtering (39% token drop)
 *   - Starknet: Used temporal analysis to detect bot patterns
 *
 * WHO are we trying to avoid:
 * - SYBIL HUNTERS: Researchers identifying fake users
 *   - Use graph analysis (wallet connections via funding)
 *   - Use temporal analysis (same-time transactions)
 *   - Use behavioral analysis (identical action sequences)
 *
 * WHAT:
 * -----
 * WHAT is a strategy:
 * A strategy is a **pluggable module** that defines:
 * 1. PROTOCOL: Which protocol(s) it targets
 * 2. ACTIONS: What activities count toward eligibility
 * 3. WEIGHTS: How important each action is
 * 4. FREQUENCY: How often to perform actions
 * 5. CONSTRAINTS: Minimum amounts, required sequences
 *
 * WHAT actions are valuable for airdrops:
 *
 * | Action Type | Typical Weight | Why It Matters |
 * |-------------|----------------|----------------|
 * | Bridge      | HIGH (2.0x)    | Cross-chain = real usage |
 * | Swap        | MEDIUM (1.0x)  | Basic DeFi activity |
 * | Provide LP  | HIGH (2.5x)    | Capital commitment |
 * | Stake       | HIGH (2.0x)    | Long-term commitment |
 * | Governance  | HIGHEST (3.0x) | Community participation |
 * | NFT Mint    | LOW (0.5x)     | Often spam-farmed |
 * | Contract Deploy | HIGH (2.0x)| Developer activity |
 *
 * WHAT makes a good strategy:
 * - Diverse actions (not just swaps)
 * - Reasonable amounts (not dust transactions)
 * - Organic timing (not clockwork precision)
 * - Multiple protocols (not single-protocol farming)
 *
 * WHEN:
 * -----
 * WHEN to use different strategies:
 *
 * PRE-SNAPSHOT (Unknown):
 * - Maintain consistent, diverse activity
 * - Don't spike activity right before rumored snapshots
 * - Build 6+ months of organic-looking history
 *
 * POST-ANNOUNCEMENT:
 * - Too late for new wallets
 * - May help existing wallets with continued activity
 * - Focus on meeting minimum criteria
 *
 * WHEN strategies are executed:
 * - Random times within allowed windows (avoid patterns)
 * - Variable intervals (not exactly every 24 hours)
 * - Natural breaks (humans don't farm at 3 AM consistently)
 *
 * WHERE:
 * ------
 * WHERE strategies apply (by chain/protocol):
 *
 * | Protocol | Chain(s) | Key Activities |
 * |----------|----------|----------------|
 * | LayerZero | Multi | Bridge, message passing |
 * | zkSync | zkSync Era | Swaps, LP, NFTs |
 * | Scroll | Scroll | Bridge, swaps, deploy |
 * | Linea | Linea | Bridge, swaps, LP |
 * | Base | Base | Swaps, LP, social |
 * | Starknet | Starknet | Bridge, swaps, gaming |
 * | Arbitrum | Arbitrum | Swaps, LP, governance |
 *
 * WHERE strategies are stored:
 * - In-memory registry for fast lookup
 * - Persistent storage for user customizations
 * - Versioned for rollback capability
 *
 * WHY:
 * ----
 * WHY we need pluggable strategies:
 *
 * 1. EVOLVING CRITERIA: Airdrop rules change constantly
 *    - 2022: TX count was king
 *    - 2023: Protocol diversity emerged
 *    - 2024: Points systems, LP requirements
 *    - 2025+: Unknown, must adapt quickly
 *
 * 2. PROTOCOL SPECIFICITY: Each protocol values different things
 *    - LayerZero cares about cross-chain bridging
 *    - zkSync cares about native ecosystem usage
 *    - Some care about governance participation
 *
 * 3. RISK MANAGEMENT: Different users have different risk tolerances
 *    - Conservative: Slow, steady, highly organic
 *    - Moderate: Balanced activity with some automation
 *    - Aggressive: High activity, higher detection risk
 *
 * WHY strategies help avoid Sybil detection:
 * - Varied actions break behavioral clustering
 * - Organic timing breaks temporal clustering
 * - Different amounts break value clustering
 * - Protocol diversity shows real user behavior
 *
 * HOW:
 * ----
 * HOW strategies are structured:
 *
 * ```javascript
 * const exampleStrategy = {
 *   name: 'layerzero-organic',
 *   version: '1.0.0',
 *   protocols: ['layerzero', 'stargate'],
 *   chains: [1, 42161, 10, 137],
 *
 *   actions: {
 *     bridge: {
 *       weight: 2.0,
 *       minAmount: 0.01,     // ETH equivalent
 *       maxAmount: 1.0,
 *       frequency: { min: 3, max: 7, unit: 'days' },
 *     },
 *     swap: {
 *       weight: 1.0,
 *       minAmount: 0.005,
 *       maxAmount: 0.5,
 *       frequency: { min: 1, max: 3, unit: 'days' },
 *     },
 *   },
 *
 *   scheduling: {
 *     timezone: 'America/New_York',
 *     activeHours: { start: 8, end: 23 }, // Human hours
 *     variance: 0.3, // 30% timing variance
 *   },
 *
 *   execute: async (wallet, action, params) => { ... },
 * };
 * ```
 *
 * HOW the engine works:
 * 1. Strategies register with the engine
 * 2. Scheduler requests next action for wallet
 * 3. Engine selects strategy based on wallet profile
 * 4. Randomizer adds human-like variance
 * 5. Action is executed and logged
 * 6. Results feed back into next scheduling decision
 *
 * =============================================================================
 */

const EventEmitter = require('events');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Action types with default weights
 *
 * WHY these weights:
 * - Based on analysis of successful airdrop criteria from:
 *   LayerZero, zkSync, Arbitrum, Optimism, Blur, etc.
 * - Higher weight = more valuable for eligibility
 */
const ACTION_TYPES = {
  BRIDGE: {
    name: 'bridge',
    defaultWeight: 2.0,
    description: 'Cross-chain asset transfer',
    sybilRisk: 'low', // Hard to fake meaningful bridge volume
  },
  SWAP: {
    name: 'swap',
    defaultWeight: 1.0,
    description: 'Token exchange on DEX',
    sybilRisk: 'medium', // Easy to spam, but common activity
  },
  LIQUIDITY: {
    name: 'liquidity',
    defaultWeight: 2.5,
    description: 'Provide liquidity to pools',
    sybilRisk: 'low', // Requires capital commitment
  },
  STAKE: {
    name: 'stake',
    defaultWeight: 2.0,
    description: 'Stake tokens for rewards',
    sybilRisk: 'low', // Time + capital commitment
  },
  GOVERNANCE: {
    name: 'governance',
    defaultWeight: 3.0,
    description: 'Vote on proposals',
    sybilRisk: 'very_low', // Requires engagement + holding
  },
  LEND: {
    name: 'lend',
    defaultWeight: 2.0,
    description: 'Supply assets to lending protocol',
    sybilRisk: 'low', // Capital at risk
  },
  BORROW: {
    name: 'borrow',
    defaultWeight: 2.0,
    description: 'Borrow from lending protocol',
    sybilRisk: 'low', // Requires collateral
  },
  NFT_MINT: {
    name: 'nft_mint',
    defaultWeight: 0.5,
    description: 'Mint NFT',
    sybilRisk: 'high', // Often spam-farmed
  },
  NFT_TRADE: {
    name: 'nft_trade',
    defaultWeight: 1.0,
    description: 'Trade NFT on marketplace',
    sybilRisk: 'medium', // Can be wash-traded
  },
  CONTRACT_DEPLOY: {
    name: 'contract_deploy',
    defaultWeight: 2.0,
    description: 'Deploy smart contract',
    sybilRisk: 'low', // Developer activity signal
  },
  SOCIAL: {
    name: 'social',
    defaultWeight: 1.5,
    description: 'Social protocol interaction (Lens, Farcaster)',
    sybilRisk: 'medium', // Can be botted but valuable
  },
};

/**
 * Protocol categories
 *
 * WHY categorize:
 * - Different protocols have different activity profiles
 * - Helps ensure diversity across categories
 */
const PROTOCOL_CATEGORIES = {
  BRIDGE: 'bridge',
  DEX: 'dex',
  LENDING: 'lending',
  PERPETUALS: 'perpetuals',
  NFT: 'nft',
  SOCIAL: 'social',
  GAMING: 'gaming',
  INFRASTRUCTURE: 'infrastructure',
};

/**
 * Strategy risk profiles
 *
 * WHY risk profiles:
 * - Different users have different detection tolerances
 * - Conservative = safer but slower
 * - Aggressive = faster but higher detection risk
 */
const RISK_PROFILES = {
  CONSERVATIVE: {
    name: 'conservative',
    description: 'Slow, steady, highly organic patterns',
    activityMultiplier: 0.5, // 50% of normal activity
    varianceMultiplier: 1.5, // 50% more timing variance
    minIntervalDays: 3,
  },
  MODERATE: {
    name: 'moderate',
    description: 'Balanced activity with reasonable variance',
    activityMultiplier: 1.0,
    varianceMultiplier: 1.0,
    minIntervalDays: 1,
  },
  AGGRESSIVE: {
    name: 'aggressive',
    description: 'High activity, higher detection risk',
    activityMultiplier: 2.0,
    varianceMultiplier: 0.5, // Less variance (more activity)
    minIntervalDays: 0.5,
  },
};

/**
 * Default strategy template
 */
const DEFAULT_STRATEGY_TEMPLATE = {
  version: '1.0.0',
  protocols: [],
  chains: [],
  actions: {},
  scheduling: {
    timezone: 'UTC',
    activeHours: { start: 6, end: 24 },
    activeDays: [0, 1, 2, 3, 4, 5, 6], // All days
    variance: 0.25,
  },
  constraints: {
    minTotalActions: 10, // Minimum actions per month
    maxDailyActions: 5,
    minDaysBetweenSameAction: 1,
  },
};

// =============================================================================
// STRATEGY CLASS
// =============================================================================

/**
 * Represents a single airdrop farming strategy
 */
class Strategy {
  constructor(config) {
    this.name = config.name;
    this.version = config.version || '1.0.0';
    this.description = config.description || '';
    this.protocols = config.protocols || [];
    this.chains = config.chains || [];
    this.category = config.category || 'general';
    this.riskProfile = config.riskProfile || RISK_PROFILES.MODERATE;

    // Actions configuration
    this.actions = new Map();
    if (config.actions) {
      for (const [actionName, actionConfig] of Object.entries(config.actions)) {
        this.actions.set(actionName, {
          ...ACTION_TYPES[actionName.toUpperCase()] || { name: actionName, defaultWeight: 1.0 },
          ...actionConfig,
        });
      }
    }

    // Scheduling configuration
    this.scheduling = {
      ...DEFAULT_STRATEGY_TEMPLATE.scheduling,
      ...config.scheduling,
    };

    // Constraints
    this.constraints = {
      ...DEFAULT_STRATEGY_TEMPLATE.constraints,
      ...config.constraints,
    };

    // Execution function
    this.executeFn = config.execute || null;

    // Validation function
    this.validateFn = config.validate || null;

    // Metadata
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.enabled = config.enabled ?? true;
  }

  /**
   * Get action configuration
   */
  getAction(actionName) {
    return this.actions.get(actionName);
  }

  /**
   * Get all actions sorted by weight
   */
  getActionsByWeight() {
    return Array.from(this.actions.entries())
      .map(([name, config]) => ({ name, ...config }))
      .sort((a, b) => (b.weight || b.defaultWeight) - (a.weight || a.defaultWeight));
  }

  /**
   * Check if action is available
   */
  hasAction(actionName) {
    return this.actions.has(actionName);
  }

  /**
   * Validate strategy configuration
   */
  validate() {
    const errors = [];

    if (!this.name) {
      errors.push('Strategy must have a name');
    }

    if (this.protocols.length === 0) {
      errors.push('Strategy must target at least one protocol');
    }

    if (this.chains.length === 0) {
      errors.push('Strategy must support at least one chain');
    }

    if (this.actions.size === 0) {
      errors.push('Strategy must define at least one action');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      protocols: this.protocols,
      chains: this.chains,
      category: this.category,
      riskProfile: this.riskProfile.name,
      actions: Object.fromEntries(this.actions),
      scheduling: this.scheduling,
      constraints: this.constraints,
      enabled: this.enabled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// =============================================================================
// STRATEGY ENGINE CLASS
// =============================================================================

/**
 * Main strategy engine - manages and executes strategies
 *
 * HOW to use:
 * 1. Create engine instance
 * 2. Register strategies (built-in or custom)
 * 3. Select strategy for wallet based on profile
 * 4. Get next action from strategy
 * 5. Execute action and record result
 */
class StrategyEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      maxStrategiesPerWallet: config.maxStrategiesPerWallet || 3,
      defaultRiskProfile: config.defaultRiskProfile || RISK_PROFILES.MODERATE,
    };

    // Strategy registry
    this.strategies = new Map(); // name -> Strategy

    // Wallet-strategy assignments
    this.walletStrategies = new Map(); // walletAddress -> Set<strategyName>

    // Execution history (for pattern analysis)
    this.executionHistory = new Map(); // walletAddress -> Array<ExecutionRecord>

    // Statistics
    this.stats = {
      strategiesRegistered: 0,
      actionsExecuted: 0,
      actionsByType: {},
      actionsByProtocol: {},
    };
  }

  // ===========================================================================
  // STRATEGY REGISTRATION
  // ===========================================================================

  /**
   * Register a new strategy
   *
   * @param {Object} config - Strategy configuration
   * @returns {Strategy} Registered strategy
   */
  registerStrategy(config) {
    const strategy = new Strategy(config);

    // Validate
    const validation = strategy.validate();
    if (!validation.valid) {
      throw new Error(`Invalid strategy: ${validation.errors.join(', ')}`);
    }

    // Check for duplicate
    if (this.strategies.has(strategy.name)) {
      this.config.logger.warn?.(`Overwriting existing strategy: ${strategy.name}`);
    }

    // Register
    this.strategies.set(strategy.name, strategy);
    this.stats.strategiesRegistered = this.strategies.size;

    this.emit('strategyRegistered', strategy.toJSON());
    this.config.logger.debug?.(`Registered strategy: ${strategy.name}`);

    return strategy;
  }

  /**
   * Unregister a strategy
   */
  unregisterStrategy(name) {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      return false;
    }

    this.strategies.delete(name);
    this.stats.strategiesRegistered = this.strategies.size;

    // Remove from wallet assignments
    for (const [wallet, strategies] of this.walletStrategies) {
      strategies.delete(name);
    }

    this.emit('strategyUnregistered', { name });
    return true;
  }

  /**
   * Get strategy by name
   */
  getStrategy(name) {
    return this.strategies.get(name);
  }

  /**
   * Get all registered strategies
   */
  getAllStrategies() {
    return Array.from(this.strategies.values());
  }

  /**
   * Get strategies by protocol
   */
  getStrategiesByProtocol(protocol) {
    return this.getAllStrategies().filter(s =>
      s.protocols.includes(protocol.toLowerCase())
    );
  }

  /**
   * Get strategies by chain
   */
  getStrategiesByChain(chainId) {
    return this.getAllStrategies().filter(s =>
      s.chains.includes(chainId)
    );
  }

  // ===========================================================================
  // WALLET-STRATEGY MANAGEMENT
  // ===========================================================================

  /**
   * Assign strategy to wallet
   */
  assignStrategy(walletAddress, strategyName) {
    const normalizedAddress = walletAddress.toLowerCase();
    const strategy = this.strategies.get(strategyName);

    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyName}`);
    }

    let walletStrategies = this.walletStrategies.get(normalizedAddress);
    if (!walletStrategies) {
      walletStrategies = new Set();
      this.walletStrategies.set(normalizedAddress, walletStrategies);
    }

    if (walletStrategies.size >= this.config.maxStrategiesPerWallet) {
      throw new Error(`Wallet already has maximum strategies (${this.config.maxStrategiesPerWallet})`);
    }

    walletStrategies.add(strategyName);

    this.emit('strategyAssigned', {
      wallet: normalizedAddress,
      strategy: strategyName,
    });

    return true;
  }

  /**
   * Remove strategy from wallet
   */
  removeStrategy(walletAddress, strategyName) {
    const normalizedAddress = walletAddress.toLowerCase();
    const walletStrategies = this.walletStrategies.get(normalizedAddress);

    if (!walletStrategies) {
      return false;
    }

    return walletStrategies.delete(strategyName);
  }

  /**
   * Get strategies assigned to wallet
   */
  getWalletStrategies(walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    const strategyNames = this.walletStrategies.get(normalizedAddress);

    if (!strategyNames) {
      return [];
    }

    return Array.from(strategyNames)
      .map(name => this.strategies.get(name))
      .filter(Boolean);
  }

  // ===========================================================================
  // ACTION SELECTION
  // ===========================================================================

  /**
   * Select next action for wallet
   *
   * HOW action selection works:
   * 1. Get wallet's assigned strategies
   * 2. Check execution history for cooldowns
   * 3. Weight actions by importance and recency
   * 4. Apply randomization
   * 5. Return selected action
   */
  selectNextAction(walletAddress, options = {}) {
    const normalizedAddress = walletAddress.toLowerCase();
    const strategies = this.getWalletStrategies(normalizedAddress);

    if (strategies.length === 0) {
      return null;
    }

    // Get execution history
    const history = this.executionHistory.get(normalizedAddress) || [];
    const recentActions = history.filter(h =>
      Date.now() - h.timestamp < 7 * 24 * 60 * 60 * 1000 // Last 7 days
    );

    // Build candidate actions from all strategies
    const candidates = [];

    for (const strategy of strategies) {
      if (!strategy.enabled) continue;

      for (const [actionName, actionConfig] of strategy.actions) {
        // Check cooldown
        const lastExecution = recentActions.find(h =>
          h.action === actionName && h.strategy === strategy.name
        );

        const cooldownMs = (actionConfig.frequency?.min || 1) * 24 * 60 * 60 * 1000;
        if (lastExecution && Date.now() - lastExecution.timestamp < cooldownMs) {
          continue; // Still in cooldown
        }

        // Calculate score
        const weight = actionConfig.weight || actionConfig.defaultWeight || 1.0;
        const recencyBonus = lastExecution
          ? Math.min(1, (Date.now() - lastExecution.timestamp) / (7 * 24 * 60 * 60 * 1000))
          : 1.5; // Bonus for never-executed actions

        const score = weight * recencyBonus;

        candidates.push({
          strategy: strategy.name,
          action: actionName,
          config: actionConfig,
          score,
          protocols: strategy.protocols,
          chains: strategy.chains,
        });
      }
    }

    if (candidates.length === 0) {
      return null; // All actions in cooldown
    }

    // Weighted random selection
    const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
    let random = Math.random() * totalScore;

    for (const candidate of candidates) {
      random -= candidate.score;
      if (random <= 0) {
        return candidate;
      }
    }

    // Fallback to highest score
    return candidates.sort((a, b) => b.score - a.score)[0];
  }

  /**
   * Get action recommendations for wallet
   *
   * Returns prioritized list of recommended actions
   */
  getRecommendations(walletAddress, count = 5) {
    const normalizedAddress = walletAddress.toLowerCase();
    const strategies = this.getWalletStrategies(normalizedAddress);

    if (strategies.length === 0) {
      return [];
    }

    const history = this.executionHistory.get(normalizedAddress) || [];
    const recommendations = [];

    for (const strategy of strategies) {
      if (!strategy.enabled) continue;

      for (const [actionName, actionConfig] of strategy.actions) {
        const lastExecution = history.find(h =>
          h.action === actionName && h.strategy === strategy.name
        );

        const daysSinceExecution = lastExecution
          ? (Date.now() - lastExecution.timestamp) / (24 * 60 * 60 * 1000)
          : Infinity;

        const idealFrequency = (actionConfig.frequency?.min || 1 +
          actionConfig.frequency?.max || 7) / 2;

        const urgency = daysSinceExecution / idealFrequency;

        recommendations.push({
          strategy: strategy.name,
          action: actionName,
          protocols: strategy.protocols,
          chains: strategy.chains,
          weight: actionConfig.weight || actionConfig.defaultWeight,
          daysSinceExecution: Math.floor(daysSinceExecution),
          urgency,
          reason: daysSinceExecution === Infinity
            ? 'Never executed'
            : urgency > 1
              ? `Overdue (${Math.floor(daysSinceExecution)} days since last)`
              : 'Regular cadence',
        });
      }
    }

    return recommendations
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, count);
  }

  // ===========================================================================
  // EXECUTION TRACKING
  // ===========================================================================

  /**
   * Record action execution
   */
  recordExecution(walletAddress, execution) {
    const normalizedAddress = walletAddress.toLowerCase();

    let history = this.executionHistory.get(normalizedAddress);
    if (!history) {
      history = [];
      this.executionHistory.set(normalizedAddress, history);
    }

    const record = {
      ...execution,
      timestamp: execution.timestamp || Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    history.push(record);

    // Trim old history (keep last 90 days)
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    this.executionHistory.set(
      normalizedAddress,
      history.filter(h => h.timestamp > cutoff)
    );

    // Update stats
    this.stats.actionsExecuted++;
    this.stats.actionsByType[execution.action] =
      (this.stats.actionsByType[execution.action] || 0) + 1;

    if (execution.protocol) {
      this.stats.actionsByProtocol[execution.protocol] =
        (this.stats.actionsByProtocol[execution.protocol] || 0) + 1;
    }

    this.emit('executionRecorded', record);

    return record;
  }

  /**
   * Get execution history for wallet
   */
  getExecutionHistory(walletAddress, options = {}) {
    const normalizedAddress = walletAddress.toLowerCase();
    let history = this.executionHistory.get(normalizedAddress) || [];

    // Filter by date range
    if (options.since) {
      history = history.filter(h => h.timestamp >= options.since);
    }
    if (options.until) {
      history = history.filter(h => h.timestamp <= options.until);
    }

    // Filter by strategy
    if (options.strategy) {
      history = history.filter(h => h.strategy === options.strategy);
    }

    // Filter by action
    if (options.action) {
      history = history.filter(h => h.action === options.action);
    }

    return history;
  }

  // ===========================================================================
  // ANALYTICS
  // ===========================================================================

  /**
   * Analyze wallet activity patterns
   *
   * WHY this matters:
   * - Identifies patterns that Sybil hunters look for
   * - Helps adjust strategies to appear more organic
   */
  analyzePatterns(walletAddress) {
    const history = this.getExecutionHistory(walletAddress);

    if (history.length < 5) {
      return { sufficient: false, message: 'Not enough history for analysis' };
    }

    // Analyze timing patterns
    const hourDistribution = new Array(24).fill(0);
    const dayDistribution = new Array(7).fill(0);
    const intervals = [];

    for (let i = 0; i < history.length; i++) {
      const date = new Date(history[i].timestamp);
      hourDistribution[date.getHours()]++;
      dayDistribution[date.getDay()]++;

      if (i > 0) {
        intervals.push(history[i].timestamp - history[i - 1].timestamp);
      }
    }

    // Calculate metrics
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const intervalVariance = intervals.reduce((sum, i) =>
      sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    const intervalStdDev = Math.sqrt(intervalVariance);

    // Check for suspicious patterns
    const warnings = [];

    // Too regular intervals (bot-like)
    const coefficientOfVariation = intervalStdDev / avgInterval;
    if (coefficientOfVariation < 0.2) {
      warnings.push({
        type: 'timing_regularity',
        severity: 'high',
        message: 'Transaction timing is too regular - appears automated',
      });
    }

    // Concentrated hours (not human-like)
    const maxHourPct = Math.max(...hourDistribution) / history.length;
    if (maxHourPct > 0.4) {
      warnings.push({
        type: 'hour_concentration',
        severity: 'medium',
        message: 'Too many transactions in same hour of day',
      });
    }

    // Action diversity
    const actionCounts = {};
    for (const h of history) {
      actionCounts[h.action] = (actionCounts[h.action] || 0) + 1;
    }
    const uniqueActions = Object.keys(actionCounts).length;

    if (uniqueActions < 3) {
      warnings.push({
        type: 'action_diversity',
        severity: 'medium',
        message: 'Low action diversity - consider varying activity types',
      });
    }

    return {
      sufficient: true,
      totalActions: history.length,
      uniqueActions,
      avgIntervalHours: avgInterval / (60 * 60 * 1000),
      intervalVariation: coefficientOfVariation,
      hourDistribution,
      dayDistribution,
      actionDistribution: actionCounts,
      warnings,
      score: Math.max(0, 100 - warnings.length * 25),
    };
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get engine statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      walletsTracked: this.walletStrategies.size,
      strategiesEnabled: this.getAllStrategies().filter(s => s.enabled).length,
    };
  }

  /**
   * Get strategy performance stats
   */
  getStrategyStats(strategyName) {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) return null;

    let totalExecutions = 0;
    let walletsUsing = 0;

    for (const [wallet, strategies] of this.walletStrategies) {
      if (strategies.has(strategyName)) {
        walletsUsing++;

        const history = this.executionHistory.get(wallet) || [];
        totalExecutions += history.filter(h => h.strategy === strategyName).length;
      }
    }

    return {
      strategy: strategyName,
      walletsUsing,
      totalExecutions,
      enabled: strategy.enabled,
    };
  }
}

// =============================================================================
// BUILT-IN STRATEGIES
// =============================================================================

/**
 * Create built-in strategies for common protocols
 */
function createBuiltInStrategies() {
  return [
    // LayerZero Strategy
    {
      name: 'layerzero-organic',
      version: '1.0.0',
      description: 'Organic LayerZero activity for potential airdrop',
      protocols: ['layerzero', 'stargate'],
      chains: [1, 42161, 10, 137, 43114, 56],
      category: PROTOCOL_CATEGORIES.BRIDGE,
      actions: {
        bridge: {
          weight: 2.5,
          minAmount: 0.01,
          maxAmount: 0.5,
          frequency: { min: 5, max: 14, unit: 'days' },
        },
        swap: {
          weight: 1.0,
          minAmount: 0.005,
          maxAmount: 0.2,
          frequency: { min: 2, max: 5, unit: 'days' },
        },
        liquidity: {
          weight: 2.0,
          minAmount: 0.05,
          maxAmount: 1.0,
          frequency: { min: 14, max: 30, unit: 'days' },
        },
      },
      scheduling: {
        timezone: 'UTC',
        activeHours: { start: 7, end: 23 },
        variance: 0.3,
      },
    },

    // zkSync Era Strategy
    {
      name: 'zksync-era-organic',
      version: '1.0.0',
      description: 'Organic zkSync Era activity',
      protocols: ['zksync', 'syncswap', 'mute', 'spacefi'],
      chains: [324], // zkSync Era
      category: PROTOCOL_CATEGORIES.DEX,
      actions: {
        bridge: {
          weight: 2.0,
          minAmount: 0.01,
          maxAmount: 0.3,
          frequency: { min: 7, max: 21, unit: 'days' },
        },
        swap: {
          weight: 1.5,
          minAmount: 0.005,
          maxAmount: 0.1,
          frequency: { min: 1, max: 4, unit: 'days' },
        },
        liquidity: {
          weight: 2.5,
          minAmount: 0.02,
          maxAmount: 0.5,
          frequency: { min: 14, max: 30, unit: 'days' },
        },
        nft_mint: {
          weight: 0.5,
          minAmount: 0,
          maxAmount: 0.01,
          frequency: { min: 7, max: 14, unit: 'days' },
        },
      },
      scheduling: {
        activeHours: { start: 8, end: 24 },
        variance: 0.25,
      },
    },

    // Base Strategy
    {
      name: 'base-organic',
      version: '1.0.0',
      description: 'Organic Base chain activity',
      protocols: ['base', 'aerodrome', 'baseswap'],
      chains: [8453], // Base
      category: PROTOCOL_CATEGORIES.DEX,
      actions: {
        bridge: {
          weight: 2.0,
          minAmount: 0.005,
          maxAmount: 0.2,
          frequency: { min: 7, max: 14, unit: 'days' },
        },
        swap: {
          weight: 1.5,
          minAmount: 0.002,
          maxAmount: 0.1,
          frequency: { min: 1, max: 3, unit: 'days' },
        },
        liquidity: {
          weight: 2.5,
          minAmount: 0.01,
          maxAmount: 0.3,
          frequency: { min: 14, max: 30, unit: 'days' },
        },
        social: {
          weight: 1.5,
          frequency: { min: 3, max: 7, unit: 'days' },
        },
      },
    },

    // Scroll Strategy
    {
      name: 'scroll-organic',
      version: '1.0.0',
      description: 'Organic Scroll activity for potential airdrop',
      protocols: ['scroll', 'syncswap', 'skydrome'],
      chains: [534352], // Scroll
      category: PROTOCOL_CATEGORIES.BRIDGE,
      actions: {
        bridge: {
          weight: 2.5,
          minAmount: 0.01,
          maxAmount: 0.3,
          frequency: { min: 7, max: 21, unit: 'days' },
        },
        swap: {
          weight: 1.5,
          minAmount: 0.005,
          maxAmount: 0.1,
          frequency: { min: 2, max: 5, unit: 'days' },
        },
        liquidity: {
          weight: 2.5,
          minAmount: 0.02,
          maxAmount: 0.5,
          frequency: { min: 14, max: 30, unit: 'days' },
        },
        contract_deploy: {
          weight: 2.0,
          frequency: { min: 30, max: 60, unit: 'days' },
        },
      },
    },

    // Linea Strategy
    {
      name: 'linea-organic',
      version: '1.0.0',
      description: 'Organic Linea activity',
      protocols: ['linea', 'syncswap', 'velocore'],
      chains: [59144], // Linea
      category: PROTOCOL_CATEGORIES.BRIDGE,
      actions: {
        bridge: {
          weight: 2.5,
          minAmount: 0.01,
          maxAmount: 0.3,
          frequency: { min: 7, max: 21, unit: 'days' },
        },
        swap: {
          weight: 1.5,
          minAmount: 0.005,
          maxAmount: 0.1,
          frequency: { min: 2, max: 5, unit: 'days' },
        },
        lend: {
          weight: 2.0,
          minAmount: 0.02,
          maxAmount: 0.3,
          frequency: { min: 14, max: 30, unit: 'days' },
        },
      },
    },
  ];
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  StrategyEngine,
  Strategy,
  ACTION_TYPES,
  PROTOCOL_CATEGORIES,
  RISK_PROFILES,
  DEFAULT_STRATEGY_TEMPLATE,
  createBuiltInStrategies,

  // Factory function
  createStrategyEngine: (config = {}) => {
    const engine = new StrategyEngine(config);

    // Register built-in strategies if requested
    if (config.includeBuiltIn !== false) {
      for (const strategyConfig of createBuiltInStrategies()) {
        engine.registerStrategy(strategyConfig);
      }
    }

    return engine;
  },
};
