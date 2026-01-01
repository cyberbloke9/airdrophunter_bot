/**
 * Scheduled Swap Function
 * Executes daily automated swaps
 */

const { schedule } = require('@netlify/functions');
const bot = require('../../src');
const notifications = require('../../src/services/notifications');
const logger = require('../../src/utils/logger');

// Initialize on cold start
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await bot.initialize();
    initialized = true;
  }
}

/**
 * Handler for scheduled swap execution
 */
const handler = async function (event, context) {
  logger.info('Scheduled swap triggered');

  try {
    await ensureInitialized();

    // Get swap configuration from environment
    const swapConfig = {
      fromToken: process.env.SWAP_FROM_TOKEN || 'ETH',
      toToken: process.env.SWAP_TO_TOKEN || 'USDC',
      amount: process.env.SWAP_AMOUNT || '0.01',
      chainId: parseInt(process.env.SWAP_CHAIN_ID) || 1,
      slippage: parseFloat(process.env.SWAP_SLIPPAGE) || 0.5,
      walletAddress: 'primary',
    };

    logger.info('Executing scheduled swap', swapConfig);

    // Execute swap
    const result = await bot.swap(swapConfig);

    // Send notification
    await notifications.notifyTransaction(result, {
      type: 'SWAP',
      chainId: swapConfig.chainId,
    });

    if (result.success) {
      logger.info('Scheduled swap completed', {
        txHash: result.txHash,
        amountOut: result.amountOut,
      });
    } else {
      logger.error('Scheduled swap failed', result);
    }

    return {
      statusCode: result.success ? 200 : 500,
      body: JSON.stringify(result),
    };
  } catch (error) {
    logger.error('Scheduled swap error:', error);

    // Notify about error
    await notifications.notifyError(error, { operation: 'scheduled-swap' });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

// Schedule to run daily at 12:00 UTC
exports.handler = schedule('@daily', handler);
