/**
 * Notification Service
 * Sends alerts via Discord, Telegram, and Webhooks
 */

const discord = require('./discord');
const telegram = require('./telegram');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Send a notification through all configured channels
 */
async function notify(message, options = {}) {
  const { type = 'info', channels = ['all'] } = options;
  const results = [];

  const shouldSend = (channel) =>
    channels.includes('all') || channels.includes(channel);

  // Discord
  if (config.notifications.discord.enabled && shouldSend('discord')) {
    try {
      await discord.send(message, { type });
      results.push({ channel: 'discord', success: true });
    } catch (error) {
      logger.error('Discord notification failed:', error.message);
      results.push({ channel: 'discord', success: false, error: error.message });
    }
  }

  // Telegram
  if (config.notifications.telegram.enabled && shouldSend('telegram')) {
    try {
      await telegram.send(message, { type });
      results.push({ channel: 'telegram', success: true });
    } catch (error) {
      logger.error('Telegram notification failed:', error.message);
      results.push({ channel: 'telegram', success: false, error: error.message });
    }
  }

  return results;
}

/**
 * Send transaction notification
 */
async function notifyTransaction(txResult, command) {
  const { success, txHash, explorerUrl } = txResult;

  const emoji = success ? '✅' : '❌';
  const status = success ? 'Success' : 'Failed';

  let message;
  switch (command.type) {
    case 'SWAP':
      message = `${emoji} **Swap ${status}**\n` +
        `${txResult.amountIn} ${txResult.fromToken} → ${txResult.amountOut || '?'} ${txResult.toToken}\n` +
        `Chain: ${command.chainId}\n` +
        (explorerUrl ? `[View Transaction](${explorerUrl})` : '');
      break;

    case 'TRANSFER':
      message = `${emoji} **Transfer ${status}**\n` +
        `Sent ${txResult.amount} ${txResult.token}\n` +
        `To: ${txResult.to}\n` +
        (explorerUrl ? `[View Transaction](${explorerUrl})` : '');
      break;

    case 'BATCH_TRANSFER':
      message = `${emoji} **Batch Transfer ${status}**\n` +
        `${txResult.totalAmount} ${txResult.token} to ${txResult.recipientCount} recipients\n` +
        (txResult.gasSavedPercent ? `Gas saved: ${txResult.gasSavedPercent}%\n` : '') +
        (explorerUrl ? `[View Transaction](${explorerUrl})` : '');
      break;

    default:
      message = `${emoji} **Transaction ${status}**\n` +
        (txHash ? `TX: ${txHash}\n` : '') +
        (explorerUrl ? `[View](${explorerUrl})` : '');
  }

  return notify(message, { type: success ? 'success' : 'error' });
}

/**
 * Send airdrop alert
 */
async function notifyAirdrop(airdropInfo) {
  const message = `🎁 **Airdrop Alert**\n` +
    `Protocol: ${airdropInfo.protocol}\n` +
    `Status: ${airdropInfo.eligible ? 'Eligible!' : 'Not eligible'}\n` +
    (airdropInfo.amount ? `Estimated: ${airdropInfo.amount}\n` : '') +
    (airdropInfo.claimUrl ? `[Claim Now](${airdropInfo.claimUrl})` : '');

  return notify(message, { type: 'alert' });
}

/**
 * Send error alert
 */
async function notifyError(error, context = {}) {
  const message = `⚠️ **Error Alert**\n` +
    `Error: ${error.message}\n` +
    (error.code ? `Code: ${error.code}\n` : '') +
    (context.operation ? `Operation: ${context.operation}\n` : '') +
    (context.txHash ? `TX: ${context.txHash}` : '');

  return notify(message, { type: 'error' });
}

/**
 * Send daily summary
 */
async function notifyDailySummary(summary) {
  const message = `📊 **Daily Summary**\n\n` +
    `Transactions: ${summary.transactionCount}\n` +
    `Swaps: ${summary.swapCount}\n` +
    `Transfers: ${summary.transferCount}\n` +
    `Total Gas Spent: ${summary.totalGasEth} ETH (~$${summary.totalGasUsd})\n` +
    (summary.errors > 0 ? `Errors: ${summary.errors}\n` : '') +
    `\nTop tokens traded: ${summary.topTokens?.join(', ') || 'None'}`;

  return notify(message, { type: 'info' });
}

/**
 * Send low balance alert
 */
async function notifyLowBalance(wallet, token, balance, threshold) {
  const message = `💸 **Low Balance Alert**\n` +
    `Wallet: ${wallet}\n` +
    `Token: ${token}\n` +
    `Balance: ${balance}\n` +
    `Threshold: ${threshold}`;

  return notify(message, { type: 'warning' });
}

/**
 * Send high gas alert
 */
async function notifyHighGas(chainId, gasPrice, threshold) {
  const { getChain } = require('../../config/chains');
  const chain = getChain(chainId);

  const message = `⛽ **High Gas Alert**\n` +
    `Chain: ${chain?.name || chainId}\n` +
    `Current: ${gasPrice} gwei\n` +
    `Threshold: ${threshold} gwei\n` +
    `Consider waiting for lower gas.`;

  return notify(message, { type: 'warning' });
}

/**
 * Get notification status
 */
function getStatus() {
  return {
    discord: {
      enabled: config.notifications.discord.enabled,
      configured: !!config.notifications.discord.webhookUrl,
    },
    telegram: {
      enabled: config.notifications.telegram.enabled,
      configured: !!config.notifications.telegram.botToken && !!config.notifications.telegram.chatId,
    },
  };
}

module.exports = {
  notify,
  notifyTransaction,
  notifyAirdrop,
  notifyError,
  notifyDailySummary,
  notifyLowBalance,
  notifyHighGas,
  getStatus,
};
