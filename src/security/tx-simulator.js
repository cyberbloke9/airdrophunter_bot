'use strict';

const { ethers } = require('ethers');

/**
 * TxSimulator - Pre-execution transaction simulation engine
 *
 * WHY: Pre-execution simulation prevents failed transactions and detects MEV attacks
 * before they happen. Tenderly reports 15-20% of DeFi transactions fail on first attempt.
 *
 * ARCHITECTURE:
 * 1. Build Transaction - Construct calldata, set gas estimates
 * 2. Fork State Simulation - eth_call against current state
 * 3. Output Validation - Expected vs actual token amounts
 * 4. MEV Risk Assessment - Compare simulated vs quoted output
 *
 * @class TxSimulator
 */
class TxSimulator {
  /**
   * Create a TxSimulator instance
   * @param {Object} config - Configuration options
   * @param {Object} [config.logger] - Logger instance
   * @param {number} [config.gasBuffer] - Gas buffer multiplier (default: 1.2)
   * @param {number} [config.maxGasLimit] - Maximum gas limit (default: 10M)
   * @param {string} [config.tenderlyApiKey] - Optional Tenderly API key
   * @param {string} [config.tenderlyProject] - Tenderly project slug
   * @param {string} [config.tenderlyUser] - Tenderly user/org
   */
  constructor(config = {}) {
    this.logger = config.logger || console;
    this.gasBuffer = config.gasBuffer || 1.2;
    this.maxGasLimit = config.maxGasLimit || 10_000_000;
    this.tenderlyApiKey = config.tenderlyApiKey || null;
    this.tenderlyProject = config.tenderlyProject || null;
    this.tenderlyUser = config.tenderlyUser || null;

    // Metrics tracking
    this.metrics = {
      totalSimulations: 0,
      successfulSimulations: 0,
      failedSimulations: 0,
      gasEstimateAccuracy: [], // Array of { estimated, actual, accuracy }
      averageAccuracy: 1.0,
      revertReasons: new Map(), // reason -> count
    };

    // Known error selectors (common Solidity errors)
    this.errorSelectors = {
      '0x08c379a0': 'Error(string)',
      '0x4e487b71': 'Panic(uint256)',
      '0xfb8f41b2': 'InsufficientBalance()',
      '0xe450d38c': 'InsufficientAllowance()',
      '0xf4d678b8': 'InsufficientLiquidity()',
      '0x7dc7a0d9': 'SlippageExceeded()',
      '0x3fb219cc': 'TransferFailed()',
      '0xb12d13eb': 'DeadlineExceeded()',
      '0x8baa579f': 'InvalidPath()',
      '0xbd79545f': 'InvalidSwap()',
    };

    // Common DEX function selectors for swap detection
    this.swapSelectors = new Set([
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0xfb3bdb41', // swapETHForExactTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0x4a25d94a', // swapTokensForExactETH
      '0x5c11d795', // swapExactTokensForTokensSupportingFeeOnTransferTokens
      '0xb6f9de95', // swapExactETHForTokensSupportingFeeOnTransferTokens
      '0x791ac947', // swapExactTokensForETHSupportingFeeOnTransferTokens
      '0x414bf389', // exactInputSingle (Uniswap V3)
      '0xc04b8d59', // exactInput (Uniswap V3)
      '0xdb3e2198', // exactOutputSingle (Uniswap V3)
      '0xf28c0498', // exactOutput (Uniswap V3)
      '0x472b43f3', // swapExactTokensForTokens (Uniswap V3 Router02)
      '0x42712a67', // swapTokensForExactTokens (Uniswap V3 Router02)
    ]);

    // Panic codes
    this.panicCodes = {
      0x00: 'Generic compiler panic',
      0x01: 'Assert failed',
      0x11: 'Arithmetic overflow/underflow',
      0x12: 'Division by zero',
      0x21: 'Invalid enum value',
      0x22: 'Storage corruption',
      0x31: 'Pop from empty array',
      0x32: 'Array index out of bounds',
      0x41: 'Allocate too much memory',
      0x51: 'Zero-initialized function pointer',
    };
  }

  /**
   * Simulate a single transaction
   * @param {Object} tx - Transaction object
   * @param {string} tx.to - Target address
   * @param {string} tx.data - Calldata
   * @param {string} [tx.from] - Sender address
   * @param {string} [tx.value] - ETH value in wei
   * @param {number} [tx.gasLimit] - Gas limit
   * @param {Object} provider - Ethers provider
   * @param {Object} [options] - Simulation options
   * @param {Object} [options.stateOverrides] - State overrides for simulation
   * @param {string} [options.blockTag] - Block to simulate against
   * @returns {Promise<Object>} Simulation result
   */
  async simulate(tx, provider, options = {}) {
    this.metrics.totalSimulations++;
    const startTime = Date.now();

    try {
      // Validate inputs
      this._validateTransaction(tx);

      // Prepare transaction for simulation
      const simTx = {
        to: tx.to,
        data: tx.data || '0x',
        from: tx.from || ethers.constants.AddressZero,
        value: tx.value || '0x0',
      };

      // Use state overrides if provided (useful for testing)
      const blockTag = options.blockTag || 'latest';

      // Simulate using eth_call
      let returnData;
      let success = true;
      let revertReason = null;

      try {
        returnData = await provider.call(simTx, blockTag);
      } catch (error) {
        success = false;
        const parsed = this.parseRevertReason(error);
        revertReason = parsed.reason;
        returnData = null;

        // Track revert reasons
        const reasonKey = revertReason || 'Unknown';
        this.metrics.revertReasons.set(
          reasonKey,
          (this.metrics.revertReasons.get(reasonKey) || 0) + 1
        );
      }

      // Estimate gas
      let gasUsed = null;
      let gasEstimateError = null;

      if (success) {
        try {
          const gasEstimate = await provider.estimateGas(simTx);
          gasUsed = gasEstimate.toNumber();
        } catch (error) {
          gasEstimateError = error.message;
          // Even if gas estimation fails, the call might succeed
          // Use a default high estimate
          gasUsed = this.maxGasLimit;
        }
      }

      // Parse state changes (limited without trace)
      const stateChanges = this._parseReturnData(returnData, tx.data);

      // Update metrics
      if (success) {
        this.metrics.successfulSimulations++;
      } else {
        this.metrics.failedSimulations++;
      }

      const result = {
        success,
        gasUsed,
        gasEstimateError,
        returnData,
        revertReason,
        stateChanges,
        simulationTime: Date.now() - startTime,
        blockTag,
      };

      this.logger.debug?.('Simulation complete', {
        success,
        gasUsed,
        revertReason,
        to: tx.to,
      });

      return result;

    } catch (error) {
      this.metrics.failedSimulations++;
      this.logger.error?.('Simulation failed', { error: error.message, tx: tx?.to });

      return {
        success: false,
        gasUsed: null,
        returnData: null,
        revertReason: error.message,
        stateChanges: null,
        simulationTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Simulate a bundle of transactions atomically
   * @param {Object[]} txs - Array of transaction objects
   * @param {Object} provider - Ethers provider
   * @param {Object} [options] - Simulation options
   * @returns {Promise<Object>} Bundle simulation result
   */
  async simulateBundle(txs, provider, options = {}) {
    const startTime = Date.now();
    const results = [];
    let bundleSuccess = true;
    let bundleGasUsed = 0;

    // Simulate each transaction in sequence
    // Note: Without a fork node, we can't simulate true bundle atomicity
    // This provides a best-effort sequential simulation
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const result = await this.simulate(tx, provider, options);
      results.push(result);

      if (!result.success) {
        bundleSuccess = false;
        // Continue to see which other txs would fail
      } else if (result.gasUsed) {
        bundleGasUsed += result.gasUsed;
      }
    }

    return {
      results,
      bundleSuccess,
      totalGasUsed: bundleGasUsed,
      transactionCount: txs.length,
      successfulCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      simulationTime: Date.now() - startTime,
    };
  }

  /**
   * Estimate expected output for a swap transaction
   * @param {Object} swapTx - Swap transaction object
   * @param {string} swapTx.to - Router address
   * @param {string} swapTx.data - Swap calldata
   * @param {Object} provider - Ethers provider
   * @param {Object} [options] - Options
   * @param {string} [options.quotedOutput] - Expected output for comparison
   * @returns {Promise<Object>} Output estimation
   */
  async estimateOutput(swapTx, provider, options = {}) {
    const startTime = Date.now();

    // First, simulate the transaction
    const simResult = await this.simulate(swapTx, provider);

    if (!simResult.success) {
      return {
        expectedOutput: null,
        confidence: 0,
        error: simResult.revertReason,
        simulationSuccess: false,
        estimationTime: Date.now() - startTime,
      };
    }

    // Try to decode output from return data
    let expectedOutput = null;
    let confidence = 0.5; // Default medium confidence

    if (simResult.returnData && simResult.returnData !== '0x') {
      try {
        // Most swaps return amounts array
        const decoded = ethers.utils.defaultAbiCoder.decode(
          ['uint256[]'],
          simResult.returnData
        );

        if (decoded[0] && decoded[0].length > 0) {
          // Last element is typically the output amount
          expectedOutput = decoded[0][decoded[0].length - 1].toString();
          confidence = 0.9; // High confidence from simulation
        }
      } catch {
        // Try single uint256
        try {
          const decoded = ethers.utils.defaultAbiCoder.decode(
            ['uint256'],
            simResult.returnData
          );
          expectedOutput = decoded[0].toString();
          confidence = 0.85;
        } catch {
          // Could not decode return data
          this.logger.debug?.('Could not decode swap return data');
        }
      }
    }

    // Compare with quoted output if provided
    let slippageEstimate = null;
    if (options.quotedOutput && expectedOutput) {
      const quoted = ethers.BigNumber.from(options.quotedOutput);
      const estimated = ethers.BigNumber.from(expectedOutput);

      if (!quoted.isZero()) {
        // Calculate difference as percentage
        const diff = quoted.sub(estimated).abs();
        slippageEstimate = diff.mul(10000).div(quoted).toNumber() / 10000;

        // Adjust confidence based on slippage
        if (slippageEstimate > 0.05) {
          confidence *= 0.7; // Reduce confidence for high slippage
        }
      }
    }

    // Determine if this looks like a MEV risk
    const mevRisk = this._assessMevRisk(swapTx, slippageEstimate);

    return {
      expectedOutput,
      confidence,
      simulationSuccess: true,
      gasUsed: simResult.gasUsed,
      slippageEstimate,
      mevRisk,
      estimationTime: Date.now() - startTime,
    };
  }

  /**
   * Parse revert reason from error
   * @param {Error} error - Error object
   * @returns {Object} Parsed reason with selector
   */
  parseRevertReason(error) {
    const errorData = error.data || error.error?.data || error.reason || '';

    // Check for known error selectors
    if (typeof errorData === 'string' && errorData.startsWith('0x')) {
      const selector = errorData.slice(0, 10).toLowerCase();

      // Check if it's a known error type
      if (this.errorSelectors[selector]) {
        const errorType = this.errorSelectors[selector];

        // Try to decode the error data
        if (selector === '0x08c379a0') {
          // Error(string) - standard revert
          try {
            const reason = ethers.utils.defaultAbiCoder.decode(
              ['string'],
              '0x' + errorData.slice(10)
            )[0];
            return { reason, selector, type: 'Error' };
          } catch {
            return { reason: 'Error (could not decode)', selector, type: 'Error' };
          }
        }

        if (selector === '0x4e487b71') {
          // Panic(uint256)
          try {
            const code = ethers.utils.defaultAbiCoder.decode(
              ['uint256'],
              '0x' + errorData.slice(10)
            )[0].toNumber();
            const panicReason = this.panicCodes[code] || `Panic code ${code}`;
            return { reason: panicReason, selector, type: 'Panic', code };
          } catch {
            return { reason: 'Panic (could not decode)', selector, type: 'Panic' };
          }
        }

        // Other known errors
        return { reason: errorType, selector, type: 'Custom' };
      }

      // Unknown selector
      return {
        reason: `Unknown error (${selector})`,
        selector,
        type: 'Unknown',
        rawData: errorData,
      };
    }

    // Plain text error message
    if (error.message) {
      // Extract reason from common error formats
      const match = error.message.match(/reason="([^"]+)"/);
      if (match) {
        return { reason: match[1], selector: null, type: 'Message' };
      }

      // Check for "execution reverted" pattern
      if (error.message.includes('execution reverted')) {
        const reasonMatch = error.message.match(/execution reverted: (.+)/);
        return {
          reason: reasonMatch ? reasonMatch[1] : 'execution reverted',
          selector: null,
          type: 'Revert',
        };
      }

      return { reason: error.message, selector: null, type: 'Message' };
    }

    return { reason: 'Unknown error', selector: null, type: 'Unknown' };
  }

  /**
   * Update gas accuracy metrics after actual execution
   * @param {number} estimated - Estimated gas from simulation
   * @param {number} actual - Actual gas used
   */
  updateGasAccuracy(estimated, actual) {
    if (!estimated || !actual || actual === 0) return;

    const accuracy = Math.min(estimated, actual) / Math.max(estimated, actual);

    this.metrics.gasEstimateAccuracy.push({
      estimated,
      actual,
      accuracy,
      timestamp: Date.now(),
    });

    // Keep only last 100 entries
    if (this.metrics.gasEstimateAccuracy.length > 100) {
      this.metrics.gasEstimateAccuracy.shift();
    }

    // Recalculate average
    const sum = this.metrics.gasEstimateAccuracy.reduce((a, b) => a + b.accuracy, 0);
    this.metrics.averageAccuracy = sum / this.metrics.gasEstimateAccuracy.length;
  }

  /**
   * Simulate using Tenderly API (if configured)
   * @param {Object} tx - Transaction object
   * @param {number} chainId - Chain ID
   * @returns {Promise<Object>} Tenderly simulation result
   */
  async simulateWithTenderly(tx, chainId) {
    if (!this.tenderlyApiKey || !this.tenderlyProject || !this.tenderlyUser) {
      throw new Error('Tenderly not configured');
    }

    const url = `https://api.tenderly.co/api/v1/account/${this.tenderlyUser}/project/${this.tenderlyProject}/simulate`;

    const body = {
      network_id: chainId.toString(),
      from: tx.from || ethers.constants.AddressZero,
      to: tx.to,
      input: tx.data || '0x',
      value: tx.value || '0',
      gas: tx.gasLimit || this.maxGasLimit,
      save: false,
      save_if_fails: false,
      simulation_type: 'quick', // 'quick' or 'full'
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': this.tenderlyApiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Tenderly API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: data.simulation?.status === true,
        gasUsed: data.simulation?.gas_used,
        returnData: data.simulation?.output,
        trace: data.simulation?.trace,
        stateDiff: data.simulation?.state_diff,
        logs: data.simulation?.logs,
      };

    } catch (error) {
      this.logger.error?.('Tenderly simulation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if transaction is a swap
   * @param {Object} tx - Transaction object
   * @returns {boolean} True if swap
   */
  isSwapTransaction(tx) {
    if (!tx.data || tx.data.length < 10) return false;
    const selector = tx.data.slice(0, 10).toLowerCase();
    return this.swapSelectors.has(selector);
  }

  /**
   * Get simulation metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    const revertReasonsObj = {};
    for (const [reason, count] of this.metrics.revertReasons) {
      revertReasonsObj[reason] = count;
    }

    return {
      totalSimulations: this.metrics.totalSimulations,
      successfulSimulations: this.metrics.successfulSimulations,
      failedSimulations: this.metrics.failedSimulations,
      successRate: this.metrics.totalSimulations > 0
        ? this.metrics.successfulSimulations / this.metrics.totalSimulations
        : 0,
      averageGasAccuracy: this.metrics.averageAccuracy,
      recentGasEstimates: this.metrics.gasEstimateAccuracy.slice(-10),
      revertReasons: revertReasonsObj,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalSimulations: 0,
      successfulSimulations: 0,
      failedSimulations: 0,
      gasEstimateAccuracy: [],
      averageAccuracy: 1.0,
      revertReasons: new Map(),
    };
  }

  /**
   * Validate transaction object
   * @private
   */
  _validateTransaction(tx) {
    if (!tx) {
      throw new Error('Transaction object required');
    }

    if (!tx.to || !ethers.utils.isAddress(tx.to)) {
      throw new Error('Valid "to" address required');
    }

    if (tx.data && typeof tx.data !== 'string') {
      throw new Error('Transaction data must be a hex string');
    }

    if (tx.value) {
      try {
        ethers.BigNumber.from(tx.value);
      } catch {
        throw new Error('Invalid transaction value');
      }
    }
  }

  /**
   * Parse return data based on function selector
   * @private
   */
  _parseReturnData(returnData, calldata) {
    if (!returnData || returnData === '0x') {
      return null;
    }

    // Basic state change inference
    // Without full trace, we can only infer from return data
    return {
      hasReturnData: true,
      returnDataLength: (returnData.length - 2) / 2, // bytes
    };
  }

  /**
   * Assess MEV risk for a swap
   * @private
   */
  _assessMevRisk(swapTx, slippageEstimate) {
    const risks = [];
    let riskLevel = 'low';

    // Check if it's a swap
    if (this.isSwapTransaction(swapTx)) {
      risks.push('DEX swap detected');
      riskLevel = 'medium';
    }

    // High value transactions are more attractive targets
    if (swapTx.value) {
      const valueInEth = parseFloat(ethers.utils.formatEther(swapTx.value));
      if (valueInEth > 10) {
        risks.push('High value transaction (>10 ETH)');
        riskLevel = 'high';
      } else if (valueInEth > 1) {
        risks.push('Medium value transaction (>1 ETH)');
        if (riskLevel === 'low') riskLevel = 'medium';
      }
    }

    // Slippage deviation indicates potential MEV
    if (slippageEstimate && slippageEstimate > 0.02) {
      risks.push(`High slippage detected (${(slippageEstimate * 100).toFixed(2)}%)`);
      riskLevel = 'high';
    } else if (slippageEstimate && slippageEstimate > 0.01) {
      risks.push(`Moderate slippage (${(slippageEstimate * 100).toFixed(2)}%)`);
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    return {
      level: riskLevel,
      risks,
      recommendation: riskLevel === 'high' || riskLevel === 'critical'
        ? 'Use private transaction submission (Flashbots)'
        : riskLevel === 'medium'
          ? 'Consider private submission for large swaps'
          : 'Standard submission acceptable',
    };
  }
}

module.exports = { TxSimulator };
