'use strict';

/**
 * Activity Scheduling Engine
 *
 * Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * THE 6 W's: ACTIVITY SCHEDULING
 * =============================================================================
 *
 * WHO:
 * ----
 * WHO uses the scheduler:
 *
 * - AIRDROP FARMERS: Automate consistent activity
 *   - Can't manually maintain activity on 10+ protocols
 *   - Need sleep, work, life - bots don't
 *   - Want organic-looking patterns without 24/7 attention
 *
 * - MULTI-WALLET OPERATORS: Coordinate multiple wallets
 *   - Different schedules per wallet (critical for Sybil avoidance)
 *   - No temporal clustering across wallets
 *   - Resource management (gas, API limits)
 *
 * WHO the scheduler protects against:
 *
 * - TEMPORAL CLUSTERING DETECTION:
 *   ```
 *   Suspicious: Wallets A, B, C all transact at 10:00:00, 10:00:01, 10:00:02
 *   Organic:    Wallet A: 10:23, Wallet B: 14:51, Wallet C: 09:07
 *   ```
 *
 * - PATTERN DETECTION:
 *   ```
 *   Suspicious: Every wallet swaps exactly every 24 hours
 *   Organic:    Random intervals: 19h, 31h, 22h, 28h...
 *   ```
 *
 * WHAT:
 * -----
 * WHAT the scheduler does:
 *
 * | Function | Description |
 * |----------|-------------|
 * | Schedule Actions | Queue future activities with timing |
 * | Randomize Timing | Apply human-like variance |
 * | Manage Queues | Per-wallet action queues |
 * | Enforce Limits | Rate limits, cooldowns |
 * | Coordinate | Prevent cross-wallet clustering |
 * | Execute | Trigger actions at scheduled time |
 *
 * WHAT gets scheduled:
 *
 * | Type | Example | Timing |
 * |------|---------|--------|
 * | Swaps | ETH → USDC | Random 1-3 days |
 * | Bridges | Arb → Base | Random 5-14 days |
 * | LP Actions | Add/Remove | Random 14-30 days |
 * | Governance | Vote | On-demand (proposals) |
 * | Claims | Airdrops | ASAP when eligible |
 *
 * WHAT scheduling patterns we avoid:
 *
 * - EXACT INTERVALS: Every 24.00 hours → detected
 * - CLOCK TIMES: Always at 10:00 AM → detected
 * - BATCH PATTERNS: All wallets within same hour → detected
 * - SEQUENTIAL: Wallet A, then B, then C in order → detected
 *
 * WHEN:
 * -----
 * WHEN to schedule actions:
 *
 * PROACTIVE SCHEDULING:
 * - At system startup, queue next 7 days of actions
 * - After each execution, schedule next occurrence
 * - When new strategy is assigned, populate queue
 *
 * REACTIVE SCHEDULING:
 * - When governance proposal appears, schedule vote
 * - When airdrop claim opens, schedule claim
 * - When gas is favorable, pull forward some actions
 *
 * WHEN NOT to execute:
 *
 * - 3-6 AM local time (humans sleep)
 * - During high gas periods (unless urgent)
 * - When recent activity on same wallet (cooldown)
 * - When other wallets just executed (cross-wallet spacing)
 *
 * WHERE:
 * ------
 * WHERE scheduling decisions are made:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    SCHEDULING ARCHITECTURE                       │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                  │
 * │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
 * │  │   Strategy   │   │  Randomizer  │   │  Diversity   │        │
 * │  │   Engine     │──▶│              │──▶│  Tracker     │        │
 * │  │ (what to do) │   │(when to do it)│  │(what's needed)│       │
 * │  └──────────────┘   └──────────────┘   └──────────────┘        │
 * │          │                 │                  │                 │
 * │          └─────────────────┼──────────────────┘                 │
 * │                            ▼                                    │
 * │                   ┌──────────────────┐                          │
 * │                   │    SCHEDULER     │                          │
 * │                   │                  │                          │
 * │                   │  Per-wallet      │                          │
 * │                   │  queues with     │                          │
 * │                   │  randomized      │                          │
 * │                   │  execution times │                          │
 * │                   └────────┬─────────┘                          │
 * │                            │                                    │
 * │                            ▼                                    │
 * │                   ┌──────────────────┐                          │
 * │                   │    EXECUTOR      │                          │
 * │                   │  (runs actions)  │                          │
 * │                   └──────────────────┘                          │
 * │                                                                  │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * WHERE queues are stored:
 * - In-memory for active scheduling
 * - Persistent storage for recovery
 * - Per-wallet isolation
 *
 * WHY:
 * ----
 * WHY scheduling is critical:
 *
 * 1. TEMPORAL ANALYSIS IS EFFECTIVE:
 *    - LayerZero found clusters by transaction timing
 *    - Millisecond-level precision can expose bots
 *    - Even "random" timing can cluster if poorly done
 *
 * 2. HUMANS CAN'T MAINTAIN ORGANIC PATTERNS:
 *    - We have schedules, sleep, forget
 *    - Manual execution tends to cluster
 *    - Need automation to BE organic
 *
 * 3. CROSS-WALLET COORDINATION:
 *    - Multiple wallets need different schedules
 *    - Can't all execute in same window
 *    - Each wallet needs unique "personality"
 *
 * 4. RESOURCE OPTIMIZATION:
 *    - Execute during low gas periods
 *    - Batch where possible (but not obviously)
 *    - Rate limit API calls
 *
 * WHY queues per wallet:
 * - Each wallet is an independent "person"
 * - Isolates failures (one wallet error ≠ all stop)
 * - Different personalities = different schedules
 *
 * HOW:
 * ----
 * HOW scheduling works:
 *
 * 1. ACTION SELECTION:
 *    ```javascript
 *    const action = strategyEngine.selectNextAction(wallet);
 *    // Returns: { action: 'swap', protocol: 'uniswap', ... }
 *    ```
 *
 * 2. TIME CALCULATION:
 *    ```javascript
 *    const baseTime = Date.now() + action.frequency.min * DAY_MS;
 *    const scheduledTime = randomizer.randomizeTime(baseTime, {
 *      walletAddress: wallet,
 *      variance: TIMING_VARIANCE.NORMAL,
 *    });
 *    ```
 *
 * 3. CROSS-WALLET SPACING:
 *    ```javascript
 *    // Ensure no other wallet scheduled within 2 hours
 *    while (hasConflict(scheduledTime, 2 * HOUR_MS)) {
 *      scheduledTime = addJitter(scheduledTime, HOUR_MS);
 *    }
 *    ```
 *
 * 4. QUEUE INSERTION:
 *    ```javascript
 *    walletQueue.push({
 *      id: generateId(),
 *      action,
 *      scheduledTime,
 *      status: 'pending',
 *    });
 *    ```
 *
 * 5. EXECUTION:
 *    ```javascript
 *    // Scheduler loop checks every minute
 *    for (const item of queue) {
 *      if (item.scheduledTime <= now && item.status === 'pending') {
 *        await execute(item);
 *        scheduleNextOccurrence(item);
 *      }
 *    }
 *    ```
 *
 * HOW conflicts are avoided:
 *
 * ```javascript
 * function checkConflicts(wallet, proposedTime) {
 *   // 1. Check same-wallet cooldown
 *   const lastExecution = getLastExecution(wallet);
 *   if (proposedTime - lastExecution < MIN_INTERVAL) {
 *     return { conflict: true, reason: 'cooldown' };
 *   }
 *
 *   // 2. Check cross-wallet clustering
 *   const nearbyExecutions = getAllExecutions(
 *     proposedTime - CLUSTER_WINDOW,
 *     proposedTime + CLUSTER_WINDOW
 *   );
 *   if (nearbyExecutions.length > MAX_CLUSTER_SIZE) {
 *     return { conflict: true, reason: 'clustering' };
 *   }
 *
 *   return { conflict: false };
 * }
 * ```
 *
 * =============================================================================
 */

const EventEmitter = require('events');

// =============================================================================
// CONSTANTS
// =============================================================================

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Scheduling status
 */
const SCHEDULE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // Minimum time between same-wallet actions
  minWalletInterval: 4 * MS_PER_HOUR,

  // Minimum time between any two wallets' actions (cross-wallet)
  minCrossWalletInterval: 30 * MS_PER_MINUTE,

  // Maximum actions to schedule ahead
  maxQueueSize: 50,

  // How far ahead to schedule
  schedulingHorizon: 7 * MS_PER_DAY,

  // Check interval for execution
  tickInterval: MS_PER_MINUTE,

  // Max cluster size (wallets executing within window)
  maxClusterSize: 3,
  clusterWindow: 2 * MS_PER_HOUR,

  // Retry configuration
  maxRetries: 3,
  retryDelay: 5 * MS_PER_MINUTE,
};

// =============================================================================
// SCHEDULED ACTION CLASS
// =============================================================================

/**
 * Represents a scheduled action
 */
class ScheduledAction {
  constructor(data) {
    this.id = data.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.walletAddress = data.walletAddress.toLowerCase();
    this.strategyName = data.strategyName;
    this.action = data.action;
    this.protocol = data.protocol;
    this.chainId = data.chainId;
    this.params = data.params || {};

    this.scheduledTime = data.scheduledTime;
    this.createdAt = data.createdAt || Date.now();

    this.status = data.status || SCHEDULE_STATUS.PENDING;
    this.attempts = data.attempts || 0;
    this.lastAttempt = data.lastAttempt || null;
    this.completedAt = data.completedAt || null;
    this.error = data.error || null;
    this.result = data.result || null;

    this.priority = data.priority || 'normal'; // normal, high, low
    this.metadata = data.metadata || {};
  }

  /**
   * Mark as running
   */
  markRunning() {
    this.status = SCHEDULE_STATUS.RUNNING;
    this.attempts++;
    this.lastAttempt = Date.now();
  }

  /**
   * Mark as completed
   */
  markCompleted(result = null) {
    this.status = SCHEDULE_STATUS.COMPLETED;
    this.completedAt = Date.now();
    this.result = result;
  }

  /**
   * Mark as failed
   */
  markFailed(error) {
    this.status = SCHEDULE_STATUS.FAILED;
    this.error = error?.message || error;
  }

  /**
   * Mark as cancelled
   */
  markCancelled(reason = null) {
    this.status = SCHEDULE_STATUS.CANCELLED;
    this.error = reason;
  }

  /**
   * Mark as skipped
   */
  markSkipped(reason) {
    this.status = SCHEDULE_STATUS.SKIPPED;
    this.error = reason;
  }

  /**
   * Check if should retry
   */
  shouldRetry(maxRetries) {
    return this.status === SCHEDULE_STATUS.FAILED && this.attempts < maxRetries;
  }

  /**
   * Check if ready to execute
   */
  isReady() {
    return this.status === SCHEDULE_STATUS.PENDING &&
           this.scheduledTime <= Date.now();
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      walletAddress: this.walletAddress,
      strategyName: this.strategyName,
      action: this.action,
      protocol: this.protocol,
      chainId: this.chainId,
      params: this.params,
      scheduledTime: this.scheduledTime,
      createdAt: this.createdAt,
      status: this.status,
      attempts: this.attempts,
      lastAttempt: this.lastAttempt,
      completedAt: this.completedAt,
      error: this.error,
      priority: this.priority,
    };
  }
}

// =============================================================================
// WALLET QUEUE CLASS
// =============================================================================

/**
 * Queue for a single wallet
 */
class WalletQueue {
  constructor(walletAddress) {
    this.walletAddress = walletAddress.toLowerCase();
    this.items = [];
    this.lastExecution = null;
    this.paused = false;
  }

  /**
   * Add item to queue
   */
  add(action) {
    this.items.push(action);
    this.items.sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  /**
   * Remove item from queue
   */
  remove(id) {
    const index = this.items.findIndex(item => item.id === id);
    if (index !== -1) {
      return this.items.splice(index, 1)[0];
    }
    return null;
  }

  /**
   * Get next ready item
   */
  getNextReady() {
    if (this.paused) return null;
    return this.items.find(item => item.isReady());
  }

  /**
   * Get all pending items
   */
  getPending() {
    return this.items.filter(item => item.status === SCHEDULE_STATUS.PENDING);
  }

  /**
   * Get queue size
   */
  get size() {
    return this.items.length;
  }

  /**
   * Get pending count
   */
  get pendingCount() {
    return this.items.filter(i => i.status === SCHEDULE_STATUS.PENDING).length;
  }

  /**
   * Clear completed items
   */
  clearCompleted() {
    this.items = this.items.filter(item =>
      item.status === SCHEDULE_STATUS.PENDING ||
      item.status === SCHEDULE_STATUS.RUNNING
    );
  }
}

// =============================================================================
// SCHEDULER CLASS
// =============================================================================

/**
 * Main activity scheduler
 */
class ActivityScheduler extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      logger: config.logger || console,
    };

    // Component references
    this.strategyEngine = config.strategyEngine || null;
    this.randomizer = config.randomizer || null;
    this.diversityTracker = config.diversityTracker || null;

    // Execution function (provided by user)
    this.executeFn = config.execute || null;

    // Wallet queues
    this.queues = new Map(); // walletAddress -> WalletQueue

    // Global execution history (for cross-wallet coordination)
    this.globalHistory = []; // Array of { walletAddress, time }
    this.historyRetention = 24 * MS_PER_HOUR;

    // Scheduler state
    this.running = false;
    this.tickTimer = null;

    // Statistics
    this.stats = {
      scheduled: 0,
      executed: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
    };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Start the scheduler
   */
  start() {
    if (this.running) {
      this.config.logger.warn?.('Scheduler already running');
      return;
    }

    this.running = true;
    this.tick();

    this.config.logger.info?.('Activity scheduler started');
    this.emit('started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.running = false;

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }

    this.config.logger.info?.('Activity scheduler stopped');
    this.emit('stopped');
  }

  /**
   * Scheduler tick - check for ready actions
   */
  async tick() {
    if (!this.running) return;

    try {
      await this.processReadyActions();
      this.cleanupHistory();
    } catch (err) {
      this.config.logger.error?.(`Scheduler tick error: ${err.message}`);
    }

    // Schedule next tick
    this.tickTimer = setTimeout(
      () => this.tick(),
      this.config.tickInterval
    );
  }

  // ===========================================================================
  // QUEUE MANAGEMENT
  // ===========================================================================

  /**
   * Get or create queue for wallet
   */
  getQueue(walletAddress) {
    const normalized = walletAddress.toLowerCase();

    if (!this.queues.has(normalized)) {
      this.queues.set(normalized, new WalletQueue(normalized));
    }

    return this.queues.get(normalized);
  }

  /**
   * Schedule an action
   */
  schedule(walletAddress, actionData) {
    const queue = this.getQueue(walletAddress);

    // Check queue size limit
    if (queue.pendingCount >= this.config.maxQueueSize) {
      throw new Error(`Queue full for ${walletAddress}`);
    }

    // Calculate scheduled time if not provided
    let scheduledTime = actionData.scheduledTime;
    if (!scheduledTime) {
      scheduledTime = this.calculateScheduledTime(walletAddress, actionData);
    }

    // Resolve conflicts
    scheduledTime = this.resolveConflicts(walletAddress, scheduledTime);

    // Create scheduled action
    const action = new ScheduledAction({
      ...actionData,
      walletAddress,
      scheduledTime,
    });

    // Add to queue
    queue.add(action);
    this.stats.scheduled++;

    this.emit('scheduled', action.toJSON());
    this.config.logger.debug?.(`Scheduled ${action.action} for ${walletAddress} at ${new Date(scheduledTime).toISOString()}`);

    return action;
  }

  /**
   * Schedule next action for wallet based on strategy
   */
  scheduleNext(walletAddress) {
    if (!this.strategyEngine) {
      throw new Error('Strategy engine not configured');
    }

    const nextAction = this.strategyEngine.selectNextAction(walletAddress);

    if (!nextAction) {
      this.config.logger.debug?.(`No action available for ${walletAddress}`);
      return null;
    }

    return this.schedule(walletAddress, {
      strategyName: nextAction.strategy,
      action: nextAction.action,
      protocol: nextAction.protocols?.[0],
      chainId: nextAction.chains?.[0],
      params: nextAction.config,
    });
  }

  /**
   * Calculate scheduled time for action
   */
  calculateScheduledTime(walletAddress, actionData) {
    const queue = this.getQueue(walletAddress);

    // Base: after minimum interval from last execution
    let baseTime = Math.max(
      Date.now() + this.config.minWalletInterval,
      (queue.lastExecution || 0) + this.config.minWalletInterval
    );

    // Add frequency-based delay if specified
    if (actionData.params?.frequency) {
      const minDays = actionData.params.frequency.min || 1;
      const maxDays = actionData.params.frequency.max || 7;

      // Random within range
      const days = minDays + Math.random() * (maxDays - minDays);
      baseTime = Date.now() + days * MS_PER_DAY;
    }

    // Apply randomization if available
    if (this.randomizer) {
      return this.randomizer.randomizeTime(baseTime, {
        walletAddress,
        variance: 2, // hours
      });
    }

    return baseTime;
  }

  /**
   * Resolve scheduling conflicts
   */
  resolveConflicts(walletAddress, proposedTime) {
    const maxAttempts = 10;
    let time = proposedTime;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const conflict = this.checkConflicts(walletAddress, time);

      if (!conflict.hasConflict) {
        return time;
      }

      // Adjust time based on conflict type
      if (conflict.type === 'wallet_cooldown') {
        time = conflict.suggestedTime;
      } else if (conflict.type === 'cross_wallet') {
        // Add jitter to move away from cluster
        const jitter = (0.5 + Math.random()) * this.config.clusterWindow;
        time += jitter;
      } else {
        // Unknown conflict, just add some time
        time += MS_PER_HOUR;
      }
    }

    // If still conflicting, just use the adjusted time
    this.config.logger.warn?.(`Could not fully resolve conflicts for ${walletAddress}`);
    return time;
  }

  /**
   * Check for scheduling conflicts
   */
  checkConflicts(walletAddress, time) {
    const queue = this.getQueue(walletAddress);

    // Check same-wallet cooldown
    if (queue.lastExecution) {
      const sinceLastExecution = time - queue.lastExecution;
      if (sinceLastExecution < this.config.minWalletInterval) {
        return {
          hasConflict: true,
          type: 'wallet_cooldown',
          reason: 'Too soon after last execution',
          suggestedTime: queue.lastExecution + this.config.minWalletInterval,
        };
      }
    }

    // Check cross-wallet clustering
    const windowStart = time - this.config.clusterWindow / 2;
    const windowEnd = time + this.config.clusterWindow / 2;

    const nearbyExecutions = this.globalHistory.filter(h =>
      h.time >= windowStart && h.time <= windowEnd
    );

    // Also check scheduled actions in other queues
    for (const [address, q] of this.queues) {
      if (address === walletAddress.toLowerCase()) continue;

      for (const item of q.getPending()) {
        if (item.scheduledTime >= windowStart && item.scheduledTime <= windowEnd) {
          nearbyExecutions.push({ walletAddress: address, time: item.scheduledTime });
        }
      }
    }

    if (nearbyExecutions.length >= this.config.maxClusterSize) {
      return {
        hasConflict: true,
        type: 'cross_wallet',
        reason: `${nearbyExecutions.length} other wallets scheduled in window`,
        nearbyCount: nearbyExecutions.length,
      };
    }

    return { hasConflict: false };
  }

  /**
   * Cancel scheduled action
   */
  cancel(actionId, reason = null) {
    for (const queue of this.queues.values()) {
      const action = queue.items.find(i => i.id === actionId);
      if (action) {
        action.markCancelled(reason);
        this.stats.cancelled++;
        this.emit('cancelled', action.toJSON());
        return true;
      }
    }
    return false;
  }

  /**
   * Pause wallet queue
   */
  pauseWallet(walletAddress) {
    const queue = this.getQueue(walletAddress);
    queue.paused = true;
    this.emit('walletPaused', { walletAddress });
  }

  /**
   * Resume wallet queue
   */
  resumeWallet(walletAddress) {
    const queue = this.getQueue(walletAddress);
    queue.paused = false;
    this.emit('walletResumed', { walletAddress });
  }

  // ===========================================================================
  // EXECUTION
  // ===========================================================================

  /**
   * Process all ready actions
   */
  async processReadyActions() {
    const readyActions = [];

    // Collect all ready actions
    for (const queue of this.queues.values()) {
      const ready = queue.getNextReady();
      if (ready) {
        readyActions.push({ queue, action: ready });
      }
    }

    // Sort by priority and scheduled time
    readyActions.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.action.priority] - priorityOrder[b.action.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.action.scheduledTime - b.action.scheduledTime;
    });

    // Execute actions (with spacing)
    for (const { queue, action } of readyActions) {
      // Check if we should execute (cross-wallet spacing)
      const lastGlobalExecution = this.globalHistory[this.globalHistory.length - 1];
      if (lastGlobalExecution) {
        const sinceLastGlobal = Date.now() - lastGlobalExecution.time;
        if (sinceLastGlobal < this.config.minCrossWalletInterval) {
          // Skip this tick, will execute next tick
          continue;
        }
      }

      await this.executeAction(queue, action);
    }
  }

  /**
   * Execute a single action
   */
  async executeAction(queue, action) {
    // Mark as running
    action.markRunning();
    this.emit('executing', action.toJSON());

    try {
      // Execute via provided function
      let result;
      if (this.executeFn) {
        result = await this.executeFn(action);
      } else {
        // Placeholder - just mark success
        result = { success: true, placeholder: true };
      }

      // Mark completed
      action.markCompleted(result);
      queue.lastExecution = Date.now();
      this.stats.executed++;

      // Record in global history
      this.globalHistory.push({
        walletAddress: action.walletAddress,
        time: Date.now(),
      });

      // Record in diversity tracker
      if (this.diversityTracker) {
        this.diversityTracker.recordActivity(action.walletAddress, {
          chainId: action.chainId,
          protocol: action.protocol,
          category: this.getActionCategory(action.action),
          action: action.action,
          timestamp: Date.now(),
        });
      }

      // Record in strategy engine
      if (this.strategyEngine) {
        this.strategyEngine.recordExecution(action.walletAddress, {
          strategy: action.strategyName,
          action: action.action,
          protocol: action.protocol,
          chainId: action.chainId,
          timestamp: Date.now(),
          success: true,
        });
      }

      this.emit('executed', action.toJSON());
      this.config.logger.info?.(`Executed ${action.action} for ${action.walletAddress}`);

      // Schedule next occurrence
      if (this.strategyEngine) {
        try {
          this.scheduleNext(action.walletAddress);
        } catch (err) {
          this.config.logger.warn?.(`Failed to schedule next for ${action.walletAddress}: ${err.message}`);
        }
      }

    } catch (err) {
      action.markFailed(err);
      this.stats.failed++;

      this.emit('failed', {
        ...action.toJSON(),
        error: err.message,
      });

      this.config.logger.error?.(`Failed ${action.action} for ${action.walletAddress}: ${err.message}`);

      // Schedule retry if applicable
      if (action.shouldRetry(this.config.maxRetries)) {
        action.status = SCHEDULE_STATUS.PENDING;
        action.scheduledTime = Date.now() + this.config.retryDelay * action.attempts;
        this.emit('retryScheduled', action.toJSON());
      }
    }
  }

  /**
   * Get action category for diversity tracking
   */
  getActionCategory(action) {
    const categoryMap = {
      swap: 'dex',
      bridge: 'bridge',
      liquidity_add: 'dex',
      liquidity_remove: 'dex',
      stake: 'staking',
      unstake: 'staking',
      lend: 'lending',
      borrow: 'lending',
      nft_mint: 'nft',
      nft_buy: 'nft',
      governance_vote: 'governance',
    };

    return categoryMap[action] || 'unknown';
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Clean up old history
   */
  cleanupHistory() {
    const cutoff = Date.now() - this.historyRetention;
    this.globalHistory = this.globalHistory.filter(h => h.time > cutoff);

    // Clean completed items from queues
    for (const queue of this.queues.values()) {
      queue.clearCompleted();
    }
  }

  /**
   * Get queue status for wallet
   */
  getQueueStatus(walletAddress) {
    const queue = this.queues.get(walletAddress.toLowerCase());
    if (!queue) {
      return null;
    }

    return {
      walletAddress: queue.walletAddress,
      totalItems: queue.size,
      pendingItems: queue.pendingCount,
      paused: queue.paused,
      lastExecution: queue.lastExecution,
      nextScheduled: queue.getPending()[0]?.scheduledTime || null,
      items: queue.items.map(i => i.toJSON()),
    };
  }

  /**
   * Get all queues status
   */
  getAllQueuesStatus() {
    const statuses = [];

    for (const [address] of this.queues) {
      statuses.push(this.getQueueStatus(address));
    }

    return statuses;
  }

  /**
   * Get scheduler statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      running: this.running,
      queuesCount: this.queues.size,
      totalPending: Array.from(this.queues.values())
        .reduce((sum, q) => sum + q.pendingCount, 0),
      globalHistorySize: this.globalHistory.length,
    };
  }

  /**
   * Populate queue for wallet with initial actions
   */
  async populateQueue(walletAddress, count = 10) {
    if (!this.strategyEngine) {
      throw new Error('Strategy engine not configured');
    }

    const scheduled = [];

    for (let i = 0; i < count; i++) {
      try {
        const action = this.scheduleNext(walletAddress);
        if (action) {
          scheduled.push(action);
        } else {
          break; // No more actions available
        }
      } catch (err) {
        this.config.logger.warn?.(`Failed to populate queue item ${i}: ${err.message}`);
        break;
      }
    }

    return scheduled;
  }

  /**
   * Get upcoming actions across all wallets
   */
  getUpcomingActions(limit = 10) {
    const allActions = [];

    for (const queue of this.queues.values()) {
      for (const item of queue.getPending()) {
        allActions.push(item.toJSON());
      }
    }

    return allActions
      .sort((a, b) => a.scheduledTime - b.scheduledTime)
      .slice(0, limit);
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  ActivityScheduler,
  ScheduledAction,
  WalletQueue,
  SCHEDULE_STATUS,
  DEFAULT_CONFIG,

  // Factory
  createScheduler: (config = {}) => new ActivityScheduler(config),
};
