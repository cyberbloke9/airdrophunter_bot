'use strict';

const { EventEmitter } = require('events');
const { ethers } = require('ethers');

/**
 * Dashboard - Real-time monitoring and observability
 *
 * WHY: Operators need visibility into bot operations, transaction status,
 * and security events in real-time. A centralized dashboard provides
 * immediate awareness of system health and performance.
 *
 * COMPONENTS:
 * - Transaction Feed (pending, confirmed, failed)
 * - Wallet Status (balances, nonces, approvals, health)
 * - MEV Metrics (sandwiches, extraction, protection, savings)
 * - RPC Health (provider status, latency, failovers)
 * - Oracle Status (price freshness, deviation, L2 sequencer)
 * - Alerts (security, errors, warnings, info)
 *
 * @class Dashboard
 * @extends EventEmitter
 */
class Dashboard extends EventEmitter {
  /**
   * Create a Dashboard instance
   * @param {Object} config - Configuration options
   * @param {Object} [config.securityLayer] - Security layer instance
   * @param {Object} [config.alertSystem] - Alert system instance
   * @param {Object} [config.analytics] - Analytics instance
   * @param {Object} [config.sandwichDetector] - Sandwich detector instance
   * @param {Object} [config.txSimulator] - Transaction simulator instance
   * @param {Object} [config.logger] - Logger instance
   * @param {number} [config.refreshIntervalMs] - Status refresh interval
   */
  constructor(config = {}) {
    super();

    this.securityLayer = config.securityLayer || null;
    this.alertSystem = config.alertSystem || null;
    this.analytics = config.analytics || null;
    this.sandwichDetector = config.sandwichDetector || null;
    this.txSimulator = config.txSimulator || null;
    this.logger = config.logger || console;
    this.refreshIntervalMs = config.refreshIntervalMs || 30000; // 30s

    // Dashboard state
    this.state = {
      running: false,
      startedAt: null,
      lastRefresh: null,
    };

    // Real-time data
    this.data = {
      transactions: {
        pending: new Map(), // txHash -> tx info
        recent: [], // Last 50 confirmed/failed
      },
      wallets: new Map(), // address -> wallet status
      rpc: {
        providers: new Map(), // chainId -> provider status
        lastFailover: null,
      },
      oracles: {
        prices: new Map(), // pair -> price info
        l2Sequencers: new Map(), // chainId -> status
      },
      mev: {
        recentSandwiches: [],
        stats: {
          detected: 0,
          protected: 0,
          extracted: ethers.BigNumber.from(0),
        },
      },
      alerts: {
        active: [],
        recent: [],
      },
      system: {
        uptime: 0,
        memoryUsage: null,
        emergencyStop: false,
      },
    };

    // Subscribers
    this.subscribers = new Map(); // event -> Set<callback>

    // Refresh interval handle
    this.refreshInterval = null;

    // Maximum items in lists
    this.maxRecentTransactions = 50;
    this.maxRecentAlerts = 100;
    this.maxRecentSandwiches = 20;
  }

  /**
   * Start the dashboard
   */
  start() {
    if (this.state.running) {
      this.logger.warn?.('Dashboard already running');
      return;
    }

    this.state.running = true;
    this.state.startedAt = Date.now();

    // Set up event listeners
    this._setupEventListeners();

    // Start periodic refresh
    this.refreshInterval = setInterval(() => {
      this._refresh();
    }, this.refreshIntervalMs);

    // Initial refresh
    this._refresh();

    this.emit('started');
    this.logger.info?.('Dashboard started');
  }

  /**
   * Stop the dashboard
   */
  stop() {
    if (!this.state.running) return;

    this.state.running = false;

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Remove event listeners
    this._removeEventListeners();

    this.emit('stopped');
    this.logger.info?.('Dashboard stopped');
  }

  /**
   * Get current dashboard status
   * @returns {Object} Dashboard status
   */
  getStatus() {
    return {
      running: this.state.running,
      uptime: this.state.startedAt ? Date.now() - this.state.startedAt : 0,
      lastRefresh: this.state.lastRefresh,
      components: {
        securityLayer: !!this.securityLayer,
        alertSystem: !!this.alertSystem,
        analytics: !!this.analytics,
        sandwichDetector: !!this.sandwichDetector,
        txSimulator: !!this.txSimulator,
      },
      data: {
        pendingTransactions: this.data.transactions.pending.size,
        recentTransactions: this.data.transactions.recent.length,
        trackedWallets: this.data.wallets.size,
        activeAlerts: this.data.alerts.active.length,
        rpcProviders: this.data.rpc.providers.size,
      },
    };
  }

  /**
   * Subscribe to dashboard events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(event);
      if (subs) {
        subs.delete(callback);
      }
    };
  }

  /**
   * Export metrics in a specific format
   * @param {string} format - 'json' or 'prometheus'
   * @returns {string} Formatted metrics
   */
  exportMetrics(format = 'json') {
    const metrics = this._collectMetrics();

    if (format === 'json') {
      return JSON.stringify(metrics, null, 2);
    }

    if (format === 'prometheus') {
      return this._formatPrometheus(metrics);
    }

    throw new Error(`Unknown format: ${format}`);
  }

  // ============ Transaction Tracking ============

  /**
   * Track a pending transaction
   * @param {Object} txInfo - Transaction info
   */
  trackPendingTransaction(txInfo) {
    const { txHash, wallet, type, chainId, value, timestamp } = txInfo;

    this.data.transactions.pending.set(txHash, {
      txHash,
      wallet,
      type,
      chainId,
      value,
      timestamp: timestamp || Date.now(),
      status: 'pending',
    });

    this._notify('transaction:pending', txInfo);
    this.emit('transaction:pending', txInfo);
  }

  /**
   * Mark transaction as confirmed
   * @param {string} txHash - Transaction hash
   * @param {Object} result - Transaction result
   */
  confirmTransaction(txHash, result = {}) {
    const pending = this.data.transactions.pending.get(txHash);
    if (!pending) return;

    this.data.transactions.pending.delete(txHash);

    const confirmed = {
      ...pending,
      ...result,
      status: 'confirmed',
      confirmedAt: Date.now(),
    };

    this._addRecentTransaction(confirmed);
    this._notify('transaction:confirmed', confirmed);
    this.emit('transaction:confirmed', confirmed);

    // Record to analytics
    if (this.analytics) {
      this.analytics.recordTransaction({
        success: true,
        ...confirmed,
      });
    }
  }

  /**
   * Mark transaction as failed
   * @param {string} txHash - Transaction hash
   * @param {Object} error - Error info
   */
  failTransaction(txHash, error = {}) {
    const pending = this.data.transactions.pending.get(txHash);
    if (!pending) return;

    this.data.transactions.pending.delete(txHash);

    const failed = {
      ...pending,
      error: error.message || error,
      status: 'failed',
      failedAt: Date.now(),
    };

    this._addRecentTransaction(failed);
    this._notify('transaction:failed', failed);
    this.emit('transaction:failed', failed);

    // Record to analytics
    if (this.analytics) {
      this.analytics.recordTransaction({
        success: false,
        ...failed,
      });
    }
  }

  // ============ Wallet Tracking ============

  /**
   * Update wallet status
   * @param {string} address - Wallet address
   * @param {Object} status - Wallet status
   */
  updateWalletStatus(address, status) {
    const current = this.data.wallets.get(address.toLowerCase()) || {};

    this.data.wallets.set(address.toLowerCase(), {
      ...current,
      ...status,
      address,
      lastUpdated: Date.now(),
    });

    this._notify('wallet:updated', { address, status });
    this.emit('wallet:updated', { address, status });
  }

  /**
   * Get wallet status
   * @param {string} address - Wallet address
   * @returns {Object|null} Wallet status
   */
  getWalletStatus(address) {
    return this.data.wallets.get(address.toLowerCase()) || null;
  }

  // ============ RPC Status ============

  /**
   * Update RPC provider status
   * @param {number} chainId - Chain ID
   * @param {Object} status - Provider status
   */
  updateRpcStatus(chainId, status) {
    const current = this.data.rpc.providers.get(chainId) || {};

    this.data.rpc.providers.set(chainId, {
      ...current,
      ...status,
      chainId,
      lastUpdated: Date.now(),
    });

    // Track failovers
    if (status.failover) {
      this.data.rpc.lastFailover = {
        chainId,
        from: status.failoverFrom,
        to: status.failoverTo,
        timestamp: Date.now(),
      };
    }

    this._notify('rpc:updated', { chainId, status });
    this.emit('rpc:updated', { chainId, status });

    // Record to analytics
    if (this.analytics && status.latency !== undefined) {
      this.analytics.recordRpcEvent({
        chainId,
        success: !status.error,
        latency: status.latency,
        failover: status.failover,
      });
    }
  }

  // ============ Oracle Status ============

  /**
   * Update oracle price status
   * @param {string} pair - Trading pair
   * @param {Object} priceInfo - Price information
   */
  updateOraclePrice(pair, priceInfo) {
    this.data.oracles.prices.set(pair, {
      ...priceInfo,
      pair,
      lastUpdated: Date.now(),
    });

    // Check for stale prices
    if (priceInfo.staleness && priceInfo.staleness > 3600) { // > 1 hour
      this._notify('oracle:stale', { pair, staleness: priceInfo.staleness });
    }

    // Check for deviation
    if (priceInfo.deviation && priceInfo.deviation > 0.02) { // > 2%
      this._notify('oracle:deviation', { pair, deviation: priceInfo.deviation });

      if (this.alertSystem) {
        this.alertSystem.alertOracleDeviation(pair, priceInfo.deviation);
      }
    }
  }

  /**
   * Update L2 sequencer status
   * @param {number} chainId - Chain ID
   * @param {Object} status - Sequencer status
   */
  updateSequencerStatus(chainId, status) {
    this.data.oracles.l2Sequencers.set(chainId, {
      ...status,
      chainId,
      lastUpdated: Date.now(),
    });

    if (!status.isUp) {
      this._notify('sequencer:down', { chainId });
    }
  }

  // ============ MEV Tracking ============

  /**
   * Record MEV event
   * @param {Object} mevEvent - MEV event data
   */
  recordMevEvent(mevEvent) {
    if (mevEvent.type === 'sandwich_detected') {
      this.data.mev.recentSandwiches.push({
        ...mevEvent,
        timestamp: Date.now(),
      });

      // Trim list
      if (this.data.mev.recentSandwiches.length > this.maxRecentSandwiches) {
        this.data.mev.recentSandwiches.shift();
      }

      this.data.mev.stats.detected++;
      if (mevEvent.extractedValue) {
        this.data.mev.stats.extracted = this.data.mev.stats.extracted.add(
          ethers.BigNumber.from(mevEvent.extractedValue)
        );
      }

      this._notify('mev:sandwich', mevEvent);
      this.emit('mev:sandwich', mevEvent);
    }

    if (mevEvent.protected) {
      this.data.mev.stats.protected++;
    }

    // Record to analytics
    if (this.analytics) {
      this.analytics.recordMevEvent(mevEvent);
    }
  }

  // ============ Alert Integration ============

  /**
   * Record an alert
   * @param {Object} alert - Alert object
   */
  recordAlert(alert) {
    // Add to active if not acknowledged
    if (!alert.acknowledged) {
      this.data.alerts.active.push(alert);
    }

    // Add to recent
    this.data.alerts.recent.push(alert);
    if (this.data.alerts.recent.length > this.maxRecentAlerts) {
      this.data.alerts.recent.shift();
    }

    this._notify('alert', alert);
    this.emit('alert', alert);
  }

  /**
   * Acknowledge an alert
   * @param {string} alertId - Alert ID
   */
  acknowledgeAlert(alertId) {
    const index = this.data.alerts.active.findIndex(a => a.id === alertId);
    if (index !== -1) {
      this.data.alerts.active.splice(index, 1);
    }

    // Also acknowledge in alert system
    if (this.alertSystem) {
      this.alertSystem.acknowledge(alertId);
    }
  }

  // ============ Data Retrieval ============

  /**
   * Get transaction feed
   * @returns {Object} Transaction feed
   */
  getTransactionFeed() {
    return {
      pending: Array.from(this.data.transactions.pending.values()),
      recent: this.data.transactions.recent,
    };
  }

  /**
   * Get all wallet statuses
   * @returns {Object[]} Wallet statuses
   */
  getAllWalletStatuses() {
    return Array.from(this.data.wallets.values());
  }

  /**
   * Get RPC health overview
   * @returns {Object} RPC health
   */
  getRpcHealth() {
    const providers = Array.from(this.data.rpc.providers.entries()).map(([chainId, status]) => ({
      chainId,
      ...status,
    }));

    return {
      providers,
      lastFailover: this.data.rpc.lastFailover,
      healthy: providers.filter(p => !p.error).length,
      unhealthy: providers.filter(p => p.error).length,
    };
  }

  /**
   * Get oracle status overview
   * @returns {Object} Oracle status
   */
  getOracleStatus() {
    return {
      prices: Array.from(this.data.oracles.prices.values()),
      l2Sequencers: Array.from(this.data.oracles.l2Sequencers.values()),
    };
  }

  /**
   * Get MEV metrics
   * @returns {Object} MEV metrics
   */
  getMevMetrics() {
    return {
      recentSandwiches: this.data.mev.recentSandwiches,
      stats: {
        detected: this.data.mev.stats.detected,
        protected: this.data.mev.stats.protected,
        extractedWei: this.data.mev.stats.extracted.toString(),
        extractedEth: ethers.utils.formatEther(this.data.mev.stats.extracted),
      },
    };
  }

  /**
   * Get active alerts
   * @returns {Object[]} Active alerts
   */
  getActiveAlerts() {
    return this.data.alerts.active;
  }

  /**
   * Get system status
   * @returns {Object} System status
   */
  getSystemStatus() {
    return {
      uptime: this.state.startedAt ? Date.now() - this.state.startedAt : 0,
      memoryUsage: process.memoryUsage?.() || null,
      emergencyStop: this.data.system.emergencyStop,
      lastRefresh: this.state.lastRefresh,
    };
  }

  /**
   * Get comprehensive snapshot
   * @returns {Object} Full dashboard snapshot
   */
  getSnapshot() {
    return {
      timestamp: Date.now(),
      status: this.getStatus(),
      transactions: this.getTransactionFeed(),
      wallets: this.getAllWalletStatuses(),
      rpc: this.getRpcHealth(),
      oracles: this.getOracleStatus(),
      mev: this.getMevMetrics(),
      alerts: {
        active: this.data.alerts.active,
        recent: this.data.alerts.recent.slice(-10),
      },
      system: this.getSystemStatus(),
    };
  }

  // ============ Private Methods ============

  /**
   * Set up event listeners
   * @private
   */
  _setupEventListeners() {
    // Listen to alert system
    if (this.alertSystem) {
      this.alertSystem.on('alert', (alert) => {
        this.recordAlert(alert);
      });

      this.alertSystem.on('alert:acknowledged', (alert) => {
        this.acknowledgeAlert(alert.id);
      });
    }

    // Listen to security layer if available
    if (this.securityLayer?.executionGuard) {
      // Could add execution guard event listeners here
    }
  }

  /**
   * Remove event listeners
   * @private
   */
  _removeEventListeners() {
    // Remove listeners if needed
  }

  /**
   * Periodic refresh
   * @private
   */
  async _refresh() {
    this.state.lastRefresh = Date.now();

    try {
      // Refresh security layer status
      if (this.securityLayer) {
        await this._refreshSecurityStatus();
      }

      // Update system metrics
      this.data.system.uptime = this.state.startedAt
        ? Date.now() - this.state.startedAt
        : 0;

      // Check for emergency stop
      if (this.securityLayer?.executionGuard) {
        this.data.system.emergencyStop =
          this.securityLayer.executionGuard.isEmergencyStop?.() || false;
      }

      // Emit refresh event
      this.emit('refresh', this.getSnapshot());
      this._notify('refresh', this.getSnapshot());

    } catch (error) {
      this.logger.error?.('Dashboard refresh failed', { error: error.message });
    }
  }

  /**
   * Refresh security layer status
   * @private
   */
  async _refreshSecurityStatus() {
    // Get RPC health
    if (this.securityLayer.rpcManager) {
      const health = this.securityLayer.rpcManager.getHealthStatus();
      for (const [chainId, providers] of Object.entries(health)) {
        this.updateRpcStatus(Number(chainId), {
          providers,
          healthy: providers.filter(p => p.state === 'healthy').length,
          total: providers.length,
        });
      }
    }

    // Get execution guard status
    if (this.securityLayer.executionGuard) {
      const metrics = this.securityLayer.executionGuard.getMetrics();
      this.data.system.executionMetrics = metrics;
    }
  }

  /**
   * Add to recent transactions
   * @private
   */
  _addRecentTransaction(tx) {
    this.data.transactions.recent.unshift(tx);
    if (this.data.transactions.recent.length > this.maxRecentTransactions) {
      this.data.transactions.recent.pop();
    }
  }

  /**
   * Notify subscribers
   * @private
   */
  _notify(event, data) {
    const subs = this.subscribers.get(event);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(data);
        } catch (error) {
          this.logger.error?.('Subscriber callback failed', { event, error: error.message });
        }
      }
    }
  }

  /**
   * Collect metrics for export
   * @private
   */
  _collectMetrics() {
    return {
      uptime_seconds: Math.floor((this.state.startedAt ? Date.now() - this.state.startedAt : 0) / 1000),
      transactions_pending: this.data.transactions.pending.size,
      transactions_recent_total: this.data.transactions.recent.length,
      transactions_recent_success: this.data.transactions.recent.filter(t => t.status === 'confirmed').length,
      transactions_recent_failed: this.data.transactions.recent.filter(t => t.status === 'failed').length,
      wallets_tracked: this.data.wallets.size,
      rpc_providers_healthy: Array.from(this.data.rpc.providers.values()).filter(p => !p.error).length,
      rpc_providers_total: this.data.rpc.providers.size,
      mev_sandwiches_detected: this.data.mev.stats.detected,
      mev_transactions_protected: this.data.mev.stats.protected,
      mev_total_extracted_wei: this.data.mev.stats.extracted.toString(),
      alerts_active: this.data.alerts.active.length,
      emergency_stop_active: this.data.system.emergencyStop ? 1 : 0,
    };
  }

  /**
   * Format metrics for Prometheus
   * @private
   */
  _formatPrometheus(metrics) {
    const lines = [];

    lines.push('# HELP airdrop_bot_uptime_seconds Bot uptime in seconds');
    lines.push('# TYPE airdrop_bot_uptime_seconds gauge');
    lines.push(`airdrop_bot_uptime_seconds ${metrics.uptime_seconds}`);

    lines.push('# HELP airdrop_bot_transactions_pending Number of pending transactions');
    lines.push('# TYPE airdrop_bot_transactions_pending gauge');
    lines.push(`airdrop_bot_transactions_pending ${metrics.transactions_pending}`);

    lines.push('# HELP airdrop_bot_transactions_success Number of successful transactions');
    lines.push('# TYPE airdrop_bot_transactions_success counter');
    lines.push(`airdrop_bot_transactions_success ${metrics.transactions_recent_success}`);

    lines.push('# HELP airdrop_bot_transactions_failed Number of failed transactions');
    lines.push('# TYPE airdrop_bot_transactions_failed counter');
    lines.push(`airdrop_bot_transactions_failed ${metrics.transactions_recent_failed}`);

    lines.push('# HELP airdrop_bot_wallets_tracked Number of tracked wallets');
    lines.push('# TYPE airdrop_bot_wallets_tracked gauge');
    lines.push(`airdrop_bot_wallets_tracked ${metrics.wallets_tracked}`);

    lines.push('# HELP airdrop_bot_rpc_healthy Number of healthy RPC providers');
    lines.push('# TYPE airdrop_bot_rpc_healthy gauge');
    lines.push(`airdrop_bot_rpc_healthy ${metrics.rpc_providers_healthy}`);

    lines.push('# HELP airdrop_bot_mev_sandwiches_detected Number of sandwich attacks detected');
    lines.push('# TYPE airdrop_bot_mev_sandwiches_detected counter');
    lines.push(`airdrop_bot_mev_sandwiches_detected ${metrics.mev_sandwiches_detected}`);

    lines.push('# HELP airdrop_bot_mev_protected Number of transactions with MEV protection');
    lines.push('# TYPE airdrop_bot_mev_protected counter');
    lines.push(`airdrop_bot_mev_protected ${metrics.mev_transactions_protected}`);

    lines.push('# HELP airdrop_bot_alerts_active Number of active alerts');
    lines.push('# TYPE airdrop_bot_alerts_active gauge');
    lines.push(`airdrop_bot_alerts_active ${metrics.alerts_active}`);

    lines.push('# HELP airdrop_bot_emergency_stop Emergency stop status (1=active, 0=inactive)');
    lines.push('# TYPE airdrop_bot_emergency_stop gauge');
    lines.push(`airdrop_bot_emergency_stop ${metrics.emergency_stop_active}`);

    return lines.join('\n');
  }
}

module.exports = { Dashboard };
