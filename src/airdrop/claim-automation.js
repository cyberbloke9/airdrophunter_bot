'use strict';

/**
 * Claim Automation System
 *
 * Sprint 3.2: Points & Eligibility Tracking
 *
 * =============================================================================
 * THE 6 W's: CLAIM AUTOMATION
 * =============================================================================
 *
 * WHO:
 * ----
 * WHO uses claim automation:
 *
 * - AIRDROP FARMERS: Claim tokens when airdrops go live
 *   - Need to claim quickly to avoid sell pressure
 *   - Managing multiple wallets is tedious manually
 *   - Want to optimize claim timing for best prices
 *
 * - MULTI-WALLET OPERATORS: Claim across many wallets efficiently
 *   - Sequential manual claiming is too slow
 *   - Risk missing claim windows
 *   - Need batch claiming with gas optimization
 *
 * WHO provides claim contracts:
 *
 * - PROTOCOL TEAMS: Deploy claim contracts
 *   - Merkle distributors (most common)
 *   - Claim with signature
 *   - Vesting contracts
 *
 * - CLAIM PORTALS: Third-party claim interfaces
 *   - Official protocol websites
 *   - Aggregators like DeBank, Zapper
 *
 * WHAT:
 * -----
 * WHAT the system automates:
 *
 * | Function | Description |
 * |----------|-------------|
 * | Claim Detection | Find when claims are available |
 * | Eligibility Verification | Check if wallet can claim |
 * | Merkle Proof Generation | Get proof from claim data |
 * | Transaction Building | Construct claim transaction |
 * | Gas Optimization | Wait for favorable gas |
 * | Execution | Submit claim transaction |
 * | Verification | Confirm claim success |
 *
 * WHAT types of claims:
 *
 * | Type | Example | Method |
 * |------|---------|--------|
 * | Merkle Drop | LayerZero ZRO | Submit proof to claim |
 * | Direct Claim | Some protocols | Call claim() directly |
 * | Signature Claim | EIP-712 based | Sign message + submit |
 * | Vested Claim | Token vesting | Claim available portion |
 * | Multi-claim | Batch drops | Claim multiple in one tx |
 *
 * WHAT data is needed:
 *
 * - Merkle proofs (from protocol API or IPFS)
 * - Claim amounts
 * - Claim contract addresses
 * - Required signatures
 * - Deadline timestamps
 *
 * WHEN:
 * -----
 * WHEN to claim:
 *
 * | Strategy | When | Reason |
 * |----------|------|--------|
 * | Immediate | At launch | Beat sell pressure |
 * | Optimized | Low gas | Save on fees |
 * | Strategic | Price high | Maximize value |
 * | Deadline | Before expiry | Don't lose tokens |
 *
 * WHEN claims become available:
 *
 * ```
 * Timeline:
 * │ Announcement │ Snapshot │ Claim Opens │ Deadline │
 * ├──────────────┼──────────┼─────────────┼──────────┤
 * │ 0            │ +X days  │ +Y days     │ +Z days  │
 * │              │          │             │          │
 * │ Prepare      │ Finalize │ CLAIM!      │ Forfeit  │
 * ```
 *
 * WHERE:
 * ------
 * WHERE claims happen:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    CLAIM AUTOMATION FLOW                         │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                  │
 * │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
 * │  │   Claim      │   │   Merkle     │   │   Wallet     │        │
 * │  │   Registry   │   │   Proofs     │   │   Manager    │        │
 * │  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
 * │         │                  │                   │                 │
 * │         └──────────────────┼───────────────────┘                 │
 * │                            ▼                                     │
 * │                   ┌──────────────────┐                          │
 * │                   │  CLAIM ENGINE    │                          │
 * │                   │                  │                          │
 * │                   │  - Verify        │                          │
 * │                   │  - Build TX      │                          │
 * │                   │  - Optimize      │                          │
 * │                   │  - Execute       │                          │
 * │                   └────────┬─────────┘                          │
 * │                            │                                     │
 * │                            ▼                                     │
 * │                   ┌──────────────────┐                          │
 * │                   │  CLAIM CONTRACT  │                          │
 * │                   │  (On-Chain)      │                          │
 * │                   └──────────────────┘                          │
 * │                                                                  │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * WHY:
 * ----
 * WHY automation is important:
 *
 * 1. TIMING IS CRITICAL:
 *    - Early claimers often get better prices
 *    - Late claimers face sell pressure
 *    - Some claims have deadlines
 *
 * 2. SCALE MATTERS:
 *    - Manual claiming for 10+ wallets is slow
 *    - Each wallet needs separate transaction
 *    - Coordination is error-prone
 *
 * 3. GAS OPTIMIZATION:
 *    - Claims during peak = high gas
 *    - Batching saves gas
 *    - Timing for low gas saves money
 *
 * 4. RELIABILITY:
 *    - Automated = less human error
 *    - Retry on failure
 *    - Track all claims
 *
 * WHY different strategies:
 *
 * - IMMEDIATE: When you expect price to dump fast
 * - DELAYED: When gas is high at launch
 * - STRATEGIC: When you want to hold and sell later
 *
 * HOW:
 * ----
 * HOW claims are automated:
 *
 * 1. DETECT CLAIM AVAILABILITY:
 *    ```javascript
 *    const claimInfo = await checkClaimAvailable(wallet, protocol);
 *    // { available: true, amount: 1000, deadline: ... }
 *    ```
 *
 * 2. FETCH MERKLE PROOF:
 *    ```javascript
 *    const proof = await getMerkleProof(wallet, protocol);
 *    // ['0x...', '0x...', ...]
 *    ```
 *
 * 3. BUILD CLAIM TRANSACTION:
 *    ```javascript
 *    const claimTx = await buildClaimTransaction({
 *      wallet,
 *      amount: claimInfo.amount,
 *      proof,
 *      contract: protocol.claimContract,
 *    });
 *    ```
 *
 * 4. OPTIMIZE GAS:
 *    ```javascript
 *    const gasPrice = await getOptimalGasPrice();
 *    if (gasPrice > MAX_GAS) {
 *      await waitForLowerGas();
 *    }
 *    ```
 *
 * 5. EXECUTE CLAIM:
 *    ```javascript
 *    const receipt = await executeClaim(claimTx);
 *    if (receipt.status === 'success') {
 *      recordClaim(wallet, protocol, amount);
 *    }
 *    ```
 *
 * HOW Merkle proofs work:
 *
 * ```javascript
 * // Protocol publishes merkle root on-chain
 * // and full tree data off-chain (IPFS/API)
 *
 * // To claim:
 * // 1. Find your leaf: hash(wallet, amount)
 * // 2. Get proof: sibling hashes up to root
 * // 3. Contract verifies: proof + leaf = root
 * // 4. If valid, tokens transferred
 * ```
 *
 * =============================================================================
 */

const EventEmitter = require('events');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Claim status
 */
const CLAIM_STATUS = {
  PENDING: 'pending',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not_available',
  CLAIMED: 'claimed',
  FAILED: 'failed',
  EXPIRED: 'expired',
};

/**
 * Claim types
 */
const CLAIM_TYPE = {
  MERKLE: 'merkle',
  DIRECT: 'direct',
  SIGNATURE: 'signature',
  VESTED: 'vested',
  MULTI: 'multi',
};

/**
 * Claim strategies
 */
const CLAIM_STRATEGY = {
  IMMEDIATE: 'immediate',     // Claim ASAP
  GAS_OPTIMIZED: 'gas_optimized', // Wait for low gas
  SCHEDULED: 'scheduled',     // Claim at specific time
  MANUAL: 'manual',           // User triggers
};

/**
 * Known airdrop configurations
 */
const KNOWN_AIRDROPS = {
  layerzero_zro: {
    name: 'LayerZero ZRO',
    token: 'ZRO',
    chainId: 1,
    claimContract: '0x...',  // To be updated when known
    claimType: CLAIM_TYPE.MERKLE,
    apiEndpoint: null,
    deadline: null,
    launched: false,
  },
  zksync_zk: {
    name: 'zkSync ZK',
    token: 'ZK',
    chainId: 324,
    claimContract: '0x...',
    claimType: CLAIM_TYPE.MERKLE,
    apiEndpoint: null,
    deadline: null,
    launched: false,
  },
  scroll: {
    name: 'Scroll',
    token: 'SCR',
    chainId: 534352,
    claimContract: '0x...',
    claimType: CLAIM_TYPE.MERKLE,
    apiEndpoint: null,
    deadline: null,
    launched: false,
  },
  // Add more as they launch
};

/**
 * Gas thresholds (in gwei)
 */
const GAS_THRESHOLDS = {
  CHEAP: 20,
  MODERATE: 50,
  EXPENSIVE: 100,
  VERY_EXPENSIVE: 200,
};

// =============================================================================
// CLAIM RECORD CLASS
// =============================================================================

/**
 * Represents a claim record
 */
class ClaimRecord {
  constructor(data) {
    this.id = data.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.walletAddress = data.walletAddress?.toLowerCase();
    this.airdropId = data.airdropId;
    this.protocol = data.protocol;
    this.token = data.token;
    this.chainId = data.chainId;

    // Claim details
    this.amount = data.amount || 0;
    this.amountFormatted = data.amountFormatted || '0';
    this.proof = data.proof || [];
    this.claimIndex = data.claimIndex || null;

    // Status
    this.status = data.status || CLAIM_STATUS.PENDING;
    this.txHash = data.txHash || null;
    this.blockNumber = data.blockNumber || null;
    this.gasUsed = data.gasUsed || null;
    this.gasCost = data.gasCost || null;

    // Timestamps
    this.detectedAt = data.detectedAt || Date.now();
    this.claimedAt = data.claimedAt || null;
    this.deadline = data.deadline || null;

    // Value tracking
    this.tokenPriceAtClaim = data.tokenPriceAtClaim || null;
    this.usdValueAtClaim = data.usdValueAtClaim || null;

    // Error info
    this.error = data.error || null;
    this.attempts = data.attempts || 0;
  }

  /**
   * Mark as claimed
   */
  markClaimed(txReceipt) {
    this.status = CLAIM_STATUS.CLAIMED;
    this.claimedAt = Date.now();
    this.txHash = txReceipt.transactionHash || txReceipt.hash;
    this.blockNumber = txReceipt.blockNumber;
    this.gasUsed = txReceipt.gasUsed?.toString();
  }

  /**
   * Mark as failed
   */
  markFailed(error) {
    this.status = CLAIM_STATUS.FAILED;
    this.error = error?.message || error;
    this.attempts++;
  }

  /**
   * Check if should retry
   */
  shouldRetry(maxAttempts = 3) {
    return this.status === CLAIM_STATUS.FAILED && this.attempts < maxAttempts;
  }

  /**
   * Check if expired
   */
  isExpired() {
    if (!this.deadline) return false;
    return Date.now() > this.deadline;
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      walletAddress: this.walletAddress,
      airdropId: this.airdropId,
      protocol: this.protocol,
      token: this.token,
      chainId: this.chainId,
      amount: this.amount,
      amountFormatted: this.amountFormatted,
      status: this.status,
      txHash: this.txHash,
      gasUsed: this.gasUsed,
      gasCost: this.gasCost,
      detectedAt: this.detectedAt,
      claimedAt: this.claimedAt,
      deadline: this.deadline,
      usdValueAtClaim: this.usdValueAtClaim,
      error: this.error,
      attempts: this.attempts,
    };
  }
}

// =============================================================================
// CLAIM AUTOMATION CLASS
// =============================================================================

/**
 * Main claim automation system
 */
class ClaimAutomation extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      logger: config.logger || console,
      maxGasPrice: config.maxGasPrice || GAS_THRESHOLDS.EXPENSIVE,
      defaultStrategy: config.defaultStrategy || CLAIM_STRATEGY.GAS_OPTIMIZED,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 60 * 1000, // 1 minute
      checkInterval: config.checkInterval || 5 * 60 * 1000, // 5 minutes
      ...config,
    };

    // Claim records storage
    this.claims = new Map(); // claimId -> ClaimRecord
    this.walletClaims = new Map(); // wallet -> Map<airdropId, claimId>

    // Airdrop registry
    this.airdrops = new Map(Object.entries(KNOWN_AIRDROPS));

    // Custom proof fetchers
    this.proofFetchers = new Map();

    // Execution queue
    this.claimQueue = [];
    this.isProcessing = false;

    // Monitoring
    this.monitoringEnabled = false;
    this.monitorTimer = null;

    // Statistics
    this.stats = {
      totalClaimed: 0,
      totalValueUSD: 0,
      totalGasSpent: 0,
      failedClaims: 0,
    };
  }

  // ===========================================================================
  // AIRDROP REGISTRY
  // ===========================================================================

  /**
   * Register a new airdrop
   */
  registerAirdrop(id, config) {
    this.airdrops.set(id, {
      ...config,
      registered: Date.now(),
    });

    this.emit('airdropRegistered', { id, config });
  }

  /**
   * Update airdrop config (e.g., when claim contract is deployed)
   */
  updateAirdrop(id, updates) {
    const existing = this.airdrops.get(id);
    if (!existing) {
      throw new Error(`Airdrop not found: ${id}`);
    }

    this.airdrops.set(id, { ...existing, ...updates });
    this.emit('airdropUpdated', { id, updates });
  }

  /**
   * Mark airdrop as launched
   */
  markAirdropLaunched(id, claimContract, apiEndpoint = null) {
    this.updateAirdrop(id, {
      launched: true,
      claimContract,
      apiEndpoint,
      launchedAt: Date.now(),
    });

    this.emit('airdropLaunched', { id });
  }

  /**
   * Get all airdrops
   */
  getAllAirdrops() {
    return Array.from(this.airdrops.entries()).map(([id, config]) => ({
      id,
      ...config,
    }));
  }

  /**
   * Get launched airdrops
   */
  getLaunchedAirdrops() {
    return this.getAllAirdrops().filter(a => a.launched);
  }

  // ===========================================================================
  // PROOF FETCHING
  // ===========================================================================

  /**
   * Register a proof fetcher for an airdrop
   */
  registerProofFetcher(airdropId, fetcher) {
    this.proofFetchers.set(airdropId, fetcher);
  }

  /**
   * Fetch merkle proof for a wallet
   */
  async fetchMerkleProof(walletAddress, airdropId) {
    const normalized = walletAddress.toLowerCase();

    // Use custom fetcher if registered
    const customFetcher = this.proofFetchers.get(airdropId);
    if (customFetcher) {
      return customFetcher(normalized);
    }

    // Use airdrop's API endpoint
    const airdrop = this.airdrops.get(airdropId);
    if (!airdrop?.apiEndpoint) {
      throw new Error(`No API endpoint for airdrop: ${airdropId}`);
    }

    // This would be implemented based on each protocol's API
    // For now, return a placeholder structure
    this.config.logger.warn?.(`Proof fetching not implemented for ${airdropId}`);

    return {
      eligible: false,
      amount: '0',
      proof: [],
      index: null,
    };
  }

  // ===========================================================================
  // CLAIM CHECKING
  // ===========================================================================

  /**
   * Check if a wallet can claim an airdrop
   */
  async checkClaimAvailable(walletAddress, airdropId) {
    const normalized = walletAddress.toLowerCase();

    const airdrop = this.airdrops.get(airdropId);
    if (!airdrop) {
      throw new Error(`Unknown airdrop: ${airdropId}`);
    }

    // Check if airdrop has launched
    if (!airdrop.launched) {
      return {
        available: false,
        reason: 'Airdrop not yet launched',
        airdrop: airdrop.name,
      };
    }

    // Check if already claimed
    const existingClaim = this.getWalletClaim(normalized, airdropId);
    if (existingClaim?.status === CLAIM_STATUS.CLAIMED) {
      return {
        available: false,
        reason: 'Already claimed',
        claimRecord: existingClaim,
      };
    }

    // Check if expired
    if (airdrop.deadline && Date.now() > airdrop.deadline) {
      return {
        available: false,
        reason: 'Claim period expired',
        deadline: airdrop.deadline,
      };
    }

    // Fetch eligibility and proof
    try {
      const proofData = await this.fetchMerkleProof(normalized, airdropId);

      if (!proofData.eligible) {
        return {
          available: false,
          reason: 'Not eligible for this airdrop',
        };
      }

      return {
        available: true,
        amount: proofData.amount,
        proof: proofData.proof,
        index: proofData.index,
        airdrop: airdrop.name,
        token: airdrop.token,
        chainId: airdrop.chainId,
      };
    } catch (error) {
      return {
        available: false,
        reason: `Error checking eligibility: ${error.message}`,
        error: true,
      };
    }
  }

  /**
   * Check all airdrops for a wallet
   */
  async checkAllClaims(walletAddress) {
    const results = {};

    for (const [airdropId, airdrop] of this.airdrops) {
      if (!airdrop.launched) continue;

      try {
        results[airdropId] = await this.checkClaimAvailable(walletAddress, airdropId);
      } catch (error) {
        results[airdropId] = {
          available: false,
          reason: error.message,
          error: true,
        };
      }
    }

    return results;
  }

  // ===========================================================================
  // CLAIM EXECUTION
  // ===========================================================================

  /**
   * Queue a claim for execution
   */
  async queueClaim(walletAddress, airdropId, options = {}) {
    const normalized = walletAddress.toLowerCase();

    // Check availability
    const availability = await this.checkClaimAvailable(normalized, airdropId);
    if (!availability.available) {
      throw new Error(`Cannot claim: ${availability.reason}`);
    }

    const airdrop = this.airdrops.get(airdropId);

    // Create claim record
    const claim = new ClaimRecord({
      walletAddress: normalized,
      airdropId,
      protocol: airdrop.name,
      token: airdrop.token,
      chainId: airdrop.chainId,
      amount: availability.amount,
      proof: availability.proof,
      claimIndex: availability.index,
      deadline: airdrop.deadline,
      status: CLAIM_STATUS.PENDING,
    });

    // Store claim
    this.claims.set(claim.id, claim);
    if (!this.walletClaims.has(normalized)) {
      this.walletClaims.set(normalized, new Map());
    }
    this.walletClaims.get(normalized).set(airdropId, claim.id);

    // Add to queue
    this.claimQueue.push({
      claimId: claim.id,
      strategy: options.strategy || this.config.defaultStrategy,
      priority: options.priority || 'normal',
      scheduledTime: options.scheduledTime || null,
    });

    this.emit('claimQueued', claim.toJSON());

    // Process queue if not already processing
    if (!this.isProcessing) {
      this.processClaimQueue();
    }

    return claim;
  }

  /**
   * Process the claim queue
   */
  async processClaimQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.claimQueue.length > 0) {
      // Sort by priority
      this.claimQueue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      const queueItem = this.claimQueue.shift();
      const claim = this.claims.get(queueItem.claimId);

      if (!claim || claim.status === CLAIM_STATUS.CLAIMED) {
        continue;
      }

      // Check scheduled time
      if (queueItem.scheduledTime && Date.now() < queueItem.scheduledTime) {
        // Re-add to queue
        this.claimQueue.push(queueItem);
        await this.sleep(1000);
        continue;
      }

      // Check gas strategy
      if (queueItem.strategy === CLAIM_STRATEGY.GAS_OPTIMIZED) {
        const gasPrice = await this.getCurrentGasPrice();
        if (gasPrice > this.config.maxGasPrice) {
          // Re-add to queue and wait
          this.claimQueue.push(queueItem);
          this.config.logger.info?.(`Gas too high (${gasPrice} gwei), waiting...`);
          await this.sleep(60000); // Wait 1 minute
          continue;
        }
      }

      // Execute claim
      try {
        await this.executeClaim(claim);
      } catch (error) {
        this.config.logger.error?.(`Claim failed: ${error.message}`);

        if (claim.shouldRetry(this.config.maxRetries)) {
          // Re-add to queue for retry
          this.claimQueue.push(queueItem);
          await this.sleep(this.config.retryDelay);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Execute a claim transaction
   */
  async executeClaim(claim) {
    claim.status = CLAIM_STATUS.CHECKING;
    this.emit('claimExecuting', claim.toJSON());

    const airdrop = this.airdrops.get(claim.airdropId);

    // Build claim transaction
    const claimTx = await this.buildClaimTransaction(claim, airdrop);

    // Execute transaction
    // This would use the actual wallet/signer to send the transaction
    // For now, we'll emit an event for external handling

    this.emit('claimTransactionReady', {
      claim: claim.toJSON(),
      transaction: claimTx,
      executeCallback: async (txReceipt) => {
        await this.handleClaimResult(claim, txReceipt);
      },
    });

    // If execute function is provided in config, use it
    if (this.config.executeTx) {
      try {
        const txReceipt = await this.config.executeTx(claimTx, claim.walletAddress);
        await this.handleClaimResult(claim, txReceipt);
      } catch (error) {
        claim.markFailed(error);
        this.emit('claimFailed', {
          claim: claim.toJSON(),
          error: error.message,
        });
        throw error;
      }
    }

    return claim;
  }

  /**
   * Build claim transaction
   */
  async buildClaimTransaction(claim, airdrop) {
    // Build transaction data based on claim type
    switch (airdrop.claimType) {
      case CLAIM_TYPE.MERKLE:
        return this.buildMerkleClaimTx(claim, airdrop);
      case CLAIM_TYPE.DIRECT:
        return this.buildDirectClaimTx(claim, airdrop);
      case CLAIM_TYPE.SIGNATURE:
        return this.buildSignatureClaimTx(claim, airdrop);
      default:
        throw new Error(`Unsupported claim type: ${airdrop.claimType}`);
    }
  }

  /**
   * Build merkle claim transaction
   */
  buildMerkleClaimTx(claim, airdrop) {
    // Standard merkle distributor claim interface
    // claim(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof)

    const iface = {
      name: 'claim',
      inputs: [
        { name: 'index', type: 'uint256' },
        { name: 'account', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'merkleProof', type: 'bytes32[]' },
      ],
    };

    return {
      to: airdrop.claimContract,
      chainId: airdrop.chainId,
      data: {
        method: 'claim',
        args: [claim.claimIndex, claim.walletAddress, claim.amount, claim.proof],
      },
      value: '0',
      interface: iface,
    };
  }

  /**
   * Build direct claim transaction
   */
  buildDirectClaimTx(claim, airdrop) {
    return {
      to: airdrop.claimContract,
      chainId: airdrop.chainId,
      data: {
        method: 'claim',
        args: [],
      },
      value: '0',
    };
  }

  /**
   * Build signature-based claim transaction
   */
  buildSignatureClaimTx(claim, airdrop) {
    // Would need to sign a message first
    return {
      to: airdrop.claimContract,
      chainId: airdrop.chainId,
      data: {
        method: 'claimWithSignature',
        args: [claim.amount, claim.signature],
      },
      value: '0',
    };
  }

  /**
   * Handle claim result
   */
  async handleClaimResult(claim, txReceipt) {
    if (txReceipt && txReceipt.status === 1) {
      claim.markClaimed(txReceipt);

      // Update stats
      this.stats.totalClaimed++;
      if (claim.gasCost) {
        this.stats.totalGasSpent += parseFloat(claim.gasCost);
      }

      this.emit('claimSuccessful', claim.toJSON());
    } else {
      claim.markFailed('Transaction failed');
      this.stats.failedClaims++;

      this.emit('claimFailed', {
        claim: claim.toJSON(),
        error: 'Transaction reverted',
      });
    }
  }

  // ===========================================================================
  // BATCH OPERATIONS
  // ===========================================================================

  /**
   * Queue claims for multiple wallets
   */
  async queueMultipleWallets(walletAddresses, airdropId, options = {}) {
    const results = {
      queued: [],
      failed: [],
    };

    for (const wallet of walletAddresses) {
      try {
        const claim = await this.queueClaim(wallet, airdropId, options);
        results.queued.push({
          wallet: wallet.toLowerCase(),
          claimId: claim.id,
        });
      } catch (error) {
        results.failed.push({
          wallet: wallet.toLowerCase(),
          reason: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Queue all available claims for a wallet
   */
  async queueAllAvailable(walletAddress, options = {}) {
    const availability = await this.checkAllClaims(walletAddress);
    const results = {
      queued: [],
      notAvailable: [],
    };

    for (const [airdropId, status] of Object.entries(availability)) {
      if (status.available) {
        try {
          const claim = await this.queueClaim(walletAddress, airdropId, options);
          results.queued.push({
            airdropId,
            claimId: claim.id,
            amount: status.amount,
          });
        } catch (error) {
          results.notAvailable.push({
            airdropId,
            reason: error.message,
          });
        }
      } else {
        results.notAvailable.push({
          airdropId,
          reason: status.reason,
        });
      }
    }

    return results;
  }

  // ===========================================================================
  // MONITORING
  // ===========================================================================

  /**
   * Start monitoring for new airdrops
   */
  startMonitoring() {
    if (this.monitoringEnabled) return;

    this.monitoringEnabled = true;
    this.monitorTimer = setInterval(() => {
      this.checkForNewAirdrops();
    }, this.config.checkInterval);

    this.config.logger.info?.('Claim monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.monitoringEnabled = false;
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * Check for newly launched airdrops
   */
  async checkForNewAirdrops() {
    // This would poll APIs or listen to events for new airdrops
    // For now, emit event for external handling

    this.emit('checkingNewAirdrops');
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get claim by ID
   */
  getClaim(claimId) {
    return this.claims.get(claimId);
  }

  /**
   * Get wallet's claim for an airdrop
   */
  getWalletClaim(walletAddress, airdropId) {
    const normalized = walletAddress.toLowerCase();
    const walletClaimMap = this.walletClaims.get(normalized);

    if (!walletClaimMap) return null;

    const claimId = walletClaimMap.get(airdropId);
    return claimId ? this.claims.get(claimId) : null;
  }

  /**
   * Get all claims for a wallet
   */
  getWalletClaims(walletAddress) {
    const normalized = walletAddress.toLowerCase();
    const walletClaimMap = this.walletClaims.get(normalized);

    if (!walletClaimMap) return [];

    const claims = [];
    for (const claimId of walletClaimMap.values()) {
      const claim = this.claims.get(claimId);
      if (claim) claims.push(claim);
    }

    return claims;
  }

  /**
   * Get pending claims
   */
  getPendingClaims() {
    return Array.from(this.claims.values()).filter(
      c => c.status === CLAIM_STATUS.PENDING || c.status === CLAIM_STATUS.CHECKING
    );
  }

  /**
   * Get completed claims
   */
  getCompletedClaims() {
    return Array.from(this.claims.values()).filter(
      c => c.status === CLAIM_STATUS.CLAIMED
    );
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Get current gas price
   */
  async getCurrentGasPrice() {
    // This would be implemented using a provider
    // For now, return a placeholder
    if (this.config.getGasPrice) {
      return this.config.getGasPrice();
    }
    return GAS_THRESHOLDS.MODERATE;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const pendingClaims = this.getPendingClaims().length;
    const completedClaims = this.getCompletedClaims().length;

    return {
      ...this.stats,
      pendingClaims,
      completedClaims,
      totalClaims: this.claims.size,
      queueLength: this.claimQueue.length,
      registeredAirdrops: this.airdrops.size,
      launchedAirdrops: this.getLaunchedAirdrops().length,
      monitoringEnabled: this.monitoringEnabled,
    };
  }

  /**
   * Generate claim report for a wallet
   */
  generateReport(walletAddress) {
    const normalized = walletAddress.toLowerCase();
    const claims = this.getWalletClaims(normalized);

    let totalClaimed = 0;
    let totalValue = 0;
    let totalGas = 0;

    const claimDetails = claims.map(claim => {
      if (claim.status === CLAIM_STATUS.CLAIMED) {
        totalClaimed++;
        if (claim.usdValueAtClaim) {
          totalValue += parseFloat(claim.usdValueAtClaim);
        }
        if (claim.gasCost) {
          totalGas += parseFloat(claim.gasCost);
        }
      }

      return claim.toJSON();
    });

    return {
      wallet: normalized,
      generatedAt: Date.now(),
      summary: {
        totalClaims: claims.length,
        successfulClaims: totalClaimed,
        totalValueUSD: totalValue,
        totalGasSpent: totalGas,
        netValue: totalValue - totalGas,
      },
      claims: claimDetails,
    };
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  ClaimAutomation,
  ClaimRecord,
  CLAIM_STATUS,
  CLAIM_TYPE,
  CLAIM_STRATEGY,
  GAS_THRESHOLDS,
  KNOWN_AIRDROPS,

  // Factory
  createClaimAutomation: (config = {}) => new ClaimAutomation(config),
};
