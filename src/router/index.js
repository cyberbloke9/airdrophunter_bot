/**
 * Command Router
 * Routes parsed commands to appropriate handlers
 */

const ai = require('../ai');
const swapEngine = require('../engines/swap');
const transferEngine = require('../engines/transfer');
const airdropEngine = require('../engines/airdrop');
const web3Core = require('../core');
const validator = require('./validator');
const logger = require('../utils/logger');
const config = require('../config');

// Rate limiting state
const rateLimiter = new Map();

/**
 * Process a natural language command
 */
async function processCommand(input, context = {}) {
  const startTime = Date.now();
  const userId = context.userId || 'anonymous';

  logger.info('Processing command', { input, userId });

  try {
    // Check rate limits
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: rateCheck.retryAfter,
      };
    }

    // Parse the command using AI layer
    const parsed = await ai.processCommand(input, context);

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error,
        suggestions: parsed.suggestions,
      };
    }

    // If confirmation is required, return the confirmation prompt
    if (parsed.requiresConfirmation && !context.confirmed) {
      return {
        success: true,
        requiresConfirmation: true,
        confirmationMessage: parsed.confirmationMessage,
        command: parsed.command,
        intent: parsed.intent,
      };
    }

    // Validate the command
    const validation = await validator.validateCommand(parsed.command);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        warnings: validation.warnings,
      };
    }

    // Execute the command
    const result = await executeCommand(parsed.command, context);

    // Generate response
    const response = ai.generateResponse(result, parsed.command);

    const duration = Date.now() - startTime;
    logger.info('Command completed', { intent: parsed.intent, duration, success: result.success });

    return {
      success: result.success,
      intent: parsed.intent,
      response,
      result,
      duration,
    };
  } catch (error) {
    logger.error('Command processing error', { error: error.message });
    return {
      success: false,
      error: error.message,
      suggestions: ai.getSuggestions(input),
    };
  }
}

/**
 * Execute a validated command
 */
async function executeCommand(command, context = {}) {
  const { type, params, chainId, walletAddress } = command;

  logger.info('Executing command', { type, chainId });

  switch (type) {
    case 'SWAP':
      return swapEngine.executeSwap({
        ...params,
        chainId,
        walletAddress,
      });

    case 'TRANSFER':
      return transferEngine.executeTransfer({
        ...params,
        chainId,
        walletAddress,
      });

    case 'BATCH_TRANSFER':
      return transferEngine.executeBatchTransfer({
        ...params,
        chainId,
        walletAddress,
      });

    case 'BALANCE':
      return web3Core.getBalances({
        ...params,
        chainId,
        walletAddress: params.wallet || walletAddress,
      });

    case 'QUOTE':
      return swapEngine.getQuote({
        ...params,
        chainId,
      });

    case 'AIRDROP_CHECK':
      return airdropEngine.checkEligibility({
        ...params,
        walletAddress,
      });

    case 'GAS':
      return getGasInfo(chainId);

    case 'STATUS':
      return web3Core.transactions.getTransactionStatus(
        chainId,
        params.txHash
      );

    case 'HELP':
      return { success: true, help: true };

    default:
      throw new Error(`Unknown command type: ${type}`);
  }
}

/**
 * Get gas information for a chain
 */
async function getGasInfo(chainId) {
  const gasData = await web3Core.providers.getGasPrice(chainId);

  // Estimate costs for common operations
  const swapGas = 150000;
  const transferGas = 65000;

  const maxFee = gasData.maxFeePerGas || gasData.gasPrice;
  const swapCostWei = maxFee.mul(swapGas);
  const transferCostWei = maxFee.mul(transferGas);

  // Convert to ETH
  const { ethers } = require('ethers');
  const swapCostEth = parseFloat(ethers.utils.formatEther(swapCostWei));
  const transferCostEth = parseFloat(ethers.utils.formatEther(transferCostWei));

  // Rough USD estimate (would need price feed in production)
  const ethPrice = 2500; // Placeholder
  const swapCostUsd = (swapCostEth * ethPrice).toFixed(2);
  const transferCostUsd = (transferCostEth * ethPrice).toFixed(2);

  return {
    success: true,
    chainId,
    baseFee: ethers.utils.formatUnits(maxFee, 'gwei'),
    priorityFee: gasData.maxPriorityFeePerGas
      ? ethers.utils.formatUnits(gasData.maxPriorityFeePerGas, 'gwei')
      : 'N/A',
    swapCostEth: swapCostEth.toFixed(6),
    swapCostUsd,
    transferCostEth: transferCostEth.toFixed(6),
    transferCostUsd,
  };
}

/**
 * Check rate limits for a user
 */
function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = config.rateLimits.maxRequestsPerMinute;

  const userRequests = rateLimiter.get(userId) || [];

  // Clean old requests
  const recentRequests = userRequests.filter(t => now - t < windowMs);

  if (recentRequests.length >= maxRequests) {
    const oldestRequest = recentRequests[0];
    const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Add this request
  recentRequests.push(now);
  rateLimiter.set(userId, recentRequests);

  return { allowed: true };
}

/**
 * Execute a pre-built command (bypass parsing)
 */
async function executeDirectCommand(command, context = {}) {
  // Validate
  const validation = await validator.validateCommand(command);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Execute
  return executeCommand(command, context);
}

/**
 * Get command history for a user
 */
function getCommandHistory(userId, limit = 10) {
  // Would be stored in database in production
  return [];
}

/**
 * Cancel a pending command
 */
async function cancelPendingCommand(commandId) {
  // Would cancel pending confirmations
  return { success: true, cancelled: true };
}

module.exports = {
  processCommand,
  executeCommand,
  executeDirectCommand,
  checkRateLimit,
  getCommandHistory,
  cancelPendingCommand,
};
