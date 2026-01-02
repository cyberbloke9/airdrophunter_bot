'use strict';

/**
 * Address Screening - OFAC/Sanctions List Integration
 *
 * Sprint 2.1: Compliance Layer
 *
 * Features:
 * - OFAC SDN list integration
 * - Chainalysis API support (optional)
 * - Custom blocklist/allowlist
 * - Real-time and batch screening
 * - Caching with configurable TTL
 * - Graceful degradation on API failure
 */

const EventEmitter = require('events');
const crypto = require('crypto');

// ============ Constants ============

const RISK_LEVELS = {
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  BLOCKED: 'blocked',
};

const SCREENING_SOURCES = {
  OFAC: 'ofac',
  CHAINALYSIS: 'chainalysis',
  CUSTOM_BLOCKLIST: 'custom_blocklist',
  CUSTOM_ALLOWLIST: 'custom_allowlist',
  CACHE: 'cache',
};

const MATCH_TYPES = {
  EXACT: 'exact',
  PARTIAL: 'partial',
  ASSOCIATED: 'associated',
};

// Default OFAC SDN cryptocurrency addresses (sample - real list is much larger)
// In production, this would be fetched from official OFAC API
const SAMPLE_OFAC_ADDRESSES = new Set([
  '0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c', // Example sanctioned address
  '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b',
  '0x7f367cc41522ce07553e823bf3be79a889debe1b',
  '0x1da5821544e25c636c1417ba96ade4cf6d2f9b5a',
  '0x72a5843cc08275c8171e582972aa4fda8c397b2a',
  '0x7f19720a857f834887fc9a7bc0a0fbe7fc7f8102',
  '0x9f4cda013e354b8fc285bf4b9a60460cee7f7ea9',
  // Tornado Cash related
  '0x8589427373d6d84e98730d7795d8f6f8731fda16',
  '0x722122df12d4e14e13ac3b6895a86e84145b6967',
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
  '0xd96f2b1c14db8458374d9aca76e26c3d18364307',
]);

// Known high-risk patterns
const HIGH_RISK_PATTERNS = [
  /^0x0{38}[0-9a-f]{2}$/i, // Almost null addresses
  /^0xdead/i, // Dead addresses
  /^0x0{40}$/i, // Null address
];

// Default cache TTL (1 hour)
const DEFAULT_CACHE_TTL = 3600000;

// ============ Screening Result ============

class ScreeningResult {
  constructor(address, data = {}) {
    this.address = address.toLowerCase();
    this.allowed = data.allowed ?? true;
    this.risk = data.risk || RISK_LEVELS.NONE;
    this.matches = data.matches || [];
    this.sources = data.sources || [];
    this.timestamp = Date.now();
    this.cached = data.cached || false;
    this.confidence = data.confidence || 1.0;
    this.metadata = data.metadata || {};
  }

  toJSON() {
    return {
      address: this.address,
      allowed: this.allowed,
      risk: this.risk,
      matches: this.matches,
      sources: this.sources,
      timestamp: this.timestamp,
      cached: this.cached,
      confidence: this.confidence,
      metadata: this.metadata,
    };
  }
}

// ============ Transaction Screening Result ============

class TxScreeningResult {
  constructor(tx, results = {}) {
    this.txHash = tx.hash;
    this.allowed = true;
    this.fromResult = results.from;
    this.toResult = results.to;
    this.additionalResults = results.additional || [];
    this.timestamp = Date.now();
    this.riskSummary = {
      highest: RISK_LEVELS.NONE,
      blockedCount: 0,
      highRiskCount: 0,
    };

    this.computeRiskSummary();
  }

  computeRiskSummary() {
    const allResults = [
      this.fromResult,
      this.toResult,
      ...this.additionalResults,
    ].filter(Boolean);

    for (const result of allResults) {
      if (!result.allowed) {
        this.allowed = false;
        this.riskSummary.blockedCount++;
      }

      if (result.risk === RISK_LEVELS.BLOCKED) {
        this.riskSummary.highest = RISK_LEVELS.BLOCKED;
      } else if (
        result.risk === RISK_LEVELS.HIGH &&
        this.riskSummary.highest !== RISK_LEVELS.BLOCKED
      ) {
        this.riskSummary.highest = RISK_LEVELS.HIGH;
        this.riskSummary.highRiskCount++;
      } else if (
        result.risk === RISK_LEVELS.MEDIUM &&
        ![RISK_LEVELS.BLOCKED, RISK_LEVELS.HIGH].includes(this.riskSummary.highest)
      ) {
        this.riskSummary.highest = RISK_LEVELS.MEDIUM;
      }
    }
  }

  toJSON() {
    return {
      txHash: this.txHash,
      allowed: this.allowed,
      fromResult: this.fromResult?.toJSON(),
      toResult: this.toResult?.toJSON(),
      additionalResults: this.additionalResults.map(r => r.toJSON()),
      timestamp: this.timestamp,
      riskSummary: this.riskSummary,
    };
  }
}

// ============ Address Screener ============

class AddressScreener extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      auditLogger: config.auditLogger || null,
      ofacEnabled: config.ofacEnabled !== false,
      chainalysisApiKey: config.chainalysisApiKey || null,
      chainalysisBaseUrl: config.chainalysisBaseUrl || 'https://api.chainalysis.com',
      cacheTtl: config.cacheTtl || DEFAULT_CACHE_TTL,
      strictMode: config.strictMode ?? true, // Block on any match
      failOpen: config.failOpen ?? false, // Allow on API failure (dangerous!)
    };

    // Lists
    this.blocklist = new Map(); // address -> { reason, addedAt, addedBy }
    this.allowlist = new Map(); // address -> { reason, addedAt, addedBy }
    this.ofacList = new Set();

    // Cache
    this.cache = new Map(); // address -> { result, expiresAt }
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // Statistics
    this.stats = {
      totalScreenings: 0,
      blockedCount: 0,
      allowedCount: 0,
      cacheHits: 0,
      ofacMatches: 0,
      customBlocklistMatches: 0,
      apiErrors: 0,
    };

    // Initialize OFAC list
    this.initializeOfacList();

    // Cache cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 60000);
  }

  // ============ Initialization ============

  initializeOfacList() {
    // Load sample OFAC addresses
    // In production, this would fetch from official OFAC API
    for (const addr of SAMPLE_OFAC_ADDRESSES) {
      this.ofacList.add(addr.toLowerCase());
    }

    this.config.logger.info?.(
      `Initialized OFAC list with ${this.ofacList.size} addresses`
    );
  }

  async updateOfacList(customList = null) {
    const previousSize = this.ofacList.size;

    if (customList && Array.isArray(customList)) {
      // Update from provided list
      this.ofacList.clear();
      for (const addr of customList) {
        if (this.isValidAddress(addr)) {
          this.ofacList.add(addr.toLowerCase());
        }
      }
    } else {
      // In production: fetch from OFAC API
      // For now, just re-initialize with sample data
      this.initializeOfacList();
    }

    const result = {
      previousSize,
      currentSize: this.ofacList.size,
      timestamp: Date.now(),
    };

    this.emit('ofacListUpdated', result);
    return result;
  }

  getOfacListAge() {
    // In production, track when list was last updated
    return Date.now() - this.startTime;
  }

  // ============ Core Screening ============

  async checkAddress(address) {
    if (!address || !this.isValidAddress(address)) {
      return new ScreeningResult(address || '0x0', {
        allowed: false,
        risk: RISK_LEVELS.BLOCKED,
        matches: [{ type: 'invalid_address', reason: 'Invalid address format' }],
        sources: ['validation'],
      });
    }

    const normalizedAddress = address.toLowerCase();
    this.stats.totalScreenings++;

    // Check cache first
    const cached = this.getFromCache(normalizedAddress);
    if (cached) {
      this.stats.cacheHits++;
      this.cacheHits++;
      return cached;
    }
    this.cacheMisses++;

    // Check allowlist (highest priority)
    if (this.allowlist.has(normalizedAddress)) {
      const result = new ScreeningResult(address, {
        allowed: true,
        risk: RISK_LEVELS.NONE,
        sources: [SCREENING_SOURCES.CUSTOM_ALLOWLIST],
        metadata: this.allowlist.get(normalizedAddress),
      });
      this.cacheResult(normalizedAddress, result);
      this.stats.allowedCount++;
      this.logScreening(address, result);
      return result;
    }

    // Check custom blocklist
    if (this.blocklist.has(normalizedAddress)) {
      const blockInfo = this.blocklist.get(normalizedAddress);
      const result = new ScreeningResult(address, {
        allowed: false,
        risk: RISK_LEVELS.BLOCKED,
        matches: [{
          type: MATCH_TYPES.EXACT,
          listName: 'custom_blocklist',
          reason: blockInfo.reason,
          confidence: 1.0,
        }],
        sources: [SCREENING_SOURCES.CUSTOM_BLOCKLIST],
        metadata: blockInfo,
      });
      this.cacheResult(normalizedAddress, result);
      this.stats.blockedCount++;
      this.stats.customBlocklistMatches++;
      this.logScreening(address, result);
      return result;
    }

    // Check OFAC list
    if (this.config.ofacEnabled && this.ofacList.has(normalizedAddress)) {
      const result = new ScreeningResult(address, {
        allowed: false,
        risk: RISK_LEVELS.BLOCKED,
        matches: [{
          type: MATCH_TYPES.EXACT,
          listName: 'OFAC_SDN',
          reason: 'Address on OFAC Specially Designated Nationals list',
          confidence: 1.0,
        }],
        sources: [SCREENING_SOURCES.OFAC],
      });
      this.cacheResult(normalizedAddress, result);
      this.stats.blockedCount++;
      this.stats.ofacMatches++;
      this.emit('sanctionsMatch', { address, result });
      this.logScreening(address, result);
      return result;
    }

    // Check high-risk patterns
    const patternRisk = this.checkHighRiskPatterns(normalizedAddress);
    if (patternRisk) {
      const result = new ScreeningResult(address, {
        allowed: !this.config.strictMode,
        risk: RISK_LEVELS.HIGH,
        matches: [patternRisk],
        sources: ['pattern_analysis'],
      });
      this.cacheResult(normalizedAddress, result);
      if (!result.allowed) this.stats.blockedCount++;
      else this.stats.allowedCount++;
      this.logScreening(address, result);
      return result;
    }

    // Check Chainalysis (if configured)
    if (this.config.chainalysisApiKey) {
      try {
        const chainalysisResult = await this.checkChainalysis(normalizedAddress);
        if (chainalysisResult) {
          this.cacheResult(normalizedAddress, chainalysisResult);
          if (!chainalysisResult.allowed) this.stats.blockedCount++;
          else this.stats.allowedCount++;
          this.logScreening(address, chainalysisResult);
          return chainalysisResult;
        }
      } catch (err) {
        this.stats.apiErrors++;
        this.config.logger.warn?.(`Chainalysis check failed: ${err.message}`);
        if (!this.config.failOpen) {
          // Fail closed - block on API error
          const result = new ScreeningResult(address, {
            allowed: false,
            risk: RISK_LEVELS.HIGH,
            matches: [{ type: 'api_error', reason: 'Unable to verify address' }],
            sources: ['chainalysis_error'],
          });
          this.logScreening(address, result);
          return result;
        }
      }
    }

    // All checks passed
    const result = new ScreeningResult(address, {
      allowed: true,
      risk: RISK_LEVELS.NONE,
      sources: this.getCheckedSources(),
    });
    this.cacheResult(normalizedAddress, result);
    this.stats.allowedCount++;
    this.logScreening(address, result);
    return result;
  }

  async checkAddresses(addresses) {
    const results = await Promise.all(
      addresses.map(addr => this.checkAddress(addr))
    );
    return results;
  }

  async checkTransaction(tx) {
    const results = {};

    // Check from address
    if (tx.from) {
      results.from = await this.checkAddress(tx.from);
    }

    // Check to address
    if (tx.to) {
      results.to = await this.checkAddress(tx.to);
    }

    // Check additional addresses (tokens, router, etc.)
    const additionalAddresses = [];
    if (tx.tokenAddress) additionalAddresses.push(tx.tokenAddress);
    if (tx.routerAddress) additionalAddresses.push(tx.routerAddress);
    if (tx.spender) additionalAddresses.push(tx.spender);

    if (additionalAddresses.length > 0) {
      results.additional = await this.checkAddresses(additionalAddresses);
    }

    const txResult = new TxScreeningResult(tx, results);

    // Log transaction screening
    if (this.config.auditLogger) {
      this.config.auditLogger.logScreening(
        tx.hash || 'pending',
        txResult.toJSON(),
        'transaction'
      );
    }

    // Emit event if blocked
    if (!txResult.allowed) {
      this.emit('transactionBlocked', { tx, result: txResult });
    }

    return txResult;
  }

  // ============ Pattern Analysis ============

  checkHighRiskPatterns(address) {
    for (const pattern of HIGH_RISK_PATTERNS) {
      if (pattern.test(address)) {
        return {
          type: 'high_risk_pattern',
          pattern: pattern.toString(),
          reason: 'Address matches high-risk pattern',
          confidence: 0.8,
        };
      }
    }
    return null;
  }

  // ============ External API Integration ============

  async checkChainalysis(address) {
    // Chainalysis KYT API integration
    // This is a placeholder - real implementation would use their API
    if (!this.config.chainalysisApiKey) return null;

    // In production:
    // const response = await fetch(`${this.config.chainalysisBaseUrl}/v2/entities/${address}`, {
    //   headers: { 'Authorization': `Bearer ${this.config.chainalysisApiKey}` }
    // });
    // return this.parseChainalysisResponse(response);

    return null; // No result from Chainalysis in demo mode
  }

  // ============ List Management ============

  addToBlocklist(address, reason, addedBy = 'system') {
    if (!this.isValidAddress(address)) {
      throw new Error('Invalid address format');
    }

    const normalizedAddress = address.toLowerCase();
    const entry = {
      reason,
      addedAt: Date.now(),
      addedBy,
    };

    this.blocklist.set(normalizedAddress, entry);

    // Invalidate cache for this address
    this.cache.delete(normalizedAddress);

    this.emit('blocklistUpdated', { action: 'add', address: normalizedAddress, entry });

    if (this.config.auditLogger) {
      this.config.auditLogger.logConfig('blocklist_add', {
        address: normalizedAddress,
        reason,
        addedBy,
      });
    }
  }

  removeFromBlocklist(address) {
    const normalizedAddress = address.toLowerCase();
    const removed = this.blocklist.delete(normalizedAddress);
    this.cache.delete(normalizedAddress);

    if (removed) {
      this.emit('blocklistUpdated', { action: 'remove', address: normalizedAddress });
    }

    return removed;
  }

  addToAllowlist(address, reason, addedBy = 'system') {
    if (!this.isValidAddress(address)) {
      throw new Error('Invalid address format');
    }

    const normalizedAddress = address.toLowerCase();
    const entry = {
      reason,
      addedAt: Date.now(),
      addedBy,
    };

    this.allowlist.set(normalizedAddress, entry);

    // Invalidate cache
    this.cache.delete(normalizedAddress);

    this.emit('allowlistUpdated', { action: 'add', address: normalizedAddress, entry });

    if (this.config.auditLogger) {
      this.config.auditLogger.logConfig('allowlist_add', {
        address: normalizedAddress,
        reason,
        addedBy,
      });
    }
  }

  removeFromAllowlist(address) {
    const normalizedAddress = address.toLowerCase();
    const removed = this.allowlist.delete(normalizedAddress);
    this.cache.delete(normalizedAddress);

    if (removed) {
      this.emit('allowlistUpdated', { action: 'remove', address: normalizedAddress });
    }

    return removed;
  }

  getBlocklist() {
    return Array.from(this.blocklist.entries()).map(([address, info]) => ({
      address,
      ...info,
    }));
  }

  getAllowlist() {
    return Array.from(this.allowlist.entries()).map(([address, info]) => ({
      address,
      ...info,
    }));
  }

  getBlockedAddresses() {
    return this.getBlocklist();
  }

  // ============ Cache Management ============

  cacheResult(address, result) {
    this.cache.set(address, {
      result: new ScreeningResult(address, {
        ...result.toJSON(),
        cached: true,
      }),
      expiresAt: Date.now() + this.config.cacheTtl,
    });
  }

  getFromCache(address) {
    const cached = this.cache.get(address);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(address);
      return null;
    }

    return cached.result;
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    return { clearedEntries: size };
  }

  cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [address, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(address);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.config.logger.debug?.(`Cleaned ${cleaned} expired cache entries`);
    }
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: this.cacheHits + this.cacheMisses > 0
        ? this.cacheHits / (this.cacheHits + this.cacheMisses)
        : 0,
      ttl: this.config.cacheTtl,
    };
  }

  // ============ Reporting ============

  getScreeningStats(timeRange = {}) {
    return {
      ...this.stats,
      cache: this.getCacheStats(),
      ofacListSize: this.ofacList.size,
      blocklistSize: this.blocklist.size,
      allowlistSize: this.allowlist.size,
      timestamp: Date.now(),
    };
  }

  // ============ Utility ============

  isValidAddress(address) {
    if (!address || typeof address !== 'string') return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  getCheckedSources() {
    const sources = [];
    if (this.config.ofacEnabled) sources.push(SCREENING_SOURCES.OFAC);
    if (this.blocklist.size > 0) sources.push(SCREENING_SOURCES.CUSTOM_BLOCKLIST);
    if (this.allowlist.size > 0) sources.push(SCREENING_SOURCES.CUSTOM_ALLOWLIST);
    if (this.config.chainalysisApiKey) sources.push(SCREENING_SOURCES.CHAINALYSIS);
    return sources;
  }

  logScreening(address, result) {
    if (this.config.auditLogger) {
      this.config.auditLogger.logScreening(address, result.toJSON(), result.sources[0]);
    }
  }

  // ============ Lifecycle ============

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  destroy() {
    this.stop();
    this.cache.clear();
    this.blocklist.clear();
    this.allowlist.clear();
    this.removeAllListeners();
  }
}

// ============ Module Exports ============

module.exports = {
  AddressScreener,
  ScreeningResult,
  TxScreeningResult,
  RISK_LEVELS,
  SCREENING_SOURCES,
  MATCH_TYPES,
  SAMPLE_OFAC_ADDRESSES,

  // Factory function
  createAddressScreener: (config = {}) => new AddressScreener(config),
};
