/**
 * Execution Guard - Reentrancy Protection & Transaction State Machine
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: Reentrancy is the #1 smart contract vulnerability. JavaScript async
 * operations can also have reentrancy-like race conditions. Critical to
 * ensure atomic execution of multi-step operations.
 *
 * STATE-OF-THE-ART:
 * - Async-lock prevents concurrent execution of same operation
 * - Transaction state machine ensures valid state transitions
 * - Pre/post execution hooks for validation
 * - Emergency stop with graceful shutdown
 *
 * @module security/execution-guard
 */

const { ethers } = require('ethers');

// Transaction states
const TX_STATE = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  SIMULATING: 'simulating',
  APPROVING: 'approving',
  EXECUTING: 'executing',
  CONFIRMING: 'confirming',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// Valid state transitions
// Note: PREPARING can go to SIMULATING, APPROVING, or EXECUTING directly (simulation/approval optional)
const VALID_TRANSITIONS = {
  [TX_STATE.IDLE]: [TX_STATE.PREPARING],
  [TX_STATE.PREPARING]: [TX_STATE.SIMULATING, TX_STATE.APPROVING, TX_STATE.EXECUTING, TX_STATE.FAILED, TX_STATE.CANCELLED],
  [TX_STATE.SIMULATING]: [TX_STATE.APPROVING, TX_STATE.EXECUTING, TX_STATE.FAILED, TX_STATE.CANCELLED],
  [TX_STATE.APPROVING]: [TX_STATE.EXECUTING, TX_STATE.FAILED, TX_STATE.CANCELLED],
  [TX_STATE.EXECUTING]: [TX_STATE.CONFIRMING, TX_STATE.FAILED],
  [TX_STATE.CONFIRMING]: [TX_STATE.COMPLETED, TX_STATE.FAILED],
  [TX_STATE.COMPLETED]: [TX_STATE.IDLE],
  [TX_STATE.FAILED]: [TX_STATE.IDLE],
  [TX_STATE.CANCELLED]: [TX_STATE.IDLE],
};

// Simple async lock implementation
class AsyncLock {
  constructor() {
    this.locks = new Map();
    this.waiting = new Map();
  }

  async acquire(key, timeout = 30000) {
    const startTime = Date.now();

    while (this.locks.has(key)) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Lock acquisition timeout for key: ${key}`);
      }

      // Wait for release notification or timeout
      await new Promise((resolve) => {
        const waiters = this.waiting.get(key) || [];
        waiters.push(resolve);
        this.waiting.set(key, waiters);

        // Also set a timeout to prevent indefinite blocking
        setTimeout(resolve, 100);
      });
    }

    this.locks.set(key, {
      acquiredAt: Date.now(),
      holder: new Error().stack, // For debugging deadlocks
    });

    return true;
  }

  release(key) {
    this.locks.delete(key);

    // Notify all waiters
    const waiters = this.waiting.get(key) || [];
    this.waiting.delete(key);
    waiters.forEach(resolve => resolve());
  }

  isLocked(key) {
    return this.locks.has(key);
  }

  getLockInfo(key) {
    return this.locks.get(key);
  }
}

class ExecutionGuard {
  constructor(config = {}) {
    this.logger = config.logger || console;

    // Async locks for different scopes
    this.walletLocks = new AsyncLock();  // Per-wallet locks
    this.globalLock = new AsyncLock();   // Global operations

    // Transaction state tracking
    this.transactions = new Map(); // txId -> { state, history, data }

    // Emergency stop flag
    this.emergencyStop = false;
    this.emergencyStopReason = null;

    // Execution hooks
    this.preExecutionHooks = [];
    this.postExecutionHooks = [];

    // Configuration
    this.config = {
      maxConcurrentPerWallet: config.maxConcurrentPerWallet ?? 1,
      lockTimeout: config.lockTimeout ?? 30000,
      confirmationTimeout: config.confirmationTimeout ?? 300000, // 5 minutes
      maxRetries: config.maxRetries ?? 3,
    };

    // Metrics
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      emergencyStops: 0,
    };
  }

  /**
   * Execute a transaction with full protection
   *
   * @param {object} params - Execution parameters
   * @param {string} params.walletAddress - Wallet address
   * @param {Function} params.prepareFn - Prepare function (returns tx data)
   * @param {Function} params.simulateFn - Simulation function (optional)
   * @param {Function} params.approveFn - Approval function (optional)
   * @param {Function} params.executeFn - Execute function
   * @param {Function} params.confirmFn - Confirmation function
   * @param {object} options - Additional options
   * @returns {Promise<{success: boolean, result: any, txId: string}>}
   */
  async execute(params, options = {}) {
    const txId = this.generateTxId();
    const startTime = Date.now();

    // Check emergency stop
    if (this.emergencyStop) {
      throw new Error(`Emergency stop active: ${this.emergencyStopReason}`);
    }

    // Initialize transaction tracking
    this.initTransaction(txId, params);

    try {
      // Acquire wallet lock
      const lockKey = params.walletAddress.toLowerCase();
      await this.walletLocks.acquire(lockKey, this.config.lockTimeout);

      try {
        // Run pre-execution hooks
        await this.runPreExecutionHooks(txId, params);

        // Prepare
        await this.transition(txId, TX_STATE.PREPARING);
        const prepareResult = await params.prepareFn();
        this.updateTransaction(txId, { prepareResult });

        // Simulate (optional)
        if (params.simulateFn) {
          await this.transition(txId, TX_STATE.SIMULATING);
          const simulationResult = await params.simulateFn(prepareResult);

          if (!simulationResult.success) {
            throw new Error(`Simulation failed: ${simulationResult.reason}`);
          }
          this.updateTransaction(txId, { simulationResult });
        }

        // Approve (optional)
        if (params.approveFn) {
          await this.transition(txId, TX_STATE.APPROVING);
          const approvalResult = await params.approveFn(prepareResult);
          this.updateTransaction(txId, { approvalResult });
        }

        // Execute
        await this.transition(txId, TX_STATE.EXECUTING);
        const executeResult = await params.executeFn(prepareResult);
        this.updateTransaction(txId, { executeResult });

        // Confirm
        await this.transition(txId, TX_STATE.CONFIRMING);
        const confirmResult = await this.waitForConfirmation(
          params.confirmFn,
          executeResult,
          this.config.confirmationTimeout
        );
        this.updateTransaction(txId, { confirmResult });

        // Complete
        await this.transition(txId, TX_STATE.COMPLETED);

        // Run post-execution hooks
        await this.runPostExecutionHooks(txId, {
          success: true,
          result: confirmResult,
          executionTime: Date.now() - startTime,
        });

        // Update metrics
        this.updateMetrics(true, Date.now() - startTime);

        return {
          success: true,
          result: confirmResult,
          txId,
          executionTime: Date.now() - startTime,
        };

      } finally {
        // Always release lock
        this.walletLocks.release(lockKey);
      }

    } catch (error) {
      // Transition to failed state
      try {
        await this.transition(txId, TX_STATE.FAILED);
      } catch {
        // Ignore transition errors
      }

      this.updateTransaction(txId, { error: error.message });

      // Run post-execution hooks
      await this.runPostExecutionHooks(txId, {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
      });

      // Update metrics
      this.updateMetrics(false, Date.now() - startTime);

      throw error;
    }
  }

  /**
   * Execute with retry logic
   *
   * @param {object} params - Execution parameters
   * @param {object} options - Retry options
   * @returns {Promise<{success: boolean, result: any, attempts: number}>}
   */
  async executeWithRetry(params, options = {}) {
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    const retryDelay = options.retryDelay ?? 1000;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.execute(params, options);
        return { ...result, attempts: attempt };

      } catch (error) {
        lastError = error;
        this.logger.warn(
          `[ExecutionGuard] Attempt ${attempt}/${maxRetries} failed: ${error.message}`
        );

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // Wait before retry (with exponential backoff)
        if (attempt < maxRetries) {
          await this.sleep(retryDelay * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError;
  }

  /**
   * Cancel a pending transaction
   *
   * @param {string} txId - Transaction ID
   * @returns {Promise<boolean>}
   */
  async cancelTransaction(txId) {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction ${txId} not found`);
    }

    const cancellableStates = [TX_STATE.PREPARING, TX_STATE.SIMULATING, TX_STATE.APPROVING];
    if (!cancellableStates.includes(tx.state)) {
      throw new Error(`Cannot cancel transaction in state: ${tx.state}`);
    }

    await this.transition(txId, TX_STATE.CANCELLED);
    this.logger.info(`[ExecutionGuard] Transaction ${txId} cancelled`);

    return true;
  }

  /**
   * Activate emergency stop
   *
   * @param {string} reason - Reason for emergency stop
   */
  activateEmergencyStop(reason) {
    this.emergencyStop = true;
    this.emergencyStopReason = reason;
    this.metrics.emergencyStops++;

    this.logger.error(`[ExecutionGuard] EMERGENCY STOP ACTIVATED: ${reason}`);

    // Attempt to cancel all cancellable transactions
    for (const [txId, tx] of this.transactions) {
      const cancellableStates = [TX_STATE.PREPARING, TX_STATE.SIMULATING, TX_STATE.APPROVING];
      if (cancellableStates.includes(tx.state)) {
        try {
          this.transition(txId, TX_STATE.CANCELLED);
        } catch {
          // Best effort
        }
      }
    }
  }

  /**
   * Deactivate emergency stop
   */
  deactivateEmergencyStop() {
    this.emergencyStop = false;
    this.emergencyStopReason = null;
    this.logger.info('[ExecutionGuard] Emergency stop deactivated');
  }

  /**
   * Register pre-execution hook
   *
   * @param {Function} hook - Hook function (async, receives txId, params)
   */
  registerPreExecutionHook(hook) {
    this.preExecutionHooks.push(hook);
  }

  /**
   * Register post-execution hook
   *
   * @param {Function} hook - Hook function (async, receives txId, result)
   */
  registerPostExecutionHook(hook) {
    this.postExecutionHooks.push(hook);
  }

  /**
   * Get transaction state
   *
   * @param {string} txId - Transaction ID
   * @returns {object|null}
   */
  getTransaction(txId) {
    return this.transactions.get(txId) || null;
  }

  /**
   * Get all active transactions
   *
   * @returns {Array}
   */
  getActiveTransactions() {
    const active = [];
    const activeStates = [
      TX_STATE.PREPARING,
      TX_STATE.SIMULATING,
      TX_STATE.APPROVING,
      TX_STATE.EXECUTING,
      TX_STATE.CONFIRMING,
    ];

    for (const [txId, tx] of this.transactions) {
      if (activeStates.includes(tx.state)) {
        active.push({ txId, ...tx });
      }
    }

    return active;
  }

  /**
   * Get execution metrics
   *
   * @returns {object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeTransactions: this.getActiveTransactions().length,
      emergencyStopActive: this.emergencyStop,
    };
  }

  /**
   * Check if wallet is currently executing
   *
   * @param {string} walletAddress - Wallet address
   * @returns {boolean}
   */
  isWalletBusy(walletAddress) {
    return this.walletLocks.isLocked(walletAddress.toLowerCase());
  }

  // ============ Private Methods ============

  generateTxId() {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  initTransaction(txId, params) {
    this.transactions.set(txId, {
      state: TX_STATE.IDLE,
      history: [{ state: TX_STATE.IDLE, timestamp: Date.now() }],
      walletAddress: params.walletAddress,
      createdAt: Date.now(),
      data: {},
    });
  }

  updateTransaction(txId, data) {
    const tx = this.transactions.get(txId);
    if (tx) {
      tx.data = { ...tx.data, ...data };
    }
  }

  async transition(txId, newState) {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction ${txId} not found`);
    }

    const validNext = VALID_TRANSITIONS[tx.state] || [];
    if (!validNext.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${tx.state} -> ${newState}. ` +
        `Valid transitions: ${validNext.join(', ')}`
      );
    }

    tx.state = newState;
    tx.history.push({ state: newState, timestamp: Date.now() });

    this.logger.info(`[ExecutionGuard] Transaction ${txId}: ${tx.history[tx.history.length - 2]?.state} -> ${newState}`);
  }

  async waitForConfirmation(confirmFn, executeResult, timeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await confirmFn(executeResult);
        if (result.confirmed) {
          return result;
        }
      } catch (error) {
        this.logger.warn(`[ExecutionGuard] Confirmation check failed: ${error.message}`);
      }

      // Wait before next check
      await this.sleep(2000);
    }

    throw new Error(`Confirmation timeout after ${timeout}ms`);
  }

  async runPreExecutionHooks(txId, params) {
    for (const hook of this.preExecutionHooks) {
      try {
        await hook(txId, params);
      } catch (error) {
        this.logger.error(`[ExecutionGuard] Pre-execution hook failed: ${error.message}`);
        throw error;
      }
    }
  }

  async runPostExecutionHooks(txId, result) {
    for (const hook of this.postExecutionHooks) {
      try {
        await hook(txId, result);
      } catch (error) {
        this.logger.error(`[ExecutionGuard] Post-execution hook failed: ${error.message}`);
        // Don't throw - post hooks are best-effort
      }
    }
  }

  isNonRetryableError(error) {
    const nonRetryable = [
      'insufficient funds',
      'nonce too low',
      'replacement transaction underpriced',
      'execution reverted',
      'emergency stop',
      'user rejected',
    ];

    const message = error.message.toLowerCase();
    return nonRetryable.some(pattern => message.includes(pattern));
  }

  updateMetrics(success, executionTime) {
    this.metrics.totalExecutions++;

    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }

    // Running average
    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) + executionTime) /
      this.metrics.totalExecutions;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup old transactions from memory
   *
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    const terminalStates = [TX_STATE.COMPLETED, TX_STATE.FAILED, TX_STATE.CANCELLED];

    for (const [txId, tx] of this.transactions) {
      if (terminalStates.includes(tx.state) && now - tx.createdAt > maxAge) {
        this.transactions.delete(txId);
      }
    }
  }
}

// Export states for external use
ExecutionGuard.TX_STATE = TX_STATE;

module.exports = ExecutionGuard;
