/**
 * Scheduled Transfer Function
 * Executes daily automated token distributions
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
 * Handler for scheduled transfer execution
 */
const handler = async function (event, context) {
  logger.info('Scheduled transfer triggered');

  try {
    await ensureInitialized();

    // Get transfer configuration from environment
    const transferConfig = {
      token: process.env.TRANSFER_TOKEN || 'USDC',
      chainId: parseInt(process.env.TRANSFER_CHAIN_ID) || 1,
      walletAddress: 'primary',
    };

    // Check if distributing to all wallets
    const distributeToAll = process.env.DISTRIBUTE_TO_ALL === 'true';
    const totalAmount = process.env.TRANSFER_TOTAL_AMOUNT || process.env.TRANSFER_AMOUNT;

    let result;

    if (distributeToAll) {
      // Distribute to all configured wallets
      logger.info('Distributing to all wallets', {
        token: transferConfig.token,
        totalAmount,
      });

      result = await bot.transferEngine.distributeToWallets({
        token: transferConfig.token,
        totalAmount,
        chainId: transferConfig.chainId,
        fromWallet: 'primary',
        distribution: 'equal',
      });
    } else {
      // Transfer to specific addresses from environment
      const recipients = [];

      // Support up to 10 recipients from environment
      for (let i = 1; i <= 10; i++) {
        const address = process.env[`TRANSFER_RECIPIENT_${i}`];
        const amount = process.env[`TRANSFER_AMOUNT_${i}`] || process.env.TRANSFER_AMOUNT;

        if (address && amount) {
          recipients.push({ address, amount });
        }
      }

      if (recipients.length === 0) {
        // Fallback to legacy config (ACCOUNT_2, ACCOUNT_3)
        const { getWallet } = require('../../src/core/wallets');
        const wallet2 = getWallet('wallet2');
        const wallet3 = getWallet('wallet3');

        if (wallet2) {
          recipients.push({
            address: wallet2.address,
            amount: process.env.TRANSFER_AMOUNT,
          });
        }
        if (wallet3) {
          recipients.push({
            address: wallet3.address,
            amount: process.env.TRANSFER_AMOUNT,
          });
        }
      }

      if (recipients.length === 0) {
        throw new Error('No transfer recipients configured');
      }

      logger.info('Executing batch transfer', {
        token: transferConfig.token,
        recipientCount: recipients.length,
      });

      result = await bot.batchTransfer({
        token: transferConfig.token,
        recipients,
        chainId: transferConfig.chainId,
        walletAddress: 'primary',
        distribution: 'custom',
      });
    }

    // Send notification
    await notifications.notifyTransaction(result, {
      type: 'BATCH_TRANSFER',
      chainId: transferConfig.chainId,
    });

    if (result.success) {
      logger.info('Scheduled transfer completed', {
        recipientCount: result.recipientCount,
        totalAmount: result.totalAmount,
      });
    } else {
      logger.error('Scheduled transfer failed', result);
    }

    return {
      statusCode: result.success ? 200 : 500,
      body: JSON.stringify(result),
    };
  } catch (error) {
    logger.error('Scheduled transfer error:', error);

    // Notify about error
    await notifications.notifyError(error, { operation: 'scheduled-transfer' });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

// Schedule to run daily at 12:30 UTC
exports.handler = schedule('30 12 * * *', handler);
