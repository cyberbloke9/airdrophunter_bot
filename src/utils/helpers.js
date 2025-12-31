/**
 * Helper Utilities
 * Common utility functions used across the application
 */

const { ethers } = require('ethers');

/**
 * Sleep for a specified duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

      if (onRetry) {
        onRetry(error, attempt + 1, delay);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Format a large number with commas
 */
function formatNumber(num, decimals = 2) {
  if (typeof num === 'string') {
    num = parseFloat(num);
  }

  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a wei value to human-readable
 */
function formatWei(wei, decimals = 18, displayDecimals = 4) {
  const formatted = ethers.utils.formatUnits(wei, decimals);
  return formatNumber(formatted, displayDecimals);
}

/**
 * Parse a human-readable value to wei
 */
function parseWei(value, decimals = 18) {
  return ethers.utils.parseUnits(value.toString(), decimals);
}

/**
 * Truncate an address for display
 */
function truncateAddress(address, startChars = 6, endChars = 4) {
  if (!address) return '';
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Check if a string is a valid Ethereum address
 */
function isValidAddress(address) {
  return ethers.utils.isAddress(address);
}

/**
 * Check if a string is a valid transaction hash
 */
function isValidTxHash(hash) {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Calculate percentage
 */
function calculatePercentage(value, total) {
  if (total === 0) return 0;
  return (value / total) * 100;
}

/**
 * Calculate slippage
 */
function calculateSlippage(expected, actual) {
  const expectedNum = typeof expected === 'string' ? parseFloat(expected) : expected;
  const actualNum = typeof actual === 'string' ? parseFloat(actual) : actual;

  if (expectedNum === 0) return 0;
  return ((expectedNum - actualNum) / expectedNum) * 100;
}

/**
 * Check if slippage is within tolerance
 */
function isSlippageAcceptable(expected, actual, maxSlippagePercent) {
  const slippage = calculateSlippage(expected, actual);
  return slippage <= maxSlippagePercent;
}

/**
 * Parse a natural language amount (e.g., "1.5 ETH", "100 USDC")
 */
function parseAmountString(input) {
  const match = input.match(/^([\d.,]+)\s*(\w+)?$/);
  if (!match) return null;

  const amount = match[1].replace(/,/g, '');
  const token = match[2] || null;

  return {
    amount: parseFloat(amount),
    token,
  };
}

/**
 * Chunk an array into smaller arrays
 */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Deep merge objects
 */
function deepMerge(target, source) {
  const output = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

/**
 * Create a deadline timestamp
 */
function createDeadline(minutes = 10) {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

/**
 * Check if a deadline has passed
 */
function isDeadlinePassed(deadline) {
  return Math.floor(Date.now() / 1000) > deadline;
}

/**
 * Format a timestamp to human-readable
 */
function formatTimestamp(timestamp, includeTime = true) {
  const date = new Date(timestamp * 1000);

  if (includeTime) {
    return date.toLocaleString();
  }

  return date.toLocaleDateString();
}

/**
 * Calculate gas cost in native token
 */
function calculateGasCost(gasUsed, gasPrice) {
  const gasCost = gasUsed.mul(gasPrice);
  return ethers.utils.formatEther(gasCost);
}

/**
 * Safe JSON parse
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Debounce a function
 */
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function
 */
function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

module.exports = {
  sleep,
  retry,
  formatNumber,
  formatWei,
  parseWei,
  truncateAddress,
  isValidAddress,
  isValidTxHash,
  calculatePercentage,
  calculateSlippage,
  isSlippageAcceptable,
  parseAmountString,
  chunk,
  deepMerge,
  createDeadline,
  isDeadlinePassed,
  formatTimestamp,
  calculateGasCost,
  safeJsonParse,
  debounce,
  throttle,
};
