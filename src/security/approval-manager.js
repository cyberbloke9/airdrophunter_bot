/**
 * Approval Manager - Token Approval Tracking & Auto-Revoke
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: Infinite approvals persist forever. Protocol compromise = token drain.
 * $71M lost to drainer exploits in 2024.
 *
 * STATE-OF-THE-ART:
 * - Exact amount approvals only (never unlimited by default)
 * - Automatic revocation after swap completion
 * - Full approval registry for auditing
 * - Risk assessment for existing approvals
 *
 * @module security/approval-manager
 */

const { ethers } = require('ethers');

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

class ApprovalManager {
  constructor(config = {}) {
    this.config = {
      maxApproval: config.maxApproval ?? 'exact', // 'exact', '2x', 'unlimited'
      autoRevoke: config.autoRevoke ?? true,
      revokeDelay: config.revokeDelay ?? 0, // milliseconds (0 = immediate)
      alertOnInfinite: config.alertOnInfinite ?? true,
      maxApprovalAge: config.maxApprovalAge ?? 30 * 24 * 60 * 60 * 1000, // 30 days
    };

    // Approval registry: wallet -> Map<`${token}:${spender}`, approvalInfo>
    this.registry = new Map();

    // Pending revocations (for delayed revoke)
    this.pendingRevokes = [];

    // Logger
    this.logger = config.logger || console;
  }

  /**
   * Safe approve with tracking and policy enforcement
   *
   * @param {string} tokenAddress - Token contract address
   * @param {string} spenderAddress - Spender to approve
   * @param {ethers.BigNumber} amount - Amount to approve
   * @param {ethers.Signer} signer - Signer instance
   * @param {object} options - Additional options
   * @returns {Promise<{success: boolean, txHash?: string, skipped?: boolean, approvalAmount?: ethers.BigNumber}>}
   */
  async safeApprove(tokenAddress, spenderAddress, amount, signer, options = {}) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const owner = await signer.getAddress();

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(owner, spenderAddress);

    // If already sufficient, skip
    if (currentAllowance.gte(amount)) {
      this.logger.info(
        `[ApprovalManager] Existing approval sufficient: ${currentAllowance.toString()} >= ${amount.toString()}`
      );
      return { success: true, skipped: true, existingAllowance: currentAllowance };
    }

    // Calculate approval amount based on policy
    let approvalAmount;
    const policyOverride = options.policy || this.config.maxApproval;

    switch (policyOverride) {
      case 'exact':
        approvalAmount = amount;
        break;
      case '2x':
        approvalAmount = amount.mul(2);
        break;
      case 'unlimited':
        // ALERT: Unlimited approval requested
        if (this.config.alertOnInfinite) {
          this.logger.warn(
            `[ApprovalManager] WARNING: Unlimited approval for ${tokenAddress} to ${spenderAddress}`
          );
        }
        approvalAmount = ethers.constants.MaxUint256;
        break;
      default:
        approvalAmount = amount;
    }

    // Execute approval
    this.logger.info(
      `[ApprovalManager] Approving ${approvalAmount.toString()} of ${tokenAddress.slice(0, 10)}... to ${spenderAddress.slice(0, 10)}...`
    );

    const tx = await tokenContract.approve(spenderAddress, approvalAmount);
    const receipt = await tx.wait();

    // Track in registry
    await this.trackApproval(owner, tokenAddress, spenderAddress, approvalAmount, tx.hash);

    return {
      success: true,
      txHash: tx.hash,
      approvalAmount,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  /**
   * Track approval in registry
   *
   * @param {string} owner - Token owner address
   * @param {string} token - Token address
   * @param {string} spender - Spender address
   * @param {ethers.BigNumber} amount - Approved amount
   * @param {string} txHash - Transaction hash
   */
  async trackApproval(owner, token, spender, amount, txHash) {
    const key = owner.toLowerCase();

    if (!this.registry.has(key)) {
      this.registry.set(key, new Map());
    }

    const ownerApprovals = this.registry.get(key);
    const tokenKey = `${token.toLowerCase()}:${spender.toLowerCase()}`;

    ownerApprovals.set(tokenKey, {
      token: token.toLowerCase(),
      spender: spender.toLowerCase(),
      amount: amount.toString(),
      amountBN: amount,
      txHash,
      approvedAt: Date.now(),
      isUnlimited: amount.eq(ethers.constants.MaxUint256),
    });

    this.logger.info(`[ApprovalManager] Tracked approval: ${tokenKey}`);
  }

  /**
   * Revoke approval (set to 0)
   *
   * @param {string} tokenAddress - Token address
   * @param {string} spenderAddress - Spender address
   * @param {ethers.Signer} signer - Signer instance
   * @returns {Promise<{success: boolean, txHash: string}>}
   */
  async revokeApproval(tokenAddress, spenderAddress, signer) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const owner = await signer.getAddress();

    this.logger.info(
      `[ApprovalManager] Revoking approval for ${tokenAddress.slice(0, 10)}... to ${spenderAddress.slice(0, 10)}...`
    );

    // Set approval to 0
    const tx = await tokenContract.approve(spenderAddress, 0);
    const receipt = await tx.wait();

    // Remove from registry
    this.removeFromRegistry(owner, tokenAddress, spenderAddress);

    return {
      success: true,
      txHash: tx.hash,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  /**
   * Schedule revocation after transaction (for auto-revoke feature)
   *
   * @param {string} tokenAddress - Token address
   * @param {string} spenderAddress - Spender address
   * @param {ethers.Signer} signer - Signer instance
   */
  scheduleRevoke(tokenAddress, spenderAddress, signer) {
    if (!this.config.autoRevoke) {
      return;
    }

    const revoke = async () => {
      try {
        await this.revokeApproval(tokenAddress, spenderAddress, signer);
        this.logger.info(`[ApprovalManager] Auto-revoked ${tokenAddress.slice(0, 10)}...`);
      } catch (error) {
        this.logger.error(`[ApprovalManager] Auto-revoke failed:`, error.message);
      }
    };

    if (this.config.revokeDelay === 0) {
      // Immediate revoke (but non-blocking)
      setImmediate(revoke);
    } else {
      // Delayed revoke
      setTimeout(revoke, this.config.revokeDelay);
    }
  }

  /**
   * Get all approvals for a wallet
   *
   * @param {string} walletAddress - Wallet address
   * @returns {Array} Array of approval info
   */
  getAllApprovals(walletAddress) {
    const key = walletAddress.toLowerCase();
    const ownerApprovals = this.registry.get(key);

    if (!ownerApprovals) {
      return [];
    }

    return Array.from(ownerApprovals.values()).map(approval => ({
      ...approval,
      age: Date.now() - approval.approvedAt,
      ageDays: Math.floor((Date.now() - approval.approvedAt) / (24 * 60 * 60 * 1000)),
    }));
  }

  /**
   * Find risky approvals (unlimited, old, etc.)
   *
   * @param {string} walletAddress - Wallet address
   * @returns {Array} Array of risky approvals with risk info
   */
  getRiskyApprovals(walletAddress) {
    const approvals = this.getAllApprovals(walletAddress);
    const risky = [];

    for (const approval of approvals) {
      const risks = [];

      // Unlimited approval
      if (approval.isUnlimited) {
        risks.push({ type: 'unlimited', severity: 'high' });
      }

      // Old approval (> 30 days)
      if (approval.age > this.config.maxApprovalAge) {
        risks.push({ type: 'old', severity: 'medium', ageDays: approval.ageDays });
      }

      // Large approval (> 1M tokens, simplified check)
      try {
        const amountBN = ethers.BigNumber.from(approval.amount);
        if (amountBN.gt(ethers.utils.parseUnits('1000000', 18))) {
          risks.push({ type: 'large', severity: 'medium' });
        }
      } catch {
        // Ignore parsing errors
      }

      if (risks.length > 0) {
        risky.push({
          ...approval,
          risks,
          overallRisk: risks.some(r => r.severity === 'high') ? 'high' : 'medium',
        });
      }
    }

    return risky;
  }

  /**
   * Emergency: Revoke all approvals for a wallet
   *
   * @param {string} walletAddress - Wallet address
   * @param {ethers.Signer} signer - Signer instance
   * @returns {Promise<{total: number, revoked: number, failed: number, details: Array}>}
   */
  async revokeAll(walletAddress, signer) {
    const approvals = this.getAllApprovals(walletAddress);
    const results = [];

    this.logger.warn(`[ApprovalManager] Revoking ALL ${approvals.length} approvals for ${walletAddress.slice(0, 10)}...`);

    for (const approval of approvals) {
      try {
        const result = await this.revokeApproval(approval.token, approval.spender, signer);
        results.push({ ...approval, revoked: true, ...result });
      } catch (error) {
        results.push({ ...approval, revoked: false, error: error.message });
      }
    }

    return {
      total: approvals.length,
      revoked: results.filter(r => r.revoked).length,
      failed: results.filter(r => !r.revoked).length,
      details: results,
    };
  }

  /**
   * Scan on-chain for active approvals (comprehensive check)
   *
   * @param {string} walletAddress - Wallet address
   * @param {string[]} tokenAddresses - Token addresses to check
   * @param {string[]} spenderAddresses - Spender addresses to check
   * @param {ethers.providers.Provider} provider - Provider instance
   * @returns {Promise<Array>} Array of active approvals found on-chain
   */
  async scanOnChainApprovals(walletAddress, tokenAddresses, spenderAddresses, provider) {
    const approvals = [];

    for (const token of tokenAddresses) {
      const tokenContract = new ethers.Contract(token, ERC20_ABI, provider);

      let symbol = 'UNKNOWN';
      try {
        symbol = await tokenContract.symbol();
      } catch {
        // Ignore
      }

      for (const spender of spenderAddresses) {
        try {
          const allowance = await tokenContract.allowance(walletAddress, spender);

          if (allowance.gt(0)) {
            approvals.push({
              token,
              tokenSymbol: symbol,
              spender,
              allowance: allowance.toString(),
              isUnlimited: allowance.eq(ethers.constants.MaxUint256),
            });
          }
        } catch (error) {
          this.logger.warn(`[ApprovalManager] Failed to check ${token} -> ${spender}: ${error.message}`);
        }
      }
    }

    return approvals;
  }

  /**
   * Remove approval from registry
   *
   * @param {string} owner - Owner address
   * @param {string} token - Token address
   * @param {string} spender - Spender address
   */
  removeFromRegistry(owner, token, spender) {
    const key = owner.toLowerCase();
    const ownerApprovals = this.registry.get(key);

    if (ownerApprovals) {
      const tokenKey = `${token.toLowerCase()}:${spender.toLowerCase()}`;
      ownerApprovals.delete(tokenKey);
    }
  }

  /**
   * Check if an approval exists and is valid
   *
   * @param {string} walletAddress - Wallet address
   * @param {string} tokenAddress - Token address
   * @param {string} spenderAddress - Spender address
   * @param {ethers.BigNumber} requiredAmount - Required allowance
   * @param {ethers.providers.Provider} provider - Provider instance
   * @returns {Promise<{sufficient: boolean, currentAllowance: ethers.BigNumber}>}
   */
  async checkApproval(walletAddress, tokenAddress, spenderAddress, requiredAmount, provider) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const currentAllowance = await tokenContract.allowance(walletAddress, spenderAddress);

    return {
      sufficient: currentAllowance.gte(requiredAmount),
      currentAllowance,
      deficit: currentAllowance.lt(requiredAmount)
        ? requiredAmount.sub(currentAllowance)
        : ethers.BigNumber.from(0),
    };
  }

  /**
   * Get approval registry statistics
   *
   * @returns {object} Registry statistics
   */
  getStats() {
    let totalApprovals = 0;
    let unlimitedCount = 0;
    let oldCount = 0;
    const walletCount = this.registry.size;

    for (const ownerApprovals of this.registry.values()) {
      for (const approval of ownerApprovals.values()) {
        totalApprovals++;
        if (approval.isUnlimited) unlimitedCount++;
        if (Date.now() - approval.approvedAt > this.config.maxApprovalAge) oldCount++;
      }
    }

    return {
      totalApprovals,
      unlimitedCount,
      oldCount,
      walletCount,
      avgApprovalsPerWallet: walletCount > 0 ? (totalApprovals / walletCount).toFixed(1) : 0,
    };
  }
}

module.exports = ApprovalManager;
