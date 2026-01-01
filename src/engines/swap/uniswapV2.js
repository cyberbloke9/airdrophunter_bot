/**
 * Uniswap V2 Handler
 * Handles swaps through Uniswap V2 and compatible DEXes
 */

const { ethers } = require('ethers');
const { getUniswapV2Router } = require('../../core/contracts');
const { getChain } = require('../../config/chains');
const { getToken, isNativeToken, getNativeToken, parseAmount, formatAmount, getWrappedNativeAddress } = require('../../config/tokens');
const { getProvider } = require('../../core/providers');
const logger = require('../../utils/logger');
const { createDeadline } = require('../../utils/helpers');

/**
 * Get a quote for a V2 swap
 */
async function getQuote(params) {
  const { fromToken, toToken, amount, chainId } = params;

  const chain = getChain(chainId);
  if (!chain?.contracts?.uniswapV2Router) {
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

    // Build path
    const wethAddress = getWrappedNativeAddress(chainId);
    let path;

    if (fromIsNative) {
      path = [wethAddress, toTokenInfo.address];
    } else if (toIsNative) {
      path = [fromTokenInfo.address, wethAddress];
    } else {
      // Token to token - route through WETH
      path = [fromTokenInfo.address, wethAddress, toTokenInfo.address];
    }

    // Get router and quote
    const router = getUniswapV2Router(chainId);
    const amountsOut = await router.getAmountsOut(amountIn, path);
    const amountOut = amountsOut[amountsOut.length - 1];

    // Calculate price impact (simplified - would need reserves for accurate)
    const priceImpact = 0; // TODO: Calculate from reserves

    return {
      dex: 'uniswapV2',
      fromToken,
      toToken,
      amountIn: formatAmount(amountIn, fromTokenInfo.decimals),
      amountInRaw: amountIn,
      amountOut: formatAmount(amountOut, toTokenInfo.decimals),
      amountOutRaw: amountOut,
      path,
      priceImpact,
      routerAddress: chain.contracts.uniswapV2Router,
      rate: (parseFloat(formatAmount(amountOut, toTokenInfo.decimals)) /
             parseFloat(amount)).toFixed(6),
    };
  } catch (error) {
    logger.warn('Uniswap V2 quote failed', { error: error.message });
    return null;
  }
}

/**
 * Execute a V2 swap
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
    path,
  } = params;

  const chain = getChain(chainId);
  const router = getUniswapV2Router(chainId, signer);
  const deadlineTimestamp = createDeadline(deadline);

  logger.info('Executing Uniswap V2 swap', {
    path: path.map(p => p.slice(0, 10)),
    amountIn: amountIn.toString(),
    minAmountOut: minAmountOut.toString(),
  });

  let tx;

  if (fromToken.isNative) {
    // ETH -> Token
    tx = await router.swapExactETHForTokens(
      minAmountOut,
      path,
      userAddress,
      deadlineTimestamp,
      { value: amountIn }
    );
  } else if (isNativeToken(toToken.symbol)) {
    // Token -> ETH
    tx = await router.swapExactTokensForETH(
      amountIn,
      minAmountOut,
      path,
      userAddress,
      deadlineTimestamp
    );
  } else {
    // Token -> Token
    tx = await router.swapExactTokensForTokens(
      amountIn,
      minAmountOut,
      path,
      userAddress,
      deadlineTimestamp
    );
  }

  logger.info('Swap transaction sent', { txHash: tx.hash });

  // Wait for confirmation
  const receipt = await tx.wait();

  // Parse swap event to get actual output
  let amountOut = null;
  try {
    const swapInterface = new ethers.utils.Interface([
      'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
    ]);

    for (const log of receipt.logs) {
      try {
        const parsed = swapInterface.parseLog(log);
        if (parsed.name === 'Swap') {
          amountOut = parsed.args.amount0Out.gt(0)
            ? parsed.args.amount0Out
            : parsed.args.amount1Out;
          break;
        }
      } catch {
        // Not a Swap event
      }
    }
  } catch (error) {
    logger.warn('Could not parse swap output', { error: error.message });
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
 * Check if a pair exists
 */
async function pairExists(tokenA, tokenB, chainId) {
  try {
    const router = getUniswapV2Router(chainId);
    const weth = await router.WETH();

    // Try to get amounts for a small value
    const path = [tokenA, tokenB];
    const testAmount = ethers.utils.parseEther('0.001');

    await router.getAmountsOut(testAmount, path);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getQuote,
  executeSwap,
  pairExists,
};
