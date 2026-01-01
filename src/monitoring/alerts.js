'use strict';

const { EventEmitter } = require('events');

/**
 * AlertSystem - Comprehensive alert management for security events
 *
 * WHY: Operators need immediate notification of security events, failures,
 * and anomalies to take action. Proper alerting prevents small issues from
 * becoming catastrophic failures.
 *
 * ALERT LEVELS:
 * - CRITICAL: Immediate action required (emergency stop, exploits)
 * - HIGH: Action within 1 hour (sandwiches >1%, stuck txs)
 * - MEDIUM: Action within 24 hours (gas high, key rotation due)
 * - LOW: Informational (tx confirmed, daily summary)
 *
 * @class AlertSystem
 * @extends EventEmitter
 */
class AlertSystem extends EventEmitter {
  /**
   * Create an AlertSystem instance
   * @param {Object} config - Configuration options
   * @param {Object} [config.logger] - Logger instance
   * @param {Object} [config.notificationService] - Notification service
   * @param {Object} [config.thresholds] - Alert thresholds
   * @param {Object} [config.rateLimits] - Rate limiting config
   * @param {number} [config.deduplicationWindowMs] - Dedup window (default: 5 min)
   * @param {number} [config.escalationTimeMs] - Time before escalation (default: 30 min)
   */
  constructor(config = {}) {
    super();

    this.logger = config.logger || console;
    this.notificationService = config.notificationService || null;

    // Alert thresholds
    this.thresholds = {
      sandwichExtractionCritical: 0.02, // 2%
      sandwichExtractionHigh: 0.01, // 1%
      slippageWarning: 0.02, // 2%
      gasMultiplierHigh: 2.0, // 2x normal
      balanceCriticalEth: 0.05, // 0.05 ETH
      balanceLowEth: 0.1, // 0.1 ETH
      rpcFailuresBeforeAlert: 3,
      stuckTxMinutes: 10,
      ...config.thresholds,
    };

    // Rate limiting per category (max alerts per window)
    this.rateLimits = {
      critical: { max: 100, windowMs: 60000 }, // 100/min (no limit really)
      high: { max: 10, windowMs: 300000 }, // 10 per 5 min
      medium: { max: 5, windowMs: 600000 }, // 5 per 10 min
      low: { max: 20, windowMs: 3600000 }, // 20 per hour
      ...config.rateLimits,
    };

    // Deduplication window
    this.deduplicationWindowMs = config.deduplicationWindowMs || 300000; // 5 min

    // Escalation time (HIGH -> CRITICAL if unacknowledged)
    this.escalationTimeMs = config.escalationTimeMs || 1800000; // 30 min

    // Alert state
    this.alerts = new Map(); // alertId -> Alert
    this.alertHistory = []; // Historical alerts (limited)
    this.maxHistorySize = config.maxHistorySize || 1000;

    // Rate limiting state
    this.rateLimitState = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    // Deduplication cache
    this.deduplicationCache = new Map(); // hash -> timestamp

    // Muted categories
    this.mutedCategories = new Map(); // category -> unmute timestamp

    // Alert ID counter
    this.alertIdCounter = 0;

    // Escalation check interval
    this.escalationInterval = null;

    // Alert categories
    this.CATEGORIES = {
      SECURITY: 'security',
      TRANSACTION: 'transaction',
      BALANCE: 'balance',
      RPC: 'rpc',
      ORACLE: 'oracle',
      MEV: 'mev',
      SYSTEM: 'system',
      KEY: 'key',
      CONFIG: 'config',
    };

    // Alert levels
    this.LEVELS = {
      CRITICAL: 'critical',
      HIGH: 'high',
      MEDIUM: 'medium',
      LOW: 'low',
    };
  }

  /**
   * Start the alert system (enables escalation checks)
   */
  start() {
    // Check for escalations every minute
    this.escalationInterval = setInterval(() => {
      this._checkEscalations();
    }, 60000);

    this.logger.info?.('Alert system started');
  }

  /**
   * Stop the alert system
   */
  stop() {
    if (this.escalationInterval) {
      clearInterval(this.escalationInterval);
      this.escalationInterval = null;
    }

    this.logger.info?.('Alert system stopped');
  }

  /**
   * Send an alert
   * @param {string} level - Alert level (critical, high, medium, low)
   * @param {string} category - Alert category
   * @param {string} message - Alert message
   * @param {Object} [data] - Additional data
   * @returns {Promise<Object>} Alert result
   */
  async sendAlert(level, category, message, data = {}) {
    const normalizedLevel = level.toLowerCase();

    // Validate level
    if (!Object.values(this.LEVELS).includes(normalizedLevel)) {
      throw new Error(`Invalid alert level: ${level}`);
    }

    // Check if category is muted
    if (this._isCategoryMuted(category)) {
      this.logger.debug?.(`Alert muted for category: ${category}`);
      return { sent: false, reason: 'muted' };
    }

    // Check rate limits
    if (!this._checkRateLimit(normalizedLevel)) {
      this.logger.warn?.(`Rate limit exceeded for level: ${normalizedLevel}`);
      return { sent: false, reason: 'rate_limited' };
    }

    // Check deduplication
    const dedupeKey = this._getDedupeKey(category, message, data);
    if (this._isDuplicate(dedupeKey)) {
      this.logger.debug?.(`Duplicate alert suppressed: ${message}`);
      return { sent: false, reason: 'duplicate' };
    }

    // Create alert
    const alert = {
      id: `alert_${++this.alertIdCounter}_${Date.now()}`,
      level: normalizedLevel,
      category,
      message,
      data,
      timestamp: Date.now(),
      acknowledged: false,
      acknowledgedAt: null,
      acknowledgedBy: null,
      escalated: false,
      escalatedAt: null,
      originalLevel: normalizedLevel,
    };

    // Store alert
    this.alerts.set(alert.id, alert);
    this._addToHistory(alert);
    this._markAsSent(dedupeKey);
    this._recordRateLimit(normalizedLevel);

    // Emit event
    this.emit('alert', alert);
    this.emit(`alert:${normalizedLevel}`, alert);
    this.emit(`alert:category:${category}`, alert);

    // Send notification
    let notificationResult = null;
    if (this.notificationService) {
      notificationResult = await this._sendNotification(alert);
    }

    this.logger.info?.(`Alert sent: [${normalizedLevel.toUpperCase()}] ${category} - ${message}`);

    return {
      sent: true,
      alert,
      notificationResult,
    };
  }

  /**
   * Acknowledge an alert
   * @param {string} alertId - Alert ID
   * @param {string} [acknowledgedBy] - Who acknowledged
   * @returns {boolean} Success
   */
  acknowledge(alertId, acknowledgedBy = 'system') {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = Date.now();
    alert.acknowledgedBy = acknowledgedBy;

    this.emit('alert:acknowledged', alert);
    this.logger.info?.(`Alert acknowledged: ${alertId} by ${acknowledgedBy}`);

    return true;
  }

  /**
   * Mute a category for a duration
   * @param {string} category - Category to mute
   * @param {number} durationMs - Duration in milliseconds
   */
  mute(category, durationMs) {
    const unmuteAt = Date.now() + durationMs;
    this.mutedCategories.set(category, unmuteAt);

    this.logger.info?.(`Category muted: ${category} until ${new Date(unmuteAt).toISOString()}`);

    // Auto-unmute after duration
    setTimeout(() => {
      if (this.mutedCategories.get(category) === unmuteAt) {
        this.mutedCategories.delete(category);
        this.logger.info?.(`Category unmuted: ${category}`);
      }
    }, durationMs);
  }

  /**
   * Unmute a category
   * @param {string} category - Category to unmute
   */
  unmute(category) {
    this.mutedCategories.delete(category);
    this.logger.info?.(`Category unmuted: ${category}`);
  }

  /**
   * Get alert history
   * @param {Object} [filter] - Filter options
   * @param {string} [filter.level] - Filter by level
   * @param {string} [filter.category] - Filter by category
   * @param {number} [filter.since] - Filter since timestamp
   * @param {number} [filter.limit] - Max results
   * @returns {Object[]} Filtered alerts
   */
  getAlertHistory(filter = {}) {
    let results = [...this.alertHistory];

    if (filter.level) {
      results = results.filter(a => a.level === filter.level);
    }

    if (filter.category) {
      results = results.filter(a => a.category === filter.category);
    }

    if (filter.since) {
      results = results.filter(a => a.timestamp >= filter.since);
    }

    if (filter.acknowledged !== undefined) {
      results = results.filter(a => a.acknowledged === filter.acknowledged);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Get active (unacknowledged) alerts
   * @returns {Object[]} Active alerts
   */
  getActiveAlerts() {
    return Array.from(this.alerts.values())
      .filter(a => !a.acknowledged)
      .sort((a, b) => {
        // Sort by level priority then timestamp
        const levelPriority = { critical: 0, high: 1, medium: 2, low: 3 };
        const aPriority = levelPriority[a.level];
        const bPriority = levelPriority[b.level];
        if (aPriority !== bPriority) return aPriority - bPriority;
        return b.timestamp - a.timestamp;
      });
  }

  /**
   * Set thresholds
   * @param {Object} thresholds - New thresholds
   */
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
    this.logger.info?.('Alert thresholds updated', thresholds);
  }

  /**
   * Get alert statistics
   * @param {number} [sinceMs] - Time window (default: 24 hours)
   * @returns {Object} Statistics
   */
  getStatistics(sinceMs = 86400000) {
    const since = Date.now() - sinceMs;
    const recent = this.alertHistory.filter(a => a.timestamp >= since);

    const byLevel = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    const byCategory = {};

    for (const alert of recent) {
      byLevel[alert.level]++;
      byCategory[alert.category] = (byCategory[alert.category] || 0) + 1;
    }

    const acknowledged = recent.filter(a => a.acknowledged).length;
    const escalated = recent.filter(a => a.escalated).length;

    return {
      total: recent.length,
      byLevel,
      byCategory,
      acknowledged,
      unacknowledged: recent.length - acknowledged,
      escalated,
      acknowledgeRate: recent.length > 0 ? acknowledged / recent.length : 0,
      activeAlerts: this.getActiveAlerts().length,
      mutedCategories: Array.from(this.mutedCategories.keys()),
    };
  }

  // ============ Convenience Methods for Common Alerts ============

  /**
   * Send emergency stop alert
   * @param {string} reason - Reason for emergency stop
   * @param {Object} [data] - Additional data
   */
  async alertEmergencyStop(reason, data = {}) {
    return this.sendAlert(
      this.LEVELS.CRITICAL,
      this.CATEGORIES.SECURITY,
      `Emergency stop activated: ${reason}`,
      data
    );
  }

  /**
   * Send suspected exploit alert
   * @param {string} description - Exploit description
   * @param {Object} [data] - Additional data
   */
  async alertSuspectedExploit(description, data = {}) {
    return this.sendAlert(
      this.LEVELS.CRITICAL,
      this.CATEGORIES.SECURITY,
      `Suspected exploit detected: ${description}`,
      data
    );
  }

  /**
   * Send sandwich attack alert
   * @param {string} txHash - Transaction hash
   * @param {number} extractionPercent - Extraction percentage
   * @param {Object} [data] - Additional data
   */
  async alertSandwichAttack(txHash, extractionPercent, data = {}) {
    const level = extractionPercent >= this.thresholds.sandwichExtractionCritical
      ? this.LEVELS.CRITICAL
      : extractionPercent >= this.thresholds.sandwichExtractionHigh
        ? this.LEVELS.HIGH
        : this.LEVELS.MEDIUM;

    return this.sendAlert(
      level,
      this.CATEGORIES.MEV,
      `Sandwich attack detected: ${(extractionPercent * 100).toFixed(2)}% extraction on ${txHash}`,
      { txHash, extractionPercent, ...data }
    );
  }

  /**
   * Send transaction failed alert
   * @param {string} txHash - Transaction hash
   * @param {string} reason - Failure reason
   * @param {Object} [data] - Additional data
   */
  async alertTransactionFailed(txHash, reason, data = {}) {
    return this.sendAlert(
      this.LEVELS.HIGH,
      this.CATEGORIES.TRANSACTION,
      `Transaction failed: ${reason}`,
      { txHash, ...data }
    );
  }

  /**
   * Send stuck transaction alert
   * @param {string} wallet - Wallet address
   * @param {number} nonce - Stuck nonce
   * @param {number} minutesPending - Minutes pending
   * @param {Object} [data] - Additional data
   */
  async alertStuckTransaction(wallet, nonce, minutesPending, data = {}) {
    return this.sendAlert(
      this.LEVELS.HIGH,
      this.CATEGORIES.TRANSACTION,
      `Stuck transaction: nonce ${nonce} pending for ${minutesPending} minutes`,
      { wallet, nonce, minutesPending, ...data }
    );
  }

  /**
   * Send RPC failure alert
   * @param {string} rpcUrl - RPC URL
   * @param {number} chainId - Chain ID
   * @param {string} error - Error message
   * @param {Object} [data] - Additional data
   */
  async alertRpcFailure(rpcUrl, chainId, error, data = {}) {
    return this.sendAlert(
      this.LEVELS.HIGH,
      this.CATEGORIES.RPC,
      `RPC failover triggered: ${rpcUrl} on chain ${chainId}`,
      { rpcUrl, chainId, error, ...data }
    );
  }

  /**
   * Send all RPCs failing alert
   * @param {number} chainId - Chain ID
   * @param {Object} [data] - Additional data
   */
  async alertAllRpcsFailing(chainId, data = {}) {
    return this.sendAlert(
      this.LEVELS.CRITICAL,
      this.CATEGORIES.RPC,
      `All RPCs failing for chain ${chainId}`,
      { chainId, ...data }
    );
  }

  /**
   * Send low balance alert
   * @param {string} wallet - Wallet address
   * @param {string} balance - Current balance
   * @param {string} token - Token symbol
   * @param {Object} [data] - Additional data
   */
  async alertLowBalance(wallet, balance, token = 'ETH', data = {}) {
    const balanceNum = parseFloat(balance);
    const level = balanceNum <= this.thresholds.balanceCriticalEth
      ? this.LEVELS.CRITICAL
      : this.LEVELS.HIGH;

    return this.sendAlert(
      level,
      this.CATEGORIES.BALANCE,
      `Low balance: ${balance} ${token} in wallet ${wallet.slice(0, 10)}...`,
      { wallet, balance, token, ...data }
    );
  }

  /**
   * Send oracle deviation alert
   * @param {string} pair - Trading pair
   * @param {number} deviation - Deviation percentage
   * @param {Object} [data] - Additional data
   */
  async alertOracleDeviation(pair, deviation, data = {}) {
    const level = deviation >= 0.05 ? this.LEVELS.CRITICAL : this.LEVELS.HIGH;

    return this.sendAlert(
      level,
      this.CATEGORIES.ORACLE,
      `Oracle price deviation: ${(deviation * 100).toFixed(2)}% for ${pair}`,
      { pair, deviation, ...data }
    );
  }

  /**
   * Send key usage anomaly alert
   * @param {string} keyId - Key identifier
   * @param {string} anomaly - Anomaly description
   * @param {Object} [data] - Additional data
   */
  async alertKeyAnomaly(keyId, anomaly, data = {}) {
    return this.sendAlert(
      this.LEVELS.CRITICAL,
      this.CATEGORIES.KEY,
      `Key usage anomaly: ${anomaly}`,
      { keyId, ...data }
    );
  }

  /**
   * Send transaction confirmed (low priority)
   * @param {string} txHash - Transaction hash
   * @param {Object} [data] - Additional data
   */
  async alertTransactionConfirmed(txHash, data = {}) {
    return this.sendAlert(
      this.LEVELS.LOW,
      this.CATEGORIES.TRANSACTION,
      `Transaction confirmed: ${txHash}`,
      { txHash, ...data }
    );
  }

  // ============ Private Methods ============

  /**
   * Check if category is muted
   * @private
   */
  _isCategoryMuted(category) {
    const unmuteAt = this.mutedCategories.get(category);
    if (!unmuteAt) return false;

    if (Date.now() >= unmuteAt) {
      this.mutedCategories.delete(category);
      return false;
    }

    return true;
  }

  /**
   * Check rate limit for level
   * @private
   */
  _checkRateLimit(level) {
    const limit = this.rateLimits[level];
    if (!limit) return true;

    const now = Date.now();
    const cutoff = now - limit.windowMs;

    // Clean old entries
    this.rateLimitState[level] = this.rateLimitState[level]
      .filter(ts => ts > cutoff);

    return this.rateLimitState[level].length < limit.max;
  }

  /**
   * Record rate limit entry
   * @private
   */
  _recordRateLimit(level) {
    if (this.rateLimitState[level]) {
      this.rateLimitState[level].push(Date.now());
    }
  }

  /**
   * Get deduplication key
   * @private
   */
  _getDedupeKey(category, message, data) {
    // Create a hash of the alert content
    const content = JSON.stringify({ category, message, wallet: data.wallet, txHash: data.txHash });
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `dedupe_${hash}`;
  }

  /**
   * Check if alert is duplicate
   * @private
   */
  _isDuplicate(dedupeKey) {
    const lastSent = this.deduplicationCache.get(dedupeKey);
    if (!lastSent) return false;

    return (Date.now() - lastSent) < this.deduplicationWindowMs;
  }

  /**
   * Mark alert as sent for deduplication
   * @private
   */
  _markAsSent(dedupeKey) {
    this.deduplicationCache.set(dedupeKey, Date.now());

    // Clean old entries periodically
    if (this.deduplicationCache.size > 1000) {
      const cutoff = Date.now() - this.deduplicationWindowMs;
      for (const [key, ts] of this.deduplicationCache) {
        if (ts < cutoff) {
          this.deduplicationCache.delete(key);
        }
      }
    }
  }

  /**
   * Add alert to history
   * @private
   */
  _addToHistory(alert) {
    this.alertHistory.push({ ...alert });

    // Trim history if too large
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Check for alerts that need escalation
   * @private
   */
  _checkEscalations() {
    const now = Date.now();

    for (const [alertId, alert] of this.alerts) {
      // Only escalate HIGH alerts that are unacknowledged
      if (
        alert.level === this.LEVELS.HIGH &&
        !alert.acknowledged &&
        !alert.escalated &&
        (now - alert.timestamp) >= this.escalationTimeMs
      ) {
        // Escalate to CRITICAL
        alert.escalated = true;
        alert.escalatedAt = now;
        alert.level = this.LEVELS.CRITICAL;

        this.emit('alert:escalated', alert);
        this.logger.warn?.(`Alert escalated to CRITICAL: ${alertId}`);

        // Send escalation notification
        if (this.notificationService) {
          this._sendNotification({
            ...alert,
            message: `[ESCALATED] ${alert.message}`,
          });
        }
      }
    }
  }

  /**
   * Send notification via notification service
   * @private
   */
  async _sendNotification(alert) {
    if (!this.notificationService) return null;

    try {
      const emoji = {
        critical: '🚨',
        high: '⚠️',
        medium: '📢',
        low: 'ℹ️',
      }[alert.level] || '📢';

      const message = `${emoji} **[${alert.level.toUpperCase()}] ${alert.category}**\n${alert.message}`;

      const result = await this.notificationService.notify(message, {
        type: alert.level === 'critical' || alert.level === 'high' ? 'error' : 'info',
      });

      return result;

    } catch (error) {
      this.logger.error?.('Failed to send notification', { error: error.message });
      return { error: error.message };
    }
  }
}

module.exports = { AlertSystem };
