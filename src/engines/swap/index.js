/**
 * Swap Engine
 * Handles all token swap operations across multiple DEXes
 */

const { ethers } = require('ethers');
const uniswapV2 = require('./uniswapV2');
const uniswapV3 = require('./uniswapV3');
const aggregator = require('./aggregator');
const { getChain } = require('../../config/chains');
const { getToken, isNativeToken, getNativeToken, parseAmount, formatAmount } = require('../../config/tokens');
const { getConnectedWallet, hasSufficientBalance } = require('../../core/wallets');
const { ensureApproval } = require('../../core/contracts');
const { getExplorerTxUrl } = require('../../config/chains');
const logger = require('../../utils/logger');
const { SlippageExceededError, InsufficientBalanceError } = require('../../utils/errors');

// Available DEX handlers
const DEX_HANDLERS = {
  uniswapV2,
  uniswapV3,
  sushiswap: uniswapV2, // Same interface
  quickswap: uniswapV2, // Same interface
  pancakeswap: uniswapV2, // Same interface
};

/**
 * Get the best swap route across DEXes
 */
async function getBestRoute(params) {
  const { fromToken, toToken, amount, chainId } = params;

  logger.info('Finding best swap route', { fromToken, toToken, amount, chainId });

  // Get quotes from all available DEXes
  const quotes = await Promise.allSettled([
    uniswapV2.getQuote({ fromToken, toToken, amount, chainId }),
    uniswapV3.getQuote({ fromToken, toToken, amount, chainId }),
    aggregator.getQuote({ fromToken, toToken, amount, chainId }),
  ]);

  // Filter successful quotes
  const validQuotes = quotes
    .filter(q => q.status === 'fulfilled' && q.value)
    .map(q => q.value)
    .sort((a, b) => {
      // Sort by output amount descending
      const aOut = parseFloat(a.amountOut);
      const bOut = parseFloat(b.amountOut);
      return bOut - aOut;
    });

  if (validQuotes.length === 0) {
    throw new Error('No valid swap routes found');
  }

  const bestQuote = validQuotes[0];
  logger.info('Best route found', {
    dex: bestQuote.dex,
    amountOut: bestQuote.amountOut,
  });

  return {
    best: bestQuote,
    alternatives: validQuotes.slice(1),
  };
}

/**
 * Execute a swap
 */
async function executeSwap(params) {
  const {
    fromToken,
    toToken,
    amount,
    chainId,
    walletAddress = 'primary',
    slippage = 0.5,
    deadline = 10,
    dex = 'auto', // 'auto', 'uniswapV2', 'uniswapV3', 'aggregator'
  } = params;

  logger.info('Executing swap', { fromToken, toToken, amount, chainId, dex });

  // Resolve token info
  const fromTokenInfo = isNativeToken(fromToken)
    ? { ...getNativeToken(chainId), isNative: true, decimals: 18 }
    : getToken(fromToken, chainId);

  const toTokenInfo = getToken(toToken, chainId);

  if (!fromTokenInfo) {
    throw new Error(`Token not found: ${fromToken}`);
  }
  if (!toTokenInfo) {
    throw new Error(`Token not found: ${toToken}`);
  }

  // Parse amount
  const amountIn = parseAmount(amount, fromTokenInfo.decimals);

  // Get connected wallet
  const signer = getConnectedWallet(walletAddress, chainId);
  const userAddress = await signer.getAddress();

  // Check balance
  const hasBalance = await hasSufficientBalance(
    walletAddress,
    chainId,
    amountIn,
    fromTokenInfo.isNative ? null : fromTokenInfo.address
  );

  if (!hasBalance) {
    throw new InsufficientBalanceError(fromToken, amount, 'insufficient');
  }

  // Get best route or use specified DEX
  let quote;
  if (dex === 'auto') {
    const routes = await getBestRoute({ fromToken, toToken, amount, chainId });
    quote = routes.best;
  } else {
    const handler = DEX_HANDLERS[dex];
    if (!handler) {
      throw new Error(`Unknown DEX: ${dex}`);
    }
    quote = await handler.getQuote({ fromToken, toToken, amount, chainId });
  }

  // Calculate minimum output with slippage
  const minAmountOut = calculateMinOutput(quote.amountOutRaw, slippage);

  // Check slippage is acceptable
  const priceImpact = quote.priceImpact || 0;
  if (priceImpact > slippage * 2) {
    logger.warn('High price impact detected', { priceImpact, slippage });
  }

  // Approve token if needed
  if (!fromTokenInfo.isNative) {
    const approvalResult = await ensureApproval(
      fromTokenInfo.address,
      quote.routerAddress,
      amountIn,
      signer,
      chainId
    );

    if (approvalResult.txHash) {
      logger.info('Token approved', { txHash: approvalResult.txHash });
    }
  }

  // Execute the swap using the appropriate handler
  const handler = DEX_HANDLERS[quote.dex] || uniswapV2;
  const result = await handler.executeSwap({
    fromToken: fromTokenInfo,
    toToken: toTokenInfo,
    amountIn,
    minAmountOut,
    signer,
    userAddress,
    chainId,
    deadline,
    path: quote.path,
  });

  // Verify output against slippage
  if (result.amountOut) {
    const actualSlippage = calculateActualSlippage(quote.amountOutRaw, result.amountOut);
    if (actualSlippage > slippage) {
      logger.warn('Slippage exceeded but transaction succeeded', {
        expected: slippage,
        actual: actualSlippage,
      });
    }
  }

  return {
    success: result.success,
    txHash: result.txHash,
    explorerUrl: getExplorerTxUrl(chainId, result.txHash),
    dex: quote.dex,
    fromToken: fromToken,
    toToken: toToken,
    amountIn: formatAmount(amountIn, fromTokenInfo.decimals),
    amountOut: result.amountOut ? formatAmount(result.amountOut, toTokenInfo.decimals) : quote.amountOut,
    expectedOutput: quote.amountOut,
    slippage,
    priceImpact: quote.priceImpact,
    gasUsed: result.gasUsed,
    route: quote.path,
  };
}

/**
 * Calculate minimum output with slippage tolerance
 */
function calculateMinOutput(amountOut, slippagePercent) {
  const slippageBps = Math.floor(slippagePercent * 100);
  return amountOut.mul(10000 - slippageBps).div(10000);
}

/**
 * Calculate actual slippage from expected vs actual
 */
function calculateActualSlippage(expected, actual) {
  const expectedNum = parseFloat(ethers.utils.formatEther(expected));
  const actualNum = parseFloat(ethers.utils.formatEther(actual));

  if (expectedNum === 0) return 0;
  return ((expectedNum - actualNum) / expectedNum) * 100;
}

/**
 * Get swap quote without executing
 */
async function getQuote(params) {
  const { fromToken, toToken, amount, chainId, dex = 'auto' } = params;

  if (dex === 'auto') {
    return getBestRoute(params);
  }

  const handler = DEX_HANDLERS[dex];
  if (!handler) {
    throw new Error(`Unknown DEX: ${dex}`);
  }

  return handler.getQuote(params);
}

/**
 * Get supported DEXes for a chain
 */
function getSupportedDexes(chainId) {
  const chain = getChain(chainId);
  if (!chain) return [];

  const dexes = [];

  if (chain.contracts?.uniswapV2Router) dexes.push('uniswapV2');
  if (chain.contracts?.uniswapV3Router) dexes.push('uniswapV3');
  if (chain.contracts?.sushiswapRouter) dexes.push('sushiswap');
  if (chain.contracts?.quickswapRouter) dexes.push('quickswap');
  if (chain.contracts?.pancakeswapRouter) dexes.push('pancakeswap');

  // Aggregator is always available
  dexes.push('aggregator');

  return dexes;
}

module.exports = {
  executeSwap,
  getQuote,
  getBestRoute,
  getSupportedDexes,
  calculateMinOutput,
  calculateActualSlippage,
};
