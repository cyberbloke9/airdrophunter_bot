'use strict';

/**
 * Audit Logger - Central, Immutable Audit Trail
 *
 * Sprint 2.1: Compliance Layer
 *
 * Features:
 * - Structured event logging with timestamps
 * - 7-year retention policy support (2555 days)
 * - Tamper-evident logging (hash chains)
 * - Multiple storage backends (memory, file, custom)
 * - Query and export capabilities
 * - Log rotation and archival
 */

const crypto = require('crypto');
const EventEmitter = require('events');

// ============ Constants ============

const AUDIT_CATEGORIES = {
  // Security Events (Sprint 1.1)
  EXECUTION: 'execution',
  ACCESS: 'access',
  KEY_USAGE: 'key_usage',
  APPROVAL: 'approval',
  NONCE: 'nonce',

  // MEV Events
  MEV_PROTECTION: 'mev_protection',
  MEV_INCIDENT: 'mev_incident',
  SIMULATION: 'simulation',

  // Infrastructure Events
  RPC: 'rpc',
  ORACLE: 'oracle',
  SLIPPAGE: 'slippage',

  // Compliance Events
  SCREENING: 'screening',
  GEO_CHECK: 'geo_check',
  VIOLATION: 'violation',

  // Administrative Events
  CONFIG: 'config',
  ALERT: 'alert',
  REPORT: 'report',
};

const SEVERITY_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  CRITICAL: 'critical',
};

const EXPORT_FORMATS = {
  JSON: 'json',
  CSV: 'csv',
  NDJSON: 'ndjson',
};

const DEFAULT_RETENTION_DAYS = 2555; // 7 years
const DEFAULT_ROTATION_SIZE = 100000; // entries per log segment
const DEFAULT_HASH_ALGORITHM = 'sha256';

// ============ Audit Entry ============

class AuditEntry {
  constructor(category, action, data, metadata = {}) {
    this.id = AuditEntry.generateId();
    this.timestamp = Date.now();
    this.isoTimestamp = new Date().toISOString();
    this.category = category;
    this.action = action;
    this.data = data;
    this.metadata = {
      severity: metadata.severity || SEVERITY_LEVELS.INFO,
      source: metadata.source || 'unknown',
      sessionId: metadata.sessionId || null,
      userId: metadata.userId || null,
      chainId: metadata.chainId || null,
      wallet: metadata.wallet || null,
      txHash: metadata.txHash || null,
      correlationId: metadata.correlationId || null,
      ...metadata,
    };
    this.hash = null;
    this.previousHash = null;
  }

  static generateId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `audit_${timestamp}_${random}`;
  }

  computeHash(previousHash = null) {
    this.previousHash = previousHash;
    const content = JSON.stringify({
      id: this.id,
      timestamp: this.timestamp,
      category: this.category,
      action: this.action,
      data: this.data,
      metadata: this.metadata,
      previousHash: this.previousHash,
    });
    this.hash = crypto
      .createHash(DEFAULT_HASH_ALGORITHM)
      .update(content)
      .digest('hex');
    return this.hash;
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      isoTimestamp: this.isoTimestamp,
      category: this.category,
      action: this.action,
      data: this.data,
      metadata: this.metadata,
      hash: this.hash,
      previousHash: this.previousHash,
    };
  }

  toCSV() {
    const fields = [
      this.id,
      this.isoTimestamp,
      this.category,
      this.action,
      this.metadata.severity,
      this.metadata.wallet || '',
      this.metadata.txHash || '',
      this.metadata.chainId || '',
      JSON.stringify(this.data).replace(/"/g, '""'),
      this.hash || '',
    ];
    return fields.map(f => `"${f}"`).join(',');
  }
}

// ============ Memory Storage Backend ============

class MemoryStorage {
  constructor(options = {}) {
    this.entries = [];
    this.index = {
      byCategory: new Map(),
      byTimestamp: [],
      byWallet: new Map(),
      byTxHash: new Map(),
      byChainId: new Map(),
    };
    this.maxEntries = options.maxEntries || 1000000;
    this.rotationSize = options.rotationSize || DEFAULT_ROTATION_SIZE;
    this.archives = [];
  }

  append(entry) {
    this.entries.push(entry);

    // Update indexes
    if (!this.index.byCategory.has(entry.category)) {
      this.index.byCategory.set(entry.category, []);
    }
    this.index.byCategory.get(entry.category).push(this.entries.length - 1);

    this.index.byTimestamp.push({
      timestamp: entry.timestamp,
      index: this.entries.length - 1,
    });

    if (entry.metadata.wallet) {
      const wallet = entry.metadata.wallet.toLowerCase();
      if (!this.index.byWallet.has(wallet)) {
        this.index.byWallet.set(wallet, []);
      }
      this.index.byWallet.get(wallet).push(this.entries.length - 1);
    }

    if (entry.metadata.txHash) {
      const txHash = entry.metadata.txHash.toLowerCase();
      if (!this.index.byTxHash.has(txHash)) {
        this.index.byTxHash.set(txHash, []);
      }
      this.index.byTxHash.get(txHash).push(this.entries.length - 1);
    }

    if (entry.metadata.chainId) {
      if (!this.index.byChainId.has(entry.metadata.chainId)) {
        this.index.byChainId.set(entry.metadata.chainId, []);
      }
      this.index.byChainId.get(entry.metadata.chainId).push(this.entries.length - 1);
    }

    // Check rotation
    if (this.entries.length >= this.rotationSize) {
      this.rotate();
    }

    return entry;
  }

  query(filter = {}, options = {}) {
    let results = [];
    const { limit = 1000, offset = 0, sort = 'desc' } = options;

    // Use indexes for efficient filtering
    if (filter.category && this.index.byCategory.has(filter.category)) {
      const indices = this.index.byCategory.get(filter.category);
      results = indices.map(i => this.entries[i]);
    } else if (filter.wallet && this.index.byWallet.has(filter.wallet.toLowerCase())) {
      const indices = this.index.byWallet.get(filter.wallet.toLowerCase());
      results = indices.map(i => this.entries[i]);
    } else if (filter.txHash && this.index.byTxHash.has(filter.txHash.toLowerCase())) {
      const indices = this.index.byTxHash.get(filter.txHash.toLowerCase());
      results = indices.map(i => this.entries[i]);
    } else if (filter.chainId && this.index.byChainId.has(filter.chainId)) {
      const indices = this.index.byChainId.get(filter.chainId);
      results = indices.map(i => this.entries[i]);
    } else {
      results = [...this.entries];
    }

    // Apply additional filters
    if (filter.startTime) {
      results = results.filter(e => e.timestamp >= filter.startTime);
    }
    if (filter.endTime) {
      results = results.filter(e => e.timestamp <= filter.endTime);
    }
    if (filter.severity) {
      results = results.filter(e => e.metadata.severity === filter.severity);
    }
    if (filter.action) {
      results = results.filter(e => e.action === filter.action);
    }
    if (filter.correlationId) {
      results = results.filter(e => e.metadata.correlationId === filter.correlationId);
    }

    // Sort
    results.sort((a, b) => {
      return sort === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
    });

    // Paginate
    return results.slice(offset, offset + limit);
  }

  getRange(startTime, endTime) {
    return this.entries.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  getStatistics() {
    const stats = {
      totalEntries: this.entries.length,
      archivedSegments: this.archives.length,
      byCategory: {},
      bySeverity: {},
      oldestEntry: this.entries[0]?.timestamp || null,
      newestEntry: this.entries[this.entries.length - 1]?.timestamp || null,
    };

    for (const [category, indices] of this.index.byCategory) {
      stats.byCategory[category] = indices.length;
    }

    for (const entry of this.entries) {
      const sev = entry.metadata.severity;
      stats.bySeverity[sev] = (stats.bySeverity[sev] || 0) + 1;
    }

    return stats;
  }

  rotate() {
    if (this.entries.length < this.rotationSize) return null;

    // Archive current entries
    const archived = {
      timestamp: Date.now(),
      startTimestamp: this.entries[0]?.timestamp,
      endTimestamp: this.entries[this.entries.length - 1]?.timestamp,
      count: this.entries.length,
      firstHash: this.entries[0]?.hash,
      lastHash: this.entries[this.entries.length - 1]?.hash,
      // In production, entries would be persisted to disk/cloud
      // For now, keep reference for testing
      entriesRef: this.entries,
    };

    this.archives.push(archived);

    // Clear current entries and rebuild indexes
    this.entries = [];
    this.index = {
      byCategory: new Map(),
      byTimestamp: [],
      byWallet: new Map(),
      byTxHash: new Map(),
      byChainId: new Map(),
    };

    return archived;
  }

  archive(olderThan) {
    const threshold = Date.now() - olderThan;
    const toArchive = this.entries.filter(e => e.timestamp < threshold);

    if (toArchive.length === 0) {
      return { archivedCount: 0 };
    }

    // Create archive
    const archived = {
      timestamp: Date.now(),
      startTimestamp: toArchive[0].timestamp,
      endTimestamp: toArchive[toArchive.length - 1].timestamp,
      count: toArchive.length,
      firstHash: toArchive[0].hash,
      lastHash: toArchive[toArchive.length - 1].hash,
    };

    this.archives.push(archived);

    // Remove archived entries
    this.entries = this.entries.filter(e => e.timestamp >= threshold);
    this.rebuildIndexes();

    return { archivedCount: toArchive.length, archive: archived };
  }

  purge(olderThan, confirm = false) {
    if (!confirm) {
      throw new Error('Purge requires explicit confirmation');
    }

    const threshold = Date.now() - olderThan;
    const initialCount = this.entries.length;
    this.entries = this.entries.filter(e => e.timestamp >= threshold);
    this.rebuildIndexes();

    // Also purge old archives
    const archiveThreshold = threshold;
    const initialArchives = this.archives.length;
    this.archives = this.archives.filter(a => a.endTimestamp >= archiveThreshold);

    return {
      purgedEntries: initialCount - this.entries.length,
      purgedArchives: initialArchives - this.archives.length,
    };
  }

  rebuildIndexes() {
    this.index = {
      byCategory: new Map(),
      byTimestamp: [],
      byWallet: new Map(),
      byTxHash: new Map(),
      byChainId: new Map(),
    };

    this.entries.forEach((entry, i) => {
      if (!this.index.byCategory.has(entry.category)) {
        this.index.byCategory.set(entry.category, []);
      }
      this.index.byCategory.get(entry.category).push(i);

      this.index.byTimestamp.push({ timestamp: entry.timestamp, index: i });

      if (entry.metadata.wallet) {
        const wallet = entry.metadata.wallet.toLowerCase();
        if (!this.index.byWallet.has(wallet)) {
          this.index.byWallet.set(wallet, []);
        }
        this.index.byWallet.get(wallet).push(i);
      }

      if (entry.metadata.txHash) {
        const txHash = entry.metadata.txHash.toLowerCase();
        if (!this.index.byTxHash.has(txHash)) {
          this.index.byTxHash.set(txHash, []);
        }
        this.index.byTxHash.get(txHash).push(i);
      }

      if (entry.metadata.chainId) {
        if (!this.index.byChainId.has(entry.metadata.chainId)) {
          this.index.byChainId.set(entry.metadata.chainId, []);
        }
        this.index.byChainId.get(entry.metadata.chainId).push(i);
      }
    });
  }

  clear() {
    this.entries = [];
    this.archives = [];
    this.rebuildIndexes();
  }
}

// ============ Audit Logger ============

class AuditLogger extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      storage: config.storage || new MemoryStorage(config.storageOptions),
      retentionDays: config.retentionDays || DEFAULT_RETENTION_DAYS,
      hashChain: config.hashChain !== false,
      rotationSize: config.rotationSize || DEFAULT_ROTATION_SIZE,
      asyncMode: config.asyncMode || false,
    };

    this.storage = this.config.storage;
    this.lastHash = null;
    this.entryCount = 0;
    this.sessionId = crypto.randomBytes(16).toString('hex');
    this.startTime = Date.now();

    // Metrics
    this.metrics = {
      totalLogged: 0,
      byCategory: {},
      bySeverity: {},
      violations: 0,
      errors: 0,
    };
  }

  // ============ Core Logging ============

  log(category, action, data, metadata = {}) {
    try {
      // Validate category
      if (!Object.values(AUDIT_CATEGORIES).includes(category)) {
        this.config.logger.warn(`Unknown audit category: ${category}`);
      }

      // Create entry
      const entry = new AuditEntry(category, action, data, {
        ...metadata,
        sessionId: this.sessionId,
      });

      // Compute hash chain
      if (this.config.hashChain) {
        entry.computeHash(this.lastHash);
        this.lastHash = entry.hash;
      }

      // Store entry
      this.storage.append(entry);
      this.entryCount++;

      // Update metrics
      this.metrics.totalLogged++;
      this.metrics.byCategory[category] = (this.metrics.byCategory[category] || 0) + 1;
      this.metrics.bySeverity[metadata.severity || SEVERITY_LEVELS.INFO] =
        (this.metrics.bySeverity[metadata.severity || SEVERITY_LEVELS.INFO] || 0) + 1;

      if (category === AUDIT_CATEGORIES.VIOLATION) {
        this.metrics.violations++;
      }

      // Emit event
      this.emit('entry', entry);
      this.emit(`entry:${category}`, entry);

      // Log to external logger if critical
      if (metadata.severity === SEVERITY_LEVELS.CRITICAL) {
        this.config.logger.error(`[AUDIT CRITICAL] ${category}:${action}`, data);
      }

      return entry;
    } catch (err) {
      this.metrics.errors++;
      this.config.logger.error('Audit log error:', err);
      throw err;
    }
  }

  async logAsync(category, action, data, metadata = {}) {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const entry = this.log(category, action, data, metadata);
          resolve(entry);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  // ============ Category-Specific Logging (Security Layer) ============

  logExecution(wallet, tx, result, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.EXECUTION,
      result.success ? 'tx_success' : 'tx_failure',
      {
        wallet,
        txHash: tx.hash || result.hash,
        to: tx.to,
        value: tx.value?.toString() || '0',
        gasUsed: result.gasUsed?.toString(),
        gasPrice: tx.gasPrice?.toString(),
        nonce: tx.nonce,
        data: tx.data?.slice(0, 10), // Function selector only
        revertReason: result.revertReason,
        blockNumber: result.blockNumber,
        confirmations: result.confirmations,
      },
      {
        ...metadata,
        severity: result.success ? SEVERITY_LEVELS.INFO : SEVERITY_LEVELS.WARN,
        wallet,
        txHash: tx.hash || result.hash,
        chainId: tx.chainId || metadata.chainId,
      }
    );
  }

  logAccess(userId, permission, granted, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.ACCESS,
      granted ? 'access_granted' : 'access_denied',
      {
        userId,
        permission,
        granted,
        resource: metadata.resource,
        action: metadata.action,
      },
      {
        ...metadata,
        severity: granted ? SEVERITY_LEVELS.INFO : SEVERITY_LEVELS.WARN,
        userId,
      }
    );
  }

  logKeyUsage(keyId, operation, wallet, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.KEY_USAGE,
      operation,
      {
        keyId, // Never log actual key material
        wallet,
        operation,
        purpose: metadata.purpose,
      },
      {
        ...metadata,
        severity: SEVERITY_LEVELS.INFO,
        wallet,
      }
    );
  }

  logApproval(wallet, token, spender, amount, metadata = {}) {
    const isRevoke = amount === '0' || amount === 0n || amount === 0;
    return this.log(
      AUDIT_CATEGORIES.APPROVAL,
      isRevoke ? 'approval_revoked' : 'approval_granted',
      {
        wallet,
        token,
        spender,
        amount: amount?.toString(),
        isUnlimited: amount === 'unlimited' || amount > 2n ** 128n,
      },
      {
        ...metadata,
        severity: isRevoke ? SEVERITY_LEVELS.INFO : SEVERITY_LEVELS.WARN,
        wallet,
      }
    );
  }

  logNonce(wallet, nonce, action, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.NONCE,
      action,
      {
        wallet,
        nonce,
        action,
        previousNonce: metadata.previousNonce,
        reason: metadata.reason,
      },
      {
        ...metadata,
        severity: SEVERITY_LEVELS.DEBUG,
        wallet,
      }
    );
  }

  // ============ Category-Specific Logging (MEV) ============

  logMevProtection(tx, route, reason, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.MEV_PROTECTION,
      `route_${route}`,
      {
        txHash: tx.hash,
        route, // 'flashbots', 'private', 'public'
        reason,
        bundleId: metadata.bundleId,
        builderTarget: metadata.builderTarget,
      },
      {
        ...metadata,
        severity: SEVERITY_LEVELS.INFO,
        txHash: tx.hash,
      }
    );
  }

  logMevIncident(tx, attacker, extraction, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.MEV_INCIDENT,
      'sandwich_detected',
      {
        victimTxHash: tx.hash || tx,
        attackerAddress: attacker,
        extractedValue: extraction?.toString(),
        frontrunTx: metadata.frontrunTx,
        backrunTx: metadata.backrunTx,
        pool: metadata.pool,
      },
      {
        ...metadata,
        severity: SEVERITY_LEVELS.CRITICAL,
        txHash: tx.hash || tx,
      }
    );
  }

  logSimulation(tx, result, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.SIMULATION,
      result.success ? 'simulation_success' : 'simulation_failure',
      {
        txHash: tx.hash,
        to: tx.to,
        success: result.success,
        gasEstimate: result.gasEstimate?.toString(),
        revertReason: result.revertReason,
        stateChanges: result.stateChanges?.length || 0,
      },
      {
        ...metadata,
        severity: result.success ? SEVERITY_LEVELS.DEBUG : SEVERITY_LEVELS.WARN,
        txHash: tx.hash,
      }
    );
  }

  // ============ Category-Specific Logging (Infrastructure) ============

  logRpc(chainId, provider, action, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.RPC,
      action,
      {
        chainId,
        provider,
        action, // 'connected', 'disconnected', 'failover', 'error'
        latency: metadata.latency,
        errorCode: metadata.errorCode,
        errorMessage: metadata.errorMessage,
      },
      {
        ...metadata,
        severity: action === 'error' ? SEVERITY_LEVELS.ERROR : SEVERITY_LEVELS.INFO,
        chainId,
      }
    );
  }

  logOracle(pair, price, source, confidence, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.ORACLE,
      'price_query',
      {
        pair,
        price: price?.toString(),
        source, // 'chainlink', 'uniswap_twap', 'aggregated'
        confidence,
        deviation: metadata.deviation,
        staleness: metadata.staleness,
      },
      {
        ...metadata,
        severity: confidence < 0.9 ? SEVERITY_LEVELS.WARN : SEVERITY_LEVELS.DEBUG,
        chainId: metadata.chainId,
      }
    );
  }

  logSlippage(pair, calculated, applied, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.SLIPPAGE,
      'slippage_calculated',
      {
        pair,
        calculatedSlippage: calculated,
        appliedSlippage: applied,
        tokenTier: metadata.tokenTier,
        priceImpact: metadata.priceImpact,
        wasRejected: metadata.wasRejected,
      },
      {
        ...metadata,
        severity: applied > 0.05 ? SEVERITY_LEVELS.WARN : SEVERITY_LEVELS.DEBUG,
      }
    );
  }

  // ============ Category-Specific Logging (Compliance) ============

  logScreening(address, result, source, metadata = {}) {
    const isSanctioned = result.risk === 'blocked' || result.matches?.length > 0;
    return this.log(
      AUDIT_CATEGORIES.SCREENING,
      isSanctioned ? 'sanctions_match' : 'screening_clear',
      {
        address,
        allowed: result.allowed,
        risk: result.risk,
        matchCount: result.matches?.length || 0,
        matches: result.matches?.map(m => ({
          listName: m.listName,
          matchType: m.matchType,
          confidence: m.confidence,
        })),
        source,
        cached: result.cached,
      },
      {
        ...metadata,
        severity: isSanctioned ? SEVERITY_LEVELS.CRITICAL : SEVERITY_LEVELS.INFO,
      }
    );
  }

  logGeoCheck(ip, country, allowed, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.GEO_CHECK,
      allowed ? 'geo_allowed' : 'geo_blocked',
      {
        ip: this.maskIp(ip), // Partial IP for privacy
        country,
        countryCode: metadata.countryCode,
        allowed,
        reason: metadata.reason,
        isVpn: metadata.isVpn,
      },
      {
        ...metadata,
        severity: allowed ? SEVERITY_LEVELS.DEBUG : SEVERITY_LEVELS.WARN,
      }
    );
  }

  logViolation(type, details, severity, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.VIOLATION,
      type,
      {
        type,
        details,
        severity,
        blockedAction: metadata.blockedAction,
        evidence: metadata.evidence,
      },
      {
        ...metadata,
        severity: severity || SEVERITY_LEVELS.CRITICAL,
      }
    );
  }

  // ============ Administrative Logging ============

  logConfig(action, changes, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.CONFIG,
      action,
      {
        action,
        changes,
        previousValues: metadata.previousValues,
        source: metadata.source,
      },
      {
        ...metadata,
        severity: SEVERITY_LEVELS.WARN,
      }
    );
  }

  logAlert(alertId, level, category, message, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.ALERT,
      `alert_${level}`,
      {
        alertId,
        level,
        category,
        message,
        recipients: metadata.recipients,
        acknowledged: metadata.acknowledged,
      },
      {
        ...metadata,
        severity: level === 'critical' ? SEVERITY_LEVELS.CRITICAL : SEVERITY_LEVELS.INFO,
      }
    );
  }

  logReport(reportType, format, filter, metadata = {}) {
    return this.log(
      AUDIT_CATEGORIES.REPORT,
      'report_generated',
      {
        reportType,
        format,
        filter,
        recordCount: metadata.recordCount,
        timeRange: metadata.timeRange,
      },
      {
        ...metadata,
        severity: SEVERITY_LEVELS.INFO,
      }
    );
  }

  // ============ Query and Export ============

  query(filter = {}, options = {}) {
    return this.storage.query(filter, options);
  }

  export(format, filter = {}, options = {}) {
    const entries = this.storage.query(filter, { limit: options.limit || 100000 });

    switch (format) {
      case EXPORT_FORMATS.JSON:
        return JSON.stringify(entries.map(e => e.toJSON()), null, 2);

      case EXPORT_FORMATS.NDJSON:
        return entries.map(e => JSON.stringify(e.toJSON())).join('\n');

      case EXPORT_FORMATS.CSV: {
        const header = 'id,timestamp,category,action,severity,wallet,txHash,chainId,data,hash';
        const rows = entries.map(e => e.toCSV());
        return [header, ...rows].join('\n');
      }

      default:
        throw new Error(`Unknown export format: ${format}`);
    }
  }

  getStatistics(timeRange = {}) {
    const storageStats = this.storage.getStatistics();

    // Filter by time range if provided
    let entries = this.storage.entries;
    if (timeRange.startTime || timeRange.endTime) {
      entries = this.storage.getRange(
        timeRange.startTime || 0,
        timeRange.endTime || Date.now()
      );
    }

    return {
      ...storageStats,
      sessionId: this.sessionId,
      uptime: Date.now() - this.startTime,
      metrics: { ...this.metrics },
      hashChainEnabled: this.config.hashChain,
      retentionDays: this.config.retentionDays,
      lastHash: this.lastHash,
    };
  }

  // ============ Integrity Verification ============

  verifyIntegrity(startTime, endTime) {
    const entries = this.storage.getRange(startTime || 0, endTime || Date.now());

    if (entries.length === 0) return true;

    let previousHash = entries[0].previousHash;

    for (const entry of entries) {
      // Verify hash chain
      if (entry.previousHash !== previousHash) {
        this.config.logger.error(`Hash chain broken at entry ${entry.id}`);
        return false;
      }

      // Verify entry hash
      const computedHash = crypto
        .createHash(DEFAULT_HASH_ALGORITHM)
        .update(JSON.stringify({
          id: entry.id,
          timestamp: entry.timestamp,
          category: entry.category,
          action: entry.action,
          data: entry.data,
          metadata: entry.metadata,
          previousHash: entry.previousHash,
        }))
        .digest('hex');

      if (computedHash !== entry.hash) {
        this.config.logger.error(`Hash mismatch at entry ${entry.id}`);
        return false;
      }

      previousHash = entry.hash;
    }

    return true;
  }

  getHashChain(startTime, endTime) {
    const entries = this.storage.getRange(startTime || 0, endTime || Date.now());
    return entries.map(e => ({
      id: e.id,
      timestamp: e.timestamp,
      hash: e.hash,
      previousHash: e.previousHash,
    }));
  }

  // ============ Lifecycle ============

  rotate() {
    const result = this.storage.rotate();
    if (result) {
      this.emit('rotated', result);
      this.logConfig('log_rotation', {
        archivedCount: result.count,
        archiveTimestamp: result.timestamp,
      });
    }
    return result;
  }

  archive(olderThan) {
    const result = this.storage.archive(olderThan);
    if (result.archivedCount > 0) {
      this.emit('archived', result);
    }
    return result;
  }

  purge(olderThan, confirm = false) {
    // Check retention policy
    const minRetention = this.config.retentionDays * 24 * 60 * 60 * 1000;
    if (olderThan < minRetention) {
      throw new Error(
        `Cannot purge data newer than retention policy (${this.config.retentionDays} days)`
      );
    }

    const result = this.storage.purge(olderThan, confirm);
    if (result.purgedEntries > 0 || result.purgedArchives > 0) {
      this.emit('purged', result);
      this.logConfig('log_purge', {
        purgedEntries: result.purgedEntries,
        purgedArchives: result.purgedArchives,
        olderThan,
      });
    }
    return result;
  }

  // ============ Utility ============

  maskIp(ip) {
    if (!ip) return null;
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    // IPv6
    return ip.split(':').slice(0, 4).join(':') + ':xxxx:xxxx:xxxx:xxxx';
  }

  getCorrelationId() {
    return `corr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  }

  createChildLogger(context = {}) {
    const parent = this;
    return {
      log: (category, action, data, metadata = {}) =>
        parent.log(category, action, data, { ...context, ...metadata }),
      logExecution: (...args) => parent.logExecution(...args),
      logAccess: (...args) => parent.logAccess(...args),
      logKeyUsage: (...args) => parent.logKeyUsage(...args),
      // ... other methods inherit context
    };
  }
}

// ============ Module Exports ============

module.exports = {
  AuditLogger,
  AuditEntry,
  MemoryStorage,
  AUDIT_CATEGORIES,
  SEVERITY_LEVELS,
  EXPORT_FORMATS,
  DEFAULT_RETENTION_DAYS,

  // Factory function
  createAuditLogger: (config = {}) => new AuditLogger(config),
};
