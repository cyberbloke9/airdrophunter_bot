/**
 * Discord Notification Service
 * Sends messages via Discord webhooks
 */

const https = require('https');
const config = require('../../config');
const logger = require('../../utils/logger');

// Message colors for different types
const COLORS = {
  info: 0x3498db,    // Blue
  success: 0x2ecc71, // Green
  warning: 0xf39c12, // Orange
  error: 0xe74c3c,   // Red
  alert: 0x9b59b6,   // Purple
};

/**
 * Send a message to Discord webhook
 */
async function send(message, options = {}) {
  const { type = 'info', title = null, fields = [] } = options;
  const webhookUrl = config.notifications.discord.webhookUrl;

  if (!webhookUrl) {
    throw new Error('Discord webhook URL not configured');
  }

  // Parse webhook URL
  const url = new URL(webhookUrl);

  // Build embed
  const embed = {
    color: COLORS[type] || COLORS.info,
    description: message,
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Airdrop Hunter Bot',
    },
  };

  if (title) {
    embed.title = title;
  }

  if (fields.length > 0) {
    embed.fields = fields.map(f => ({
      name: f.name,
      value: f.value,
      inline: f.inline !== false,
    }));
  }

  const payload = JSON.stringify({
    embeds: [embed],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode === 204 || res.statusCode === 200) {
          logger.debug('Discord notification sent');
          resolve({ success: true });
        } else {
          reject(new Error(`Discord API returned ${res.statusCode}`));
        }
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Send a transaction notification
 */
async function sendTransaction(txResult, chain) {
  const fields = [
    { name: 'Chain', value: chain, inline: true },
    { name: 'Status', value: txResult.success ? '✅ Success' : '❌ Failed', inline: true },
  ];

  if (txResult.txHash) {
    fields.push({
      name: 'Transaction',
      value: `[View on Explorer](${txResult.explorerUrl})`,
      inline: false,
    });
  }

  if (txResult.gasUsed) {
    fields.push({
      name: 'Gas Used',
      value: txResult.gasUsed,
      inline: true,
    });
  }

  return send(txResult.summary || 'Transaction completed', {
    type: txResult.success ? 'success' : 'error',
    title: 'Transaction Update',
    fields,
  });
}

/**
 * Send a rich embed
 */
async function sendEmbed(embed) {
  const webhookUrl = config.notifications.discord.webhookUrl;

  if (!webhookUrl) {
    throw new Error('Discord webhook URL not configured');
  }

  const url = new URL(webhookUrl);
  const payload = JSON.stringify({ embeds: [embed] });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode === 204 || res.statusCode === 200) {
          resolve({ success: true });
        } else {
          reject(new Error(`Discord API returned ${res.statusCode}`));
        }
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = {
  send,
  sendTransaction,
  sendEmbed,
  COLORS,
};
