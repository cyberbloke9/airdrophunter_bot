/**
 * Telegram Notification Service
 * Sends messages via Telegram Bot API
 */

const https = require('https');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Send a message to Telegram
 */
async function send(message, options = {}) {
  const { type = 'info', parseMode = 'Markdown' } = options;
  const { botToken, chatId } = config.notifications.telegram;

  if (!botToken || !chatId) {
    throw new Error('Telegram bot token or chat ID not configured');
  }

  // Add emoji based on type
  const emojis = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    alert: '🚨',
  };

  const emoji = emojis[type] || '';
  const formattedMessage = emoji ? `${emoji} ${message}` : message;

  const payload = JSON.stringify({
    chat_id: chatId,
    text: formattedMessage,
    parse_mode: parseMode,
    disable_web_page_preview: false,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.ok) {
              logger.debug('Telegram notification sent');
              resolve({ success: true, messageId: response.result.message_id });
            } else {
              reject(new Error(response.description || 'Telegram API error'));
            }
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Send a message with inline keyboard
 */
async function sendWithButtons(message, buttons, options = {}) {
  const { parseMode = 'Markdown' } = options;
  const { botToken, chatId } = config.notifications.telegram;

  if (!botToken || !chatId) {
    throw new Error('Telegram bot token or chat ID not configured');
  }

  const payload = JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: parseMode,
    reply_markup: {
      inline_keyboard: buttons,
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.ok) {
              resolve({ success: true, messageId: response.result.message_id });
            } else {
              reject(new Error(response.description || 'Telegram API error'));
            }
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Send a transaction notification with view button
 */
async function sendTransaction(txResult, chain) {
  const status = txResult.success ? '✅ Success' : '❌ Failed';
  const message = [
    `*Transaction Update*`,
    '',
    `Status: ${status}`,
    `Chain: ${chain}`,
    txResult.summary ? `Details: ${txResult.summary}` : '',
    txResult.gasUsed ? `Gas: ${txResult.gasUsed}` : '',
  ].filter(Boolean).join('\n');

  const buttons = [];
  if (txResult.explorerUrl) {
    buttons.push([
      { text: '🔍 View on Explorer', url: txResult.explorerUrl },
    ]);
  }

  if (buttons.length > 0) {
    return sendWithButtons(message, buttons);
  }

  return send(message, { type: txResult.success ? 'success' : 'error' });
}

/**
 * Send a photo/image
 */
async function sendPhoto(photoUrl, caption = '') {
  const { botToken, chatId } = config.notifications.telegram;

  if (!botToken || !chatId) {
    throw new Error('Telegram bot token or chat ID not configured');
  }

  const payload = JSON.stringify({
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'Markdown',
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendPhoto`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.ok) {
              resolve({ success: true });
            } else {
              reject(new Error(response.description || 'Telegram API error'));
            }
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = {
  send,
  sendWithButtons,
  sendTransaction,
  sendPhoto,
};
