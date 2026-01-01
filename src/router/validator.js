/**
 * Command Validator
 * Validates commands before execution
 */

const { ethers } = require('ethers');
const { getChain, isChainSupported } = require('../config/chains');
const { getToken, isNativeToken } = require('../config/tokens');
const { getWallet, hasSufficientBalance } = require('../core/wallets');
const { resolveAddress } = require('../core/providers');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Validate a command before execution
 */
async function validateCommand(command) {
  const errors = [];
  const warnings = [];

  // Validate chain
  if (command.chainId && !isChainSupported(command.chainId)) {
    errors.push(`Chain ${command.chainId} is not supported`);
  }

  // Validate wallet
  if (command.walletAddress) {
    const wallet = getWallet(command.walletAddress);
    if (!wallet) {
      errors.push(`Wallet "${command.walletAddress}" not found`);
    }
  }

  // Type-specific validation
  switch (command.type) {
    case 'SWAP':
      await validateSwapCommand(command, errors, warnings);
      break;

    case 'TRANSFER':
      await validateTransferCommand(command, errors, warnings);
      break;

    case 'BATCH_TRANSFER':
      await validateBatchTransferCommand(command, errors, warnings);
      break;

    case 'QUOTE':
      validateQuoteCommand(command, errors, warnings);
      break;

    default:
      // No specific validation needed
      break;
  }

  return {
    valid: errors.length === 0,
    error: errors.join('; '),
    errors,
    warnings,
  };
}

/**
 * Validate swap command
 */
async function validateSwapCommand(command, errors, warnings) {
  const { params, chainId, walletAddress } = command;

  // Validate tokens
  if (!params.fromToken) {
    errors.push('Source token not specified');
  }
  if (!params.toToken) {
    errors.push('Destination token not specified');
  }
  if (params.fromToken === params.toToken) {
    errors.push('Cannot swap a token for itself');
  }

  // Validate amount
  if (!params.amount || parseFloat(params.amount) <= 0) {
    errors.push('Invalid swap amount');
  }

  // Validate slippage
  if (params.slippage !== undefined) {
    if (params.slippage < 0 || params.slippage > 50) {
      errors.push('Slippage must be between 0% and 50%');
    }
    if (params.slippage > config.trading.maxSlippage) {
      warnings.push(`Slippage ${params.slippage}% is above recommended maximum`);
    }
    if (params.slippage > 5) {
      warnings.push('High slippage tolerance may result in unfavorable trades');
    }
  }

  // Check token existence on chain
  if (chainId && params.fromToken && !isNativeToken(params.fromToken)) {
    const token = getToken(params.fromToken, chainId);
    if (!token) {
      errors.push(`Token ${params.fromToken} not available on chain ${chainId}`);
    }
  }

  if (chainId && params.toToken && !isNativeToken(params.toToken)) {
    const token = getToken(params.toToken, chainId);
    if (!token) {
      errors.push(`Token ${params.toToken} not available on chain ${chainId}`);
    }
  }

  // Check balance (if wallet is configured)
  if (walletAddress && chainId && params.fromToken && params.amount) {
    try {
      const tokenInfo = isNativeToken(params.fromToken)
        ? { decimals: 18 }
        : getToken(params.fromToken, chainId);

      if (tokenInfo) {
        const amount = ethers.utils.parseUnits(params.amount, tokenInfo.decimals);
        const hasBalance = await hasSufficientBalance(
          walletAddress,
          chainId,
          amount,
          isNativeToken(params.fromToken) ? null : tokenInfo.address
        );

        if (!hasBalance) {
          errors.push(`Insufficient ${params.fromToken} balance`);
        }
      }
    } catch (error) {
      warnings.push('Could not verify balance');
    }
  }
}

/**
 * Validate transfer command
 */
async function validateTransferCommand(command, errors, warnings) {
  const { params, chainId, walletAddress } = command;

  // Validate token
  if (!params.token) {
    errors.push('Token not specified');
  }

  // Validate amount
  if (!params.amount || parseFloat(params.amount) <= 0) {
    errors.push('Invalid transfer amount');
  }

  // Validate recipient
  if (!params.to) {
    errors.push('Recipient address not specified');
  } else {
    try {
      const resolved = await resolveAddress(params.to, chainId || 1);
      if (!ethers.utils.isAddress(resolved)) {
        errors.push('Invalid recipient address');
      }
    } catch {
      errors.push(`Could not resolve recipient: ${params.to}`);
    }
  }

  // Check for self-transfer
  if (walletAddress && params.to) {
    try {
      const wallet = getWallet(walletAddress);
      const resolved = await resolveAddress(params.to, chainId || 1);
      if (wallet && wallet.address.toLowerCase() === resolved.toLowerCase()) {
        warnings.push('You are sending to your own address');
      }
    } catch {
      // Ignore resolution errors here
    }
  }

  // Check balance
  if (walletAddress && chainId && params.token && params.amount) {
    try {
      const tokenInfo = isNativeToken(params.token)
        ? { decimals: 18 }
        : getToken(params.token, chainId);

      if (tokenInfo) {
        const amount = ethers.utils.parseUnits(params.amount, tokenInfo.decimals);
        const hasBalance = await hasSufficientBalance(
          walletAddress,
          chainId,
          amount,
          isNativeToken(params.token) ? null : tokenInfo.address
        );

        if (!hasBalance) {
          errors.push(`Insufficient ${params.token} balance`);
        }
      }
    } catch (error) {
      warnings.push('Could not verify balance');
    }
  }
}

/**
 * Validate batch transfer command
 */
async function validateBatchTransferCommand(command, errors, warnings) {
  const { params, chainId } = command;

  // Validate token
  if (!params.token) {
    errors.push('Token not specified');
  }

  // Validate recipients
  if (!params.recipients || params.recipients.length === 0) {
    errors.push('No recipients specified');
  } else {
    // Validate each recipient
    const invalidRecipients = [];
    for (const recipient of params.recipients) {
      const addr = typeof recipient === 'string' ? recipient : recipient.address;
      try {
        await resolveAddress(addr, chainId || 1);
      } catch {
        invalidRecipients.push(addr);
      }
    }

    if (invalidRecipients.length > 0) {
      errors.push(`Invalid recipient addresses: ${invalidRecipients.join(', ')}`);
    }
  }

  // Validate amounts
  if (params.distribution === 'equal' && !params.totalAmount) {
    errors.push('Total amount required for equal distribution');
  }

  if (params.distribution === 'custom') {
    const missingAmounts = params.recipients?.filter(
      r => typeof r !== 'string' && !r.amount
    );
    if (missingAmounts?.length > 0) {
      errors.push('All recipients must have amounts for custom distribution');
    }
  }

  // Warn about large batch
  if (params.recipients?.length > 100) {
    warnings.push('Large batch transfer may require multiple transactions');
  }
}

/**
 * Validate quote command
 */
function validateQuoteCommand(command, errors, warnings) {
  const { params, chainId } = command;

  if (!params.fromToken) {
    errors.push('Source token not specified');
  }
  if (!params.toToken) {
    errors.push('Destination token not specified');
  }
  if (!params.amount || parseFloat(params.amount) <= 0) {
    errors.push('Invalid amount for quote');
  }

  // Validate tokens exist on chain
  if (chainId) {
    if (params.fromToken && !isNativeToken(params.fromToken)) {
      const token = getToken(params.fromToken, chainId);
      if (!token) {
        errors.push(`Token ${params.fromToken} not found on chain ${chainId}`);
      }
    }
    if (params.toToken && !isNativeToken(params.toToken)) {
      const token = getToken(params.toToken, chainId);
      if (!token) {
        errors.push(`Token ${params.toToken} not found on chain ${chainId}`);
      }
    }
  }
}

/**
 * Validate an address
 */
function validateAddress(address) {
  if (!address) {
    return { valid: false, error: 'Address is required' };
  }

  // ENS name
  if (address.endsWith('.eth')) {
    return { valid: true, type: 'ens' };
  }

  // Ethereum address
  if (ethers.utils.isAddress(address)) {
    return { valid: true, type: 'address' };
  }

  return { valid: false, error: 'Invalid address format' };
}

/**
 * Validate a token symbol
 */
function validateToken(symbol, chainId) {
  if (!symbol) {
    return { valid: false, error: 'Token symbol is required' };
  }

  if (isNativeToken(symbol)) {
    return { valid: true, type: 'native' };
  }

  const token = getToken(symbol, chainId);
  if (token) {
    return { valid: true, type: 'erc20', token };
  }

  return { valid: false, error: `Token ${symbol} not found` };
}

/**
 * Validate an amount
 */
function validateAmount(amount, decimals = 18) {
  if (!amount) {
    return { valid: false, error: 'Amount is required' };
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return { valid: false, error: 'Amount must be a positive number' };
  }

  // Check for too many decimals
  const decimalParts = amount.toString().split('.');
  if (decimalParts.length > 1 && decimalParts[1].length > decimals) {
    return {
      valid: false,
      error: `Amount has too many decimal places (max ${decimals})`,
    };
  }

  return { valid: true, amount: numAmount };
}

module.exports = {
  validateCommand,
  validateSwapCommand,
  validateTransferCommand,
  validateBatchTransferCommand,
  validateAddress,
  validateToken,
  validateAmount,
};
