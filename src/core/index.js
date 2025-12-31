/**
 * Web3 Core Engine
 * Central entry point for all blockchain operations
 */

const providers = require('./providers');
const wallets = require('./wallets');
const contracts = require('./contracts');
const transactions = require('./transactions');
const { getChain, getExplorerTxUrl, getExplorerAddressUrl } = require('../config/chains');
const { getToken, isNativeToken, getNativeToken, parseAmount, formatAmount } = require('../config/tokens');
const logger = require('../utils/logger');

/**
 * Initialize the Web3 Core Engine
 */
async function initialize() {
  logger.info('Initializing Web3 Core Engine...');

  // Initialize wallets
  const walletCount = wallets.initializeWallets();
  logger.info(`Initialized ${walletCount} wallets`);

  // Initialize providers and check health
  const providerHealth = await providers.initializeProviders();
  const healthyCount = providerHealth.filter(p => p.healthy).length;
  logger.info(`Providers initialized: ${healthyCount}/${providerHealth.length} healthy`);

  return {
    wallets: walletCount,
    providers: providerHealth,
  };
}

/**
 * Get status of the Web3 engine
 */
async function getStatus() {
  const walletAddresses = wallets.getAllWalletAddresses();
  const healthyProviders = providers.getHealthyProviders();
  const pendingTxs = transactions.getPendingTransactions();

  return {
    wallets: walletAddresses,
    providers: healthyProviders,
    pendingTransactions: pendingTxs.length,
  };
}

/**
 * Execute a swap operation
 */
async function executeSwap(params) {
  const {
    fromToken,
    toToken,
    amount,
    chainId,
    walletAddress = 'primary',
    slippage = 0.5,
    deadline = 10, // minutes
  } = params;

  logger.info('Executing swap', { fromToken, toToken, amount, chainId });

  // Get connected wallet
  const signer = wallets.getConnectedWallet(walletAddress, chainId);
  const userAddress = await signer.getAddress();

  // Resolve tokens
  const fromTokenInfo = isNativeToken(fromToken)
    ? { ...getNativeToken(chainId), isNative: true }
    : getToken(fromToken, chainId);

  const toTokenInfo = getToken(toToken, chainId);

  if (!fromTokenInfo || !toTokenInfo) {
    throw new Error('Invalid token(s) specified');
  }

  // Parse amount
  const amountIn = parseAmount(amount, fromTokenInfo.decimals);

  // Check balance
  const hasBalance = await wallets.hasSufficientBalance(
    walletAddress,
    chainId,
    amountIn,
    fromTokenInfo.isNative ? null : fromTokenInfo.address
  );

  if (!hasBalance) {
    throw new Error(`Insufficient ${fromToken} balance`);
  }

  // Get router contract
  const router = contracts.getUniswapV2Router(chainId, signer);
  const chain = getChain(chainId);

  // Build path
  const wethAddress = chain.contracts.weth || chain.contracts.wmatic || chain.contracts.wbnb;
  const path = fromTokenInfo.isNative
    ? [wethAddress, toTokenInfo.address]
    : [fromTokenInfo.address, wethAddress, toTokenInfo.address];

  // Get quote
  const amountsOut = await router.getAmountsOut(amountIn, path);
  const expectedOutput = amountsOut[amountsOut.length - 1];

  // Calculate minimum output with slippage
  const slippageBps = Math.floor(slippage * 100);
  const minOutput = expectedOutput.mul(10000 - slippageBps).div(10000);

  // Calculate deadline
  const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60;

  // Approve if needed (for token swaps)
  if (!fromTokenInfo.isNative) {
    await contracts.ensureApproval(
      fromTokenInfo.address,
      router.address,
      amountIn,
      signer,
      chainId
    );
  }

  // Execute swap
  let tx;
  if (fromTokenInfo.isNative) {
    tx = await router.swapExactETHForTokens(
      minOutput,
      path,
      userAddress,
      deadlineTimestamp,
      { value: amountIn }
    );
  } else if (isNativeToken(toToken)) {
    tx = await router.swapExactTokensForETH(
      amountIn,
      minOutput,
      path,
      userAddress,
      deadlineTimestamp
    );
  } else {
    tx = await router.swapExactTokensForTokens(
      amountIn,
      minOutput,
      path,
      userAddress,
      deadlineTimestamp
    );
  }

  // Wait for confirmation
  const receipt = await tx.wait();

  return {
    success: receipt.status === 1,
    txHash: tx.hash,
    explorerUrl: getExplorerTxUrl(chainId, tx.hash),
    fromToken,
    toToken,
    amountIn: formatAmount(amountIn, fromTokenInfo.decimals),
    expectedOutput: formatAmount(expectedOutput, toTokenInfo.decimals),
    minOutput: formatAmount(minOutput, toTokenInfo.decimals),
    gasUsed: receipt.gasUsed.toString(),
  };
}

/**
 * Execute a transfer operation
 */
async function executeTransfer(params) {
  const {
    token,
    amount,
    to,
    chainId,
    walletAddress = 'primary',
  } = params;

  logger.info('Executing transfer', { token, amount, to, chainId });

  // Get connected wallet
  const signer = wallets.getConnectedWallet(walletAddress, chainId);
  const fromAddress = await signer.getAddress();

  // Resolve recipient address (supports ENS)
  const toAddress = await providers.resolveAddress(to, chainId);

  // Check if native token transfer
  if (isNativeToken(token)) {
    const nativeToken = getNativeToken(chainId);
    const amountWei = parseAmount(amount, nativeToken.decimals);

    // Check balance
    const hasBalance = await wallets.hasSufficientBalance(walletAddress, chainId, amountWei);
    if (!hasBalance) {
      throw new Error(`Insufficient ${nativeToken.symbol} balance`);
    }

    // Send native token
    const result = await transactions.sendTransaction(signer, {
      to: toAddress,
      value: amountWei,
    });

    return {
      success: result.status === 'confirmed',
      txHash: result.hash,
      explorerUrl: result.explorerUrl,
      from: fromAddress,
      to: toAddress,
      amount: formatAmount(amountWei, nativeToken.decimals),
      token: nativeToken.symbol,
    };
  }

  // ERC20 transfer
  const tokenInfo = getToken(token, chainId);
  if (!tokenInfo) {
    throw new Error(`Token ${token} not found on chain ${chainId}`);
  }

  const amountRaw = parseAmount(amount, tokenInfo.decimals);

  // Check balance
  const hasBalance = await wallets.hasSufficientBalance(
    walletAddress,
    chainId,
    amountRaw,
    tokenInfo.address
  );
  if (!hasBalance) {
    throw new Error(`Insufficient ${tokenInfo.symbol} balance`);
  }

  // Get token contract
  const tokenContract = contracts.getERC20Contract(tokenInfo.address, chainId, signer);

  // Execute transfer
  const tx = await tokenContract.transfer(toAddress, amountRaw);
  const receipt = await tx.wait();

  return {
    success: receipt.status === 1,
    txHash: tx.hash,
    explorerUrl: getExplorerTxUrl(chainId, tx.hash),
    from: fromAddress,
    to: toAddress,
    amount: formatAmount(amountRaw, tokenInfo.decimals),
    token: tokenInfo.symbol,
    gasUsed: receipt.gasUsed.toString(),
  };
}

/**
 * Get wallet balances
 */
async function getBalances(params) {
  const { walletAddress = 'primary', chainId, tokens = [] } = params;

  const tokenAddresses = tokens.map(t => {
    const tokenInfo = getToken(t, chainId);
    return tokenInfo?.address;
  }).filter(Boolean);

  return wallets.getAllBalances(walletAddress, chainId, tokenAddresses);
}

/**
 * Get quote for a swap
 */
async function getSwapQuote(params) {
  const { fromToken, toToken, amount, chainId } = params;

  const fromTokenInfo = isNativeToken(fromToken)
    ? { ...getNativeToken(chainId), isNative: true }
    : getToken(fromToken, chainId);

  const toTokenInfo = getToken(toToken, chainId);

  if (!fromTokenInfo || !toTokenInfo) {
    throw new Error('Invalid token(s) specified');
  }

  const amountIn = parseAmount(amount, fromTokenInfo.decimals);
  const router = contracts.getUniswapV2Router(chainId);
  const chain = getChain(chainId);

  const wethAddress = chain.contracts.weth || chain.contracts.wmatic || chain.contracts.wbnb;
  const path = fromTokenInfo.isNative
    ? [wethAddress, toTokenInfo.address]
    : [fromTokenInfo.address, wethAddress, toTokenInfo.address];

  try {
    const amountsOut = await router.getAmountsOut(amountIn, path);
    const expectedOutput = amountsOut[amountsOut.length - 1];

    // Calculate price impact (simplified)
    const priceImpact = 0; // Would need reserves for accurate calculation

    return {
      fromToken,
      toToken,
      amountIn: formatAmount(amountIn, fromTokenInfo.decimals),
      amountOut: formatAmount(expectedOutput, toTokenInfo.decimals),
      path: path.map(addr => addr.slice(0, 10) + '...'),
      priceImpact,
      rate: (parseFloat(formatAmount(expectedOutput, toTokenInfo.decimals)) /
             parseFloat(amount)).toFixed(6),
    };
  } catch (error) {
    throw new Error(`Unable to get quote: ${error.message}`);
  }
}

module.exports = {
  initialize,
  getStatus,
  executeSwap,
  executeTransfer,
  getBalances,
  getSwapQuote,
  // Re-export submodules
  providers,
  wallets,
  contracts,
  transactions,
};
