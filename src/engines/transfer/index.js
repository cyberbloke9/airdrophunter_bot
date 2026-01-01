/**
 * Transfer Engine
 * Handles single and batch token transfers
 */

const { ethers } = require('ethers');
const single = require('./single');
const batch = require('./batch');
const { getChain, getExplorerTxUrl } = require('../../config/chains');
const { getToken, isNativeToken, getNativeToken, parseAmount, formatAmount } = require('../../config/tokens');
const { getConnectedWallet, getAllWalletAddresses, hasSufficientBalance, resolveWalletIdentifier } = require('../../core/wallets');
const { resolveAddress } = require('../../core/providers');
const logger = require('../../utils/logger');

/**
 * Execute a single transfer
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

  return single.transfer({
    token,
    amount,
    to,
    chainId,
    walletAddress,
  });
}

/**
 * Execute batch transfers (one-to-many)
 */
async function executeBatchTransfer(params) {
  const {
    token,
    recipients, // Array of { address, amount } or { address } for equal distribution
    totalAmount, // Total amount to distribute (for equal distribution)
    chainId,
    walletAddress = 'primary',
    distribution = 'equal', // 'equal' or 'custom'
  } = params;

  logger.info('Executing batch transfer', {
    token,
    recipientCount: recipients.length,
    distribution,
    chainId,
  });

  // Calculate amounts for each recipient
  let transferList;

  if (distribution === 'equal') {
    const amountPerRecipient = parseFloat(totalAmount) / recipients.length;
    transferList = recipients.map(r => ({
      address: typeof r === 'string' ? r : r.address,
      amount: amountPerRecipient.toString(),
    }));
  } else {
    transferList = recipients.map(r => ({
      address: r.address,
      amount: r.amount,
    }));
  }

  // Resolve all addresses (support ENS)
  const resolvedTransfers = await Promise.all(
    transferList.map(async (t) => ({
      address: await resolveAddress(t.address, chainId),
      amount: t.amount,
    }))
  );

  return batch.batchTransfer({
    token,
    transfers: resolvedTransfers,
    chainId,
    walletAddress,
  });
}

/**
 * Distribute tokens to all configured wallets
 */
async function distributeToWallets(params) {
  const {
    token,
    totalAmount,
    chainId,
    fromWallet = 'primary',
    excludeWallets = [], // Wallets to exclude
    distribution = 'equal',
  } = params;

  logger.info('Distributing to configured wallets', { token, totalAmount });

  // Get all wallets except the source and excluded
  const allWallets = getAllWalletAddresses();
  const sourceAddress = resolveWalletIdentifier(fromWallet);

  const targetWallets = allWallets.filter(w =>
    w.address.toLowerCase() !== sourceAddress?.toLowerCase() &&
    !excludeWallets.includes(w.alias) &&
    !excludeWallets.includes(w.address.toLowerCase())
  );

  if (targetWallets.length === 0) {
    throw new Error('No target wallets available for distribution');
  }

  return executeBatchTransfer({
    token,
    recipients: targetWallets.map(w => ({ address: w.address })),
    totalAmount,
    chainId,
    walletAddress: fromWallet,
    distribution,
  });
}

/**
 * Get transfer history (from transaction manager)
 */
function getTransferHistory(options = {}) {
  const { getTransactionHistory } = require('../../core/transactions');
  return getTransactionHistory(options);
}

/**
 * Estimate gas for a transfer
 */
async function estimateTransferGas(params) {
  const { token, amount, to, chainId, walletAddress = 'primary' } = params;

  const signer = getConnectedWallet(walletAddress, chainId);
  const toAddress = await resolveAddress(to, chainId);

  if (isNativeToken(token)) {
    const nativeToken = getNativeToken(chainId);
    const amountWei = parseAmount(amount, nativeToken.decimals);

    const gasEstimate = await signer.estimateGas({
      to: toAddress,
      value: amountWei,
    });

    return {
      gasEstimate: gasEstimate.toString(),
      token: nativeToken.symbol,
    };
  }

  // ERC20 transfer
  const tokenInfo = getToken(token, chainId);
  if (!tokenInfo) {
    throw new Error(`Token ${token} not found on chain ${chainId}`);
  }

  const { getERC20Contract } = require('../../core/contracts');
  const tokenContract = getERC20Contract(tokenInfo.address, chainId, signer);
  const amountRaw = parseAmount(amount, tokenInfo.decimals);

  const gasEstimate = await tokenContract.estimateGas.transfer(toAddress, amountRaw);

  return {
    gasEstimate: gasEstimate.toString(),
    token: tokenInfo.symbol,
  };
}

/**
 * Validate a transfer before execution
 */
async function validateTransfer(params) {
  const { token, amount, to, chainId, walletAddress = 'primary' } = params;

  const errors = [];
  const warnings = [];

  // Validate recipient address
  try {
    await resolveAddress(to, chainId);
  } catch {
    errors.push(`Invalid recipient address: ${to}`);
  }

  // Check balance
  const tokenInfo = isNativeToken(token)
    ? { ...getNativeToken(chainId), decimals: 18 }
    : getToken(token, chainId);

  if (!tokenInfo) {
    errors.push(`Token ${token} not found on chain ${chainId}`);
  } else {
    const amountRaw = parseAmount(amount, tokenInfo.decimals);
    const hasBalance = await hasSufficientBalance(
      walletAddress,
      chainId,
      amountRaw,
      isNativeToken(token) ? null : tokenInfo.address
    );

    if (!hasBalance) {
      errors.push(`Insufficient ${token} balance`);
    }
  }

  // Check if sending to self
  const signer = getConnectedWallet(walletAddress, chainId);
  const fromAddress = await signer.getAddress();
  const toAddress = await resolveAddress(to, chainId).catch(() => null);

  if (toAddress && fromAddress.toLowerCase() === toAddress.toLowerCase()) {
    warnings.push('Sending to your own address');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

module.exports = {
  executeTransfer,
  executeBatchTransfer,
  distributeToWallets,
  getTransferHistory,
  estimateTransferGas,
  validateTransfer,
  // Re-export submodules
  single,
  batch,
};
