'use strict';

const { ethers } = require('ethers');

/**
 * SandwichDetector - Post-execution sandwich attack detection
 *
 * WHY: Post-execution analysis identifies if transactions were sandwiched,
 * enabling learning and adaptation of protection strategies. MEV extraction
 * analysis helps optimize protection parameters over time.
 *
 * DETECTION ALGORITHM:
 * 1. Get block transactions
 * 2. Identify candidate sandwiches (same token pair, ±5 tx index)
 * 3. Validate sandwich pattern (frontrun buy, target swap, backrun sell)
 * 4. Calculate extraction (user price impact vs expected)
 * 5. Record & alert
 *
 * @class SandwichDetector
 */
class SandwichDetector {
  /**
   * Create a SandwichDetector instance
   * @param {Object} config - Configuration options
   * @param {Object} [config.logger] - Logger instance
   * @param {Object} [config.alertSystem] - Alert system for notifications
   * @param {number} [config.searchRadius] - Tx index search radius (default: 5)
   * @param {number} [config.minExtractionAlert] - Min extraction to alert (default: 0.5%)
   */
  constructor(config = {}) {
    this.logger = config.logger || console;
    this.alertSystem = config.alertSystem || null;
    this.searchRadius = config.searchRadius || 5;
    this.minExtractionAlert = config.minExtractionAlert || 0.005; // 0.5%

    // Known attacker addresses (discovered through analysis)
    this.knownAttackers = new Set();

    // DEX router addresses to identify swaps
    this.dexRouters = new Set([
      // Uniswap
      '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // V2 Router
      '0xE592427A0AEce92De3Edee1F18E0157C05861564', // V3 Router
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Universal Router
      // Sushiswap
      '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
      // 1inch
      '0x1111111254EEB25477B68fb85Ed929f73A960582',
      // Paraswap
      '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57',
    ].map(a => a.toLowerCase()));

    // Swap event signatures
    this.swapEventSignatures = {
      // Uniswap V2: Swap(address,uint256,uint256,uint256,uint256,address)
      uniswapV2: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
      // Uniswap V3: Swap(address,address,int256,int256,uint160,uint128,int24)
      uniswapV3: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
    };

    // Statistics
    this.stats = {
      totalAnalyzed: 0,
      sandwichesDetected: 0,
      totalExtracted: ethers.BigNumber.from(0),
      attackerAddresses: new Set(),
    };

    // Recent sandwich events cache
    this.recentSandwiches = [];
    this.maxCacheSize = 100;
  }

  /**
   * Analyze a transaction for sandwich attacks
   * @param {string} txHash - Transaction hash to analyze
   * @param {Object} provider - Ethers provider
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeTransaction(txHash, provider) {
    this.stats.totalAnalyzed++;

    try {
      // Get transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return { wasSandwiched: false, error: 'Transaction not found' };
      }

      // Get block transactions
      const block = await provider.getBlockWithTransactions(receipt.blockNumber);
      if (!block || !block.transactions) {
        return { wasSandwiched: false, error: 'Block not found' };
      }

      // Find our transaction index
      const targetIndex = block.transactions.findIndex(
        tx => tx.hash.toLowerCase() === txHash.toLowerCase()
      );

      if (targetIndex === -1) {
        return { wasSandwiched: false, error: 'Transaction not in block' };
      }

      // Parse swap events from target transaction
      const targetSwapInfo = this._parseSwapFromReceipt(receipt);
      if (!targetSwapInfo) {
        return { wasSandwiched: false, reason: 'Not a swap transaction' };
      }

      // Search for sandwich pattern
      const sandwichResult = await this._detectSandwichPattern(
        block.transactions,
        targetIndex,
        targetSwapInfo,
        provider
      );

      if (sandwichResult.detected) {
        this.stats.sandwichesDetected++;

        // Add to cache
        this._addToCache({
          txHash,
          blockNumber: receipt.blockNumber,
          ...sandwichResult,
          timestamp: Date.now(),
        });

        // Track attacker
        if (sandwichResult.attackerAddress) {
          this.stats.attackerAddresses.add(sandwichResult.attackerAddress);
          this.knownAttackers.add(sandwichResult.attackerAddress.toLowerCase());
        }

        // Calculate extraction
        if (sandwichResult.extractedValue) {
          this.stats.totalExtracted = this.stats.totalExtracted.add(
            ethers.BigNumber.from(sandwichResult.extractedValue)
          );
        }

        // Send alert if significant
        if (
          this.alertSystem &&
          sandwichResult.extractionPercent >= this.minExtractionAlert
        ) {
          await this.alertSystem.alertSandwichAttack(
            txHash,
            sandwichResult.extractionPercent,
            sandwichResult
          );
        }

        return {
          wasSandwiched: true,
          details: sandwichResult,
        };
      }

      return { wasSandwiched: false };

    } catch (error) {
      this.logger.error?.('Sandwich analysis failed', { txHash, error: error.message });
      return { wasSandwiched: false, error: error.message };
    }
  }

  /**
   * Get all sandwiches in a block
   * @param {number} blockNumber - Block number
   * @param {Object} provider - Ethers provider
   * @returns {Promise<Object[]>} Array of sandwich events
   */
  async getBlockSandwiches(blockNumber, provider) {
    try {
      const block = await provider.getBlockWithTransactions(blockNumber);
      if (!block || !block.transactions) {
        return [];
      }

      const sandwiches = [];
      const analyzedTxs = new Set();

      for (let i = 0; i < block.transactions.length; i++) {
        const tx = block.transactions[i];

        // Skip if already analyzed as part of another sandwich
        if (analyzedTxs.has(tx.hash)) continue;

        // Check if this looks like a swap
        if (!this._isSwapTransaction(tx)) continue;

        // Get receipt and analyze
        const receipt = await provider.getTransactionReceipt(tx.hash);
        if (!receipt) continue;

        const swapInfo = this._parseSwapFromReceipt(receipt);
        if (!swapInfo) continue;

        // Look for sandwich
        const result = await this._detectSandwichPattern(
          block.transactions,
          i,
          swapInfo,
          provider
        );

        if (result.detected) {
          // Mark related txs as analyzed
          if (result.frontrunTx) analyzedTxs.add(result.frontrunTx);
          if (result.backrunTx) analyzedTxs.add(result.backrunTx);

          sandwiches.push({
            victimTx: tx.hash,
            blockNumber,
            ...result,
          });
        }
      }

      return sandwiches;

    } catch (error) {
      this.logger.error?.('Block sandwich analysis failed', { blockNumber, error: error.message });
      return [];
    }
  }

  /**
   * Get extraction statistics for a wallet
   * @param {string} wallet - Wallet address
   * @param {number} days - Number of days to look back
   * @returns {Object} Extraction statistics
   */
  getExtractionStats(wallet, days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const walletLower = wallet.toLowerCase();

    const relevantSandwiches = this.recentSandwiches.filter(
      s => s.victimWallet?.toLowerCase() === walletLower && s.timestamp >= cutoff
    );

    if (relevantSandwiches.length === 0) {
      return {
        totalExtracted: '0',
        avgPerTx: '0',
        count: 0,
        transactions: [],
      };
    }

    const totalExtracted = relevantSandwiches.reduce(
      (sum, s) => sum.add(ethers.BigNumber.from(s.extractedValue || 0)),
      ethers.BigNumber.from(0)
    );

    return {
      totalExtracted: totalExtracted.toString(),
      avgPerTx: totalExtracted.div(relevantSandwiches.length).toString(),
      count: relevantSandwiches.length,
      transactions: relevantSandwiches.map(s => s.txHash),
    };
  }

  /**
   * Check if address is a known attacker
   * @param {string} address - Address to check
   * @returns {boolean} True if known attacker
   */
  isKnownAttacker(address) {
    return this.knownAttackers.has(address.toLowerCase());
  }

  /**
   * Add addresses to known attackers list
   * @param {string[]} addresses - Attacker addresses
   */
  addKnownAttackers(addresses) {
    for (const addr of addresses) {
      this.knownAttackers.add(addr.toLowerCase());
    }
  }

  /**
   * Get detection statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      totalAnalyzed: this.stats.totalAnalyzed,
      sandwichesDetected: this.stats.sandwichesDetected,
      detectionRate: this.stats.totalAnalyzed > 0
        ? this.stats.sandwichesDetected / this.stats.totalAnalyzed
        : 0,
      totalExtracted: this.stats.totalExtracted.toString(),
      uniqueAttackers: this.stats.attackerAddresses.size,
      knownAttackers: this.knownAttackers.size,
      recentSandwiches: this.recentSandwiches.slice(-10),
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      totalAnalyzed: 0,
      sandwichesDetected: 0,
      totalExtracted: ethers.BigNumber.from(0),
      attackerAddresses: new Set(),
    };
    this.recentSandwiches = [];
  }

  // ============ Private Methods ============

  /**
   * Parse swap info from transaction receipt
   * @private
   */
  _parseSwapFromReceipt(receipt) {
    // Look for swap events
    for (const log of receipt.logs) {
      // Check for Uniswap V2 Swap event
      if (log.topics[0] === this.swapEventSignatures.uniswapV2) {
        try {
          const decoded = ethers.utils.defaultAbiCoder.decode(
            ['uint256', 'uint256', 'uint256', 'uint256'],
            log.data
          );

          return {
            type: 'UniswapV2',
            pool: log.address,
            amount0In: decoded[0],
            amount1In: decoded[1],
            amount0Out: decoded[2],
            amount1Out: decoded[3],
            sender: '0x' + log.topics[1].slice(26),
            to: '0x' + log.topics[2].slice(26),
          };
        } catch {
          continue;
        }
      }

      // Check for Uniswap V3 Swap event
      if (log.topics[0] === this.swapEventSignatures.uniswapV3) {
        try {
          const decoded = ethers.utils.defaultAbiCoder.decode(
            ['int256', 'int256', 'uint160', 'uint128', 'int24'],
            log.data
          );

          return {
            type: 'UniswapV3',
            pool: log.address,
            amount0: decoded[0],
            amount1: decoded[1],
            sqrtPriceX96: decoded[2],
            liquidity: decoded[3],
            tick: decoded[4],
            sender: '0x' + log.topics[1].slice(26),
            recipient: '0x' + log.topics[2].slice(26),
          };
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Detect sandwich pattern in block transactions
   * @private
   */
  async _detectSandwichPattern(transactions, targetIndex, targetSwapInfo, provider) {
    const targetTx = transactions[targetIndex];

    // Search window
    const startIdx = Math.max(0, targetIndex - this.searchRadius);
    const endIdx = Math.min(transactions.length - 1, targetIndex + this.searchRadius);

    // Look for frontrun (before target)
    let frontrunCandidate = null;
    for (let i = startIdx; i < targetIndex; i++) {
      const tx = transactions[i];
      if (await this._isSamePoolSwap(tx, targetSwapInfo, provider)) {
        frontrunCandidate = { tx, index: i };
        break; // First match before target
      }
    }

    if (!frontrunCandidate) {
      return { detected: false };
    }

    // Look for backrun (after target)
    let backrunCandidate = null;
    for (let i = targetIndex + 1; i <= endIdx; i++) {
      const tx = transactions[i];
      if (await this._isSamePoolSwap(tx, targetSwapInfo, provider)) {
        // Check if same sender as frontrun (typical sandwich pattern)
        if (tx.from.toLowerCase() === frontrunCandidate.tx.from.toLowerCase()) {
          backrunCandidate = { tx, index: i };
          break;
        }
      }
    }

    if (!backrunCandidate) {
      return { detected: false };
    }

    // Validate sandwich direction
    // Frontrun should buy what target is buying (pushing price up)
    // Backrun should sell what target bought (taking profit)
    const isValidSandwich = await this._validateSandwichDirection(
      frontrunCandidate.tx,
      targetTx,
      backrunCandidate.tx,
      targetSwapInfo,
      provider
    );

    if (!isValidSandwich) {
      return { detected: false };
    }

    // Calculate extraction
    const extraction = await this._calculateExtraction(
      frontrunCandidate.tx,
      targetTx,
      backrunCandidate.tx,
      targetSwapInfo,
      provider
    );

    return {
      detected: true,
      frontrunTx: frontrunCandidate.tx.hash,
      frontrunIndex: frontrunCandidate.index,
      backrunTx: backrunCandidate.tx.hash,
      backrunIndex: backrunCandidate.index,
      attackerAddress: frontrunCandidate.tx.from,
      victimWallet: targetTx.from,
      pool: targetSwapInfo.pool,
      ...extraction,
    };
  }

  /**
   * Check if transaction swaps on the same pool
   * @private
   */
  async _isSamePoolSwap(tx, targetSwapInfo, provider) {
    if (!this._isSwapTransaction(tx)) return false;

    try {
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (!receipt) return false;

      const swapInfo = this._parseSwapFromReceipt(receipt);
      if (!swapInfo) return false;

      // Check if same pool
      return swapInfo.pool.toLowerCase() === targetSwapInfo.pool.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * Check if transaction looks like a swap
   * @private
   */
  _isSwapTransaction(tx) {
    if (!tx.to) return false;

    // Check if to a known DEX router
    if (this.dexRouters.has(tx.to.toLowerCase())) return true;

    // Check function selector
    if (tx.data && tx.data.length >= 10) {
      const selector = tx.data.slice(0, 10).toLowerCase();
      const swapSelectors = [
        '0x38ed1739', // swapExactTokensForTokens
        '0x7ff36ab5', // swapExactETHForTokens
        '0x18cbafe5', // swapExactTokensForETH
        '0x414bf389', // exactInputSingle
        '0xc04b8d59', // exactInput
      ];
      return swapSelectors.includes(selector);
    }

    return false;
  }

  /**
   * Validate sandwich direction
   * @private
   */
  async _validateSandwichDirection(frontrunTx, targetTx, backrunTx, targetSwapInfo, provider) {
    try {
      // Get swap info for all three
      const frontrunReceipt = await provider.getTransactionReceipt(frontrunTx.hash);
      const backrunReceipt = await provider.getTransactionReceipt(backrunTx.hash);

      const frontrunSwap = this._parseSwapFromReceipt(frontrunReceipt);
      const backrunSwap = this._parseSwapFromReceipt(backrunReceipt);

      if (!frontrunSwap || !backrunSwap) return false;

      // For V2: Check that frontrun bought what target bought, backrun sold it
      if (targetSwapInfo.type === 'UniswapV2') {
        // If target is buying token0 (amount0Out > 0), frontrun should also buy token0
        const targetBuysToken0 = targetSwapInfo.amount0Out.gt(0);
        const frontrunBuysToken0 = frontrunSwap.amount0Out.gt(0);
        const backrunSellsToken0 = backrunSwap.amount0In.gt(0);

        // Sandwich: frontrun buys same token, backrun sells same token
        return (targetBuysToken0 === frontrunBuysToken0) && (targetBuysToken0 === backrunSellsToken0);
      }

      // For V3: Check that amounts have opposite signs
      if (targetSwapInfo.type === 'UniswapV3') {
        const targetDirection = targetSwapInfo.amount0.lt(0);
        const frontrunDirection = frontrunSwap.amount0.lt(0);
        const backrunDirection = backrunSwap.amount0.lt(0);

        // Frontrun same direction as target, backrun opposite
        return (targetDirection === frontrunDirection) && (targetDirection !== backrunDirection);
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Calculate MEV extraction
   * @private
   */
  async _calculateExtraction(frontrunTx, targetTx, backrunTx, targetSwapInfo, provider) {
    try {
      const frontrunReceipt = await provider.getTransactionReceipt(frontrunTx.hash);
      const backrunReceipt = await provider.getTransactionReceipt(backrunTx.hash);

      const frontrunSwap = this._parseSwapFromReceipt(frontrunReceipt);
      const backrunSwap = this._parseSwapFromReceipt(backrunReceipt);

      if (!frontrunSwap || !backrunSwap) {
        return {
          extractedValue: '0',
          extractionPercent: 0,
          priceImpact: 0,
        };
      }

      // Calculate attacker profit (backrun output - frontrun input - gas)
      let attackerProfit = ethers.BigNumber.from(0);
      let victimLoss = ethers.BigNumber.from(0);

      if (targetSwapInfo.type === 'UniswapV2') {
        // Simple estimation based on amounts
        const targetBuysToken0 = targetSwapInfo.amount0Out.gt(0);

        if (targetBuysToken0) {
          // Attacker bought token0 then sold it
          const frontrunCost = frontrunSwap.amount1In;
          const backrunRevenue = backrunSwap.amount1Out;
          attackerProfit = backrunRevenue.sub(frontrunCost);
        } else {
          const frontrunCost = frontrunSwap.amount0In;
          const backrunRevenue = backrunSwap.amount0Out;
          attackerProfit = backrunRevenue.sub(frontrunCost);
        }

        // Estimate victim loss as % of their trade
        const targetIn = targetSwapInfo.amount0In.gt(0)
          ? targetSwapInfo.amount0In
          : targetSwapInfo.amount1In;

        if (targetIn.gt(0)) {
          victimLoss = attackerProfit;
        }
      }

      // Subtract gas costs from attacker profit
      const frontrunGas = frontrunReceipt.gasUsed.mul(frontrunReceipt.effectiveGasPrice || frontrunTx.gasPrice || 0);
      const backrunGas = backrunReceipt.gasUsed.mul(backrunReceipt.effectiveGasPrice || backrunTx.gasPrice || 0);
      const totalGas = frontrunGas.add(backrunGas);

      const netProfit = attackerProfit.sub(totalGas);

      // Calculate extraction percentage (relative to victim's trade)
      let extractionPercent = 0;
      if (targetSwapInfo.type === 'UniswapV2') {
        const targetValue = targetSwapInfo.amount0In.gt(0)
          ? targetSwapInfo.amount0In
          : targetSwapInfo.amount1In;

        if (targetValue.gt(0) && netProfit.gt(0)) {
          extractionPercent = netProfit.mul(10000).div(targetValue).toNumber() / 10000;
        }
      }

      return {
        extractedValue: netProfit.gt(0) ? netProfit.toString() : '0',
        extractionPercent: Math.max(0, extractionPercent),
        attackerGasCost: totalGas.toString(),
        grossProfit: attackerProfit.toString(),
      };

    } catch (error) {
      this.logger.debug?.('Extraction calculation failed', { error: error.message });
      return {
        extractedValue: '0',
        extractionPercent: 0,
        error: error.message,
      };
    }
  }

  /**
   * Add sandwich to cache
   * @private
   */
  _addToCache(sandwich) {
    this.recentSandwiches.push(sandwich);
    if (this.recentSandwiches.length > this.maxCacheSize) {
      this.recentSandwiches.shift();
    }
  }
}

module.exports = { SandwichDetector };
