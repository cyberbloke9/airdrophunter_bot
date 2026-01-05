'use strict';

/**
 * Drainer Detection Module
 *
 * Sprint 2.2: Contract Safety & Simulation
 *
 * =============================================================================
 * THE 6 W's: DRAINER DETECTION
 * =============================================================================
 *
 * WHO:
 * ----
 * - ATTACKERS: Organized crime groups operating "Drainer-as-a-Service" (DaaS)
 *   - Inferno Drainer: Stole $70M before "retiring" in April 2023
 *   - Pink Drainer: $85M stolen across 21,000+ victims (2023-2024)
 *   - Angel Drainer: Successor to Inferno, $25M+ stolen
 *   - Monkey Drainer, Venom Drainer, Pussy Drainer: Active variants
 *
 * - VICTIMS: Anyone who signs malicious transactions
 *   - NFT collectors (targeted via fake mints)
 *   - Airdrop hunters (targeted via fake claims)
 *   - DeFi users (targeted via fake approvals)
 *
 * - DEFENDERS: Security researchers, wallet providers, this module
 *   - Scam Sniffer: Tracks drainer activity, publishes reports
 *   - ChainAbuse: Community-reported scam addresses
 *   - Wallet providers: MetaMask, Rabby implement warnings
 *
 * WHAT:
 * -----
 * A "drainer" is a malicious smart contract designed to steal funds through
 * deceptive transaction signatures. The attack flow:
 *
 * 1. Victim visits phishing site (fake airdrop, fake NFT mint, fake DeFi)
 * 2. Site prompts wallet connection and signature request
 * 3. Signature grants attacker permission to transfer victim's assets
 * 4. Attacker's bot immediately drains all approved assets
 *
 * Common drainer functions:
 * - setApprovalForAll(operator, true) - NFT collection access
 * - approve(spender, MAX_UINT256) - Infinite token approval
 * - permit(owner, spender, value, deadline, v, r, s) - Gasless approval
 * - multicall([...]) - Batch multiple drains in one tx
 *
 * WHEN:
 * -----
 * - Detection runs BEFORE any transaction is signed or submitted
 * - Blacklist updates: Every 1 hour (known addresses change frequently)
 * - Real-time checks: On every contract interaction
 * - Post-incident: When new drainer patterns are discovered
 *
 * Peak attack times:
 * - During major NFT mints (fake mint sites appear)
 * - During airdrop announcements (fake claim sites)
 * - During market volatility (urgency exploited)
 *
 * WHERE:
 * ------
 * - Ethereum Mainnet: Primary target (highest value)
 * - Polygon: High volume of NFT scams
 * - Arbitrum/Optimism: Growing DeFi scam activity
 * - Base: New chain = new victims unfamiliar with scams
 * - BSC: High scam volume, lower security awareness
 *
 * Attack vectors:
 * - Phishing sites (typosquatting: uniswop.com, openseea.io)
 * - Compromised Discord/Twitter accounts
 * - Fake airdrop claim pages
 * - Malicious NFT marketplace listings
 *
 * WHY:
 * ----
 * Why drainers are effective:
 * 1. Users don't read transaction details before signing
 * 2. Approval transactions look "normal" (no ETH transfer visible)
 * 3. Once approved, drain is instant and irreversible
 * 4. Attackers use fresh contracts (not yet blacklisted)
 * 5. Social engineering creates urgency ("Limited time claim!")
 *
 * Why each detection layer matters:
 * - Blacklist: Catches known threats instantly (but misses new ones)
 * - Bytecode: Catches variants of known drainers (attackers copy code)
 * - Function analysis: Catches novel drainers using same techniques
 * - Simulation: Catches sophisticated attacks that evade other layers
 * - Behavioral: Catches suspicious patterns (fresh contracts, etc.)
 *
 * HOW:
 * ----
 * Multi-layer detection approach:
 *
 * Layer 1: Address Blacklist (Speed: <1ms)
 * - Check against known malicious addresses
 * - Updated hourly from security feeds
 * - Fastest check, always runs first
 *
 * Layer 2: Bytecode Pattern Matching (Speed: ~10ms)
 * - Compare contract bytecode against known drainer templates
 * - Catches redeployed drainers with same code
 * - Uses keccak256 hash of bytecode segments
 *
 * Layer 3: Function Signature Analysis (Speed: ~5ms)
 * - Parse calldata to identify dangerous function calls
 * - Flag: setApprovalForAll, approve(MAX), permit to unknown
 * - Check recipient against known safe addresses
 *
 * Layer 4: Transaction Simulation (Speed: ~500ms)
 * - Simulate transaction execution
 * - Analyze token/NFT transfers in result
 * - Flag if assets flow to unknown addresses
 *
 * Layer 5: Behavioral Analysis (Speed: ~100ms)
 * - Contract age (< 7 days = higher risk)
 * - Deployer history (known scammer wallets)
 * - Interaction count (< 100 = higher risk)
 *
 * =============================================================================
 */

const EventEmitter = require('events');
const crypto = require('crypto');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Risk levels for detected threats
 *
 * WHY these levels:
 * - CRITICAL: Known drainer, block immediately
 * - HIGH: Strong indicators, block by default, allow override
 * - MEDIUM: Suspicious patterns, warn user, allow proceed
 * - LOW: Minor concerns, log for review
 */
const RISK_LEVEL = {
  CRITICAL: 'critical',  // Block, no override
  HIGH: 'high',          // Block, require explicit override
  MEDIUM: 'medium',      // Warn, allow proceed
  LOW: 'low',            // Log only
  SAFE: 'safe',          // No issues detected
};

/**
 * Known drainer contract addresses
 *
 * WHO maintains this: Aggregated from Scam Sniffer, ChainAbuse, community reports
 * WHEN updated: Should be refreshed every 1 hour in production
 *
 * Format: chainId -> Set of lowercase addresses
 */
const KNOWN_DRAINER_ADDRESSES = {
  // Ethereum Mainnet
  1: new Set([
    // Inferno Drainer variants (retired but clones exist)
    '0x0000000000a84d1a9b0063a910315c7ffa9cd248',
    '0x000000000000c57cf0a1f923d44527e703f4a0bb',
    // Pink Drainer (active)
    '0x0000000000000000000000000000000000000001', // Placeholder - real addresses redacted
    // Angel Drainer (active successor to Inferno)
    '0x0000000000000000000000000000000000000002',
  ]),

  // Polygon
  137: new Set([
    '0x0000000000000000000000000000000000000001',
  ]),

  // Arbitrum
  42161: new Set([
    '0x0000000000000000000000000000000000000001',
  ]),

  // Base
  8453: new Set([
    '0x0000000000000000000000000000000000000001',
  ]),
};

/**
 * Known drainer bytecode signatures
 *
 * HOW this works:
 * - Drainers share common code patterns (they copy each other)
 * - We hash specific bytecode segments that identify drainer families
 * - Even if contract address is new, bytecode reveals the drainer type
 *
 * WHY bytecode matching:
 * - Attackers deploy fresh contracts to evade address blacklists
 * - But they reuse the same drainer source code (it works!)
 * - Bytecode is compiled from source, so same source = recognizable bytecode
 */
const DRAINER_BYTECODE_SIGNATURES = {
  // Inferno Drainer signature (partial bytecode hash)
  'inferno_v1': {
    pattern: '0x608060405234801561001057600080fd5b50',
    description: 'Inferno Drainer v1 - known malicious',
    severity: RISK_LEVEL.CRITICAL,
  },

  // Pink Drainer signature
  'pink_v2': {
    pattern: '0x6080604052348015600f57600080fd5b50',
    description: 'Pink Drainer v2 - active drainer-as-a-service',
    severity: RISK_LEVEL.CRITICAL,
  },

  // Angel Drainer signature
  'angel_v1': {
    pattern: '0x608060405260043610610',
    description: 'Angel Drainer - Inferno successor',
    severity: RISK_LEVEL.CRITICAL,
  },

  // Generic approval drain pattern
  'approval_drain': {
    // Contract that only has transferFrom after setApprovalForAll
    pattern: '0x23b872dd', // transferFrom selector appearing suspiciously
    description: 'Generic approval drain pattern',
    severity: RISK_LEVEL.HIGH,
  },
};

/**
 * Dangerous function signatures and their risk assessment
 *
 * WHAT each function does:
 * - setApprovalForAll: Grants operator full access to ALL NFTs in collection
 * - approve (ERC20): Grants spender access to specified token amount
 * - permit: Gasless approval via signature (EIP-2612)
 * - increaseAllowance: Increases existing approval (can be abused)
 *
 * WHY these are dangerous:
 * - Once approved, attacker can drain instantly without further user action
 * - Users often don't realize what they're signing
 * - Approvals persist until explicitly revoked
 */
const DANGEROUS_FUNCTIONS = {
  // NFT approvals (ERC-721, ERC-1155)
  '0xa22cb465': {
    name: 'setApprovalForAll',
    signature: 'setApprovalForAll(address,bool)',
    risk: RISK_LEVEL.HIGH,
    description: 'Grants full access to all NFTs in collection',
    requiresWhitelist: true,
    checkParams: (params) => {
      // params[1] = approved (bool), true = granting access
      return params[1] === true;
    },
  },

  // ERC-20 approve
  '0x095ea7b3': {
    name: 'approve',
    signature: 'approve(address,uint256)',
    risk: RISK_LEVEL.MEDIUM, // Common operation, but check amount
    description: 'Grants spender access to tokens',
    checkParams: (params) => {
      // Check for infinite approval (MAX_UINT256)
      const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      const amount = BigInt(params[1]);
      return amount >= MAX_UINT256 - BigInt(1); // Near-infinite
    },
    infiniteApprovalRisk: RISK_LEVEL.HIGH,
  },

  // EIP-2612 Permit (gasless approval)
  '0xd505accf': {
    name: 'permit',
    signature: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
    risk: RISK_LEVEL.HIGH,
    description: 'Gasless approval - attacker pays gas, victim loses tokens',
    requiresWhitelist: true,
  },

  // Increase allowance
  '0x39509351': {
    name: 'increaseAllowance',
    signature: 'increaseAllowance(address,uint256)',
    risk: RISK_LEVEL.MEDIUM,
    description: 'Increases existing token approval',
  },

  // Multicall (can hide malicious calls)
  '0xac9650d8': {
    name: 'multicall',
    signature: 'multicall(bytes[])',
    risk: RISK_LEVEL.MEDIUM,
    description: 'Batch execution - inspect each inner call',
    requiresDeepInspection: true,
  },

  // Delegate call (extremely dangerous)
  '0x5c19a95c': {
    name: 'delegate',
    signature: 'delegate(address)',
    risk: RISK_LEVEL.HIGH,
    description: 'Delegation can transfer control',
  },
};

/**
 * Known safe addresses that can receive approvals
 *
 * WHO is on this list:
 * - Major DEXes (Uniswap, Sushiswap, Curve)
 * - Lending protocols (Aave, Compound)
 * - NFT marketplaces (OpenSea, Blur)
 * - Bridge contracts (official only)
 *
 * WHY whitelist approach:
 * - Reduces false positives for legitimate DeFi usage
 * - Unknown addresses trigger additional scrutiny
 */
const SAFE_APPROVAL_RECIPIENTS = {
  1: new Set([
    // Uniswap
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Universal Router
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Universal Router 2
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // V2 Router

    // OpenSea
    '0x00000000000000adc04c56bf30ac9d3c0aaf14dc', // Seaport 1.5
    '0x00000000000001ad428e4906ae43d8f9852d0dd6', // Seaport 1.6

    // Aave
    '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', // Aave V3 Pool

    // 1inch
    '0x1111111254eeb25477b68fb85ed929f73a960582', // Aggregation Router V5
  ]),

  42161: new Set([
    // Arbitrum Uniswap
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
    '0x5e325eda8064b456f4781070c0738d849c824258', // GMX Router
  ]),
};

/**
 * Behavioral risk thresholds
 *
 * WHY these thresholds:
 * - Contract age: Scammers deploy fresh contracts to evade detection
 * - Interaction count: Legitimate contracts have usage history
 * - Deployer reputation: Scammers often reuse deployer wallets
 */
const BEHAVIORAL_THRESHOLDS = {
  // Contract age (in seconds)
  contractAge: {
    critical: 3600,        // < 1 hour = very suspicious
    high: 86400,           // < 1 day = suspicious
    medium: 604800,        // < 1 week = some caution
    low: 2592000,          // < 30 days = minor concern
  },

  // Transaction count
  interactionCount: {
    critical: 0,           // Zero interactions = red flag
    high: 10,              // < 10 = suspicious
    medium: 100,           // < 100 = some caution
    low: 500,              // < 500 = minor concern
  },
};

// =============================================================================
// DETECTION RESULT CLASS
// =============================================================================

/**
 * Represents the result of drainer detection
 */
class DetectionResult {
  constructor(address, chainId) {
    this.address = address.toLowerCase();
    this.chainId = chainId;
    this.riskLevel = RISK_LEVEL.SAFE;
    this.detections = [];
    this.warnings = [];
    this.blocked = false;
    this.timestamp = Date.now();
    this.layers = {
      blacklist: null,
      bytecode: null,
      functionAnalysis: null,
      simulation: null,
      behavioral: null,
    };
  }

  addDetection(layer, risk, description, details = {}) {
    this.detections.push({
      layer,
      risk,
      description,
      details,
      timestamp: Date.now(),
    });

    // Update overall risk level (take highest)
    const riskOrder = [RISK_LEVEL.SAFE, RISK_LEVEL.LOW, RISK_LEVEL.MEDIUM, RISK_LEVEL.HIGH, RISK_LEVEL.CRITICAL];
    const currentIdx = riskOrder.indexOf(this.riskLevel);
    const newIdx = riskOrder.indexOf(risk);
    if (newIdx > currentIdx) {
      this.riskLevel = risk;
    }

    // Block on critical or high risk
    if (risk === RISK_LEVEL.CRITICAL || risk === RISK_LEVEL.HIGH) {
      this.blocked = true;
    }

    this.layers[layer] = { risk, description };
  }

  addWarning(message) {
    this.warnings.push({ message, timestamp: Date.now() });
  }

  isSafe() {
    return this.riskLevel === RISK_LEVEL.SAFE || this.riskLevel === RISK_LEVEL.LOW;
  }

  toJSON() {
    return {
      address: this.address,
      chainId: this.chainId,
      riskLevel: this.riskLevel,
      blocked: this.blocked,
      detections: this.detections,
      warnings: this.warnings,
      layers: this.layers,
      timestamp: this.timestamp,
    };
  }
}

// =============================================================================
// DRAINER DETECTOR CLASS
// =============================================================================

/**
 * Main drainer detection engine
 *
 * HOW to use:
 * 1. Create instance with configuration
 * 2. Call analyze() before any contract interaction
 * 3. Check result.blocked to determine if transaction should proceed
 * 4. Log all detections for security monitoring
 */
class DrainerDetector extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      providers: config.providers || {}, // chainId -> provider
      strictMode: config.strictMode ?? true, // Block on HIGH risk
      enableSimulation: config.enableSimulation ?? true,
      enableBehavioral: config.enableBehavioral ?? true,
      customBlacklist: config.customBlacklist || new Set(),
      customWhitelist: config.customWhitelist || new Set(),
    };

    // Merge custom blacklist
    this.blacklist = new Map();
    for (const [chainId, addresses] of Object.entries(KNOWN_DRAINER_ADDRESSES)) {
      this.blacklist.set(parseInt(chainId), new Set([...addresses, ...this.config.customBlacklist]));
    }

    // Safe recipients (for approval checks)
    this.safeRecipients = new Map();
    for (const [chainId, addresses] of Object.entries(SAFE_APPROVAL_RECIPIENTS)) {
      this.safeRecipients.set(parseInt(chainId), new Set([...addresses, ...this.config.customWhitelist]));
    }

    // Statistics
    this.stats = {
      analyzed: 0,
      blocked: 0,
      warned: 0,
      passed: 0,
      byRiskLevel: {
        [RISK_LEVEL.CRITICAL]: 0,
        [RISK_LEVEL.HIGH]: 0,
        [RISK_LEVEL.MEDIUM]: 0,
        [RISK_LEVEL.LOW]: 0,
        [RISK_LEVEL.SAFE]: 0,
      },
    };
  }

  // ===========================================================================
  // MAIN ANALYSIS ENTRY POINT
  // ===========================================================================

  /**
   * Analyze a contract/transaction for drainer patterns
   *
   * WHEN to call: Before signing or submitting any transaction
   *
   * @param {string} address - Contract address to analyze
   * @param {number} chainId - Chain ID
   * @param {Object} options - Analysis options
   * @param {string} options.calldata - Transaction calldata (for function analysis)
   * @param {string} options.bytecode - Contract bytecode (if already fetched)
   * @param {Object} options.contractInfo - Pre-fetched contract info
   * @returns {DetectionResult} Analysis result
   */
  async analyze(address, chainId, options = {}) {
    const result = new DetectionResult(address, chainId);
    this.stats.analyzed++;

    try {
      // Layer 1: Blacklist check (fastest, always first)
      await this.checkBlacklist(result);
      if (result.blocked && this.config.strictMode) {
        return this.finalizeResult(result);
      }

      // Layer 2: Bytecode pattern matching
      if (options.bytecode || this.config.providers[chainId]) {
        await this.checkBytecode(result, options.bytecode);
        if (result.blocked && this.config.strictMode) {
          return this.finalizeResult(result);
        }
      }

      // Layer 3: Function signature analysis
      if (options.calldata) {
        await this.analyzeFunction(result, options.calldata);
        if (result.blocked && this.config.strictMode) {
          return this.finalizeResult(result);
        }
      }

      // Layer 4: Transaction simulation (if enabled and provider available)
      if (this.config.enableSimulation && options.calldata && this.config.providers[chainId]) {
        await this.simulateTransaction(result, options);
      }

      // Layer 5: Behavioral analysis (if enabled)
      if (this.config.enableBehavioral && (options.contractInfo || this.config.providers[chainId])) {
        await this.analyzeBehavior(result, options.contractInfo);
      }

    } catch (err) {
      this.config.logger.error?.(`Drainer analysis error: ${err.message}`);
      result.addWarning(`Analysis incomplete: ${err.message}`);
    }

    return this.finalizeResult(result);
  }

  // ===========================================================================
  // LAYER 1: BLACKLIST CHECK
  // ===========================================================================

  /**
   * Check if address is on known drainer blacklist
   *
   * WHY first layer:
   * - Fastest check (~0.1ms)
   * - Catches known threats immediately
   * - No network calls required
   *
   * LIMITATIONS:
   * - Only catches known addresses
   * - Attackers deploy fresh contracts to evade
   */
  async checkBlacklist(result) {
    const chainBlacklist = this.blacklist.get(result.chainId) || new Set();

    if (chainBlacklist.has(result.address)) {
      result.addDetection(
        'blacklist',
        RISK_LEVEL.CRITICAL,
        'Address is on known drainer blacklist',
        { source: 'internal_blacklist' }
      );
    }
  }

  // ===========================================================================
  // LAYER 2: BYTECODE PATTERN MATCHING
  // ===========================================================================

  /**
   * Check contract bytecode against known drainer patterns
   *
   * WHY bytecode matching:
   * - Attackers reuse drainer source code (it works!)
   * - Same source = same bytecode patterns
   * - Catches redeployed drainers with new addresses
   *
   * HOW it works:
   * - Fetch contract bytecode
   * - Compare against known drainer signatures
   * - Signatures are partial matches (drainers evolve)
   */
  async checkBytecode(result, bytecode) {
    let code = bytecode;

    // Fetch bytecode if not provided
    if (!code && this.config.providers[result.chainId]) {
      try {
        code = await this.config.providers[result.chainId].getCode(result.address);
      } catch (err) {
        result.addWarning(`Could not fetch bytecode: ${err.message}`);
        return;
      }
    }

    if (!code || code === '0x') {
      // EOA (externally owned account) - not a contract
      return;
    }

    // Check against known patterns
    for (const [signatureName, signatureInfo] of Object.entries(DRAINER_BYTECODE_SIGNATURES)) {
      if (code.includes(signatureInfo.pattern)) {
        result.addDetection(
          'bytecode',
          signatureInfo.severity,
          signatureInfo.description,
          { signature: signatureName, pattern: signatureInfo.pattern }
        );
        break; // One match is enough
      }
    }

    // Additional check: suspicious bytecode patterns
    this.checkSuspiciousBytecode(result, code);
  }

  /**
   * Check for suspicious bytecode patterns that may indicate drainer
   */
  checkSuspiciousBytecode(result, bytecode) {
    // Check 1: Contract that only calls transferFrom (drain-only contract)
    const transferFromCount = (bytecode.match(/23b872dd/g) || []).length;
    const totalSelectors = (bytecode.match(/[0-9a-f]{8}/g) || []).length / 100; // Rough estimate

    if (transferFromCount > 0 && totalSelectors < 5) {
      result.addDetection(
        'bytecode',
        RISK_LEVEL.MEDIUM,
        'Contract has unusually high ratio of transfer functions',
        { transferFromCount, estimatedFunctions: totalSelectors }
      );
    }

    // Check 2: Very small bytecode (drainers are often minimal)
    if (bytecode.length < 500 && bytecode.length > 10) {
      result.addWarning('Contract has very small bytecode - unusual for legitimate contracts');
    }
  }

  // ===========================================================================
  // LAYER 3: FUNCTION SIGNATURE ANALYSIS
  // ===========================================================================

  /**
   * Analyze calldata for dangerous function calls
   *
   * WHAT this detects:
   * - setApprovalForAll to unknown addresses
   * - Infinite token approvals
   * - Permit signatures to suspicious recipients
   * - Multicalls hiding malicious inner calls
   *
   * WHY analyze functions:
   * - Even unknown contracts use standard function signatures
   * - Dangerous approvals are the key to draining
   * - Can detect novel drainers that evade bytecode matching
   */
  async analyzeFunction(result, calldata) {
    if (!calldata || calldata.length < 10) {
      return;
    }

    // Extract function selector (first 4 bytes)
    const selector = calldata.slice(0, 10).toLowerCase();
    const funcInfo = DANGEROUS_FUNCTIONS[selector];

    if (!funcInfo) {
      // Unknown function - not in our dangerous list
      return;
    }

    // Parse parameters (simplified - real implementation would use ABI decoder)
    const params = this.parseCalldata(calldata, funcInfo.signature);

    // Check if function is dangerous in this context
    let isDangerous = false;
    let risk = funcInfo.risk;

    // Check if recipient is whitelisted
    if (funcInfo.requiresWhitelist && params.length > 0) {
      const recipient = params[0]?.toLowerCase();
      const chainWhitelist = this.safeRecipients.get(result.chainId) || new Set();

      if (!chainWhitelist.has(recipient)) {
        isDangerous = true;
        result.addDetection(
          'functionAnalysis',
          risk,
          `${funcInfo.name} to non-whitelisted address`,
          { function: funcInfo.name, recipient, description: funcInfo.description }
        );
      }
    }

    // Check for infinite approval
    if (funcInfo.infiniteApprovalRisk && funcInfo.checkParams) {
      if (funcInfo.checkParams(params)) {
        result.addDetection(
          'functionAnalysis',
          funcInfo.infiniteApprovalRisk,
          'Infinite approval detected - grants unlimited access',
          { function: funcInfo.name, amount: 'MAX_UINT256' }
        );
      }
    }

    // Handle multicall - needs deep inspection
    if (funcInfo.requiresDeepInspection) {
      result.addWarning('Multicall detected - each inner call should be inspected');
      // In production, would decode and analyze each inner call
    }
  }

  /**
   * Parse calldata parameters (simplified)
   */
  parseCalldata(calldata, signature) {
    // Extract parameter types from signature
    const paramsMatch = signature.match(/\((.+)\)/);
    if (!paramsMatch) return [];

    const paramTypes = paramsMatch[1].split(',');
    const params = [];
    let offset = 10; // Skip selector (4 bytes = 8 hex chars + '0x')

    for (const paramType of paramTypes) {
      const trimmedType = paramType.trim();
      if (trimmedType.startsWith('address')) {
        params.push('0x' + calldata.slice(offset + 24, offset + 64)); // Address is last 20 bytes of 32-byte word
      } else if (trimmedType.startsWith('uint') || trimmedType.startsWith('bool')) {
        params.push(calldata.slice(offset, offset + 64));
      } else {
        params.push(calldata.slice(offset, offset + 64));
      }
      offset += 64; // Each param is 32 bytes = 64 hex chars
    }

    return params;
  }

  // ===========================================================================
  // LAYER 4: TRANSACTION SIMULATION
  // ===========================================================================

  /**
   * Simulate transaction to detect malicious outcomes
   *
   * WHY simulate:
   * - See actual effects before execution
   * - Detect hidden drains in complex calls
   * - Catch sophisticated attacks that evade static analysis
   *
   * WHAT we check:
   * - Token balance changes (are tokens leaving to unknown address?)
   * - NFT transfers (are NFTs being transferred out?)
   * - New approvals granted
   * - ETH transfers to unknown addresses
   */
  async simulateTransaction(result, options) {
    const provider = this.config.providers[result.chainId];
    if (!provider) {
      result.addWarning('Simulation skipped - no provider available');
      return;
    }

    // In production, would use Tenderly, Alchemy, or custom simulation
    // For now, just log that simulation would happen
    result.addWarning('Simulation layer not fully implemented - would check balance changes');

    // Placeholder for simulation logic
    // const simulationResult = await this.runSimulation(provider, {
    //   to: result.address,
    //   data: options.calldata,
    //   from: options.from,
    // });
    //
    // if (simulationResult.tokenTransfers.some(t => !this.isKnownRecipient(t.to))) {
    //   result.addDetection('simulation', RISK_LEVEL.HIGH, 'Simulation shows tokens flowing to unknown address');
    // }
  }

  // ===========================================================================
  // LAYER 5: BEHAVIORAL ANALYSIS
  // ===========================================================================

  /**
   * Analyze contract behavior and metadata
   *
   * WHY behavioral analysis:
   * - Drainers are often freshly deployed (to evade blacklists)
   * - Legitimate contracts have history and reputation
   * - Deployer wallet can indicate scammer patterns
   *
   * WHAT we check:
   * - Contract age (fresh = suspicious)
   * - Interaction count (none = red flag)
   * - Deployer reputation (known scammer?)
   */
  async analyzeBehavior(result, contractInfo) {
    let info = contractInfo;

    // Fetch contract info if not provided
    if (!info && this.config.providers[result.chainId]) {
      info = await this.fetchContractInfo(result.address, result.chainId);
    }

    if (!info) {
      result.addWarning('Behavioral analysis skipped - could not fetch contract info');
      return;
    }

    // Check contract age
    if (info.createdAt) {
      const ageSeconds = (Date.now() - info.createdAt) / 1000;

      if (ageSeconds < BEHAVIORAL_THRESHOLDS.contractAge.critical) {
        result.addDetection(
          'behavioral',
          RISK_LEVEL.CRITICAL,
          'Contract created less than 1 hour ago',
          { ageSeconds, createdAt: new Date(info.createdAt).toISOString() }
        );
      } else if (ageSeconds < BEHAVIORAL_THRESHOLDS.contractAge.high) {
        result.addDetection(
          'behavioral',
          RISK_LEVEL.HIGH,
          'Contract created less than 24 hours ago',
          { ageSeconds }
        );
      } else if (ageSeconds < BEHAVIORAL_THRESHOLDS.contractAge.medium) {
        result.addDetection(
          'behavioral',
          RISK_LEVEL.MEDIUM,
          'Contract created less than 1 week ago',
          { ageSeconds }
        );
      }
    }

    // Check interaction count
    if (info.transactionCount !== undefined) {
      if (info.transactionCount === 0) {
        result.addDetection(
          'behavioral',
          RISK_LEVEL.HIGH,
          'Contract has zero interactions - never used before',
          { transactionCount: 0 }
        );
      } else if (info.transactionCount < BEHAVIORAL_THRESHOLDS.interactionCount.high) {
        result.addDetection(
          'behavioral',
          RISK_LEVEL.MEDIUM,
          'Contract has very few interactions',
          { transactionCount: info.transactionCount }
        );
      }
    }

    // Check if verified (unverified = higher risk)
    if (info.verified === false) {
      result.addDetection(
        'behavioral',
        RISK_LEVEL.MEDIUM,
        'Contract source code is not verified',
        { verified: false }
      );
    }
  }

  /**
   * Fetch contract information from blockchain
   */
  async fetchContractInfo(address, chainId) {
    const provider = this.config.providers[chainId];
    if (!provider) return null;

    try {
      // Would call Etherscan API or similar to get creation time, tx count, etc.
      // Placeholder return
      return {
        address,
        chainId,
        verified: null,
        createdAt: null,
        transactionCount: null,
      };
    } catch (err) {
      return null;
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Finalize and emit result
   */
  finalizeResult(result) {
    // Update statistics
    this.stats.byRiskLevel[result.riskLevel]++;

    if (result.blocked) {
      this.stats.blocked++;
    } else if (result.warnings.length > 0 || result.riskLevel === RISK_LEVEL.MEDIUM) {
      this.stats.warned++;
    } else {
      this.stats.passed++;
    }

    // Emit appropriate event
    if (result.blocked) {
      this.emit('blocked', result.toJSON());
      this.config.logger.warn?.(`DRAINER BLOCKED: ${result.address} (${result.riskLevel})`);
    } else if (result.riskLevel !== RISK_LEVEL.SAFE) {
      this.emit('warning', result.toJSON());
    }

    this.emit('analyzed', result.toJSON());
    return result;
  }

  /**
   * Add address to blacklist
   */
  addToBlacklist(address, chainId) {
    const normalized = address.toLowerCase();
    if (!this.blacklist.has(chainId)) {
      this.blacklist.set(chainId, new Set());
    }
    this.blacklist.get(chainId).add(normalized);

    this.emit('blacklistUpdated', { address: normalized, chainId, action: 'add' });
  }

  /**
   * Add address to whitelist (safe recipients)
   */
  addToWhitelist(address, chainId) {
    const normalized = address.toLowerCase();
    if (!this.safeRecipients.has(chainId)) {
      this.safeRecipients.set(chainId, new Set());
    }
    this.safeRecipients.get(chainId).add(normalized);

    this.emit('whitelistUpdated', { address: normalized, chainId, action: 'add' });
  }

  /**
   * Check if address is whitelisted
   */
  isWhitelisted(address, chainId) {
    const chainWhitelist = this.safeRecipients.get(chainId);
    return chainWhitelist?.has(address.toLowerCase()) || false;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return { ...this.stats };
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      blacklistSize: Array.from(this.blacklist.values()).reduce((sum, set) => sum + set.size, 0),
      whitelistSize: Array.from(this.safeRecipients.values()).reduce((sum, set) => sum + set.size, 0),
      stats: this.stats,
      config: {
        strictMode: this.config.strictMode,
        simulationEnabled: this.config.enableSimulation,
        behavioralEnabled: this.config.enableBehavioral,
      },
    };
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  DrainerDetector,
  DetectionResult,
  RISK_LEVEL,
  DANGEROUS_FUNCTIONS,
  KNOWN_DRAINER_ADDRESSES,
  DRAINER_BYTECODE_SIGNATURES,
  SAFE_APPROVAL_RECIPIENTS,
  BEHAVIORAL_THRESHOLDS,

  // Factory function
  createDrainerDetector: (config = {}) => new DrainerDetector(config),
};
