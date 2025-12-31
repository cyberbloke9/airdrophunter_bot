/**
 * DEX Aggregator Handler
 * Integrates with 1inch, Paraswap, and 0x for best execution
 */

const { ethers } = require('ethers');
const { getToken, isNativeToken, getNativeToken, parseAmount, formatAmount, getWrappedNativeAddress } = require('../../config/tokens');
const { getChain } = require('../../config/chains');
const logger = require('../../utils/logger');
const { retry } = require('../../utils/helpers');

// Aggregator API endpoints
const AGGREGATORS = {
  oneInch: {
    name: '1inch',
    baseUrl: 'https://api.1inch.dev/swap/v6.0',
    chainMapping: {
      1: '1',
      42161: '42161',
      137: '137',
      10: '10',
      56: '56',
      8453: '8453',
    },
  },
  paraswap: {
    name: 'Paraswap',
    baseUrl: 'https://apiv5.paraswap.io',
    chainMapping: {
      1: '1',
      42161: '42161',
      137: '137',
      10: '10',
      56: '56',
    },
  },
};

/**
 * Get quote from 1inch
 */
async function get1inchQuote(params) {
  const { fromToken, toToken, amount, chainId } = params;

  const chainIdStr = AGGREGATORS.oneInch.chainMapping[chainId];
  if (!chainIdStr) {
    return null;
  }

  try {
    const fromIsNative = isNativeToken(fromToken);
    const toIsNative = isNativeToken(toToken);

    const fromTokenInfo = fromIsNative
      ? { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 }
      : getToken(fromToken, chainId);

    const toTokenInfo = toIsNative
      ? { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 }
      : getToken(toToken, chainId);

    if (!fromTokenInfo || !toTokenInfo) {
      return null;
    }

    const amountIn = parseAmount(amount, fromTokenInfo.decimals);

    // In production, you would call the 1inch API here
    // For now, return null as we need an API key
    logger.debug('1inch aggregator would be called here', {
      fromToken: fromTokenInfo.address,
      toToken: toTokenInfo.address,
      amount: amountIn.toString(),
    });

    return null;
  } catch (error) {
    logger.warn('1inch quote failed', { error: error.message });
    return null;
  }
}

/**
 * Get quote from Paraswap
 */
async function getParaswapQuote(params) {
  const { fromToken, toToken, amount, chainId } = params;

  const chainIdStr = AGGREGATORS.paraswap.chainMapping[chainId];
  if (!chainIdStr) {
    return null;
  }

  try {
    const fromIsNative = isNativeToken(fromToken);
    const toIsNative = isNativeToken(toToken);

    const fromTokenInfo = fromIsNative
      ? { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 }
      : getToken(fromToken, chainId);

    const toTokenInfo = toIsNative
      ? { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 }
      : getToken(toToken, chainId);

    if (!fromTokenInfo || !toTokenInfo) {
      return null;
    }

    const amountIn = parseAmount(amount, fromTokenInfo.decimals);

    // In production, you would call the Paraswap API here
    logger.debug('Paraswap aggregator would be called here', {
      fromToken: fromTokenInfo.address,
      toToken: toTokenInfo.address,
      amount: amountIn.toString(),
    });

    return null;
  } catch (error) {
    logger.warn('Paraswap quote failed', { error: error.message });
    return null;
  }
}

/**
 * Get the best quote from all aggregators
 */
async function getQuote(params) {
  const quotes = await Promise.allSettled([
    get1inchQuote(params),
    getParaswapQuote(params),
  ]);

  const validQuotes = quotes
    .filter(q => q.status === 'fulfilled' && q.value)
    .map(q => q.value)
    .sort((a, b) => {
      const aOut = parseFloat(a.amountOut);
      const bOut = parseFloat(b.amountOut);
      return bOut - aOut;
    });

  if (validQuotes.length === 0) {
    // Fallback: return a placeholder that indicates aggregator would be used
    return {
      dex: 'aggregator',
      available: false,
      message: 'Aggregator APIs require configuration. Using direct DEX routes.',
    };
  }

  return validQuotes[0];
}

/**
 * Execute swap through aggregator
 */
async function executeSwap(params) {
  const {
    fromToken,
    toToken,
    amountIn,
    minAmountOut,
    signer,
    userAddress,
    chainId,
    aggregatorData, // Data returned from quote
  } = params;

  if (!aggregatorData || !aggregatorData.tx) {
    throw new Error('Aggregator swap data not provided');
  }

  logger.info('Executing aggregator swap', {
    aggregator: aggregatorData.aggregator,
    amountIn: amountIn.toString(),
  });

  // Execute the transaction provided by the aggregator
  const tx = await signer.sendTransaction({
    to: aggregatorData.tx.to,
    data: aggregatorData.tx.data,
    value: aggregatorData.tx.value || 0,
    gasLimit: aggregatorData.tx.gas,
  });

  const receipt = await tx.wait();

  return {
    success: receipt.status === 1,
    txHash: tx.hash,
    gasUsed: receipt.gasUsed.toString(),
    aggregator: aggregatorData.aggregator,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Build swap transaction data from aggregator
 */
async function buildSwapTransaction(params) {
  const { fromToken, toToken, amount, chainId, userAddress, slippage = 1 } = params;

  // This would call the aggregator's build transaction endpoint
  // For now, return null as it requires API configuration

  logger.debug('Would build aggregator transaction here', {
    fromToken,
    toToken,
    amount,
    userAddress,
    slippage,
  });

  return null;
}

/**
 * Get supported aggregators for a chain
 */
function getSupportedAggregators(chainId) {
  const supported = [];

  for (const [key, config] of Object.entries(AGGREGATORS)) {
    if (config.chainMapping[chainId]) {
      supported.push({
        id: key,
        name: config.name,
      });
    }
  }

  return supported;
}

module.exports = {
  getQuote,
  executeSwap,
  buildSwapTransaction,
  getSupportedAggregators,
  get1inchQuote,
  getParaswapQuote,
};
