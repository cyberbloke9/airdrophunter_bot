/**
 * Uniswap V3 Handler
 * Handles swaps through Uniswap V3 with concentrated liquidity
 */

const { ethers } = require('ethers');
const { getUniswapV3Router, getUniswapV3Quoter } = require('../../core/contracts');
const { getChain } = require('../../config/chains');
const { getToken, isNativeToken, getNativeToken, parseAmount, formatAmount, getWrappedNativeAddress } = require('../../config/tokens');
const logger = require('../../utils/logger');
const { createDeadline } = require('../../utils/helpers');

// Common fee tiers in V3
const FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

/**
 * Get a quote for a V3 swap
 */
async function getQuote(params) {
  const { fromToken, toToken, amount, chainId } = params;

  const chain = getChain(chainId);
  if (!chain?.contracts?.uniswapV3Router || !chain?.contracts?.uniswapV3Quoter) {
    return null;
  }

  try {
    // Resolve tokens
    const fromIsNative = isNativeToken(fromToken);
    const toIsNative = isNativeToken(toToken);

    const fromTokenInfo = fromIsNative
      ? { ...getNativeToken(chainId), decimals: 18 }
      : getToken(fromToken, chainId);

    const toTokenInfo = toIsNative
      ? { ...getNativeToken(chainId), decimals: 18 }
      : getToken(toToken, chainId);

    if (!fromTokenInfo || !toTokenInfo) {
      return null;
    }

    // Parse amount
    const amountIn = parseAmount(amount, fromTokenInfo.decimals);

    // Get addresses
    const wethAddress = getWrappedNativeAddress(chainId);
    const tokenIn = fromIsNative ? wethAddress : fromTokenInfo.address;
    const tokenOut = toIsNative ? wethAddress : toTokenInfo.address;

    // Try different fee tiers to find best quote
    const quoter = getUniswapV3Quoter(chainId);
    let bestQuote = null;
    let bestFee = null;

    for (const fee of FEE_TIERS) {
      try {
        const amountOut = await quoter.callStatic.quoteExactInputSingle(
          tokenIn,
          tokenOut,
          fee,
          amountIn,
          0 // sqrtPriceLimitX96 - no limit
        );

        if (!bestQuote || amountOut.gt(bestQuote)) {
          bestQuote = amountOut;
          bestFee = fee;
        }
      } catch {
        // This fee tier might not have liquidity
        continue;
      }
    }

    if (!bestQuote) {
      return null;
    }

    return {
      dex: 'uniswapV3',
      fromToken,
      toToken,
      amountIn: formatAmount(amountIn, fromTokenInfo.decimals),
      amountInRaw: amountIn,
      amountOut: formatAmount(bestQuote, toTokenInfo.decimals),
      amountOutRaw: bestQuote,
      fee: bestFee,
      feeTier: `${bestFee / 10000}%`,
      path: [tokenIn, tokenOut],
      priceImpact: 0, // Would need pool state for accurate calculation
      routerAddress: chain.contracts.uniswapV3Router,
      rate: (parseFloat(formatAmount(bestQuote, toTokenInfo.decimals)) /
             parseFloat(amount)).toFixed(6),
    };
  } catch (error) {
    logger.warn('Uniswap V3 quote failed', { error: error.message });
    return null;
  }
}

/**
 * Execute a V3 swap
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
    deadline = 10,
    fee = 3000, // Default to 0.3%
  } = params;

  const chain = getChain(chainId);
  const router = getUniswapV3Router(chainId, signer);
  const deadlineTimestamp = createDeadline(deadline);

  // Get addresses
  const wethAddress = getWrappedNativeAddress(chainId);
  const tokenIn = fromToken.isNative ? wethAddress : fromToken.address;
  const tokenOut = isNativeToken(toToken.symbol) ? wethAddress : toToken.address;

  logger.info('Executing Uniswap V3 swap', {
    tokenIn: tokenIn.slice(0, 10),
    tokenOut: tokenOut.slice(0, 10),
    fee,
    amountIn: amountIn.toString(),
  });

  // Build swap params
  const swapParams = {
    tokenIn,
    tokenOut,
    fee,
    recipient: userAddress,
    deadline: deadlineTimestamp,
    amountIn,
    amountOutMinimum: minAmountOut,
    sqrtPriceLimitX96: 0,
  };

  let tx;

  if (fromToken.isNative) {
    // ETH -> Token
    tx = await router.exactInputSingle(swapParams, { value: amountIn });
  } else {
    // Token -> Token or Token -> ETH
    tx = await router.exactInputSingle(swapParams);
  }

  logger.info('V3 Swap transaction sent', { txHash: tx.hash });

  // Wait for confirmation
  const receipt = await tx.wait();

  // Parse swap event to get actual output
  let amountOut = null;
  try {
    const swapInterface = new ethers.utils.Interface([
      'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
    ]);

    for (const log of receipt.logs) {
      try {
        const parsed = swapInterface.parseLog(log);
        if (parsed.name === 'Swap') {
          // The output amount is the positive value
          const amount0 = parsed.args.amount0;
          const amount1 = parsed.args.amount1;
          amountOut = amount0.gt(0) ? amount0 : amount1.abs();
          break;
        }
      } catch {
        // Not a Swap event
      }
    }
  } catch (error) {
    logger.warn('Could not parse V3 swap output', { error: error.message });
  }

  return {
    success: receipt.status === 1,
    txHash: tx.hash,
    gasUsed: receipt.gasUsed.toString(),
    amountOut,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Find the best fee tier for a pair
 */
async function findBestFeeTier(tokenA, tokenB, chainId) {
  const quoter = getUniswapV3Quoter(chainId);
  const testAmount = ethers.utils.parseEther('1');

  let bestFee = null;
  let bestLiquidity = ethers.BigNumber.from(0);

  for (const fee of FEE_TIERS) {
    try {
      const quote = await quoter.callStatic.quoteExactInputSingle(
        tokenA,
        tokenB,
        fee,
        testAmount,
        0
      );

      if (quote.gt(bestLiquidity)) {
        bestLiquidity = quote;
        bestFee = fee;
      }
    } catch {
      continue;
    }
  }

  return bestFee;
}

module.exports = {
  getQuote,
  executeSwap,
  findBestFeeTier,
  FEE_TIERS,
};
