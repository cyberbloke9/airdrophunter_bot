'use strict';

/**
 * Geo Restrictions - Jurisdiction-Based Access Control
 *
 * Sprint 2.1: Compliance Layer
 *
 * Features:
 * - IP-to-country resolution (MaxMind GeoIP compatible)
 * - Configurable country blocklist
 * - VPN/proxy detection (optional)
 * - Graceful fallback modes
 * - Request-level and session-level checking
 */

const EventEmitter = require('events');
const crypto = require('crypto');

// ============ Constants ============

const FALLBACK_MODES = {
  BLOCK: 'block', // Block if geo lookup fails
  ALLOW: 'allow', // Allow if geo lookup fails (less secure)
  FLAG: 'flag', // Allow but flag for review
};

const VPN_POLICIES = {
  BLOCK: 'block', // Block all VPN traffic
  ALLOW: 'allow', // Allow VPN traffic
  FLAG: 'flag', // Allow but flag for review
};

// Countries commonly restricted due to sanctions/regulations
const DEFAULT_BLOCKED_COUNTRIES = [
  'KP', // North Korea
  'IR', // Iran
  'SY', // Syria
  'CU', // Cuba
  'RU', // Russia (varies by service)
  'BY', // Belarus
  'MM', // Myanmar
];

// US states with crypto restrictions (example)
const RESTRICTED_US_STATES = [
  'NY', // New York (BitLicense requirements)
];

// Sample VPN/Datacenter IP ranges (in production, use full databases)
const KNOWN_VPN_ASN = new Set([
  'AS9009', // M247
  'AS20473', // Vultr
  'AS14061', // DigitalOcean
  'AS16276', // OVH
  'AS14618', // AWS
  'AS15169', // Google Cloud
  'AS8075', // Microsoft Azure
]);

// Sample IP database for testing (in production, use MaxMind GeoIP)
const SAMPLE_GEO_DATABASE = new Map([
  // US IPs
  ['8.8.8.8', { country: 'United States', countryCode: 'US', region: 'CA', city: 'Mountain View' }],
  ['1.1.1.1', { country: 'Australia', countryCode: 'AU', region: 'NSW', city: 'Sydney' }],
  // Blocked country IPs (samples)
  ['175.45.176.1', { country: 'North Korea', countryCode: 'KP', region: '', city: 'Pyongyang' }],
  ['5.160.0.1', { country: 'Iran', countryCode: 'IR', region: 'Tehran', city: 'Tehran' }],
  ['91.108.56.1', { country: 'Russia', countryCode: 'RU', region: 'Moscow', city: 'Moscow' }],
  // VPN indicators
  ['185.220.101.1', { country: 'Germany', countryCode: 'DE', region: 'Berlin', city: 'Berlin', isVpn: true }],
]);

// ============ Geo Check Result ============

class GeoCheckResult {
  constructor(ip, data = {}) {
    this.ip = ip;
    this.country = data.country || 'Unknown';
    this.countryCode = data.countryCode || 'XX';
    this.region = data.region || '';
    this.city = data.city || '';
    this.allowed = data.allowed ?? true;
    this.reason = data.reason || '';
    this.isVpn = data.isVpn || false;
    this.isProxy = data.isProxy || false;
    this.isDatacenter = data.isDatacenter || false;
    this.confidence = data.confidence || 1.0;
    this.timestamp = Date.now();
    this.metadata = data.metadata || {};
  }

  toJSON() {
    return {
      ip: this.ip,
      country: this.country,
      countryCode: this.countryCode,
      region: this.region,
      city: this.city,
      allowed: this.allowed,
      reason: this.reason,
      isVpn: this.isVpn,
      isProxy: this.isProxy,
      isDatacenter: this.isDatacenter,
      confidence: this.confidence,
      timestamp: this.timestamp,
      metadata: this.metadata,
    };
  }
}

// ============ VPN Check Result ============

class VpnCheckResult {
  constructor(ip, data = {}) {
    this.ip = ip;
    this.isVpn = data.isVpn || false;
    this.isProxy = data.isProxy || false;
    this.isDatacenter = data.isDatacenter || false;
    this.isTor = data.isTor || false;
    this.provider = data.provider || null;
    this.asn = data.asn || null;
    this.confidence = data.confidence || 0.0;
    this.timestamp = Date.now();
  }

  toJSON() {
    return {
      ip: this.ip,
      isVpn: this.isVpn,
      isProxy: this.isProxy,
      isDatacenter: this.isDatacenter,
      isTor: this.isTor,
      provider: this.provider,
      asn: this.asn,
      confidence: this.confidence,
      timestamp: this.timestamp,
    };
  }
}

// ============ Geo Restrictor ============

class GeoRestrictor extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      auditLogger: config.auditLogger || null,
      blockedCountries: new Set(config.blockedCountries || DEFAULT_BLOCKED_COUNTRIES),
      blockedRegions: new Map(), // countryCode -> [regions]
      vpnDetection: config.vpnDetection ?? false,
      vpnPolicy: config.vpnPolicy || VPN_POLICIES.FLAG,
      fallbackMode: config.fallbackMode || FALLBACK_MODES.FLAG,
      maxmindLicenseKey: config.maxmindLicenseKey || null,
      cacheTtl: config.cacheTtl || 3600000, // 1 hour
    };

    // IP lookup cache
    this.cache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // Statistics
    this.stats = {
      totalChecks: 0,
      allowedCount: 0,
      blockedCount: 0,
      vpnDetected: 0,
      lookupErrors: 0,
      byCountry: new Map(),
    };

    // In production, this would be MaxMind GeoIP database
    this.geoDatabase = SAMPLE_GEO_DATABASE;

    // Cache cleanup
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 60000);
  }

  // ============ Core Checking ============

  async checkIp(ip) {
    if (!ip || !this.isValidIp(ip)) {
      return new GeoCheckResult(ip || '0.0.0.0', {
        allowed: false,
        reason: 'Invalid IP address',
        confidence: 0,
      });
    }

    this.stats.totalChecks++;

    // Check cache
    const cached = this.getFromCache(ip);
    if (cached) {
      this.cacheHits++;
      return cached;
    }
    this.cacheMisses++;

    try {
      // Get geo data
      const geoData = await this.lookupIp(ip);

      if (!geoData) {
        return this.handleLookupFailure(ip);
      }

      // Track country stats
      const countryCode = geoData.countryCode;
      this.stats.byCountry.set(
        countryCode,
        (this.stats.byCountry.get(countryCode) || 0) + 1
      );

      // Check if country is blocked
      if (this.isCountryBlocked(countryCode)) {
        const result = new GeoCheckResult(ip, {
          ...geoData,
          allowed: false,
          reason: `Country ${countryCode} is restricted`,
        });
        this.cacheResult(ip, result);
        this.stats.blockedCount++;
        this.logGeoCheck(ip, result);
        this.emit('geoBlocked', { ip, result });
        return result;
      }

      // Check if region is blocked
      if (this.isRegionBlocked(countryCode, geoData.region)) {
        const result = new GeoCheckResult(ip, {
          ...geoData,
          allowed: false,
          reason: `Region ${geoData.region}, ${countryCode} is restricted`,
        });
        this.cacheResult(ip, result);
        this.stats.blockedCount++;
        this.logGeoCheck(ip, result);
        this.emit('geoBlocked', { ip, result });
        return result;
      }

      // VPN detection
      let vpnResult = null;
      if (this.config.vpnDetection) {
        vpnResult = await this.checkVpn(ip);

        if (vpnResult.isVpn || vpnResult.isProxy || vpnResult.isTor) {
          this.stats.vpnDetected++;

          if (this.config.vpnPolicy === VPN_POLICIES.BLOCK) {
            const result = new GeoCheckResult(ip, {
              ...geoData,
              allowed: false,
              reason: 'VPN/Proxy detected',
              isVpn: vpnResult.isVpn,
              isProxy: vpnResult.isProxy,
              confidence: vpnResult.confidence,
            });
            this.cacheResult(ip, result);
            this.stats.blockedCount++;
            this.logGeoCheck(ip, result);
            this.emit('vpnBlocked', { ip, result, vpnResult });
            return result;
          }
        }
      }

      // All checks passed
      const result = new GeoCheckResult(ip, {
        ...geoData,
        allowed: true,
        isVpn: vpnResult?.isVpn || geoData.isVpn || false,
        isProxy: vpnResult?.isProxy || false,
        metadata: vpnResult ? { vpn: vpnResult.toJSON() } : {},
      });

      this.cacheResult(ip, result);
      this.stats.allowedCount++;
      this.logGeoCheck(ip, result);
      return result;

    } catch (err) {
      this.stats.lookupErrors++;
      this.config.logger.error?.(`Geo lookup error for ${ip}: ${err.message}`);
      return this.handleLookupFailure(ip);
    }
  }

  async checkRequest(request) {
    // Extract IP from request object
    const ip = this.extractIp(request);
    return this.checkIp(ip);
  }

  handleLookupFailure(ip) {
    let allowed, reason;

    switch (this.config.fallbackMode) {
      case FALLBACK_MODES.BLOCK:
        allowed = false;
        reason = 'Geo lookup failed - blocking by policy';
        this.stats.blockedCount++;
        break;
      case FALLBACK_MODES.ALLOW:
        allowed = true;
        reason = 'Geo lookup failed - allowing by policy';
        this.stats.allowedCount++;
        break;
      case FALLBACK_MODES.FLAG:
      default:
        allowed = true;
        reason = 'Geo lookup failed - flagged for review';
        this.stats.allowedCount++;
        break;
    }

    const result = new GeoCheckResult(ip, {
      allowed,
      reason,
      confidence: 0,
      metadata: { lookupFailed: true },
    });

    this.logGeoCheck(ip, result);
    return result;
  }

  // ============ IP Lookup ============

  async lookupIp(ip) {
    // Check sample database first (for testing)
    if (this.geoDatabase.has(ip)) {
      return this.geoDatabase.get(ip);
    }

    // In production, this would use MaxMind GeoIP2
    // const response = await maxmind.lookup(ip);
    // return this.parseMaxmindResponse(response);

    // For unknown IPs, try to infer from IP ranges
    return this.inferGeoFromIpRange(ip);
  }

  inferGeoFromIpRange(ip) {
    // Basic inference for testing - in production use MaxMind
    const firstOctet = parseInt(ip.split('.')[0], 10);

    // Very rough IP allocation (not accurate for production!)
    if (firstOctet >= 1 && firstOctet <= 126) {
      return { country: 'United States', countryCode: 'US', region: '', city: '' };
    } else if (firstOctet >= 128 && firstOctet <= 191) {
      return { country: 'Europe', countryCode: 'EU', region: '', city: '' };
    } else if (firstOctet >= 192 && firstOctet <= 223) {
      return { country: 'Asia-Pacific', countryCode: 'AP', region: '', city: '' };
    }

    return null;
  }

  // ============ VPN Detection ============

  async checkVpn(ip) {
    // In production, this would use:
    // - IPQualityScore
    // - MaxMind minFraud
    // - IPinfo.io
    // - Custom ASN database

    // Check sample database
    const geoData = this.geoDatabase.get(ip);
    if (geoData?.isVpn) {
      return new VpnCheckResult(ip, {
        isVpn: true,
        confidence: 0.9,
      });
    }

    // Check known datacenter IP ranges (basic check)
    const isDatacenter = this.checkDatacenterIp(ip);

    return new VpnCheckResult(ip, {
      isVpn: false,
      isProxy: false,
      isDatacenter,
      isTor: this.checkTorExit(ip),
      confidence: isDatacenter ? 0.7 : 0.3,
    });
  }

  checkDatacenterIp(ip) {
    // In production, check against ASN database
    // For now, just check first octet patterns common in datacenters
    const firstOctet = parseInt(ip.split('.')[0], 10);
    return [185, 45, 146, 104, 35].includes(firstOctet);
  }

  checkTorExit(ip) {
    // In production, check against Tor exit node list
    // https://check.torproject.org/torbulkexitlist
    return false;
  }

  setVpnPolicy(policy) {
    if (!Object.values(VPN_POLICIES).includes(policy)) {
      throw new Error(`Invalid VPN policy: ${policy}`);
    }
    this.config.vpnPolicy = policy;
  }

  // ============ Country/Region Management ============

  isCountryBlocked(countryCode) {
    return this.config.blockedCountries.has(countryCode);
  }

  isRegionBlocked(countryCode, region) {
    if (!this.config.blockedRegions.has(countryCode)) return false;
    const blockedRegions = this.config.blockedRegions.get(countryCode);
    return blockedRegions.includes(region);
  }

  blockCountry(countryCode, reason = '') {
    const normalizedCode = countryCode.toUpperCase();
    this.config.blockedCountries.add(normalizedCode);

    // Invalidate cache for this country
    this.invalidateCacheByCountry(normalizedCode);

    this.emit('countryBlocked', { countryCode: normalizedCode, reason });

    if (this.config.auditLogger) {
      this.config.auditLogger.logConfig('geo_block_country', {
        countryCode: normalizedCode,
        reason,
      });
    }
  }

  unblockCountry(countryCode) {
    const normalizedCode = countryCode.toUpperCase();
    const removed = this.config.blockedCountries.delete(normalizedCode);

    if (removed) {
      this.invalidateCacheByCountry(normalizedCode);
      this.emit('countryUnblocked', { countryCode: normalizedCode });

      if (this.config.auditLogger) {
        this.config.auditLogger.logConfig('geo_unblock_country', {
          countryCode: normalizedCode,
        });
      }
    }

    return removed;
  }

  setBlockedCountries(countries) {
    this.config.blockedCountries = new Set(
      countries.map(c => c.toUpperCase())
    );
    this.cache.clear(); // Invalidate entire cache

    if (this.config.auditLogger) {
      this.config.auditLogger.logConfig('geo_set_blocked_countries', {
        countries: Array.from(this.config.blockedCountries),
      });
    }
  }

  getBlockedCountries() {
    return Array.from(this.config.blockedCountries).map(code => ({
      countryCode: code,
      countryName: this.getCountryName(code),
    }));
  }

  blockRegion(countryCode, region, reason = '') {
    const normalizedCode = countryCode.toUpperCase();
    if (!this.config.blockedRegions.has(normalizedCode)) {
      this.config.blockedRegions.set(normalizedCode, []);
    }
    this.config.blockedRegions.get(normalizedCode).push(region);

    this.emit('regionBlocked', { countryCode: normalizedCode, region, reason });
  }

  unblockRegion(countryCode, region) {
    const normalizedCode = countryCode.toUpperCase();
    if (!this.config.blockedRegions.has(normalizedCode)) return false;

    const regions = this.config.blockedRegions.get(normalizedCode);
    const index = regions.indexOf(region);
    if (index !== -1) {
      regions.splice(index, 1);
      this.emit('regionUnblocked', { countryCode: normalizedCode, region });
      return true;
    }
    return false;
  }

  // ============ Fallback Configuration ============

  setFallbackMode(mode) {
    if (!Object.values(FALLBACK_MODES).includes(mode)) {
      throw new Error(`Invalid fallback mode: ${mode}`);
    }
    this.config.fallbackMode = mode;
  }

  // ============ Cache Management ============

  cacheResult(ip, result) {
    this.cache.set(ip, {
      result,
      expiresAt: Date.now() + this.config.cacheTtl,
    });
  }

  getFromCache(ip) {
    const cached = this.cache.get(ip);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(ip);
      return null;
    }

    return cached.result;
  }

  invalidateCacheByCountry(countryCode) {
    for (const [ip, entry] of this.cache) {
      if (entry.result.countryCode === countryCode) {
        this.cache.delete(ip);
      }
    }
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    return { clearedEntries: size };
  }

  cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [ip, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(ip);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.config.logger.debug?.(`Cleaned ${cleaned} expired geo cache entries`);
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
    };
  }

  // ============ Reporting ============

  getGeoStats(timeRange = {}) {
    return {
      ...this.stats,
      byCountry: Object.fromEntries(this.stats.byCountry),
      cache: this.getCacheStats(),
      blockedCountryCount: this.config.blockedCountries.size,
      blockedRegionCount: Array.from(this.config.blockedRegions.values())
        .reduce((sum, regions) => sum + regions.length, 0),
      vpnDetection: this.config.vpnDetection,
      vpnPolicy: this.config.vpnPolicy,
      fallbackMode: this.config.fallbackMode,
      timestamp: Date.now(),
    };
  }

  // ============ Utility ============

  isValidIp(ip) {
    if (!ip || typeof ip !== 'string') return false;

    // IPv4
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Pattern.test(ip)) {
      const parts = ip.split('.').map(Number);
      return parts.every(part => part >= 0 && part <= 255);
    }

    // IPv6 (simplified check)
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv6Pattern.test(ip);
  }

  extractIp(request) {
    // Try various headers in order of preference
    const headers = request.headers || {};

    // Cloudflare
    if (headers['cf-connecting-ip']) {
      return headers['cf-connecting-ip'];
    }

    // X-Forwarded-For (first IP)
    if (headers['x-forwarded-for']) {
      return headers['x-forwarded-for'].split(',')[0].trim();
    }

    // X-Real-IP
    if (headers['x-real-ip']) {
      return headers['x-real-ip'];
    }

    // Direct IP
    return request.ip || request.connection?.remoteAddress || null;
  }

  getCountryName(countryCode) {
    const countries = {
      US: 'United States',
      GB: 'United Kingdom',
      DE: 'Germany',
      FR: 'France',
      AU: 'Australia',
      KP: 'North Korea',
      IR: 'Iran',
      SY: 'Syria',
      CU: 'Cuba',
      RU: 'Russia',
      BY: 'Belarus',
      MM: 'Myanmar',
      CN: 'China',
      JP: 'Japan',
      KR: 'South Korea',
      // Add more as needed
    };
    return countries[countryCode] || countryCode;
  }

  logGeoCheck(ip, result) {
    if (this.config.auditLogger) {
      this.config.auditLogger.logGeoCheck(
        ip,
        result.country,
        result.allowed,
        {
          countryCode: result.countryCode,
          reason: result.reason,
          isVpn: result.isVpn,
        }
      );
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
    this.removeAllListeners();
  }
}

// ============ Module Exports ============

module.exports = {
  GeoRestrictor,
  GeoCheckResult,
  VpnCheckResult,
  FALLBACK_MODES,
  VPN_POLICIES,
  DEFAULT_BLOCKED_COUNTRIES,
  RESTRICTED_US_STATES,

  // Factory function
  createGeoRestrictor: (config = {}) => new GeoRestrictor(config),
};
