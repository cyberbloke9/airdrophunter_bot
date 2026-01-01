'use strict';

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

/**
 * Analytics - Long-term performance tracking and reporting
 *
 * WHY: Long-term analysis of bot performance, MEV extraction, gas efficiency,
 * and profitability enables optimization. Understanding patterns helps improve
 * trading strategies and security measures.
 *
 * METRICS TRACKED:
 * - Transaction success rate (by chain, protocol)
 * - Average gas cost per transaction type
 * - Slippage: expected vs actual
 * - MEV extraction suffered
 * - MEV protection savings
 * - Wallet P&L over time
 * - RPC uptime and latency
 * - Airdrop activity diversity
 *
 * @class Analytics
 */
class Analytics {
  /**
   * Create an Analytics instance
   * @param {Object} config - Configuration options
   * @param {Object} [config.logger] - Logger instance
   * @param {string} [config.dataDir] - Directory for persistent storage
   * @param {number} [config.retentionDays] - Data retention period (default: 90)
   * @param {boolean} [config.persistToDisk] - Enable disk persistence
   */
  constructor(config = {}) {
    this.logger = config.logger || console;
    this.dataDir = config.dataDir || './data/analytics';
    this.retentionDays = config.retentionDays || 90;
    this.persistToDisk = config.persistToDisk || false;

    // In-memory storage
    this.events = [];
    this.maxEventsInMemory = config.maxEventsInMemory || 10000;

    // Aggregated metrics (computed periodically)
    this.aggregates = {
      daily: new Map(), // date -> metrics
      hourly: new Map(), // hour -> metrics
    };

    // Real-time counters
    this.counters = {
      transactions: {
        total: 0,
        successful: 0,
        failed: 0,
        byChain: new Map(),
        byType: new Map(),
      },
      gas: {
        totalSpent: ethers.BigNumber.from(0),
        byChain: new Map(),
        byType: new Map(),
      },
      mev: {
        sandwichesDetected: 0,
        totalExtracted: ethers.BigNumber.from(0),
        protectedTransactions: 0,
        estimatedSavings: ethers.BigNumber.from(0),
      },
      slippage: {
        samples: [],
        totalDeviation: 0,
      },
      rpc: {
        requests: 0,
        failures: 0,
        failovers: 0,
        latencySum: 0,
        latencyCount: 0,
      },
      airdrop: {
        protocolsInteracted: new Set(),
        actionsPerformed: new Map(),
        chainsUsed: new Set(),
      },
    };

    // Performance tracking
    this.performanceWindows = {
      '1h': { start: Date.now() - 3600000, events: [] },
      '24h': { start: Date.now() - 86400000, events: [] },
      '7d': { start: Date.now() - 604800000, events: [] },
    };

    // Report templates
    this.reportTypes = {
      daily: this._generateDailyReport.bind(this),
      weekly: this._generateWeeklyReport.bind(this),
      performance: this._generatePerformanceReport.bind(this),
      mev: this._generateMevReport.bind(this),
      gas: this._generateGasReport.bind(this),
    };
  }

  /**
   * Record an event
   * @param {string} type - Event type
   * @param {Object} data - Event data
   */
  recordEvent(type, data = {}) {
    const event = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      data,
      timestamp: Date.now(),
    };

    // Add to in-memory storage
    this.events.push(event);
    if (this.events.length > this.maxEventsInMemory) {
      this.events.shift();
    }

    // Update real-time counters
    this._updateCounters(type, data);

    // Update performance windows
    this._updatePerformanceWindows(event);

    // Persist if enabled
    if (this.persistToDisk) {
      this._persistEvent(event);
    }

    return event;
  }

  /**
   * Record a transaction event
   * @param {Object} txData - Transaction data
   */
  recordTransaction(txData) {
    const { success, chainId, type, gasUsed, gasPrice, txHash, ...rest } = txData;

    this.recordEvent('transaction', {
      success,
      chainId,
      type,
      gasUsed,
      gasPrice,
      txHash,
      ...rest,
    });

    // Update transaction counters
    this.counters.transactions.total++;
    if (success) {
      this.counters.transactions.successful++;
    } else {
      this.counters.transactions.failed++;
    }

    // By chain
    const chainCount = this.counters.transactions.byChain.get(chainId) || { total: 0, success: 0 };
    chainCount.total++;
    if (success) chainCount.success++;
    this.counters.transactions.byChain.set(chainId, chainCount);

    // By type
    const typeCount = this.counters.transactions.byType.get(type) || { total: 0, success: 0 };
    typeCount.total++;
    if (success) typeCount.success++;
    this.counters.transactions.byType.set(type, typeCount);

    // Gas tracking
    if (gasUsed && gasPrice) {
      const gasCost = ethers.BigNumber.from(gasUsed).mul(ethers.BigNumber.from(gasPrice));
      this.counters.gas.totalSpent = this.counters.gas.totalSpent.add(gasCost);

      const chainGas = this.counters.gas.byChain.get(chainId) || ethers.BigNumber.from(0);
      this.counters.gas.byChain.set(chainId, chainGas.add(gasCost));

      const typeGas = this.counters.gas.byType.get(type) || ethers.BigNumber.from(0);
      this.counters.gas.byType.set(type, typeGas.add(gasCost));
    }
  }

  /**
   * Record slippage event
   * @param {Object} slippageData - Slippage data
   */
  recordSlippage(slippageData) {
    const { expected, actual, pair, chainId } = slippageData;

    const deviation = Math.abs((actual - expected) / expected);

    this.recordEvent('slippage', {
      expected,
      actual,
      deviation,
      pair,
      chainId,
    });

    // Update slippage tracking
    this.counters.slippage.samples.push(deviation);
    this.counters.slippage.totalDeviation += deviation;

    // Keep only recent samples
    if (this.counters.slippage.samples.length > 1000) {
      const removed = this.counters.slippage.samples.shift();
      this.counters.slippage.totalDeviation -= removed;
    }
  }

  /**
   * Record MEV event (sandwich detected, protection used)
   * @param {Object} mevData - MEV data
   */
  recordMevEvent(mevData) {
    const { type, extractedValue, protectionUsed, estimatedSavings } = mevData;

    this.recordEvent('mev', mevData);

    if (type === 'sandwich_detected') {
      this.counters.mev.sandwichesDetected++;
      if (extractedValue) {
        this.counters.mev.totalExtracted = this.counters.mev.totalExtracted.add(
          ethers.BigNumber.from(extractedValue)
        );
      }
    }

    if (protectionUsed) {
      this.counters.mev.protectedTransactions++;
      if (estimatedSavings) {
        this.counters.mev.estimatedSavings = this.counters.mev.estimatedSavings.add(
          ethers.BigNumber.from(estimatedSavings)
        );
      }
    }
  }

  /**
   * Record RPC event
   * @param {Object} rpcData - RPC event data
   */
  recordRpcEvent(rpcData) {
    const { success, latency, failover, chainId, rpcUrl } = rpcData;

    this.recordEvent('rpc', rpcData);

    this.counters.rpc.requests++;
    if (!success) {
      this.counters.rpc.failures++;
    }
    if (failover) {
      this.counters.rpc.failovers++;
    }
    if (latency) {
      this.counters.rpc.latencySum += latency;
      this.counters.rpc.latencyCount++;
    }
  }

  /**
   * Record airdrop activity
   * @param {Object} activityData - Activity data
   */
  recordAirdropActivity(activityData) {
    const { protocol, action, chainId, wallet } = activityData;

    this.recordEvent('airdrop_activity', activityData);

    if (protocol) {
      this.counters.airdrop.protocolsInteracted.add(protocol);
    }
    if (action) {
      const actionCount = this.counters.airdrop.actionsPerformed.get(action) || 0;
      this.counters.airdrop.actionsPerformed.set(action, actionCount + 1);
    }
    if (chainId) {
      this.counters.airdrop.chainsUsed.add(chainId);
    }
  }

  /**
   * Get metrics for a time range
   * @param {string} metric - Metric name
   * @param {Object} timeRange - Time range { start, end }
   * @returns {Object[]} Metric data points
   */
  getMetrics(metric, timeRange = {}) {
    const start = timeRange.start || Date.now() - 86400000; // Default 24h
    const end = timeRange.end || Date.now();

    const relevantEvents = this.events.filter(
      e => e.timestamp >= start && e.timestamp <= end
    );

    switch (metric) {
      case 'transactions':
        return this._aggregateTransactionMetrics(relevantEvents);
      case 'gas':
        return this._aggregateGasMetrics(relevantEvents);
      case 'slippage':
        return this._aggregateSlippageMetrics(relevantEvents);
      case 'mev':
        return this._aggregateMevMetrics(relevantEvents);
      case 'rpc':
        return this._aggregateRpcMetrics(relevantEvents);
      default:
        return relevantEvents.filter(e => e.type === metric);
    }
  }

  /**
   * Generate a report
   * @param {string} reportType - Report type
   * @param {Object} [options] - Report options
   * @returns {Object} Report
   */
  generateReport(reportType, options = {}) {
    const generator = this.reportTypes[reportType];
    if (!generator) {
      throw new Error(`Unknown report type: ${reportType}`);
    }

    return generator(options);
  }

  /**
   * Get performance summary for a wallet
   * @param {string} wallet - Wallet address
   * @param {number} [days] - Number of days (default: 30)
   * @returns {Object} Summary
   */
  getPerformanceSummary(wallet, days = 30) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    const walletLower = wallet.toLowerCase();

    const walletEvents = this.events.filter(
      e => e.timestamp >= since && e.data.wallet?.toLowerCase() === walletLower
    );

    const transactions = walletEvents.filter(e => e.type === 'transaction');
    const successful = transactions.filter(e => e.data.success);
    const failed = transactions.filter(e => !e.data.success);

    // Calculate gas spent
    const gasSpent = transactions.reduce((sum, e) => {
      if (e.data.gasUsed && e.data.gasPrice) {
        return sum.add(
          ethers.BigNumber.from(e.data.gasUsed).mul(e.data.gasPrice)
        );
      }
      return sum;
    }, ethers.BigNumber.from(0));

    // Get unique protocols
    const protocols = new Set(
      walletEvents
        .filter(e => e.type === 'airdrop_activity')
        .map(e => e.data.protocol)
        .filter(Boolean)
    );

    // Get chains used
    const chains = new Set(
      walletEvents
        .map(e => e.data.chainId)
        .filter(Boolean)
    );

    return {
      wallet,
      period: `${days} days`,
      transactions: {
        total: transactions.length,
        successful: successful.length,
        failed: failed.length,
        successRate: transactions.length > 0
          ? successful.length / transactions.length
          : 0,
      },
      gas: {
        totalSpentWei: gasSpent.toString(),
        totalSpentEth: ethers.utils.formatEther(gasSpent),
      },
      activity: {
        protocolsInteracted: Array.from(protocols),
        chainsUsed: Array.from(chains),
        diversityScore: protocols.size * chains.size, // Simple diversity metric
      },
    };
  }

  /**
   * Export data
   * @param {string} format - Export format ('json' or 'csv')
   * @param {Object} [filter] - Filter options
   * @returns {string} Exported data
   */
  exportData(format, filter = {}) {
    let data = this.events;

    // Apply filters
    if (filter.since) {
      data = data.filter(e => e.timestamp >= filter.since);
    }
    if (filter.type) {
      data = data.filter(e => e.type === filter.type);
    }
    if (filter.limit) {
      data = data.slice(-filter.limit);
    }

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    if (format === 'csv') {
      if (data.length === 0) return '';

      // Flatten data for CSV
      const rows = data.map(e => ({
        id: e.id,
        type: e.type,
        timestamp: new Date(e.timestamp).toISOString(),
        ...this._flattenObject(e.data),
      }));

      // Get all unique keys
      const keys = new Set();
      rows.forEach(row => Object.keys(row).forEach(k => keys.add(k)));
      const headers = Array.from(keys);

      // Generate CSV
      const csvRows = [
        headers.join(','),
        ...rows.map(row =>
          headers.map(h => {
            const val = row[h];
            if (val === undefined || val === null) return '';
            if (typeof val === 'string' && val.includes(',')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val);
          }).join(',')
        ),
      ];

      return csvRows.join('\n');
    }

    throw new Error(`Unknown format: ${format}`);
  }

  /**
   * Get current counters
   * @returns {Object} Current counters
   */
  getCounters() {
    return {
      transactions: {
        total: this.counters.transactions.total,
        successful: this.counters.transactions.successful,
        failed: this.counters.transactions.failed,
        successRate: this.counters.transactions.total > 0
          ? this.counters.transactions.successful / this.counters.transactions.total
          : 0,
        byChain: Object.fromEntries(this.counters.transactions.byChain),
        byType: Object.fromEntries(this.counters.transactions.byType),
      },
      gas: {
        totalSpentWei: this.counters.gas.totalSpent.toString(),
        totalSpentEth: ethers.utils.formatEther(this.counters.gas.totalSpent),
        byChain: Object.fromEntries(
          Array.from(this.counters.gas.byChain.entries()).map(([k, v]) => [k, v.toString()])
        ),
        byType: Object.fromEntries(
          Array.from(this.counters.gas.byType.entries()).map(([k, v]) => [k, v.toString()])
        ),
      },
      mev: {
        sandwichesDetected: this.counters.mev.sandwichesDetected,
        totalExtractedWei: this.counters.mev.totalExtracted.toString(),
        protectedTransactions: this.counters.mev.protectedTransactions,
        estimatedSavingsWei: this.counters.mev.estimatedSavings.toString(),
      },
      slippage: {
        sampleCount: this.counters.slippage.samples.length,
        averageDeviation: this.counters.slippage.samples.length > 0
          ? this.counters.slippage.totalDeviation / this.counters.slippage.samples.length
          : 0,
      },
      rpc: {
        requests: this.counters.rpc.requests,
        failures: this.counters.rpc.failures,
        failovers: this.counters.rpc.failovers,
        failureRate: this.counters.rpc.requests > 0
          ? this.counters.rpc.failures / this.counters.rpc.requests
          : 0,
        averageLatency: this.counters.rpc.latencyCount > 0
          ? this.counters.rpc.latencySum / this.counters.rpc.latencyCount
          : 0,
      },
      airdrop: {
        protocolCount: this.counters.airdrop.protocolsInteracted.size,
        protocols: Array.from(this.counters.airdrop.protocolsInteracted),
        chainCount: this.counters.airdrop.chainsUsed.size,
        actions: Object.fromEntries(this.counters.airdrop.actionsPerformed),
      },
    };
  }

  /**
   * Reset counters
   */
  resetCounters() {
    this.counters = {
      transactions: {
        total: 0,
        successful: 0,
        failed: 0,
        byChain: new Map(),
        byType: new Map(),
      },
      gas: {
        totalSpent: ethers.BigNumber.from(0),
        byChain: new Map(),
        byType: new Map(),
      },
      mev: {
        sandwichesDetected: 0,
        totalExtracted: ethers.BigNumber.from(0),
        protectedTransactions: 0,
        estimatedSavings: ethers.BigNumber.from(0),
      },
      slippage: {
        samples: [],
        totalDeviation: 0,
      },
      rpc: {
        requests: 0,
        failures: 0,
        failovers: 0,
        latencySum: 0,
        latencyCount: 0,
      },
      airdrop: {
        protocolsInteracted: new Set(),
        actionsPerformed: new Map(),
        chainsUsed: new Set(),
      },
    };
  }

  // ============ Private Methods ============

  /**
   * Update counters based on event type
   * @private
   */
  _updateCounters(type, data) {
    // Counters are updated by specific record* methods
    // This is for any additional processing
  }

  /**
   * Update performance windows
   * @private
   */
  _updatePerformanceWindows(event) {
    const now = Date.now();

    for (const [window, data] of Object.entries(this.performanceWindows)) {
      // Slide window
      if (event.timestamp >= data.start) {
        data.events.push(event);
      }

      // Clean old events
      const windowMs = {
        '1h': 3600000,
        '24h': 86400000,
        '7d': 604800000,
      }[window];

      const cutoff = now - windowMs;
      data.start = cutoff;
      data.events = data.events.filter(e => e.timestamp >= cutoff);
    }
  }

  /**
   * Persist event to disk
   * @private
   */
  _persistEvent(event) {
    try {
      // Create data directory if needed
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      // Use date-based files
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      const filePath = path.join(this.dataDir, `events_${date}.jsonl`);

      fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
    } catch (error) {
      this.logger.error?.('Failed to persist event', { error: error.message });
    }
  }

  /**
   * Flatten object for CSV export
   * @private
   */
  _flattenObject(obj, prefix = '') {
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}_${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this._flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        result[newKey] = value.join(';');
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * Aggregate transaction metrics
   * @private
   */
  _aggregateTransactionMetrics(events) {
    const txEvents = events.filter(e => e.type === 'transaction');

    // Group by hour
    const byHour = new Map();
    for (const event of txEvents) {
      const hour = new Date(event.timestamp).toISOString().slice(0, 13);
      const hourData = byHour.get(hour) || { total: 0, success: 0, failed: 0 };
      hourData.total++;
      if (event.data.success) hourData.success++;
      else hourData.failed++;
      byHour.set(hour, hourData);
    }

    return Array.from(byHour.entries())
      .map(([hour, data]) => ({ timestamp: hour, ...data }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Aggregate gas metrics
   * @private
   */
  _aggregateGasMetrics(events) {
    const txEvents = events.filter(e => e.type === 'transaction' && e.data.gasUsed);

    // Group by hour
    const byHour = new Map();
    for (const event of txEvents) {
      const hour = new Date(event.timestamp).toISOString().slice(0, 13);
      const hourData = byHour.get(hour) || { totalGas: ethers.BigNumber.from(0), count: 0 };

      if (event.data.gasUsed && event.data.gasPrice) {
        const gasCost = ethers.BigNumber.from(event.data.gasUsed).mul(event.data.gasPrice);
        hourData.totalGas = hourData.totalGas.add(gasCost);
      }
      hourData.count++;
      byHour.set(hour, hourData);
    }

    return Array.from(byHour.entries())
      .map(([hour, data]) => ({
        timestamp: hour,
        totalGasWei: data.totalGas.toString(),
        transactions: data.count,
        avgGasPerTx: data.count > 0 ? data.totalGas.div(data.count).toString() : '0',
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Aggregate slippage metrics
   * @private
   */
  _aggregateSlippageMetrics(events) {
    const slippageEvents = events.filter(e => e.type === 'slippage');

    // Group by hour
    const byHour = new Map();
    for (const event of slippageEvents) {
      const hour = new Date(event.timestamp).toISOString().slice(0, 13);
      const hourData = byHour.get(hour) || { sum: 0, count: 0, max: 0 };
      hourData.sum += event.data.deviation;
      hourData.count++;
      hourData.max = Math.max(hourData.max, event.data.deviation);
      byHour.set(hour, hourData);
    }

    return Array.from(byHour.entries())
      .map(([hour, data]) => ({
        timestamp: hour,
        averageSlippage: data.count > 0 ? data.sum / data.count : 0,
        maxSlippage: data.max,
        sampleCount: data.count,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Aggregate MEV metrics
   * @private
   */
  _aggregateMevMetrics(events) {
    const mevEvents = events.filter(e => e.type === 'mev');

    // Group by hour
    const byHour = new Map();
    for (const event of mevEvents) {
      const hour = new Date(event.timestamp).toISOString().slice(0, 13);
      const hourData = byHour.get(hour) || {
        sandwiches: 0,
        extracted: ethers.BigNumber.from(0),
        protected: 0,
      };

      if (event.data.type === 'sandwich_detected') {
        hourData.sandwiches++;
        if (event.data.extractedValue) {
          hourData.extracted = hourData.extracted.add(event.data.extractedValue);
        }
      }
      if (event.data.protectionUsed) {
        hourData.protected++;
      }

      byHour.set(hour, hourData);
    }

    return Array.from(byHour.entries())
      .map(([hour, data]) => ({
        timestamp: hour,
        sandwichesDetected: data.sandwiches,
        totalExtractedWei: data.extracted.toString(),
        protectedTransactions: data.protected,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Aggregate RPC metrics
   * @private
   */
  _aggregateRpcMetrics(events) {
    const rpcEvents = events.filter(e => e.type === 'rpc');

    // Group by hour
    const byHour = new Map();
    for (const event of rpcEvents) {
      const hour = new Date(event.timestamp).toISOString().slice(0, 13);
      const hourData = byHour.get(hour) || {
        requests: 0,
        failures: 0,
        failovers: 0,
        latencySum: 0,
        latencyCount: 0,
      };

      hourData.requests++;
      if (!event.data.success) hourData.failures++;
      if (event.data.failover) hourData.failovers++;
      if (event.data.latency) {
        hourData.latencySum += event.data.latency;
        hourData.latencyCount++;
      }

      byHour.set(hour, hourData);
    }

    return Array.from(byHour.entries())
      .map(([hour, data]) => ({
        timestamp: hour,
        requests: data.requests,
        failures: data.failures,
        failovers: data.failovers,
        failureRate: data.requests > 0 ? data.failures / data.requests : 0,
        avgLatency: data.latencyCount > 0 ? data.latencySum / data.latencyCount : 0,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Generate daily report
   * @private
   */
  _generateDailyReport(options = {}) {
    const date = options.date || new Date().toISOString().split('T')[0];
    const dayStart = new Date(date).getTime();
    const dayEnd = dayStart + 86400000;

    const dayEvents = this.events.filter(
      e => e.timestamp >= dayStart && e.timestamp < dayEnd
    );

    const transactions = dayEvents.filter(e => e.type === 'transaction');
    const successful = transactions.filter(e => e.data.success);

    // Calculate totals
    const gasSpent = transactions.reduce((sum, e) => {
      if (e.data.gasUsed && e.data.gasPrice) {
        return sum.add(ethers.BigNumber.from(e.data.gasUsed).mul(e.data.gasPrice));
      }
      return sum;
    }, ethers.BigNumber.from(0));

    const mevEvents = dayEvents.filter(e => e.type === 'mev');
    const sandwiches = mevEvents.filter(e => e.data.type === 'sandwich_detected');

    return {
      reportType: 'daily',
      date,
      generatedAt: new Date().toISOString(),
      summary: {
        transactions: {
          total: transactions.length,
          successful: successful.length,
          failed: transactions.length - successful.length,
          successRate: transactions.length > 0 ? successful.length / transactions.length : 0,
        },
        gas: {
          totalSpentWei: gasSpent.toString(),
          totalSpentEth: ethers.utils.formatEther(gasSpent),
        },
        mev: {
          sandwichesDetected: sandwiches.length,
          totalEvents: mevEvents.length,
        },
        events: {
          total: dayEvents.length,
        },
      },
    };
  }

  /**
   * Generate weekly report
   * @private
   */
  _generateWeeklyReport(options = {}) {
    const endDate = options.endDate || Date.now();
    const startDate = endDate - 604800000; // 7 days

    const weekEvents = this.events.filter(
      e => e.timestamp >= startDate && e.timestamp <= endDate
    );

    // Generate daily summaries
    const dailySummaries = [];
    for (let i = 0; i < 7; i++) {
      const dayStart = startDate + (i * 86400000);
      const dayEnd = dayStart + 86400000;
      const dayEvents = weekEvents.filter(
        e => e.timestamp >= dayStart && e.timestamp < dayEnd
      );

      const transactions = dayEvents.filter(e => e.type === 'transaction');
      dailySummaries.push({
        date: new Date(dayStart).toISOString().split('T')[0],
        transactions: transactions.length,
        successful: transactions.filter(e => e.data.success).length,
      });
    }

    return {
      reportType: 'weekly',
      period: {
        start: new Date(startDate).toISOString(),
        end: new Date(endDate).toISOString(),
      },
      generatedAt: new Date().toISOString(),
      dailySummaries,
      totals: {
        events: weekEvents.length,
        transactions: weekEvents.filter(e => e.type === 'transaction').length,
      },
    };
  }

  /**
   * Generate performance report
   * @private
   */
  _generatePerformanceReport(options = {}) {
    const window = options.window || '24h';
    const windowData = this.performanceWindows[window];

    if (!windowData) {
      throw new Error(`Unknown window: ${window}`);
    }

    const transactions = windowData.events.filter(e => e.type === 'transaction');
    const successful = transactions.filter(e => e.data.success);

    return {
      reportType: 'performance',
      window,
      generatedAt: new Date().toISOString(),
      metrics: {
        transactionSuccessRate: transactions.length > 0
          ? successful.length / transactions.length
          : 0,
        transactionCount: transactions.length,
        eventsProcessed: windowData.events.length,
      },
    };
  }

  /**
   * Generate MEV report
   * @private
   */
  _generateMevReport(options = {}) {
    const days = options.days || 30;
    const since = Date.now() - (days * 86400000);

    const mevEvents = this.events.filter(
      e => e.type === 'mev' && e.timestamp >= since
    );

    const sandwiches = mevEvents.filter(e => e.data.type === 'sandwich_detected');
    const totalExtracted = sandwiches.reduce((sum, e) => {
      if (e.data.extractedValue) {
        return sum.add(ethers.BigNumber.from(e.data.extractedValue));
      }
      return sum;
    }, ethers.BigNumber.from(0));

    const protectedTxs = mevEvents.filter(e => e.data.protectionUsed);

    return {
      reportType: 'mev',
      period: `${days} days`,
      generatedAt: new Date().toISOString(),
      metrics: {
        sandwichesDetected: sandwiches.length,
        totalExtractedWei: totalExtracted.toString(),
        totalExtractedEth: ethers.utils.formatEther(totalExtracted),
        protectedTransactions: protectedTxs.length,
        protectionRate: mevEvents.length > 0 ? protectedTxs.length / mevEvents.length : 0,
      },
    };
  }

  /**
   * Generate gas report
   * @private
   */
  _generateGasReport(options = {}) {
    const days = options.days || 30;
    const since = Date.now() - (days * 86400000);

    const transactions = this.events.filter(
      e => e.type === 'transaction' && e.timestamp >= since && e.data.gasUsed
    );

    const totalGas = transactions.reduce((sum, e) => {
      if (e.data.gasUsed && e.data.gasPrice) {
        return sum.add(ethers.BigNumber.from(e.data.gasUsed).mul(e.data.gasPrice));
      }
      return sum;
    }, ethers.BigNumber.from(0));

    // By type
    const byType = new Map();
    for (const tx of transactions) {
      const type = tx.data.type || 'unknown';
      const typeData = byType.get(type) || { count: 0, gas: ethers.BigNumber.from(0) };
      typeData.count++;
      if (tx.data.gasUsed && tx.data.gasPrice) {
        typeData.gas = typeData.gas.add(
          ethers.BigNumber.from(tx.data.gasUsed).mul(tx.data.gasPrice)
        );
      }
      byType.set(type, typeData);
    }

    return {
      reportType: 'gas',
      period: `${days} days`,
      generatedAt: new Date().toISOString(),
      metrics: {
        totalGasWei: totalGas.toString(),
        totalGasEth: ethers.utils.formatEther(totalGas),
        transactionCount: transactions.length,
        avgGasPerTx: transactions.length > 0
          ? ethers.utils.formatEther(totalGas.div(transactions.length))
          : '0',
      },
      byType: Object.fromEntries(
        Array.from(byType.entries()).map(([type, data]) => [
          type,
          {
            count: data.count,
            totalGasWei: data.gas.toString(),
            avgGasWei: data.count > 0 ? data.gas.div(data.count).toString() : '0',
          },
        ])
      ),
    };
  }
}

module.exports = { Analytics };
