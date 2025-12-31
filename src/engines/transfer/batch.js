/**
 * Batch Transfer Handler
 * Handles multi-recipient transfers with gas optimization
 */

const { ethers } = require('ethers');
const { getToken, isNativeToken, getNativeToken, parseAmount, formatAmount } = require('../../config/tokens');
const { getConnectedWallet, hasSufficientBalance } = require('../../core/wallets');
const { getERC20Contract, getMulticall3 } = require('../../core/contracts');
const { getExplorerTxUrl, getChain } = require('../../config/chains');
const logger = require('../../utils/logger');
const { InsufficientBalanceError } = require('../../utils/errors');

/**
 * Execute batch ERC20 transfers using multicall
 */
async function batchTransferERC20(params) {
  const { token, transfers, chainId, walletAddress } = params;

  // Get token info
  const tokenInfo = getToken(token, chainId);
  if (!tokenInfo) {
    throw new Error(`Token ${token} not found on chain ${chainId}`);
  }

  // Calculate total amount
  const totalAmount = transfers.reduce((sum, t) => {
    return sum.add(parseAmount(t.amount, tokenInfo.decimals));
  }, ethers.BigNumber.from(0));

  // Get signer
  const signer = getConnectedWallet(walletAddress, chainId);
  const fromAddress = await signer.getAddress();

  // Check balance
  const hasBalance = await hasSufficientBalance(
    walletAddress,
    chainId,
    totalAmount,
    tokenInfo.address
  );
  if (!hasBalance) {
    throw new InsufficientBalanceError(
      tokenInfo.symbol,
      formatAmount(totalAmount, tokenInfo.decimals),
      'insufficient'
    );
  }

  logger.info('Executing batch ERC20 transfer', {
    token: tokenInfo.symbol,
    recipientCount: transfers.length,
    totalAmount: formatAmount(totalAmount, tokenInfo.decimals),
  });

  // Try to use multicall if available
  const chain = getChain(chainId);
  if (chain?.contracts?.multicall3) {
    return batchTransferWithMulticall({
      tokenInfo,
      transfers,
      chainId,
      signer,
      fromAddress,
    });
  }

  // Fallback to sequential transfers
  return batchTransferSequential({
    tokenInfo,
    transfers,
    chainId,
    signer,
    fromAddress,
  });
}

/**
 * Batch transfer using Multicall3
 */
async function batchTransferWithMulticall(params) {
  const { tokenInfo, transfers, chainId, signer, fromAddress } = params;

  const tokenContract = getERC20Contract(tokenInfo.address, chainId);
  const multicall = getMulticall3(chainId, signer);

  // Encode all transfer calls
  const calls = transfers.map(t => ({
    target: tokenInfo.address,
    allowFailure: false,
    callData: tokenContract.interface.encodeFunctionData('transfer', [
      t.address,
      parseAmount(t.amount, tokenInfo.decimals),
    ]),
  }));

  logger.info('Executing multicall batch transfer', { callCount: calls.length });

  // Execute multicall
  const tx = await multicall.aggregate3(calls);
  const receipt = await tx.wait();

  // Calculate gas saved vs individual transfers
  const estimatedIndividualGas = 65000 * transfers.length; // Approximate gas per transfer
  const actualGas = receipt.gasUsed.toNumber();
  const gasSaved = ((estimatedIndividualGas - actualGas) / estimatedIndividualGas * 100).toFixed(1);

  return {
    success: receipt.status === 1,
    txHash: tx.hash,
    explorerUrl: getExplorerTxUrl(chainId, tx.hash),
    from: fromAddress,
    transfers: transfers.map(t => ({
      to: t.address,
      amount: t.amount,
    })),
    token: tokenInfo.symbol,
    totalAmount: formatAmount(
      transfers.reduce((sum, t) => sum.add(parseAmount(t.amount, tokenInfo.decimals)), ethers.BigNumber.from(0)),
      tokenInfo.decimals
    ),
    recipientCount: transfers.length,
    gasUsed: receipt.gasUsed.toString(),
    gasSavedPercent: gasSaved,
    method: 'multicall',
  };
}

/**
 * Sequential batch transfer (fallback)
 */
async function batchTransferSequential(params) {
  const { tokenInfo, transfers, chainId, signer, fromAddress } = params;

  const tokenContract = getERC20Contract(tokenInfo.address, chainId, signer);
  const results = [];
  let totalGasUsed = ethers.BigNumber.from(0);

  logger.info('Executing sequential batch transfer', { transferCount: transfers.length });

  for (const transfer of transfers) {
    try {
      const amount = parseAmount(transfer.amount, tokenInfo.decimals);
      const tx = await tokenContract.transfer(transfer.address, amount);
      const receipt = await tx.wait();

      results.push({
        to: transfer.address,
        amount: transfer.amount,
        txHash: tx.hash,
        success: receipt.status === 1,
        gasUsed: receipt.gasUsed.toString(),
      });

      totalGasUsed = totalGasUsed.add(receipt.gasUsed);
    } catch (error) {
      results.push({
        to: transfer.address,
        amount: transfer.amount,
        success: false,
        error: error.message,
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return {
    success: successCount === transfers.length,
    partialSuccess: successCount > 0 && successCount < transfers.length,
    from: fromAddress,
    transfers: results,
    token: tokenInfo.symbol,
    totalAmount: formatAmount(
      transfers.reduce((sum, t) => sum.add(parseAmount(t.amount, tokenInfo.decimals)), ethers.BigNumber.from(0)),
      tokenInfo.decimals
    ),
    recipientCount: transfers.length,
    successCount,
    failedCount: transfers.length - successCount,
    totalGasUsed: totalGasUsed.toString(),
    method: 'sequential',
  };
}

/**
 * Batch transfer native tokens
 */
async function batchTransferNative(params) {
  const { transfers, chainId, walletAddress } = params;

  const nativeToken = getNativeToken(chainId);

  // Calculate total amount
  const totalAmount = transfers.reduce((sum, t) => {
    return sum.add(parseAmount(t.amount, nativeToken.decimals));
  }, ethers.BigNumber.from(0));

  // Get signer
  const signer = getConnectedWallet(walletAddress, chainId);
  const fromAddress = await signer.getAddress();

  // Check balance
  const hasBalance = await hasSufficientBalance(walletAddress, chainId, totalAmount);
  if (!hasBalance) {
    throw new InsufficientBalanceError(
      nativeToken.symbol,
      formatAmount(totalAmount, nativeToken.decimals),
      'insufficient'
    );
  }

  logger.info('Executing batch native transfer', {
    symbol: nativeToken.symbol,
    recipientCount: transfers.length,
    totalAmount: formatAmount(totalAmount, nativeToken.decimals),
  });

  // Try multicall with value
  const chain = getChain(chainId);
  if (chain?.contracts?.multicall3) {
    return batchTransferNativeWithMulticall({
      nativeToken,
      transfers,
      chainId,
      signer,
      fromAddress,
      totalAmount,
    });
  }

  // Fallback to sequential
  return batchTransferNativeSequential({
    nativeToken,
    transfers,
    chainId,
    signer,
    fromAddress,
  });
}

/**
 * Batch native transfer with Multicall3
 */
async function batchTransferNativeWithMulticall(params) {
  const { nativeToken, transfers, chainId, signer, fromAddress, totalAmount } = params;

  const multicall = getMulticall3(chainId, signer);

  // Build calls with value
  const calls = transfers.map(t => ({
    target: t.address,
    allowFailure: false,
    value: parseAmount(t.amount, nativeToken.decimals),
    callData: '0x', // Empty calldata for simple ETH transfer
  }));

  const tx = await multicall.aggregate3Value(calls, { value: totalAmount });
  const receipt = await tx.wait();

  return {
    success: receipt.status === 1,
    txHash: tx.hash,
    explorerUrl: getExplorerTxUrl(chainId, tx.hash),
    from: fromAddress,
    transfers: transfers.map(t => ({
      to: t.address,
      amount: t.amount,
    })),
    token: nativeToken.symbol,
    totalAmount: formatAmount(totalAmount, nativeToken.decimals),
    recipientCount: transfers.length,
    gasUsed: receipt.gasUsed.toString(),
    method: 'multicall',
  };
}

/**
 * Sequential native transfer
 */
async function batchTransferNativeSequential(params) {
  const { nativeToken, transfers, chainId, signer, fromAddress } = params;

  const results = [];
  let totalGasUsed = ethers.BigNumber.from(0);

  for (const transfer of transfers) {
    try {
      const amount = parseAmount(transfer.amount, nativeToken.decimals);
      const tx = await signer.sendTransaction({
        to: transfer.address,
        value: amount,
      });
      const receipt = await tx.wait();

      results.push({
        to: transfer.address,
        amount: transfer.amount,
        txHash: tx.hash,
        success: receipt.status === 1,
        gasUsed: receipt.gasUsed.toString(),
      });

      totalGasUsed = totalGasUsed.add(receipt.gasUsed);
    } catch (error) {
      results.push({
        to: transfer.address,
        amount: transfer.amount,
        success: false,
        error: error.message,
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return {
    success: successCount === transfers.length,
    partialSuccess: successCount > 0 && successCount < transfers.length,
    from: fromAddress,
    transfers: results,
    token: nativeToken.symbol,
    recipientCount: transfers.length,
    successCount,
    failedCount: transfers.length - successCount,
    totalGasUsed: totalGasUsed.toString(),
    method: 'sequential',
  };
}

/**
 * Execute batch transfer (auto-detect token type)
 */
async function batchTransfer(params) {
  const { token, transfers, chainId, walletAddress = 'primary' } = params;

  if (isNativeToken(token)) {
    return batchTransferNative({ transfers, chainId, walletAddress });
  }

  return batchTransferERC20({ token, transfers, chainId, walletAddress });
}

module.exports = {
  batchTransfer,
  batchTransferERC20,
  batchTransferNative,
  batchTransferWithMulticall,
  batchTransferSequential,
};
