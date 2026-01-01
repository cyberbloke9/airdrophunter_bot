/**
 * Nonce Manager - Transaction Nonce Coordination
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: Nonces must be strictly sequential. Parallel transactions cause race
 * conditions. Stuck transactions can block entire wallets.
 *
 * STATE-OF-THE-ART:
 * - Async lock per wallet prevents race conditions
 * - Automatic stuck transaction detection and resolution
 * - Gap prevention (never skip nonces)
 *
 * @module security/nonce-manager
 */

const { ethers } = require('ethers');

// Simple async lock implementation (no external dependency)
class AsyncLock {
  constructor(options = {}) {
    this.locks = new Map();
    this.timeout = options.timeout ?? 30000;
  }

  async acquire(key, fn) {
    const startTime = Date.now();

    // Wait for existing lock to release
    while (this.locks.has(key)) {
      if (Date.now() - startTime > this.timeout) {
        throw new Error(`Lock timeout for key: ${key}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Acquire lock
    this.locks.set(key, true);

    try {
      return await fn();
    } finally {
      this.locks.delete(key);
    }
  }
}

class NonceManager {
  constructor(config = {}) {
    this.lock = new AsyncLock({ timeout: config.lockTimeout ?? 30000 });
    this.pendingNonces = new Map();  // wallet -> Set<nonce>
    this.confirmedNonce = new Map(); // wallet -> last confirmed nonce
    this.stuckTransactions = new Map(); // `${wallet}:${nonce}` -> txInfo
    this.stuckTimeout = config.stuckTimeout ?? 600000; // 10 minutes
    this.logger = config.logger || console;
  }

  /**
   * Get and reserve next available nonce
   *
   * @param {string} walletAddress - Wallet address
   * @param {ethers.providers.Provider} provider - Provider instance
   * @returns {Promise<number>} Reserved nonce
   */
  async getNextNonce(walletAddress, provider) {
    const wallet = walletAddress.toLowerCase();

    return this.lock.acquire(wallet, async () => {
      // Get on-chain nonce (includes pending in mempool)
      const onChainNonce = await provider.getTransactionCount(wallet, 'pending');

      // Get our tracked pending nonces
      let pending = this.pendingNonces.get(wallet);
      if (!pending) {
        pending = new Set();
        this.pendingNonces.set(wallet, pending);
      }

      // Find next available nonce (no gaps)
      let nextNonce = onChainNonce;
      while (pending.has(nextNonce)) {
        nextNonce++;
      }

      // Reserve this nonce
      pending.add(nextNonce);

      // Track for stuck detection
      this.trackNonce(wallet, nextNonce);

      this.logger.info(`[NonceManager] Reserved nonce ${nextNonce} for ${wallet.slice(0, 10)}...`);

      return nextNonce;
    });
  }

  /**
   * Confirm nonce was used successfully
   *
   * @param {string} walletAddress - Wallet address
   * @param {number} nonce - Confirmed nonce
   * @param {string} txHash - Transaction hash
   */
  async confirmNonce(walletAddress, nonce, txHash) {
    const wallet = walletAddress.toLowerCase();

    return this.lock.acquire(wallet, async () => {
      const pending = this.pendingNonces.get(wallet);
      if (pending) {
        pending.delete(nonce);
      }

      // Update confirmed nonce
      const current = this.confirmedNonce.get(wallet) || -1;
      if (nonce > current) {
        this.confirmedNonce.set(wallet, nonce);
      }

      // Remove from stuck tracking
      this.stuckTransactions.delete(`${wallet}:${nonce}`);

      this.logger.info(`[NonceManager] Confirmed nonce ${nonce} for ${wallet.slice(0, 10)}... (tx: ${txHash?.slice(0, 10)}...)`);
    });
  }

  /**
   * Release nonce on transaction failure (before submission)
   *
   * @param {string} walletAddress - Wallet address
   * @param {number} nonce - Nonce to release
   */
  async releaseNonce(walletAddress, nonce) {
    const wallet = walletAddress.toLowerCase();

    return this.lock.acquire(wallet, async () => {
      const pending = this.pendingNonces.get(wallet);
      if (pending) {
        pending.delete(nonce);
        this.logger.info(`[NonceManager] Released nonce ${nonce} for ${wallet.slice(0, 10)}...`);
      }

      this.stuckTransactions.delete(`${wallet}:${nonce}`);
    });
  }

  /**
   * Track nonce for stuck detection
   *
   * @param {string} wallet - Wallet address (lowercase)
   * @param {number} nonce - Nonce to track
   */
  trackNonce(wallet, nonce) {
    const key = `${wallet}:${nonce}`;
    this.stuckTransactions.set(key, {
      wallet,
      nonce,
      reservedAt: Date.now(),
      txHash: null,
      submittedAt: null,
    });
  }

  /**
   * Update tracking with transaction hash after submission
   *
   * @param {string} walletAddress - Wallet address
   * @param {number} nonce - Transaction nonce
   * @param {string} txHash - Transaction hash
   */
  updateNonceTransaction(walletAddress, nonce, txHash) {
    const key = `${walletAddress.toLowerCase()}:${nonce}`;
    const tracking = this.stuckTransactions.get(key);
    if (tracking) {
      tracking.txHash = txHash;
      tracking.submittedAt = Date.now();
    }
  }

  /**
   * Find stuck transactions (reserved but not confirmed after timeout)
   *
   * @returns {Promise<Array>} Array of stuck transaction info
   */
  async findStuckTransactions() {
    const now = Date.now();
    const stuck = [];

    for (const [key, info] of this.stuckTransactions) {
      const age = now - info.reservedAt;
      if (age > this.stuckTimeout) {
        stuck.push({
          ...info,
          age,
          key,
          ageMinutes: Math.floor(age / 60000),
        });
      }
    }

    // Sort by nonce (must cancel in order)
    stuck.sort((a, b) => {
      if (a.wallet !== b.wallet) return a.wallet.localeCompare(b.wallet);
      return a.nonce - b.nonce;
    });

    return stuck;
  }

  /**
   * Cancel stuck transaction by sending replacement
   *
   * @param {string} walletAddress - Wallet address
   * @param {number} stuckNonce - Stuck nonce to cancel
   * @param {ethers.Signer} signer - Signer instance
   * @param {ethers.providers.Provider} provider - Provider instance
   * @returns {Promise<{success: boolean, cancelTxHash: string}>}
   */
  async cancelStuckTransaction(walletAddress, stuckNonce, signer, provider) {
    const wallet = walletAddress.toLowerCase();

    this.logger.warn(`[NonceManager] Cancelling stuck transaction: wallet=${wallet.slice(0, 10)}..., nonce=${stuckNonce}`);

    // Get current gas price and increase by 30%
    const gasPrice = await provider.getGasPrice();
    const replacementGasPrice = gasPrice.mul(130).div(100);

    // Send 0-value transaction to self with same nonce
    const cancelTx = await signer.sendTransaction({
      to: walletAddress,
      value: 0,
      nonce: stuckNonce,
      gasPrice: replacementGasPrice,
      gasLimit: 21000, // Minimum for simple transfer
    });

    this.logger.info(`[NonceManager] Cancellation tx sent: ${cancelTx.hash}`);

    // Wait for confirmation
    const receipt = await cancelTx.wait();

    // Cleanup
    await this.confirmNonce(wallet, stuckNonce, cancelTx.hash);

    return {
      success: true,
      cancelTxHash: cancelTx.hash,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  /**
   * Speed up transaction with higher gas
   *
   * @param {object} originalTx - Original transaction
   * @param {ethers.Signer} signer - Signer instance
   * @param {ethers.providers.Provider} provider - Provider instance
   * @param {number} multiplier - Gas price multiplier
   * @returns {Promise<ethers.providers.TransactionResponse>}
   */
  async speedUpTransaction(originalTx, signer, provider, multiplier = 1.3) {
    const gasPrice = await provider.getGasPrice();
    const newGasPrice = gasPrice.mul(Math.floor(multiplier * 100)).div(100);

    // Resend with same nonce but higher gas
    const speedUpTx = await signer.sendTransaction({
      to: originalTx.to,
      value: originalTx.value,
      data: originalTx.data,
      nonce: originalTx.nonce,
      gasPrice: newGasPrice,
      gasLimit: originalTx.gasLimit,
    });

    this.logger.info(`[NonceManager] Speed-up tx sent: ${speedUpTx.hash} (was ${originalTx.hash})`);

    // Update tracking
    const wallet = (await signer.getAddress()).toLowerCase();
    const key = `${wallet}:${originalTx.nonce}`;
    const tracking = this.stuckTransactions.get(key);
    if (tracking) {
      tracking.txHash = speedUpTx.hash;
      tracking.speedUpOf = originalTx.hash;
    }

    return speedUpTx;
  }

  /**
   * Cleanup stuck transactions automatically
   *
   * @param {ethers.Signer} signer - Signer instance
   * @param {ethers.providers.Provider} provider - Provider instance
   * @returns {Promise<{cleaned: number, total: number, errors: string[]}>}
   */
  async cleanup(signer, provider) {
    const stuck = await this.findStuckTransactions();
    const errors = [];

    if (stuck.length === 0) {
      return { cleaned: 0, total: 0, errors: [] };
    }

    this.logger.warn(`[NonceManager] Found ${stuck.length} stuck transactions`);

    // Group by wallet and sort by nonce
    const byWallet = new Map();
    for (const tx of stuck) {
      if (!byWallet.has(tx.wallet)) {
        byWallet.set(tx.wallet, []);
      }
      byWallet.get(tx.wallet).push(tx);
    }

    let cleaned = 0;
    const signerAddress = (await signer.getAddress()).toLowerCase();

    for (const [wallet, txs] of byWallet) {
      // Can only cleanup our own wallet
      if (wallet !== signerAddress) {
        this.logger.warn(`[NonceManager] Cannot cleanup ${wallet} - not signer wallet`);
        continue;
      }

      // Sort by nonce and cancel in order
      txs.sort((a, b) => a.nonce - b.nonce);

      for (const stuckTx of txs) {
        try {
          await this.cancelStuckTransaction(wallet, stuckTx.nonce, signer, provider);
          cleaned++;
        } catch (error) {
          errors.push(`Nonce ${stuckTx.nonce}: ${error.message}`);
          this.logger.error(`[NonceManager] Failed to cancel stuck tx:`, error.message);
          break; // Stop - subsequent nonces depend on this one
        }
      }
    }

    return { cleaned, total: stuck.length, errors };
  }

  /**
   * Get pending nonces for a wallet
   *
   * @param {string} walletAddress - Wallet address
   * @returns {number[]} Array of pending nonces
   */
  getPendingNonces(walletAddress) {
    const pending = this.pendingNonces.get(walletAddress.toLowerCase());
    return pending ? Array.from(pending).sort((a, b) => a - b) : [];
  }

  /**
   * Get last confirmed nonce for a wallet
   *
   * @param {string} walletAddress - Wallet address
   * @returns {number|null}
   */
  getLastConfirmedNonce(walletAddress) {
    return this.confirmedNonce.get(walletAddress.toLowerCase()) ?? null;
  }

  /**
   * Get status of all tracked transactions
   *
   * @returns {object} Status summary
   */
  getStatus() {
    const status = {
      pendingByWallet: {},
      stuckTransactions: [],
      totalPending: 0,
      totalStuck: 0,
    };

    for (const [wallet, pending] of this.pendingNonces) {
      const pendingArray = Array.from(pending);
      status.pendingByWallet[wallet] = pendingArray;
      status.totalPending += pendingArray.length;
    }

    const now = Date.now();
    for (const [key, info] of this.stuckTransactions) {
      const age = now - info.reservedAt;
      if (age > this.stuckTimeout) {
        status.stuckTransactions.push({
          wallet: info.wallet.slice(0, 10) + '...',
          nonce: info.nonce,
          ageMinutes: Math.floor(age / 60000),
          txHash: info.txHash?.slice(0, 10),
        });
        status.totalStuck++;
      }
    }

    return status;
  }

  /**
   * Clear all tracking for a wallet (use with caution)
   *
   * @param {string} walletAddress - Wallet address
   */
  clearWallet(walletAddress) {
    const wallet = walletAddress.toLowerCase();

    this.pendingNonces.delete(wallet);
    this.confirmedNonce.delete(wallet);

    // Clear stuck transactions for this wallet
    for (const key of this.stuckTransactions.keys()) {
      if (key.startsWith(wallet + ':')) {
        this.stuckTransactions.delete(key);
      }
    }

    this.logger.info(`[NonceManager] Cleared all tracking for ${wallet.slice(0, 10)}...`);
  }
}

module.exports = NonceManager;
