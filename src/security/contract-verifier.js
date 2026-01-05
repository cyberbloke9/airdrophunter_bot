'use strict';

/**
 * Contract Verification Module
 *
 * Sprint 2.2: Contract Safety & Simulation
 *
 * =============================================================================
 * THE 6 W's: CONTRACT VERIFICATION
 * =============================================================================
 *
 * WHO:
 * ----
 * - LEGITIMATE DEVELOPERS: Verify contracts to build trust
 *   - Major protocols (Uniswap, Aave, OpenSea) all have verified contracts
 *   - Verification allows security researchers to audit code
 *   - Required for many integrations and partnerships
 *
 * - SCAMMERS: Often avoid verification to hide malicious code
 *   - Rug pulls frequently use unverified contracts
 *   - Drainers rarely verify (would expose the drain logic)
 *   - Some sophisticated scammers DO verify to appear legitimate
 *
 * - VERIFICATION SERVICES:
 *   - Etherscan/Polygonscan/Arbiscan: Centralized, most common
 *   - Sourcify: Decentralized verification, growing adoption
 *   - Tenderly: Adds simulation capabilities
 *
 * - SECURITY AUDITORS:
 *   - Trail of Bits, OpenZeppelin, Consensys Diligence
 *   - Audited contracts have formal security review
 *   - Audit != perfect security, but reduces risk significantly
 *
 * WHAT:
 * -----
 * Contract verification means:
 * 1. SOURCE CODE is publicly available
 * 2. SOURCE CODE compiles to EXACT bytecode on-chain
 * 3. Anyone can READ and AUDIT the contract logic
 *
 * Trust score components:
 * - Verification status (verified vs unverified)
 * - Contract age (older = more battle-tested)
 * - Interaction history (more usage = more trust)
 * - Proxy detection (check implementation, not just proxy)
 * - Security audits (formal third-party review)
 * - Deployer reputation (known good actors vs anon)
 *
 * WHEN:
 * -----
 * WHEN to verify:
 * - BEFORE any token approval (most important!)
 * - BEFORE interacting with new protocols
 * - BEFORE providing liquidity
 * - BEFORE minting NFTs from unknown collections
 * - After receiving airdrop claim links (often scams)
 *
 * WHEN verification becomes stale:
 * - Proxy contracts can change implementation at any time
 * - Need to re-verify after proxy upgrades
 * - Cached trust scores should expire (24 hours recommended)
 *
 * WHERE:
 * ------
 * Verification data sources by chain:
 *
 * | Chain      | Explorer API              | Sourcify |
 * |------------|---------------------------|----------|
 * | Ethereum   | api.etherscan.io          | Yes      |
 * | Polygon    | api.polygonscan.com       | Yes      |
 * | Arbitrum   | api.arbiscan.io           | Yes      |
 * | Optimism   | api-optimistic.etherscan.io| Yes     |
 * | Base       | api.basescan.org          | Yes      |
 * | BSC        | api.bscscan.com           | Yes      |
 * | Avalanche  | api.snowtrace.io          | Yes      |
 *
 * WHERE to find audit reports:
 * - Protocol's official docs/GitHub
 * - Audit firm websites
 * - DeFi Safety ratings
 * - Rekt.news (for past incidents)
 *
 * WHY:
 * ----
 * WHY verification matters:
 *
 * 1. UNVERIFIED = BLACK BOX
 *    - Cannot see what code does
 *    - Could contain hidden drains, backdoors, or rugpull logic
 *    - No way to audit without reverse engineering bytecode
 *
 * 2. VERIFIED = TRANSPARENT
 *    - Anyone can read the code
 *    - Security researchers can spot issues
 *    - Community can review and flag problems
 *
 * 3. VERIFICATION != SAFETY
 *    - Code can be verified AND malicious (just harder to hide)
 *    - Subtle bugs can exist in verified code
 *    - That's why we need MULTIPLE trust signals
 *
 * WHY each trust signal matters:
 * - Age: Time exposes bugs/rugs - 90+ days without incident is good
 * - Usage: Many users = crowd-sourced security testing
 * - Audits: Professional review catches issues users miss
 * - Deployer: Known teams are accountable, anons can disappear
 * - Proxy: Must verify implementation, not just proxy shell
 *
 * HOW:
 * ----
 * Trust score calculation:
 *
 * BASE SCORE: Start at 0
 *
 * VERIFICATION (max +30):
 * - Verified on Etherscan: +25
 * - Verified on Sourcify: +20
 * - Verified on multiple sources: +30
 * - Unverified: +0 (major red flag)
 *
 * AGE (max +20):
 * - < 1 day: -10 (suspicious)
 * - 1-7 days: +0
 * - 7-30 days: +5
 * - 30-90 days: +10
 * - > 90 days: +20
 *
 * INTERACTIONS (max +20):
 * - 0 txs: -15 (never used, suspicious)
 * - 1-10 txs: +0
 * - 10-100 txs: +5
 * - 100-1000 txs: +10
 * - > 1000 txs: +20
 *
 * AUDITS (max +25):
 * - Top-tier audit (Trail of Bits, OZ): +25
 * - Mid-tier audit: +15
 * - Self-reported audit: +5
 * - No audit: +0
 *
 * DEPLOYER (max +10):
 * - Known team (ENS, Twitter verified): +10
 * - Contract factory (OpenZeppelin, etc): +5
 * - Anonymous: +0
 *
 * PENALTIES:
 * - Proxy with unverified implementation: -20
 * - Known vulnerability (not patched): BLOCK
 * - Deployer on scammer list: BLOCK
 *
 * FINAL THRESHOLDS:
 * - 80+: SAFE (green light)
 * - 50-79: CAUTION (yellow, warn user)
 * - 20-49: RISKY (red, require override)
 * - <20: BLOCKED (no interaction)
 *
 * =============================================================================
 */

const EventEmitter = require('events');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Trust levels based on verification score
 */
const TRUST_LEVEL = {
  SAFE: 'safe',           // Score 80+
  CAUTION: 'caution',     // Score 50-79
  RISKY: 'risky',         // Score 20-49
  BLOCKED: 'blocked',     // Score <20 or hard block
};

/**
 * Score thresholds for trust levels
 */
const TRUST_THRESHOLDS = {
  SAFE: 80,
  CAUTION: 50,
  RISKY: 20,
};

/**
 * Verification sources by chain
 *
 * WHO provides this data: Block explorers (centralized) and Sourcify (decentralized)
 * WHY multiple sources: Redundancy and cross-validation
 */
const VERIFICATION_SOURCES = {
  1: {
    name: 'Ethereum',
    etherscan: { baseUrl: 'https://api.etherscan.io/api', weight: 1.0 },
    sourcify: { baseUrl: 'https://sourcify.dev/server', weight: 0.9 },
  },
  137: {
    name: 'Polygon',
    etherscan: { baseUrl: 'https://api.polygonscan.com/api', weight: 1.0 },
    sourcify: { baseUrl: 'https://sourcify.dev/server', weight: 0.9 },
  },
  42161: {
    name: 'Arbitrum',
    etherscan: { baseUrl: 'https://api.arbiscan.io/api', weight: 1.0 },
    sourcify: { baseUrl: 'https://sourcify.dev/server', weight: 0.9 },
  },
  10: {
    name: 'Optimism',
    etherscan: { baseUrl: 'https://api-optimistic.etherscan.io/api', weight: 1.0 },
    sourcify: { baseUrl: 'https://sourcify.dev/server', weight: 0.9 },
  },
  8453: {
    name: 'Base',
    etherscan: { baseUrl: 'https://api.basescan.org/api', weight: 1.0 },
    sourcify: { baseUrl: 'https://sourcify.dev/server', weight: 0.9 },
  },
  56: {
    name: 'BSC',
    etherscan: { baseUrl: 'https://api.bscscan.com/api', weight: 1.0 },
    sourcify: { baseUrl: 'https://sourcify.dev/server', weight: 0.9 },
  },
  43114: {
    name: 'Avalanche',
    etherscan: { baseUrl: 'https://api.snowtrace.io/api', weight: 1.0 },
    sourcify: { baseUrl: 'https://sourcify.dev/server', weight: 0.9 },
  },
};

/**
 * Known audit firms and their reputation tiers
 *
 * WHO: Security audit companies that review smart contract code
 * WHY tiers: Not all audits are equal in thoroughness
 */
const AUDIT_FIRMS = {
  // Tier 1: Top-tier, most thorough
  tier1: {
    firms: ['Trail of Bits', 'OpenZeppelin', 'Consensys Diligence', 'Certora', 'Runtime Verification'],
    scoreBonus: 25,
  },
  // Tier 2: Reputable, good coverage
  tier2: {
    firms: ['Quantstamp', 'Halborn', 'Peckshield', 'Hacken', 'Zellic', 'Spearbit'],
    scoreBonus: 20,
  },
  // Tier 3: Newer or less established
  tier3: {
    firms: ['Code4rena', 'Sherlock', 'Immunefi'],
    scoreBonus: 15,
  },
};

/**
 * Known trusted deployers
 *
 * WHO: Teams/wallets known to deploy legitimate contracts
 * WHY: Adds trust signal for new contracts from known good actors
 */
const TRUSTED_DEPLOYERS = {
  1: new Set([
    '0x1a9c8182c09f50c8318d769245bea52c32be35bc', // Uniswap deployer
    '0x0000000000ffe8b47b3e2130213b802212439497', // Aave deployer
  ]),
};

/**
 * Known scammer deployers (never trust)
 *
 * WHO: Wallets known to deploy malicious contracts
 * WHY: Hard block any contract from these deployers
 */
const SCAMMER_DEPLOYERS = {
  1: new Set([
    // Placeholder - would be populated from security feeds
    '0x0000000000000000000000000000000000000001',
  ]),
};

/**
 * Proxy implementation slots (EIP-1967)
 *
 * WHAT: Storage slots where proxy contracts store implementation address
 * WHY: Need to verify the implementation, not just the proxy
 */
const PROXY_SLOTS = {
  // EIP-1967 implementation slot
  EIP1967_IMPLEMENTATION: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  // EIP-1967 admin slot
  EIP1967_ADMIN: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',
  // OpenZeppelin transparent proxy
  OZ_IMPLEMENTATION: '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3',
};

/**
 * Score components and their max values
 */
const SCORE_COMPONENTS = {
  verification: { max: 30, weight: 1.0 },
  age: { max: 20, weight: 1.0 },
  interactions: { max: 20, weight: 1.0 },
  audit: { max: 25, weight: 1.0 },
  deployer: { max: 10, weight: 1.0 },
};

// =============================================================================
// VERIFICATION RESULT CLASS
// =============================================================================

/**
 * Represents the result of contract verification
 */
class VerificationResult {
  constructor(address, chainId) {
    this.address = address.toLowerCase();
    this.chainId = chainId;
    this.score = 0;
    this.trustLevel = TRUST_LEVEL.BLOCKED;
    this.components = {
      verification: { score: 0, details: null },
      age: { score: 0, details: null },
      interactions: { score: 0, details: null },
      audit: { score: 0, details: null },
      deployer: { score: 0, details: null },
    };
    this.flags = [];
    this.warnings = [];
    this.isProxy = false;
    this.implementation = null;
    this.timestamp = Date.now();
    this.cached = false;
  }

  setComponent(name, score, details) {
    if (this.components[name]) {
      this.components[name] = { score, details };
    }
  }

  addFlag(flag, severity = 'info') {
    this.flags.push({ flag, severity, timestamp: Date.now() });
  }

  addWarning(message) {
    this.warnings.push({ message, timestamp: Date.now() });
  }

  calculateFinalScore() {
    this.score = Object.values(this.components).reduce((sum, c) => sum + c.score, 0);

    // Determine trust level
    if (this.score >= TRUST_THRESHOLDS.SAFE) {
      this.trustLevel = TRUST_LEVEL.SAFE;
    } else if (this.score >= TRUST_THRESHOLDS.CAUTION) {
      this.trustLevel = TRUST_LEVEL.CAUTION;
    } else if (this.score >= TRUST_THRESHOLDS.RISKY) {
      this.trustLevel = TRUST_LEVEL.RISKY;
    } else {
      this.trustLevel = TRUST_LEVEL.BLOCKED;
    }

    return this.score;
  }

  isSafe() {
    return this.trustLevel === TRUST_LEVEL.SAFE;
  }

  shouldBlock() {
    return this.trustLevel === TRUST_LEVEL.BLOCKED;
  }

  toJSON() {
    return {
      address: this.address,
      chainId: this.chainId,
      score: this.score,
      trustLevel: this.trustLevel,
      components: this.components,
      flags: this.flags,
      warnings: this.warnings,
      isProxy: this.isProxy,
      implementation: this.implementation,
      timestamp: this.timestamp,
      cached: this.cached,
    };
  }
}

// =============================================================================
// CONTRACT VERIFIER CLASS
// =============================================================================

/**
 * Main contract verification engine
 *
 * HOW to use:
 * 1. Create instance with API keys and configuration
 * 2. Call verify() before interacting with any new contract
 * 3. Check result.trustLevel to determine if interaction should proceed
 * 4. Cache results to avoid repeated API calls
 */
class ContractVerifier extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      providers: config.providers || {}, // chainId -> provider
      apiKeys: config.apiKeys || {}, // chainId -> { etherscan: key }
      strictMode: config.strictMode ?? true,
      cacheEnabled: config.cacheEnabled ?? true,
      cacheTtl: config.cacheTtl || 24 * 60 * 60 * 1000, // 24 hours
      knownAudits: config.knownAudits || {}, // address -> audit info
    };

    // Result cache
    this.cache = new Map(); // `${chainId}:${address}` -> VerificationResult

    // Statistics
    this.stats = {
      verified: 0,
      fromCache: 0,
      blocked: 0,
      byTrustLevel: {
        [TRUST_LEVEL.SAFE]: 0,
        [TRUST_LEVEL.CAUTION]: 0,
        [TRUST_LEVEL.RISKY]: 0,
        [TRUST_LEVEL.BLOCKED]: 0,
      },
    };

    // Cache cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 60 * 60 * 1000); // Every hour
  }

  // ===========================================================================
  // MAIN VERIFICATION ENTRY POINT
  // ===========================================================================

  /**
   * Verify a contract and calculate trust score
   *
   * WHEN to call: Before any interaction with unfamiliar contracts
   *
   * @param {string} address - Contract address to verify
   * @param {number} chainId - Chain ID
   * @param {Object} options - Verification options
   * @returns {VerificationResult} Verification result with trust score
   */
  async verify(address, chainId, options = {}) {
    const normalizedAddress = address.toLowerCase();
    const cacheKey = `${chainId}:${normalizedAddress}`;

    // Check cache first
    if (this.config.cacheEnabled && !options.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtl) {
        this.stats.fromCache++;
        cached.cached = true;
        return cached;
      }
    }

    const result = new VerificationResult(normalizedAddress, chainId);
    this.stats.verified++;

    try {
      // Step 1: Check if contract exists (not EOA)
      const isContract = await this.isContract(normalizedAddress, chainId);
      if (!isContract) {
        result.addFlag('Address is an EOA, not a contract', 'info');
        result.setComponent('verification', 0, { verified: false, reason: 'EOA' });
        return this.finalizeResult(result, cacheKey);
      }

      // Step 2: Check if proxy and get implementation
      await this.checkProxy(result);

      // Step 3: Check verification status
      await this.checkVerification(result);

      // Step 4: Get contract age
      await this.checkAge(result);

      // Step 5: Get interaction count
      await this.checkInteractions(result);

      // Step 6: Check for known audits
      await this.checkAudits(result);

      // Step 7: Check deployer reputation
      await this.checkDeployer(result);

      // Step 8: Apply any hard blocks
      this.applyHardBlocks(result);

    } catch (err) {
      this.config.logger.error?.(`Verification error for ${address}: ${err.message}`);
      result.addWarning(`Verification incomplete: ${err.message}`);
    }

    return this.finalizeResult(result, cacheKey);
  }

  // ===========================================================================
  // VERIFICATION CHECKS
  // ===========================================================================

  /**
   * Check if address is a contract (not EOA)
   */
  async isContract(address, chainId) {
    const provider = this.config.providers[chainId];
    if (!provider) return true; // Assume contract if no provider

    try {
      const code = await provider.getCode(address);
      return code && code !== '0x';
    } catch (err) {
      return true; // Assume contract on error
    }
  }

  /**
   * Check if contract is a proxy and get implementation
   *
   * WHY this matters:
   * - Proxies are just shells that delegate to implementation
   * - The IMPLEMENTATION is what executes the code
   * - Must verify implementation, not just proxy
   * - Upgradeable proxies can change implementation at any time
   */
  async checkProxy(result) {
    const provider = this.config.providers[result.chainId];
    if (!provider) return;

    try {
      // Check EIP-1967 implementation slot
      const implSlot = await provider.getStorageAt(
        result.address,
        PROXY_SLOTS.EIP1967_IMPLEMENTATION
      );

      if (implSlot && implSlot !== '0x' + '0'.repeat(64)) {
        // Extract address from storage slot (last 20 bytes)
        const implAddress = '0x' + implSlot.slice(-40);

        if (implAddress !== '0x' + '0'.repeat(40)) {
          result.isProxy = true;
          result.implementation = implAddress.toLowerCase();
          result.addFlag(`Proxy contract - implementation at ${implAddress}`, 'info');

          // Verify implementation is also verified
          const implCode = await provider.getCode(implAddress);
          if (!implCode || implCode === '0x') {
            result.addFlag('Proxy implementation not deployed', 'critical');
            result.setComponent('verification', -20, { proxy: true, implementationMissing: true });
          }
        }
      }
    } catch (err) {
      // Not a proxy or error checking
    }
  }

  /**
   * Check source code verification status
   *
   * HOW this works:
   * 1. Query Etherscan API for contract source
   * 2. Query Sourcify for decentralized verification
   * 3. Score based on verification source and completeness
   */
  async checkVerification(result) {
    const sources = VERIFICATION_SOURCES[result.chainId];
    if (!sources) {
      result.addWarning('Unknown chain - cannot check verification');
      result.setComponent('verification', 0, { unknown: true });
      return;
    }

    const apiKey = this.config.apiKeys[result.chainId]?.etherscan;
    let verified = false;
    let verificationDetails = {};

    // Check Etherscan
    if (sources.etherscan && apiKey) {
      try {
        const response = await this.fetchEtherscanVerification(
          sources.etherscan.baseUrl,
          result.isProxy ? result.implementation : result.address,
          apiKey
        );

        if (response.verified) {
          verified = true;
          verificationDetails.etherscan = {
            verified: true,
            contractName: response.contractName,
            compiler: response.compiler,
          };
        }
      } catch (err) {
        result.addWarning(`Etherscan check failed: ${err.message}`);
      }
    }

    // Check Sourcify (no API key needed)
    if (sources.sourcify) {
      try {
        const response = await this.fetchSourcifyVerification(
          sources.sourcify.baseUrl,
          result.isProxy ? result.implementation : result.address,
          result.chainId
        );

        if (response.verified) {
          verified = true;
          verificationDetails.sourcify = {
            verified: true,
            match: response.match,
          };
        }
      } catch (err) {
        // Sourcify check failed, continue
      }
    }

    // Calculate verification score
    let score = 0;
    if (verified) {
      if (verificationDetails.etherscan && verificationDetails.sourcify) {
        score = 30; // Verified on multiple sources
      } else if (verificationDetails.etherscan) {
        score = 25; // Etherscan only
      } else if (verificationDetails.sourcify) {
        score = 20; // Sourcify only
      }
    } else {
      result.addFlag('Contract source code NOT verified', 'warning');
    }

    // Penalty for unverified proxy implementation
    if (result.isProxy && !verified) {
      score = -20;
      result.addFlag('Proxy has UNVERIFIED implementation - HIGH RISK', 'critical');
    }

    result.setComponent('verification', score, { verified, ...verificationDetails });
  }

  /**
   * Fetch verification status from Etherscan-like API
   */
  async fetchEtherscanVerification(baseUrl, address, apiKey) {
    // In production, would make actual API call
    // Placeholder response
    return {
      verified: false,
      contractName: null,
      compiler: null,
    };
  }

  /**
   * Fetch verification status from Sourcify
   */
  async fetchSourcifyVerification(baseUrl, address, chainId) {
    // In production, would make actual API call
    // Placeholder response
    return {
      verified: false,
      match: null,
    };
  }

  /**
   * Check contract age
   *
   * WHY age matters:
   * - Fresh contracts haven't been battle-tested
   * - Scammers deploy new contracts to evade detection
   * - Older contracts have had time to be audited/reviewed
   */
  async checkAge(result) {
    // In production, would fetch creation time from explorer API
    // Placeholder implementation
    const creationTime = null;

    if (!creationTime) {
      result.addWarning('Could not determine contract age');
      result.setComponent('age', 0, { unknown: true });
      return;
    }

    const ageMs = Date.now() - creationTime;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    let score = 0;
    let ageCategory = 'unknown';

    if (ageDays < 1) {
      score = -10;
      ageCategory = 'very_new';
      result.addFlag('Contract less than 24 hours old', 'warning');
    } else if (ageDays < 7) {
      score = 0;
      ageCategory = 'new';
    } else if (ageDays < 30) {
      score = 5;
      ageCategory = 'recent';
    } else if (ageDays < 90) {
      score = 10;
      ageCategory = 'established';
    } else {
      score = 20;
      ageCategory = 'mature';
    }

    result.setComponent('age', score, { ageDays: Math.floor(ageDays), category: ageCategory });
  }

  /**
   * Check interaction count
   *
   * WHY interactions matter:
   * - Heavily used contracts have been "tested" by many users
   * - Zero interactions = never used = suspicious
   * - High usage != safe, but low usage = warning sign
   */
  async checkInteractions(result) {
    // In production, would fetch tx count from explorer API
    const txCount = null;

    if (txCount === null) {
      result.addWarning('Could not determine transaction count');
      result.setComponent('interactions', 0, { unknown: true });
      return;
    }

    let score = 0;
    let category = 'unknown';

    if (txCount === 0) {
      score = -15;
      category = 'unused';
      result.addFlag('Contract has ZERO transactions', 'critical');
    } else if (txCount < 10) {
      score = 0;
      category = 'minimal';
      result.addFlag('Contract has very few transactions', 'warning');
    } else if (txCount < 100) {
      score = 5;
      category = 'low';
    } else if (txCount < 1000) {
      score = 10;
      category = 'moderate';
    } else {
      score = 20;
      category = 'high';
    }

    result.setComponent('interactions', score, { count: txCount, category });
  }

  /**
   * Check for known security audits
   *
   * WHY audits matter:
   * - Professional security review
   * - Catches issues that code review might miss
   * - Not perfect, but significantly reduces risk
   */
  async checkAudits(result) {
    // Check local audit database
    const addressToCheck = result.isProxy ? result.implementation : result.address;
    const knownAudit = this.config.knownAudits[addressToCheck];

    if (knownAudit) {
      // Determine tier
      let tier = null;
      let score = 5; // Base score for any audit

      for (const [tierName, tierInfo] of Object.entries(AUDIT_FIRMS)) {
        if (tierInfo.firms.some(firm =>
          knownAudit.auditor?.toLowerCase().includes(firm.toLowerCase())
        )) {
          tier = tierName;
          score = tierInfo.scoreBonus;
          break;
        }
      }

      result.setComponent('audit', score, {
        audited: true,
        auditor: knownAudit.auditor,
        tier,
        date: knownAudit.date,
        reportUrl: knownAudit.reportUrl,
      });

      result.addFlag(`Audited by ${knownAudit.auditor}`, 'positive');
    } else {
      result.setComponent('audit', 0, { audited: false });
    }
  }

  /**
   * Check deployer reputation
   *
   * WHY deployer matters:
   * - Known teams have reputation at stake
   * - Anonymous deployers can disappear after rug
   * - Past scammer wallets are red flags
   */
  async checkDeployer(result) {
    // In production, would fetch deployer from creation tx
    const deployer = null;

    if (!deployer) {
      result.setComponent('deployer', 0, { unknown: true });
      return;
    }

    const normalizedDeployer = deployer.toLowerCase();

    // Check if known scammer
    const scammers = SCAMMER_DEPLOYERS[result.chainId];
    if (scammers?.has(normalizedDeployer)) {
      result.addFlag('Deployed by KNOWN SCAMMER', 'critical');
      result.setComponent('deployer', -100, { scammer: true, deployer: normalizedDeployer });
      return;
    }

    // Check if trusted deployer
    const trusted = TRUSTED_DEPLOYERS[result.chainId];
    if (trusted?.has(normalizedDeployer)) {
      result.addFlag('Deployed by verified team', 'positive');
      result.setComponent('deployer', 10, { trusted: true, deployer: normalizedDeployer });
      return;
    }

    // Unknown deployer
    result.setComponent('deployer', 0, { deployer: normalizedDeployer, unknown: true });
  }

  /**
   * Apply hard blocks for critical issues
   */
  applyHardBlocks(result) {
    // Check for critical flags that should hard block
    const criticalFlags = result.flags.filter(f => f.severity === 'critical');

    if (criticalFlags.length > 0) {
      // Set score to 0 to force BLOCKED status
      result.score = 0;
      result.trustLevel = TRUST_LEVEL.BLOCKED;
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Finalize result and cache
   */
  finalizeResult(result, cacheKey) {
    result.calculateFinalScore();

    // Update stats
    this.stats.byTrustLevel[result.trustLevel]++;
    if (result.shouldBlock()) {
      this.stats.blocked++;
    }

    // Cache result
    if (this.config.cacheEnabled && cacheKey) {
      this.cache.set(cacheKey, result);
    }

    // Emit events
    this.emit('verified', result.toJSON());

    if (result.shouldBlock()) {
      this.emit('blocked', result.toJSON());
      this.config.logger.warn?.(`CONTRACT BLOCKED: ${result.address} (score: ${result.score})`);
    } else if (result.trustLevel === TRUST_LEVEL.CAUTION) {
      this.emit('caution', result.toJSON());
    }

    return result;
  }

  /**
   * Add known audit to database
   */
  addKnownAudit(address, auditInfo) {
    this.config.knownAudits[address.toLowerCase()] = {
      auditor: auditInfo.auditor,
      date: auditInfo.date,
      reportUrl: auditInfo.reportUrl,
    };
  }

  /**
   * Clear cache for address
   */
  clearCache(address, chainId) {
    const cacheKey = `${chainId}:${address.toLowerCase()}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    let removed = 0;

    for (const [key, result] of this.cache) {
      if (now - result.timestamp > this.config.cacheTtl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.config.logger.debug?.(`Cache cleanup: removed ${removed} expired entries`);
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
    };
  }

  /**
   * Stop verifier and cleanup
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.stop();
    this.cache.clear();
    this.removeAllListeners();
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  ContractVerifier,
  VerificationResult,
  TRUST_LEVEL,
  TRUST_THRESHOLDS,
  VERIFICATION_SOURCES,
  AUDIT_FIRMS,
  PROXY_SLOTS,
  SCORE_COMPONENTS,

  // Factory function
  createContractVerifier: (config = {}) => new ContractVerifier(config),
};
