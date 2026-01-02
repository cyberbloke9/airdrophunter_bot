/**
 * ERC-4337 Safety Module
 *
 * Protects against account abstraction vulnerabilities including:
 * - Non-canonical EntryPoint contracts
 * - Malicious bundlers and DoS attacks
 * - Paymaster exploitation
 * - UserOperation validation bypass
 *
 * Based on known vulnerabilities like UniPass exploit
 *
 * @module security/erc4337-safety
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Canonical ERC-4337 EntryPoint addresses by version
 * Only these should be trusted for UserOperation submission
 */
const CANONICAL_ENTRYPOINTS = {
  'v0.6.0': {
    address: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    deployedChains: [1, 10, 137, 42161, 8453, 43114, 56],
    deprecated: false,
  },
  'v0.7.0': {
    address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    deployedChains: [1, 10, 137, 42161, 8453],
    deprecated: false,
  },
};

/**
 * Default EntryPoint version to use
 */
const DEFAULT_ENTRYPOINT_VERSION = 'v0.6.0';

/**
 * Whitelisted bundler endpoints
 * These are reputable bundlers with track records
 */
const WHITELISTED_BUNDLERS = {
  'biconomy': {
    endpoint: 'https://bundler.biconomy.io',
    name: 'Biconomy',
    reliability: 0.99,
    supportedChains: [1, 137, 42161, 10, 8453],
    features: ['sponsorship', 'batching'],
  },
  'stackup': {
    endpoint: 'https://api.stackup.sh',
    name: 'Stackup',
    reliability: 0.98,
    supportedChains: [1, 137, 42161, 10, 8453, 43114],
    features: ['sponsorship', 'simulation'],
  },
  'pimlico': {
    endpoint: 'https://api.pimlico.io',
    name: 'Pimlico',
    reliability: 0.99,
    supportedChains: [1, 137, 42161, 10, 8453, 43114, 56],
    features: ['sponsorship', 'alto-bundler', 'simulation'],
  },
  'alchemy': {
    endpoint: 'https://eth-mainnet.g.alchemy.com',
    name: 'Alchemy',
    reliability: 0.999,
    supportedChains: [1, 137, 42161, 10, 8453],
    features: ['sponsorship', 'simulation', 'gas-estimation'],
  },
  'particle': {
    endpoint: 'https://bundler.particle.network',
    name: 'Particle Network',
    reliability: 0.97,
    supportedChains: [1, 137, 42161, 10],
    features: ['batching'],
  },
};

/**
 * Gas limits for UserOperation validation
 */
const GAS_LIMITS = {
  maxCallGasLimit: 1_000_000,
  maxVerificationGasLimit: 500_000,
  maxPreVerificationGas: 200_000,
  maxPaymasterVerificationGasLimit: 500_000,
  maxPaymasterPostOpGasLimit: 100_000,

  // Minimum gas values (to prevent DoS via zero-gas ops)
  minCallGasLimit: 21_000,
  minVerificationGasLimit: 10_000,
  minPreVerificationGas: 21_000,
};

/**
 * Paymaster validation settings
 */
const PAYMASTER_SETTINGS = {
  // Max gas a paymaster can consume
  maxGas: 500_000,
  // Require paymaster to be verified/whitelisted
  requireVerification: true,
  // Maximum sponsorship amount in USD
  maxSponsorshipUsd: 100,
  // Minimum paymaster stake (in ETH)
  minStake: 0.5,
  // Minimum unstake delay (in seconds)
  minUnstakeDelay: 86400, // 1 day
};

/**
 * Known malicious or vulnerable patterns
 */
const VULNERABILITY_PATTERNS = {
  // UniPass-style vulnerability - signature validation bypass
  signatureBypass: {
    description: 'Signature validation bypass via malformed data',
    severity: 'critical',
    patterns: [
      /0x00000000.*0x00000000/i, // Null signature padding
    ],
  },
  // Reentry through callback
  reentryCallback: {
    description: 'Reentrancy through validateUserOp callback',
    severity: 'critical',
    dangerousFunctions: ['delegatecall', 'call'],
  },
  // Gas griefing
  gasGriefing: {
    description: 'Excessive gas consumption in validation',
    severity: 'high',
    maxGasRatio: 0.8, // Max 80% of block gas limit
  },
};

/**
 * Severity levels for security events
 */
const SEVERITY_LEVELS = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

// =============================================================================
// USER OPERATION VALIDATOR
// =============================================================================

/**
 * Validates UserOperation objects before submission
 */
class UserOperationValidator {
  constructor(options = {}) {
    this.strictMode = options.strictMode !== false;
    this.gasLimits = { ...GAS_LIMITS, ...options.gasLimits };
  }

  /**
   * Validate a UserOperation
   * @param {Object} userOp - The UserOperation to validate
   * @returns {Object} Validation result
   */
  validate(userOp) {
    const errors = [];
    const warnings = [];

    // Required fields check
    const requiredFields = [
      'sender',
      'nonce',
      'initCode',
      'callData',
      'callGasLimit',
      'verificationGasLimit',
      'preVerificationGas',
      'maxFeePerGas',
      'maxPriorityFeePerGas',
      'paymasterAndData',
      'signature',
    ];

    for (const field of requiredFields) {
      if (userOp[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Sender validation
    if (userOp.sender && !this._isValidAddress(userOp.sender)) {
      errors.push('Invalid sender address');
    }

    // Nonce validation
    if (userOp.nonce !== undefined) {
      const nonce = BigInt(userOp.nonce);
      if (nonce < 0n) {
        errors.push('Nonce cannot be negative');
      }
    }

    // Gas limits validation
    if (userOp.callGasLimit !== undefined) {
      const callGas = BigInt(userOp.callGasLimit);
      if (callGas > BigInt(this.gasLimits.maxCallGasLimit)) {
        errors.push(`callGasLimit exceeds maximum (${this.gasLimits.maxCallGasLimit})`);
      }
      if (callGas < BigInt(this.gasLimits.minCallGasLimit)) {
        errors.push(`callGasLimit below minimum (${this.gasLimits.minCallGasLimit})`);
      }
    }

    if (userOp.verificationGasLimit !== undefined) {
      const verifyGas = BigInt(userOp.verificationGasLimit);
      if (verifyGas > BigInt(this.gasLimits.maxVerificationGasLimit)) {
        errors.push(`verificationGasLimit exceeds maximum (${this.gasLimits.maxVerificationGasLimit})`);
      }
      if (verifyGas < BigInt(this.gasLimits.minVerificationGasLimit)) {
        errors.push(`verificationGasLimit below minimum (${this.gasLimits.minVerificationGasLimit})`);
      }
    }

    if (userOp.preVerificationGas !== undefined) {
      const preVerifyGas = BigInt(userOp.preVerificationGas);
      if (preVerifyGas > BigInt(this.gasLimits.maxPreVerificationGas)) {
        errors.push(`preVerificationGas exceeds maximum (${this.gasLimits.maxPreVerificationGas})`);
      }
      if (preVerifyGas < BigInt(this.gasLimits.minPreVerificationGas)) {
        errors.push(`preVerificationGas below minimum (${this.gasLimits.minPreVerificationGas})`);
      }
    }

    // Fee validation
    if (userOp.maxFeePerGas !== undefined && userOp.maxPriorityFeePerGas !== undefined) {
      const maxFee = BigInt(userOp.maxFeePerGas);
      const priorityFee = BigInt(userOp.maxPriorityFeePerGas);

      if (priorityFee > maxFee) {
        errors.push('maxPriorityFeePerGas cannot exceed maxFeePerGas');
      }

      // Warn on unreasonably high fees
      const maxReasonableFee = BigInt(500e9); // 500 gwei
      if (maxFee > maxReasonableFee) {
        warnings.push('maxFeePerGas is unusually high (>500 gwei)');
      }
    }

    // InitCode validation
    if (userOp.initCode && userOp.initCode !== '0x') {
      if (userOp.initCode.length < 42) {
        errors.push('initCode too short - must include factory address');
      }
      const factoryAddress = userOp.initCode.slice(0, 42);
      if (!this._isValidAddress(factoryAddress)) {
        errors.push('Invalid factory address in initCode');
      }
    }

    // CallData validation
    if (userOp.callData && userOp.callData !== '0x') {
      if (userOp.callData.length < 10) {
        warnings.push('callData unusually short - no function selector');
      }

      // Check for vulnerability patterns
      const vulnCheck = this._checkVulnerabilityPatterns(userOp.callData);
      if (vulnCheck.found) {
        errors.push(`Security vulnerability detected: ${vulnCheck.description}`);
      }
    }

    // Signature validation (basic)
    if (userOp.signature && userOp.signature !== '0x') {
      if (userOp.signature.length < 10) {
        errors.push('Signature too short');
      }

      // Check for null signature attack
      if (/^0x0+$/.test(userOp.signature)) {
        errors.push('Null signature detected - potential bypass attack');
      }
    }

    // PaymasterAndData validation
    if (userOp.paymasterAndData && userOp.paymasterAndData !== '0x') {
      if (userOp.paymasterAndData.length < 42) {
        errors.push('paymasterAndData too short - must include paymaster address');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      strictMode: this.strictMode,
    };
  }

  /**
   * Check for known vulnerability patterns
   * @private
   */
  _checkVulnerabilityPatterns(data) {
    for (const [name, vuln] of Object.entries(VULNERABILITY_PATTERNS)) {
      if (vuln.patterns) {
        for (const pattern of vuln.patterns) {
          if (pattern.test(data)) {
            return {
              found: true,
              name,
              description: vuln.description,
              severity: vuln.severity,
            };
          }
        }
      }
    }
    return { found: false };
  }

  /**
   * Check if address is valid
   * @private
   */
  _isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Calculate UserOperation hash (for signature verification)
   * @param {Object} userOp - The UserOperation
   * @param {string} entryPoint - EntryPoint address
   * @param {number} chainId - Chain ID
   */
  calculateUserOpHash(userOp, entryPoint, chainId) {
    // Pack UserOp data
    const packed = this._packUserOp(userOp);

    // Hash with entryPoint and chainId
    const encoded = Buffer.concat([
      Buffer.from(packed.slice(2), 'hex'),
      Buffer.from(entryPoint.slice(2).padStart(64, '0'), 'hex'),
      Buffer.from(chainId.toString(16).padStart(64, '0'), 'hex'),
    ]);

    return '0x' + crypto.createHash('sha256').update(encoded).digest('hex');
  }

  /**
   * Pack UserOp for hashing
   * @private
   */
  _packUserOp(userOp) {
    // Simplified packing - in production would use proper ABI encoding
    const parts = [
      userOp.sender.slice(2).padStart(64, '0'),
      BigInt(userOp.nonce).toString(16).padStart(64, '0'),
      crypto.createHash('sha256').update(userOp.initCode || '0x').digest('hex'),
      crypto.createHash('sha256').update(userOp.callData || '0x').digest('hex'),
      BigInt(userOp.callGasLimit).toString(16).padStart(64, '0'),
      BigInt(userOp.verificationGasLimit).toString(16).padStart(64, '0'),
      BigInt(userOp.preVerificationGas).toString(16).padStart(64, '0'),
      BigInt(userOp.maxFeePerGas).toString(16).padStart(64, '0'),
      BigInt(userOp.maxPriorityFeePerGas).toString(16).padStart(64, '0'),
      crypto.createHash('sha256').update(userOp.paymasterAndData || '0x').digest('hex'),
    ];

    return '0x' + parts.join('');
  }
}

// =============================================================================
// ENTRYPOINT VERIFIER
// =============================================================================

/**
 * Verifies EntryPoint contracts are canonical
 */
class EntryPointVerifier {
  constructor(options = {}) {
    this.allowedEntryPoints = { ...CANONICAL_ENTRYPOINTS };
    this.allowNonCanonical = options.allowNonCanonical || false;
    this.customEntryPoints = new Map();
  }

  /**
   * Verify an EntryPoint address
   * @param {string} address - EntryPoint address
   * @param {number} chainId - Chain ID
   * @returns {Object} Verification result
   */
  verify(address, chainId) {
    const normalizedAddress = address.toLowerCase();

    // Check canonical EntryPoints
    for (const [version, info] of Object.entries(this.allowedEntryPoints)) {
      if (info.address.toLowerCase() === normalizedAddress) {
        // Check if deployed on this chain
        if (!info.deployedChains.includes(chainId)) {
          return {
            valid: false,
            canonical: true,
            version,
            reason: `EntryPoint ${version} not deployed on chain ${chainId}`,
          };
        }

        if (info.deprecated) {
          return {
            valid: true,
            canonical: true,
            version,
            deprecated: true,
            warning: `EntryPoint ${version} is deprecated`,
          };
        }

        return {
          valid: true,
          canonical: true,
          version,
          deprecated: false,
        };
      }
    }

    // Check custom EntryPoints
    const customKey = `${chainId}:${normalizedAddress}`;
    if (this.customEntryPoints.has(customKey)) {
      const custom = this.customEntryPoints.get(customKey);
      return {
        valid: true,
        canonical: false,
        custom: true,
        name: custom.name,
        addedAt: custom.addedAt,
      };
    }

    // Non-canonical EntryPoint
    if (this.allowNonCanonical) {
      return {
        valid: true,
        canonical: false,
        warning: 'Non-canonical EntryPoint - use with caution',
      };
    }

    return {
      valid: false,
      canonical: false,
      reason: 'Non-canonical EntryPoint rejected',
    };
  }

  /**
   * Get canonical EntryPoint for a chain
   * @param {number} chainId - Chain ID
   * @param {string} version - Version preference
   */
  getCanonicalEntryPoint(chainId, version = DEFAULT_ENTRYPOINT_VERSION) {
    const info = this.allowedEntryPoints[version];
    if (!info) {
      return null;
    }

    if (!info.deployedChains.includes(chainId)) {
      // Try to find any deployed version
      for (const [v, i] of Object.entries(this.allowedEntryPoints)) {
        if (i.deployedChains.includes(chainId) && !i.deprecated) {
          return { address: i.address, version: v };
        }
      }
      return null;
    }

    return { address: info.address, version };
  }

  /**
   * Add a custom trusted EntryPoint
   * @param {number} chainId - Chain ID
   * @param {string} address - EntryPoint address
   * @param {string} name - Name/description
   */
  addCustomEntryPoint(chainId, address, name) {
    const key = `${chainId}:${address.toLowerCase()}`;
    this.customEntryPoints.set(key, {
      name,
      addedAt: Date.now(),
    });
  }
}

// =============================================================================
// BUNDLER MANAGER
// =============================================================================

/**
 * Manages bundler connections and failover
 */
class BundlerManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.bundlers = { ...WHITELISTED_BUNDLERS };
    this.fallbackEnabled = options.fallbackEnabled !== false;
    this.healthStatus = new Map();
    this.requestCounts = new Map();
    this.lastHealthCheck = new Map();
    this.healthCheckInterval = options.healthCheckInterval || 60000;

    // Custom bundlers added at runtime
    this.customBundlers = new Map();
  }

  /**
   * Get available bundlers for a chain
   * @param {number} chainId - Chain ID
   * @returns {Array} Available bundlers
   */
  getAvailableBundlers(chainId) {
    const available = [];

    // Check whitelisted bundlers
    for (const [id, bundler] of Object.entries(this.bundlers)) {
      if (bundler.supportedChains.includes(chainId)) {
        const health = this.healthStatus.get(id) || { healthy: true };
        available.push({
          id,
          ...bundler,
          healthy: health.healthy,
          lastCheck: health.lastCheck,
        });
      }
    }

    // Check custom bundlers
    for (const [id, bundler] of this.customBundlers) {
      if (bundler.supportedChains.includes(chainId)) {
        const health = this.healthStatus.get(id) || { healthy: true };
        available.push({
          id,
          ...bundler,
          custom: true,
          healthy: health.healthy,
          lastCheck: health.lastCheck,
        });
      }
    }

    // Sort by reliability and health
    return available.sort((a, b) => {
      if (a.healthy !== b.healthy) return b.healthy ? 1 : -1;
      return b.reliability - a.reliability;
    });
  }

  /**
   * Select best bundler for a chain
   * @param {number} chainId - Chain ID
   * @param {Object} options - Selection options
   */
  selectBundler(chainId, options = {}) {
    const available = this.getAvailableBundlers(chainId);

    if (available.length === 0) {
      return {
        selected: null,
        reason: 'No bundlers available for this chain',
      };
    }

    // Filter by required features
    let candidates = available;
    if (options.requiredFeatures) {
      candidates = candidates.filter(b =>
        options.requiredFeatures.every(f => b.features.includes(f))
      );
    }

    // Prefer healthy bundlers
    const healthy = candidates.filter(b => b.healthy);
    if (healthy.length > 0) {
      candidates = healthy;
    } else if (!this.fallbackEnabled) {
      return {
        selected: null,
        reason: 'All bundlers unhealthy and fallback disabled',
      };
    }

    // Select highest reliability
    const selected = candidates[0];

    // Track request
    const count = this.requestCounts.get(selected.id) || 0;
    this.requestCounts.set(selected.id, count + 1);

    return {
      selected,
      alternates: candidates.slice(1, 3),
      totalAvailable: available.length,
    };
  }

  /**
   * Report bundler health status
   * @param {string} bundlerId - Bundler ID
   * @param {boolean} healthy - Health status
   * @param {Object} details - Additional details
   */
  reportHealth(bundlerId, healthy, details = {}) {
    const previous = this.healthStatus.get(bundlerId);
    const status = {
      healthy,
      lastCheck: Date.now(),
      ...details,
    };

    this.healthStatus.set(bundlerId, status);
    this.lastHealthCheck.set(bundlerId, Date.now());

    // Emit event on status change
    if (!previous || previous.healthy !== healthy) {
      this.emit('healthChange', {
        bundlerId,
        healthy,
        previous: previous?.healthy,
        details,
      });
    }
  }

  /**
   * Add custom bundler
   * @param {string} id - Unique ID
   * @param {Object} config - Bundler configuration
   */
  addCustomBundler(id, config) {
    if (this.bundlers[id] || this.customBundlers.has(id)) {
      throw new Error(`Bundler ${id} already exists`);
    }

    const bundler = {
      endpoint: config.endpoint,
      name: config.name || id,
      reliability: config.reliability || 0.9,
      supportedChains: config.supportedChains || [],
      features: config.features || [],
    };

    this.customBundlers.set(id, bundler);
    this.emit('bundlerAdded', { id, bundler });

    return bundler;
  }

  /**
   * Remove custom bundler
   * @param {string} id - Bundler ID
   */
  removeCustomBundler(id) {
    if (!this.customBundlers.has(id)) {
      return false;
    }

    this.customBundlers.delete(id);
    this.healthStatus.delete(id);
    this.requestCounts.delete(id);
    this.emit('bundlerRemoved', { id });

    return true;
  }

  /**
   * Get bundler statistics
   */
  getStatistics() {
    const stats = {
      whitelisted: Object.keys(this.bundlers).length,
      custom: this.customBundlers.size,
      healthy: 0,
      unhealthy: 0,
      requestsByBundler: {},
    };

    for (const [id] of Object.entries(this.bundlers)) {
      const health = this.healthStatus.get(id);
      if (!health || health.healthy) {
        stats.healthy++;
      } else {
        stats.unhealthy++;
      }
      stats.requestsByBundler[id] = this.requestCounts.get(id) || 0;
    }

    for (const [id] of this.customBundlers) {
      const health = this.healthStatus.get(id);
      if (!health || health.healthy) {
        stats.healthy++;
      } else {
        stats.unhealthy++;
      }
      stats.requestsByBundler[id] = this.requestCounts.get(id) || 0;
    }

    return stats;
  }
}

// =============================================================================
// PAYMASTER VERIFIER
// =============================================================================

/**
 * Verifies and validates paymasters
 */
class PaymasterVerifier {
  constructor(options = {}) {
    this.settings = { ...PAYMASTER_SETTINGS, ...options };
    this.verifiedPaymasters = new Map();
    this.blacklistedPaymasters = new Set();
  }

  /**
   * Verify paymaster data
   * @param {string} paymasterAndData - Paymaster and data from UserOp
   * @param {number} chainId - Chain ID
   */
  verify(paymasterAndData, chainId) {
    if (!paymasterAndData || paymasterAndData === '0x') {
      return {
        valid: true,
        hasPaymaster: false,
      };
    }

    if (paymasterAndData.length < 42) {
      return {
        valid: false,
        reason: 'Invalid paymasterAndData length',
      };
    }

    const paymasterAddress = paymasterAndData.slice(0, 42);

    // Check blacklist
    if (this.blacklistedPaymasters.has(paymasterAddress.toLowerCase())) {
      return {
        valid: false,
        reason: 'Paymaster is blacklisted',
        paymaster: paymasterAddress,
      };
    }

    // Check if verified
    const key = `${chainId}:${paymasterAddress.toLowerCase()}`;
    const verified = this.verifiedPaymasters.get(key);

    if (this.settings.requireVerification && !verified) {
      return {
        valid: false,
        reason: 'Paymaster not verified',
        paymaster: paymasterAddress,
      };
    }

    return {
      valid: true,
      hasPaymaster: true,
      paymaster: paymasterAddress,
      verified: !!verified,
      verificationDetails: verified,
    };
  }

  /**
   * Validate paymaster gas limits
   * @param {Object} userOp - UserOperation
   */
  validateGasLimits(userOp) {
    const warnings = [];

    if (userOp.paymasterVerificationGasLimit) {
      const gasLimit = BigInt(userOp.paymasterVerificationGasLimit);
      if (gasLimit > BigInt(this.settings.maxGas)) {
        return {
          valid: false,
          reason: `Paymaster verification gas exceeds maximum (${this.settings.maxGas})`,
        };
      }
    }

    if (userOp.paymasterPostOpGasLimit) {
      const gasLimit = BigInt(userOp.paymasterPostOpGasLimit);
      if (gasLimit > BigInt(GAS_LIMITS.maxPaymasterPostOpGasLimit)) {
        warnings.push('High paymaster postOp gas limit');
      }
    }

    return {
      valid: true,
      warnings,
    };
  }

  /**
   * Register a verified paymaster
   * @param {number} chainId - Chain ID
   * @param {string} address - Paymaster address
   * @param {Object} details - Verification details
   */
  registerVerifiedPaymaster(chainId, address, details = {}) {
    const key = `${chainId}:${address.toLowerCase()}`;
    this.verifiedPaymasters.set(key, {
      verifiedAt: Date.now(),
      name: details.name,
      stake: details.stake,
      unstakeDelay: details.unstakeDelay,
      ...details,
    });
  }

  /**
   * Blacklist a paymaster
   * @param {string} address - Paymaster address
   * @param {string} reason - Reason for blacklisting
   */
  blacklistPaymaster(address, reason) {
    this.blacklistedPaymasters.add(address.toLowerCase());
    return { address, reason, blacklistedAt: Date.now() };
  }

  /**
   * Check if paymaster has sufficient stake
   * @param {Object} stakeInfo - Stake information
   */
  checkStake(stakeInfo) {
    if (!stakeInfo) {
      return { sufficient: false, reason: 'No stake info provided' };
    }

    const stake = parseFloat(stakeInfo.stake || 0);
    const unstakeDelay = parseInt(stakeInfo.unstakeDelaySec || 0);

    if (stake < this.settings.minStake) {
      return {
        sufficient: false,
        reason: `Stake ${stake} ETH below minimum ${this.settings.minStake} ETH`,
      };
    }

    if (unstakeDelay < this.settings.minUnstakeDelay) {
      return {
        sufficient: false,
        reason: `Unstake delay ${unstakeDelay}s below minimum ${this.settings.minUnstakeDelay}s`,
      };
    }

    return { sufficient: true };
  }
}

// =============================================================================
// ERC-4337 SAFETY MANAGER
// =============================================================================

/**
 * Main ERC-4337 safety coordination class
 */
class ERC4337Safety extends EventEmitter {
  constructor(options = {}) {
    super();
    this.userOpValidator = new UserOperationValidator(options.validator);
    this.entryPointVerifier = new EntryPointVerifier(options.entryPoint);
    this.bundlerManager = new BundlerManager(options.bundler);
    this.paymasterVerifier = new PaymasterVerifier(options.paymaster);

    this.config = {
      strictValidation: options.strictValidation !== false,
      rejectNonCanonical: options.rejectNonCanonical !== false,
      requireVerifiedPaymaster: options.requireVerifiedPaymaster || false,
    };

    this.stats = {
      validatedOps: 0,
      rejectedOps: 0,
      warnings: 0,
      lastReset: Date.now(),
    };

    // Forward bundler events
    this.bundlerManager.on('healthChange', (data) => {
      this.emit('bundlerHealthChange', data);
    });
  }

  /**
   * Validate a complete UserOperation submission
   * @param {Object} userOp - The UserOperation
   * @param {string} entryPoint - EntryPoint address
   * @param {number} chainId - Chain ID
   */
  async validateSubmission(userOp, entryPoint, chainId) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      entryPoint: null,
      userOp: null,
      paymaster: null,
      bundler: null,
    };

    // 1. Validate EntryPoint
    const epResult = this.entryPointVerifier.verify(entryPoint, chainId);
    results.entryPoint = epResult;

    if (!epResult.valid) {
      results.valid = false;
      results.errors.push(`EntryPoint: ${epResult.reason}`);
    } else if (epResult.warning) {
      results.warnings.push(`EntryPoint: ${epResult.warning}`);
    }

    // 2. Validate UserOperation
    const opResult = this.userOpValidator.validate(userOp);
    results.userOp = opResult;

    if (!opResult.valid) {
      results.valid = false;
      results.errors.push(...opResult.errors.map(e => `UserOp: ${e}`));
    }
    results.warnings.push(...opResult.warnings.map(w => `UserOp: ${w}`));

    // 3. Validate Paymaster
    const pmResult = this.paymasterVerifier.verify(userOp.paymasterAndData, chainId);
    results.paymaster = pmResult;

    if (!pmResult.valid) {
      if (this.config.requireVerifiedPaymaster) {
        results.valid = false;
        results.errors.push(`Paymaster: ${pmResult.reason}`);
      } else {
        results.warnings.push(`Paymaster: ${pmResult.reason}`);
      }
    }

    // Validate paymaster gas
    if (pmResult.hasPaymaster) {
      const gasResult = this.paymasterVerifier.validateGasLimits(userOp);
      if (!gasResult.valid) {
        results.valid = false;
        results.errors.push(`Paymaster gas: ${gasResult.reason}`);
      }
      results.warnings.push(...(gasResult.warnings || []));
    }

    // 4. Select bundler
    const bundlerResult = this.bundlerManager.selectBundler(chainId);
    results.bundler = bundlerResult;

    if (!bundlerResult.selected) {
      results.valid = false;
      results.errors.push(`Bundler: ${bundlerResult.reason}`);
    }

    // Update stats
    if (results.valid) {
      this.stats.validatedOps++;
    } else {
      this.stats.rejectedOps++;
    }
    this.stats.warnings += results.warnings.length;

    // Emit event
    this.emit('validation', {
      valid: results.valid,
      chainId,
      entryPoint,
      sender: userOp.sender,
      errorCount: results.errors.length,
      warningCount: results.warnings.length,
    });

    return results;
  }

  /**
   * Get canonical EntryPoint for submission
   * @param {number} chainId - Chain ID
   * @param {string} version - Preferred version
   */
  getEntryPoint(chainId, version) {
    return this.entryPointVerifier.getCanonicalEntryPoint(chainId, version);
  }

  /**
   * Get recommended bundler for submission
   * @param {number} chainId - Chain ID
   * @param {Object} options - Selection options
   */
  getBundler(chainId, options) {
    return this.bundlerManager.selectBundler(chainId, options);
  }

  /**
   * Register a verified paymaster
   */
  registerPaymaster(chainId, address, details) {
    return this.paymasterVerifier.registerVerifiedPaymaster(chainId, address, details);
  }

  /**
   * Blacklist a paymaster
   */
  blacklistPaymaster(address, reason) {
    return this.paymasterVerifier.blacklistPaymaster(address, reason);
  }

  /**
   * Report bundler health
   */
  reportBundlerHealth(bundlerId, healthy, details) {
    return this.bundlerManager.reportHealth(bundlerId, healthy, details);
  }

  /**
   * Calculate UserOp hash
   */
  calculateUserOpHash(userOp, entryPoint, chainId) {
    return this.userOpValidator.calculateUserOpHash(userOp, entryPoint, chainId);
  }

  /**
   * Get module statistics
   */
  getStatistics() {
    return {
      validation: { ...this.stats },
      bundlers: this.bundlerManager.getStatistics(),
    };
  }

  /**
   * Get module status
   */
  getStatus() {
    return {
      healthy: true,
      strictMode: this.config.strictValidation,
      rejectNonCanonical: this.config.rejectNonCanonical,
      stats: this.getStatistics(),
      entryPointVersions: Object.keys(CANONICAL_ENTRYPOINTS),
      bundlerCount: Object.keys(WHITELISTED_BUNDLERS).length + this.bundlerManager.customBundlers.size,
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create an ERC-4337 safety instance
 * @param {Object} options - Configuration options
 */
function createERC4337Safety(options = {}) {
  return new ERC4337Safety(options);
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Main class
  ERC4337Safety,
  createERC4337Safety,

  // Sub-components
  UserOperationValidator,
  EntryPointVerifier,
  BundlerManager,
  PaymasterVerifier,

  // Constants
  CANONICAL_ENTRYPOINTS,
  WHITELISTED_BUNDLERS,
  GAS_LIMITS,
  PAYMASTER_SETTINGS,
  VULNERABILITY_PATTERNS,
  SEVERITY_LEVELS,
  DEFAULT_ENTRYPOINT_VERSION,
};
