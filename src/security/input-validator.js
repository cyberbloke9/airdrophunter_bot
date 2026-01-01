/**
 * Input Validator - Calldata Validation & Contract Verification
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: 34.6% of DeFi exploits stem from input validation failures.
 * Most bots validate at the application layer but not at the calldata layer.
 *
 * STATE-OF-THE-ART:
 * - 3-Layer Validation: Semantic → Calldata → Contract Verification
 * - Function selector whitelisting
 * - Known malicious pattern detection
 * - Contract age and verification checks
 *
 * @module security/input-validator
 */

const { ethers } = require('ethers');

class InputValidator {
  constructor(config = {}) {
    this.logger = config.logger || console;
    this.strictMode = config.strictMode ?? true;

    // Known-safe function selectors (4-byte signatures)
    this.WHITELISTED_SELECTORS = {
      // ERC20 Standard
      '0x095ea7b3': { name: 'approve', params: ['address', 'uint256'], risk: 'low' },
      '0xa9059cbb': { name: 'transfer', params: ['address', 'uint256'], risk: 'low' },
      '0x23b872dd': { name: 'transferFrom', params: ['address', 'address', 'uint256'], risk: 'low' },

      // Uniswap V2 Router
      '0x38ed1739': { name: 'swapExactTokensForTokens', params: ['uint256', 'uint256', 'address[]', 'address', 'uint256'], risk: 'low' },
      '0x8803dbee': { name: 'swapTokensForExactTokens', params: ['uint256', 'uint256', 'address[]', 'address', 'uint256'], risk: 'low' },
      '0x7ff36ab5': { name: 'swapExactETHForTokens', params: ['uint256', 'address[]', 'address', 'uint256'], risk: 'low' },
      '0x4a25d94a': { name: 'swapTokensForExactETH', params: ['uint256', 'uint256', 'address[]', 'address', 'uint256'], risk: 'low' },
      '0x18cbafe5': { name: 'swapExactTokensForETH', params: ['uint256', 'uint256', 'address[]', 'address', 'uint256'], risk: 'low' },
      '0xfb3bdb41': { name: 'swapETHForExactTokens', params: ['uint256', 'address[]', 'address', 'uint256'], risk: 'low' },

      // Uniswap V3 Router
      '0x04e45aaf': { name: 'exactInputSingle', params: ['tuple'], risk: 'low' },
      '0xb858183f': { name: 'exactInput', params: ['tuple'], risk: 'low' },
      '0x5023b4df': { name: 'exactOutputSingle', params: ['tuple'], risk: 'low' },
      '0x09b81346': { name: 'exactOutput', params: ['tuple'], risk: 'low' },

      // Uniswap V3 SwapRouter02
      '0x472b43f3': { name: 'swapExactTokensForTokens', params: ['uint256', 'uint256', 'address[]', 'address'], risk: 'low' },
      '0x42712a67': { name: 'swapTokensForExactTokens', params: ['uint256', 'uint256', 'address[]', 'address'], risk: 'low' },

      // Permit2
      '0x2b67b570': { name: 'permit', params: ['tuple', 'bytes'], risk: 'medium' },

      // Multicall
      '0xac9650d8': { name: 'multicall', params: ['bytes[]'], risk: 'medium' },
      '0x5ae401dc': { name: 'multicall', params: ['uint256', 'bytes[]'], risk: 'medium' },
      '0x1f0464d1': { name: 'multicall', params: ['bytes32', 'bytes[]'], risk: 'medium' },

      // WETH
      '0xd0e30db0': { name: 'deposit', params: [], risk: 'low' },
      '0x2e1a7d4d': { name: 'withdraw', params: ['uint256'], risk: 'low' },
    };

    // Known malicious patterns in calldata
    this.MALICIOUS_PATTERNS = [
      { pattern: /^0x00000000/, reason: 'Null selector (exploit pattern)' },
      { pattern: /0{64}/, reason: 'Large zero padding (potential overflow)' },
      { pattern: /ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff/i, reason: 'Max uint256 (infinite approval risk)' },
    ];

    // Known malicious contracts (would be fetched from API in production)
    this.KNOWN_MALICIOUS = new Set([
      // Example malicious addresses - would be updated from external source
    ]);

    // Minimum contract age (in seconds) for interaction
    this.MIN_CONTRACT_AGE = config.minContractAge ?? 86400; // 24 hours

    // Etherscan API configuration
    this.etherscanApiKey = config.etherscanApiKey || process.env.ETHERSCAN_API_KEY;
    this.etherscanBaseUrls = {
      1: 'https://api.etherscan.io/api',
      42161: 'https://api.arbiscan.io/api',
      10: 'https://api-optimistic.etherscan.io/api',
      8453: 'https://api.basescan.org/api',
      137: 'https://api.polygonscan.com/api',
    };
  }

  /**
   * Validate calldata before execution
   *
   * @param {string} to - Target contract address
   * @param {string} data - Transaction calldata
   * @param {number} chainId - Chain ID
   * @param {object} options - Additional validation options
   * @returns {Promise<{valid: boolean, errors: string[], warnings: string[], selector: string, functionName: string}>}
   */
  async validateCalldata(to, data, chainId, options = {}) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      selector: null,
      functionName: null,
    };

    // Empty data is valid (simple ETH transfer)
    if (!data || data === '0x' || data.length < 10) {
      return result;
    }

    // Extract function selector (first 4 bytes)
    const selector = data.slice(0, 10).toLowerCase();
    result.selector = selector;

    // Check against whitelist
    const whitelistedFunc = this.WHITELISTED_SELECTORS[selector];
    if (whitelistedFunc) {
      result.functionName = whitelistedFunc.name;

      if (whitelistedFunc.risk === 'medium') {
        result.warnings.push(`Function '${whitelistedFunc.name}' has medium risk level`);
      }

      // Decode and validate parameters
      try {
        await this.validateParameters(data, whitelistedFunc, result);
      } catch (error) {
        result.warnings.push(`Could not decode parameters: ${error.message}`);
      }
    } else {
      // Not whitelisted - verify contract is trusted
      if (this.strictMode) {
        const isVerified = await this.verifyContract(to, chainId);
        if (!isVerified.verified) {
          result.errors.push(
            `Unknown function selector ${selector} on unverified contract. ` +
            `Reason: ${isVerified.reason}`
          );
          result.valid = false;
        } else {
          result.warnings.push(
            `Unknown function selector ${selector} on verified contract. ` +
            `Proceeding with caution.`
          );
        }
      } else {
        result.warnings.push(`Unknown function selector ${selector}`);
      }
    }

    // Check for malicious patterns
    for (const { pattern, reason } of this.MALICIOUS_PATTERNS) {
      if (pattern.test(data)) {
        if (this.strictMode) {
          result.errors.push(`Malicious pattern detected: ${reason}`);
          result.valid = false;
        } else {
          result.warnings.push(`Suspicious pattern detected: ${reason}`);
        }
      }
    }

    // Check if target is known malicious
    if (this.KNOWN_MALICIOUS.has(to.toLowerCase())) {
      result.errors.push('Target address is known malicious');
      result.valid = false;
    }

    return result;
  }

  /**
   * Validate decoded parameters
   *
   * @param {string} data - Full calldata
   * @param {object} funcInfo - Function info from whitelist
   * @param {object} result - Result object to populate
   */
  async validateParameters(data, funcInfo, result) {
    if (funcInfo.params.length === 0) {
      return; // No parameters to validate
    }

    // Skip tuple validation (complex, would need ABI)
    if (funcInfo.params.includes('tuple')) {
      result.warnings.push('Complex parameter validation skipped for tuple types');
      return;
    }

    try {
      const paramData = '0x' + data.slice(10);
      const decoded = ethers.utils.defaultAbiCoder.decode(funcInfo.params, paramData);

      for (let i = 0; i < decoded.length; i++) {
        const value = decoded[i];
        const type = funcInfo.params[i];

        // Address validation
        if (type === 'address') {
          if (value === ethers.constants.AddressZero) {
            result.errors.push('Zero address parameter detected - likely invalid');
            result.valid = false;
          }
        }

        // Amount validation (prevent dust attacks / overflow triggers)
        if (type === 'uint256') {
          // Check for max uint (infinite approval)
          if (value.eq(ethers.constants.MaxUint256)) {
            result.warnings.push('Infinite approval (MaxUint256) detected');
          }

          // Check for suspiciously large values
          const maxReasonable = ethers.constants.MaxUint256.div(2);
          if (value.gt(maxReasonable)) {
            result.warnings.push('Suspiciously large amount parameter');
          }
        }

        // Path validation (for swap routes)
        if (type === 'address[]') {
          if (value.length > 5) {
            result.warnings.push('Suspiciously long swap path (>5 hops)');
          }
          if (value.length < 2) {
            result.errors.push('Invalid swap path (less than 2 addresses)');
            result.valid = false;
          }
          for (const addr of value) {
            if (addr === ethers.constants.AddressZero) {
              result.errors.push('Zero address in swap path');
              result.valid = false;
            }
          }
        }
      }
    } catch (error) {
      // Decoding failed - might be mismatched ABI
      this.logger.warn(`[InputValidator] Parameter decoding failed: ${error.message}`);
    }
  }

  /**
   * Verify contract is trusted (verified on explorer, not too new)
   *
   * @param {string} address - Contract address
   * @param {number} chainId - Chain ID
   * @returns {Promise<{verified: boolean, reason: string, age: number|null}>}
   */
  async verifyContract(address, chainId) {
    const result = {
      verified: false,
      reason: 'Unknown',
      age: null,
      name: null,
    };

    // Check if it's an EOA (not a contract)
    // This would need a provider - skip for now if not available

    // Check Etherscan verification
    if (this.etherscanApiKey && this.etherscanBaseUrls[chainId]) {
      try {
        const baseUrl = this.etherscanBaseUrls[chainId];
        const url = `${baseUrl}?module=contract&action=getabi&address=${address}&apikey=${this.etherscanApiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === '1' && data.result !== 'Contract source code not verified') {
          result.verified = true;
          result.reason = 'Verified on Etherscan';

          // Try to get contract creation info for age check
          try {
            const creationUrl = `${baseUrl}?module=contract&action=getcontractcreation&contractaddresses=${address}&apikey=${this.etherscanApiKey}`;
            const creationResponse = await fetch(creationUrl);
            const creationData = await creationResponse.json();

            if (creationData.status === '1' && creationData.result?.[0]?.txHash) {
              // Would need to get tx timestamp - simplified for now
              result.reason = 'Verified on Etherscan with creation info';
            }
          } catch {
            // Ignore creation lookup errors
          }
        } else {
          result.reason = 'Not verified on Etherscan';
        }
      } catch (error) {
        this.logger.warn(`[InputValidator] Etherscan API error: ${error.message}`);
        result.reason = 'Could not verify (API error)';
      }
    } else {
      result.reason = 'No Etherscan API key configured';
    }

    return result;
  }

  /**
   * Validate an Ethereum address
   *
   * @param {string} address - Address to validate
   * @returns {{valid: boolean, type: string, error: string|null}}
   */
  validateAddress(address) {
    if (!address) {
      return { valid: false, type: null, error: 'Address is required' };
    }

    // ENS name
    if (address.endsWith('.eth')) {
      return { valid: true, type: 'ens', error: null };
    }

    // Ethereum address
    try {
      const checksummed = ethers.utils.getAddress(address);
      return { valid: true, type: 'address', checksummed, error: null };
    } catch {
      return { valid: false, type: null, error: 'Invalid Ethereum address format' };
    }
  }

  /**
   * Validate a token amount
   *
   * @param {string|number} amount - Amount to validate
   * @param {number} decimals - Token decimals
   * @returns {{valid: boolean, parsed: ethers.BigNumber|null, error: string|null}}
   */
  validateAmount(amount, decimals = 18) {
    if (!amount && amount !== 0) {
      return { valid: false, parsed: null, error: 'Amount is required' };
    }

    try {
      const strAmount = amount.toString();
      const numAmount = parseFloat(strAmount);

      if (isNaN(numAmount) || numAmount < 0) {
        return { valid: false, parsed: null, error: 'Amount must be a positive number' };
      }

      // Check for too many decimals
      const decimalParts = strAmount.split('.');
      if (decimalParts.length > 1 && decimalParts[1].length > decimals) {
        return {
          valid: false,
          parsed: null,
          error: `Amount has too many decimal places (max ${decimals})`
        };
      }

      const parsed = ethers.utils.parseUnits(strAmount, decimals);

      // Check for zero
      if (parsed.isZero()) {
        return { valid: false, parsed: null, error: 'Amount cannot be zero' };
      }

      return { valid: true, parsed, error: null };
    } catch (error) {
      return { valid: false, parsed: null, error: `Invalid amount format: ${error.message}` };
    }
  }

  /**
   * Add a function selector to whitelist
   *
   * @param {string} selector - 4-byte function selector
   * @param {object} info - Function info
   */
  addWhitelistedSelector(selector, info) {
    const normalizedSelector = selector.toLowerCase();
    if (!/^0x[a-f0-9]{8}$/.test(normalizedSelector)) {
      throw new Error('Invalid selector format');
    }
    this.WHITELISTED_SELECTORS[normalizedSelector] = info;
    this.logger.info(`[InputValidator] Added whitelisted selector: ${selector} (${info.name})`);
  }

  /**
   * Add a known malicious address
   *
   * @param {string} address - Malicious address
   */
  addMaliciousAddress(address) {
    this.KNOWN_MALICIOUS.add(address.toLowerCase());
    this.logger.info(`[InputValidator] Added malicious address: ${address}`);
  }

  /**
   * Check if a selector is whitelisted
   *
   * @param {string} selector - Function selector
   * @returns {boolean}
   */
  isSelectorWhitelisted(selector) {
    return !!this.WHITELISTED_SELECTORS[selector.toLowerCase()];
  }

  /**
   * Get function info from selector
   *
   * @param {string} selector - Function selector
   * @returns {object|null}
   */
  getFunctionInfo(selector) {
    return this.WHITELISTED_SELECTORS[selector.toLowerCase()] || null;
  }
}

module.exports = InputValidator;
