/**
 * Transaction Manager
 * Handles transaction building, submission, and tracking
 */

const { ethers } = require('ethers');
const { getProvider, getOptimalGasSettings, waitForTransaction } = require('./providers');
const { getChain, getExplorerTxUrl } = require('../config/chains');
const logger = require('../utils/logger');

// Transaction status tracking
const pendingTransactions = new Map();
const transactionHistory = [];
const MAX_HISTORY = 100;

// Transaction status enum
const TxStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  REPLACED: 'replaced',
};

/**
 * Build transaction with optimal gas settings
 */
async function buildTransaction(chainId, txParams, options = {}) {
  const gasSettings = await getOptimalGasSettings(chainId, options);

  const tx = {
    ...txParams,
    ...gasSettings,
    chainId,
  };

  // Estimate gas if not provided
  if (!tx.gasLimit && txParams.to && txParams.data) {
    try {
      const provider = getProvider(chainId);
      const estimated = await provider.estimateGas({
        from: txParams.from,
        to: txParams.to,
        data: txParams.data,
        value: txParams.value || 0,
      });
      // Add 20% buffer
      tx.gasLimit = estimated.mul(120).div(100);
    } catch (error) {
      logger.warn('Gas estimation failed, using default:', error.message);
    }
  }

  return tx;
}

/**
 * Send a transaction
 */
async function sendTransaction(signer, txParams, options = {}) {
  const chainId = await signer.getChainId();
  const from = await signer.getAddress();

  // Build transaction with gas settings
  const tx = await buildTransaction(chainId, { ...txParams, from }, options);

  logger.info(`Sending transaction on chain ${chainId}`, {
    from,
    to: tx.to,
    value: tx.value?.toString(),
  });

  // Send transaction
  const txResponse = await signer.sendTransaction(tx);

  // Track pending transaction
  const txRecord = {
    hash: txResponse.hash,
    chainId,
    from,
    to: tx.to,
    value: tx.value?.toString(),
    status: TxStatus.PENDING,
    submittedAt: Date.now(),
    nonce: txResponse.nonce,
  };

  pendingTransactions.set(txResponse.hash, txRecord);

  logger.info(`Transaction submitted: ${txResponse.hash}`);

  // Wait for confirmation if requested
  if (options.waitForConfirmation !== false) {
    try {
      const receipt = await waitForConfirmation(chainId, txResponse.hash, options.confirmations);
      return {
        ...txRecord,
        status: receipt.status === 1 ? TxStatus.CONFIRMED : TxStatus.FAILED,
        receipt,
        explorerUrl: getExplorerTxUrl(chainId, txResponse.hash),
      };
    } catch (error) {
      logger.error('Transaction failed:', error.message);
      txRecord.status = TxStatus.FAILED;
      txRecord.error = error.message;
      return txRecord;
    }
  }

  return {
    ...txRecord,
    explorerUrl: getExplorerTxUrl(chainId, txResponse.hash),
  };
}

/**
 * Wait for transaction confirmation
 */
async function waitForConfirmation(chainId, txHash, confirmations = 1, timeout = 120000) {
  const receipt = await waitForTransaction(chainId, txHash, confirmations, timeout);

  // Update pending transaction record
  const txRecord = pendingTransactions.get(txHash);
  if (txRecord) {
    txRecord.status = receipt.status === 1 ? TxStatus.CONFIRMED : TxStatus.FAILED;
    txRecord.confirmedAt = Date.now();
    txRecord.gasUsed = receipt.gasUsed.toString();
    txRecord.blockNumber = receipt.blockNumber;

    // Move to history
    pendingTransactions.delete(txHash);
    addToHistory(txRecord);
  }

  return receipt;
}

/**
 * Add transaction to history
 */
function addToHistory(txRecord) {
  transactionHistory.unshift(txRecord);
  if (transactionHistory.length > MAX_HISTORY) {
    transactionHistory.pop();
  }
}

/**
 * Get pending transactions
 */
function getPendingTransactions() {
  return Array.from(pendingTransactions.values());
}

/**
 * Get transaction history
 */
function getTransactionHistory(options = {}) {
  let history = [...transactionHistory];

  if (options.chainId) {
    history = history.filter(tx => tx.chainId === options.chainId);
  }

  if (options.status) {
    history = history.filter(tx => tx.status === options.status);
  }

  if (options.limit) {
    history = history.slice(0, options.limit);
  }

  return history;
}

/**
 * Cancel a pending transaction (by sending 0 ETH to self with higher gas)
 */
async function cancelTransaction(signer, txHash, options = {}) {
  const txRecord = pendingTransactions.get(txHash);
  if (!txRecord) {
    throw new Error('Transaction not found or already confirmed');
  }

  const from = await signer.getAddress();
  const chainId = await signer.getChainId();

  // Get current gas price and increase it
  const gasSettings = await getOptimalGasSettings(chainId, { speedMultiplier: 1.5 });

  const cancelTx = await signer.sendTransaction({
    to: from,
    value: 0,
    nonce: txRecord.nonce,
    ...gasSettings,
  });

  logger.info(`Cancellation transaction sent: ${cancelTx.hash}`);

  // Update original transaction status
  txRecord.status = TxStatus.REPLACED;
  txRecord.replacedBy = cancelTx.hash;

  return {
    originalTxHash: txHash,
    cancelTxHash: cancelTx.hash,
    status: 'cancellation_pending',
  };
}

/**
 * Speed up a pending transaction
 */
async function speedUpTransaction(signer, txHash, speedMultiplier = 1.3) {
  const provider = getProvider(await signer.getChainId());
  const txRecord = pendingTransactions.get(txHash);

  if (!txRecord) {
    throw new Error('Transaction not found or already confirmed');
  }

  // Get original transaction
  const originalTx = await provider.getTransaction(txHash);
  if (!originalTx) {
    throw new Error('Original transaction not found');
  }

  const chainId = await signer.getChainId();
  const gasSettings = await getOptimalGasSettings(chainId, { speedMultiplier });

  // Send replacement transaction with same nonce but higher gas
  const speedUpTx = await signer.sendTransaction({
    to: originalTx.to,
    value: originalTx.value,
    data: originalTx.data,
    nonce: originalTx.nonce,
    ...gasSettings,
  });

  logger.info(`Speed-up transaction sent: ${speedUpTx.hash}`);

  // Update tracking
  txRecord.status = TxStatus.REPLACED;
  txRecord.replacedBy = speedUpTx.hash;

  pendingTransactions.set(speedUpTx.hash, {
    ...txRecord,
    hash: speedUpTx.hash,
    status: TxStatus.PENDING,
    speedUpOf: txHash,
  });

  return {
    originalTxHash: txHash,
    newTxHash: speedUpTx.hash,
    status: 'speed_up_pending',
  };
}

/**
 * Simulate a transaction
 */
async function simulateTransaction(chainId, txParams) {
  const provider = getProvider(chainId);

  try {
    const result = await provider.call({
      to: txParams.to,
      data: txParams.data,
      value: txParams.value || 0,
      from: txParams.from,
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      reason: error.reason,
    };
  }
}

/**
 * Decode transaction error
 */
function decodeTransactionError(error) {
  const errorMessages = {
    'execution reverted': 'Transaction would fail on-chain',
    'insufficient funds': 'Not enough balance to cover gas + value',
    'nonce too low': 'Transaction nonce already used',
    'replacement fee too low': 'Gas price too low to replace pending transaction',
    'gas required exceeds allowance': 'Gas limit too low for transaction',
  };

  const message = error.message?.toLowerCase() || '';

  for (const [key, value] of Object.entries(errorMessages)) {
    if (message.includes(key)) {
      return value;
    }
  }

  return error.reason || error.message || 'Unknown transaction error';
}

/**
 * Get transaction status
 */
async function getTransactionStatus(chainId, txHash) {
  // Check pending first
  const pending = pendingTransactions.get(txHash);
  if (pending) {
    return { ...pending, status: TxStatus.PENDING };
  }

  // Check history
  const historical = transactionHistory.find(tx => tx.hash === txHash);
  if (historical) {
    return historical;
  }

  // Check on-chain
  const provider = getProvider(chainId);
  const receipt = await provider.getTransactionReceipt(txHash);

  if (receipt) {
    return {
      hash: txHash,
      chainId,
      status: receipt.status === 1 ? TxStatus.CONFIRMED : TxStatus.FAILED,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  // Transaction not found - might still be pending
  const tx = await provider.getTransaction(txHash);
  if (tx) {
    return {
      hash: txHash,
      chainId,
      status: TxStatus.PENDING,
      from: tx.from,
      to: tx.to,
      nonce: tx.nonce,
    };
  }

  throw new Error('Transaction not found');
}

module.exports = {
  TxStatus,
  buildTransaction,
  sendTransaction,
  waitForConfirmation,
  getPendingTransactions,
  getTransactionHistory,
  cancelTransaction,
  speedUpTransaction,
  simulateTransaction,
  decodeTransactionError,
  getTransactionStatus,
};
