/**
 * MEV Protection - Flashbots & Private Transaction Submission
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: MEV bots extract ~$500M annually from DeFi users through sandwich
 * attacks, frontrunning, and backrunning. Flashbots Protect sends transactions
 * directly to block builders, bypassing the public mempool.
 *
 * STATE-OF-THE-ART:
 * - Flashbots Protect RPC for mainnet
 * - MEV Blocker for multi-chain support
 * - Transaction simulation before submission
 * - Bundle creation for atomic operations
 *
 * @module security/mev-protection
 */

const { ethers } = require('ethers');

class MevProtection {
  constructor(config = {}) {
    this.logger = config.logger || console;

    // MEV protection RPC endpoints by chain
    this.PROTECT_RPC = {
      // Ethereum Mainnet - Flashbots Protect
      1: {
        url: 'https://rpc.flashbots.net',
        name: 'Flashbots Protect',
        features: ['private', 'bundle', 'simulation'],
      },
      // Alternative: MEV Blocker (supports more hints)
      // 1: {
      //   url: 'https://rpc.mevblocker.io',
      //   name: 'MEV Blocker',
      //   features: ['private', 'refund'],
      // },

      // Arbitrum - No public mempool, but still use private RPC
      42161: {
        url: config.arbitrumRpc || process.env.ARBITRUM_RPC_URL,
        name: 'Arbitrum (sequencer)',
        features: ['sequencer'],
      },

      // Optimism
      10: {
        url: config.optimismRpc || process.env.OPTIMISM_RPC_URL,
        name: 'Optimism (sequencer)',
        features: ['sequencer'],
      },

      // Base
      8453: {
        url: config.baseRpc || process.env.BASE_RPC_URL,
        name: 'Base (sequencer)',
        features: ['sequencer'],
      },
    };

    // Flashbots bundle relay (for advanced bundle submission)
    this.FLASHBOTS_RELAY = 'https://relay.flashbots.net';

    // Simulation configuration
    this.SIMULATION_ENDPOINT = 'https://rpc.flashbots.net';

    // Configuration
    this.config = {
      preferPrivate: config.preferPrivate ?? true,
      simulateFirst: config.simulateFirst ?? true,
      maxBlockWait: config.maxBlockWait ?? 25, // Max blocks to wait for inclusion
      bundleEnabled: config.bundleEnabled ?? false,
    };

    // Pending transactions tracking
    this.pendingTxs = new Map();

    // Auth signer for Flashbots (optional, for bundle submission)
    this.authSigner = null;
  }

  /**
   * Get MEV-protected provider for a chain
   *
   * @param {number} chainId - Chain ID
   * @returns {ethers.providers.JsonRpcProvider}
   */
  getProtectedProvider(chainId) {
    const rpcConfig = this.PROTECT_RPC[chainId];
    if (!rpcConfig || !rpcConfig.url) {
      throw new Error(`No MEV protection RPC configured for chain ${chainId}`);
    }

    return new ethers.providers.JsonRpcProvider(rpcConfig.url);
  }

  /**
   * Send transaction via MEV-protected RPC
   *
   * @param {ethers.Signer} signer - Signer instance
   * @param {object} transaction - Transaction object
   * @param {number} chainId - Chain ID
   * @param {object} options - Additional options
   * @returns {Promise<{txHash: string, status: string, protectionUsed: string}>}
   */
  async sendProtectedTransaction(signer, transaction, chainId, options = {}) {
    const rpcConfig = this.PROTECT_RPC[chainId];

    if (!rpcConfig || !rpcConfig.url || !this.config.preferPrivate) {
      // Fall back to regular submission
      this.logger.warn('[MevProtection] No protection available, using public mempool');
      return this.sendPublicTransaction(signer, transaction);
    }

    // Simulate first if enabled
    if (this.config.simulateFirst && chainId === 1) {
      const simulation = await this.simulateTransaction(transaction, chainId);
      if (!simulation.success) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }
      this.logger.info('[MevProtection] Simulation passed');
    }

    // Create protected provider
    const protectedProvider = this.getProtectedProvider(chainId);

    // Connect signer to protected provider
    const protectedSigner = signer.connect(protectedProvider);

    this.logger.info(`[MevProtection] Sending via ${rpcConfig.name}`);

    // Send transaction
    const tx = await protectedSigner.sendTransaction(transaction);

    // Track pending transaction
    this.pendingTxs.set(tx.hash, {
      hash: tx.hash,
      chainId,
      sentAt: Date.now(),
      protection: rpcConfig.name,
      status: 'pending',
    });

    return {
      txHash: tx.hash,
      status: 'pending',
      protectionUsed: rpcConfig.name,
      transaction: tx,
    };
  }

  /**
   * Simulate transaction using Flashbots simulation
   *
   * @param {object} transaction - Transaction to simulate
   * @param {number} chainId - Chain ID
   * @returns {Promise<{success: boolean, gasUsed: string, error: string|null}>}
   */
  async simulateTransaction(transaction, chainId) {
    if (chainId !== 1) {
      // Simulation only available on mainnet via Flashbots
      return { success: true, simulated: false, note: 'Simulation not available on this chain' };
    }

    try {
      const provider = new ethers.providers.JsonRpcProvider(this.SIMULATION_ENDPOINT);

      // Use eth_call for simulation
      const result = await provider.call({
        to: transaction.to,
        from: transaction.from,
        data: transaction.data,
        value: transaction.value,
        gasLimit: transaction.gasLimit,
      });

      // Estimate gas
      const gasEstimate = await provider.estimateGas({
        to: transaction.to,
        from: transaction.from,
        data: transaction.data,
        value: transaction.value,
      });

      return {
        success: true,
        simulated: true,
        result,
        gasUsed: gasEstimate.toString(),
      };

    } catch (error) {
      return {
        success: false,
        simulated: true,
        error: error.message,
        revertReason: this.parseRevertReason(error),
      };
    }
  }

  /**
   * Create and submit a bundle of transactions (Flashbots)
   *
   * @param {ethers.Signer} signer - Signer instance
   * @param {object[]} transactions - Array of transaction objects
   * @param {number} targetBlock - Target block number
   * @param {object} options - Bundle options
   * @returns {Promise<{bundleHash: string, status: string}>}
   */
  async submitBundle(signer, transactions, targetBlock, options = {}) {
    if (!this.config.bundleEnabled) {
      throw new Error('Bundle submission is not enabled');
    }

    if (!this.authSigner) {
      // Create auth signer for Flashbots
      this.authSigner = ethers.Wallet.createRandom();
    }

    // Sign all transactions
    const signedTxs = [];
    for (const tx of transactions) {
      const signedTx = await signer.signTransaction(tx);
      signedTxs.push(signedTx);
    }

    // Create bundle payload
    const bundlePayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendBundle',
      params: [
        {
          txs: signedTxs,
          blockNumber: ethers.utils.hexValue(targetBlock),
          minTimestamp: options.minTimestamp,
          maxTimestamp: options.maxTimestamp,
        },
      ],
    };

    // Sign the payload with auth signer
    const body = JSON.stringify(bundlePayload);
    const signature = await this.authSigner.signMessage(
      ethers.utils.id(body)
    );

    // Submit to Flashbots relay
    const response = await fetch(this.FLASHBOTS_RELAY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Flashbots-Signature': `${this.authSigner.address}:${signature}`,
      },
      body,
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(`Bundle submission failed: ${result.error.message}`);
    }

    const bundleHash = result.result.bundleHash;

    this.logger.info(`[MevProtection] Bundle submitted: ${bundleHash} for block ${targetBlock}`);

    return {
      bundleHash,
      targetBlock,
      status: 'pending',
      signedTransactions: signedTxs.length,
    };
  }

  /**
   * Check if transaction was included (for Flashbots)
   *
   * @param {string} txHash - Transaction hash
   * @param {number} chainId - Chain ID
   * @returns {Promise<{included: boolean, block: number|null, status: string}>}
   */
  async checkInclusion(txHash, chainId) {
    const tracked = this.pendingTxs.get(txHash);
    const provider = new ethers.providers.JsonRpcProvider(
      this.PROTECT_RPC[chainId]?.url
    );

    try {
      const receipt = await provider.getTransactionReceipt(txHash);

      if (receipt) {
        // Update tracking
        if (tracked) {
          tracked.status = receipt.status === 1 ? 'confirmed' : 'failed';
          tracked.blockNumber = receipt.blockNumber;
        }

        return {
          included: true,
          block: receipt.blockNumber,
          status: receipt.status === 1 ? 'success' : 'reverted',
          gasUsed: receipt.gasUsed.toString(),
        };
      }

      return {
        included: false,
        block: null,
        status: 'pending',
      };

    } catch (error) {
      return {
        included: false,
        block: null,
        status: 'unknown',
        error: error.message,
      };
    }
  }

  /**
   * Wait for transaction inclusion with timeout
   *
   * @param {string} txHash - Transaction hash
   * @param {number} chainId - Chain ID
   * @param {number} timeoutBlocks - Max blocks to wait
   * @returns {Promise<{included: boolean, receipt: object|null}>}
   */
  async waitForInclusion(txHash, chainId, timeoutBlocks = null) {
    const maxBlocks = timeoutBlocks || this.config.maxBlockWait;
    const provider = new ethers.providers.JsonRpcProvider(
      this.PROTECT_RPC[chainId]?.url
    );

    const startBlock = await provider.getBlockNumber();

    this.logger.info(`[MevProtection] Waiting for ${txHash.slice(0, 10)}... (max ${maxBlocks} blocks)`);

    while (true) {
      const currentBlock = await provider.getBlockNumber();

      // Check timeout
      if (currentBlock - startBlock > maxBlocks) {
        this.logger.warn(`[MevProtection] Transaction ${txHash.slice(0, 10)}... not included after ${maxBlocks} blocks`);

        // Update tracking
        const tracked = this.pendingTxs.get(txHash);
        if (tracked) {
          tracked.status = 'timeout';
        }

        return { included: false, receipt: null, reason: 'timeout' };
      }

      // Check inclusion
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        this.logger.info(`[MevProtection] Transaction ${txHash.slice(0, 10)}... included in block ${receipt.blockNumber}`);

        // Update tracking
        const tracked = this.pendingTxs.get(txHash);
        if (tracked) {
          tracked.status = receipt.status === 1 ? 'confirmed' : 'reverted';
          tracked.blockNumber = receipt.blockNumber;
        }

        return { included: true, receipt };
      }

      // Wait for next block
      await this.sleep(2000);
    }
  }

  /**
   * Analyze transaction for MEV vulnerability
   *
   * @param {object} transaction - Transaction to analyze
   * @returns {{vulnerable: boolean, riskLevel: string, reasons: string[]}}
   */
  analyzeMevRisk(transaction) {
    const risks = [];
    let riskLevel = 'low';

    // Check if it's a swap
    const swapSelectors = [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0x04e45aaf', // exactInputSingle (V3)
      '0xb858183f', // exactInput (V3)
    ];

    const selector = transaction.data?.slice(0, 10);
    if (swapSelectors.includes(selector)) {
      risks.push('DEX swap detected - highly susceptible to sandwich attacks');
      riskLevel = 'high';
    }

    // Check value (large ETH transfers are targets)
    if (transaction.value && ethers.BigNumber.from(transaction.value).gt(
      ethers.utils.parseEther('10')
    )) {
      risks.push('Large value transfer - may attract frontrunning');
      riskLevel = riskLevel === 'high' ? 'critical' : 'medium';
    }

    // Check gas price (high gas = more valuable target)
    if (transaction.gasPrice && ethers.BigNumber.from(transaction.gasPrice).gt(
      ethers.utils.parseUnits('100', 'gwei')
    )) {
      risks.push('High gas price - indicates time-sensitive transaction');
      if (riskLevel !== 'critical') {
        riskLevel = 'medium';
      }
    }

    return {
      vulnerable: risks.length > 0,
      riskLevel,
      reasons: risks,
      recommendation: riskLevel === 'low'
        ? 'Public mempool acceptable'
        : 'Use MEV protection (Flashbots Protect)',
    };
  }

  /**
   * Get optimal submission strategy
   *
   * @param {object} transaction - Transaction object
   * @param {number} chainId - Chain ID
   * @returns {{strategy: string, rpc: string, reason: string}}
   */
  getSubmissionStrategy(transaction, chainId) {
    const riskAnalysis = this.analyzeMevRisk(transaction);
    const rpcConfig = this.PROTECT_RPC[chainId];

    // L2s don't need MEV protection (no public mempool)
    if ([42161, 10, 8453].includes(chainId)) {
      return {
        strategy: 'sequencer',
        rpc: rpcConfig?.url || 'default',
        reason: 'L2 sequencer provides natural MEV protection',
      };
    }

    // High risk on mainnet - use Flashbots
    if (chainId === 1 && riskAnalysis.riskLevel !== 'low') {
      return {
        strategy: 'private',
        rpc: rpcConfig?.url,
        reason: riskAnalysis.reasons.join('; '),
      };
    }

    // Default to public for low-risk
    return {
      strategy: 'public',
      rpc: null,
      reason: 'Low MEV risk, public mempool acceptable',
    };
  }

  /**
   * Send via public mempool (fallback)
   *
   * @param {ethers.Signer} signer - Signer instance
   * @param {object} transaction - Transaction object
   * @returns {Promise<{txHash: string, status: string}>}
   */
  async sendPublicTransaction(signer, transaction) {
    const tx = await signer.sendTransaction(transaction);

    this.pendingTxs.set(tx.hash, {
      hash: tx.hash,
      sentAt: Date.now(),
      protection: 'none',
      status: 'pending',
    });

    return {
      txHash: tx.hash,
      status: 'pending',
      protectionUsed: 'none',
      transaction: tx,
    };
  }

  /**
   * Parse revert reason from error
   *
   * @param {Error} error - Error object
   * @returns {string|null}
   */
  parseRevertReason(error) {
    if (!error.data) return null;

    try {
      // Try to decode revert reason
      const reason = ethers.utils.toUtf8String('0x' + error.data.slice(138));
      return reason.replace(/\0/g, '');
    } catch {
      return error.data;
    }
  }

  /**
   * Get pending transactions
   *
   * @returns {Array}
   */
  getPendingTransactions() {
    return Array.from(this.pendingTxs.values()).filter(tx => tx.status === 'pending');
  }

  /**
   * Clear old pending transactions
   *
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    for (const [hash, tx] of this.pendingTxs) {
      if (now - tx.sentAt > maxAge) {
        this.pendingTxs.delete(hash);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MevProtection;
