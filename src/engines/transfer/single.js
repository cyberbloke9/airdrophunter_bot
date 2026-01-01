/**
 * Single Transfer Handler
 * Handles individual token transfers
 */

const { ethers } = require('ethers');
const { getToken, isNativeToken, getNativeToken, parseAmount, formatAmount } = require('../../config/tokens');
const { getConnectedWallet, hasSufficientBalance } = require('../../core/wallets');
const { resolveAddress } = require('../../core/providers');
const { getERC20Contract } = require('../../core/contracts');
const { sendTransaction } = require('../../core/transactions');
const { getExplorerTxUrl } = require('../../config/chains');
const logger = require('../../utils/logger');
const { InsufficientBalanceError } = require('../../utils/errors');

/**
 * Transfer native token (ETH, MATIC, BNB)
 */
async function transferNative(params) {
  const { amount, to, chainId, walletAddress } = params;

  const nativeToken = getNativeToken(chainId);
  const amountWei = parseAmount(amount, nativeToken.decimals);

  // Get signer
  const signer = getConnectedWallet(walletAddress, chainId);
  const fromAddress = await signer.getAddress();

  // Resolve recipient (supports ENS)
  const toAddress = await resolveAddress(to, chainId);

  // Check balance
  const hasBalance = await hasSufficientBalance(walletAddress, chainId, amountWei);
  if (!hasBalance) {
    throw new InsufficientBalanceError(nativeToken.symbol, amount, 'insufficient');
  }

  logger.info('Transferring native token', {
    from: fromAddress,
    to: toAddress,
    amount,
    symbol: nativeToken.symbol,
  });

  // Execute transfer
  const result = await sendTransaction(signer, {
    to: toAddress,
    value: amountWei,
  });

  return {
    success: result.status === 'confirmed',
    txHash: result.hash,
    explorerUrl: getExplorerTxUrl(chainId, result.hash),
    from: fromAddress,
    to: toAddress,
    amount: formatAmount(amountWei, nativeToken.decimals),
    token: nativeToken.symbol,
    gasUsed: result.receipt?.gasUsed?.toString(),
  };
}

/**
 * Transfer ERC20 token
 */
async function transferERC20(params) {
  const { token, amount, to, chainId, walletAddress } = params;

  // Get token info
  const tokenInfo = getToken(token, chainId);
  if (!tokenInfo) {
    throw new Error(`Token ${token} not found on chain ${chainId}`);
  }

  const amountRaw = parseAmount(amount, tokenInfo.decimals);

  // Get signer
  const signer = getConnectedWallet(walletAddress, chainId);
  const fromAddress = await signer.getAddress();

  // Resolve recipient (supports ENS)
  const toAddress = await resolveAddress(to, chainId);

  // Check balance
  const hasBalance = await hasSufficientBalance(
    walletAddress,
    chainId,
    amountRaw,
    tokenInfo.address
  );
  if (!hasBalance) {
    throw new InsufficientBalanceError(tokenInfo.symbol, amount, 'insufficient');
  }

  logger.info('Transferring ERC20 token', {
    from: fromAddress,
    to: toAddress,
    amount,
    symbol: tokenInfo.symbol,
    tokenAddress: tokenInfo.address,
  });

  // Get token contract
  const tokenContract = getERC20Contract(tokenInfo.address, chainId, signer);

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
    tokenAddress: tokenInfo.address,
    gasUsed: receipt.gasUsed.toString(),
  };
}

/**
 * Execute a transfer (auto-detect native vs ERC20)
 */
async function transfer(params) {
  const { token, amount, to, chainId, walletAddress = 'primary' } = params;

  if (isNativeToken(token)) {
    return transferNative({ amount, to, chainId, walletAddress });
  }

  return transferERC20({ token, amount, to, chainId, walletAddress });
}

module.exports = {
  transfer,
  transferNative,
  transferERC20,
};
