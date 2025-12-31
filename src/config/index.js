/**
 * Configuration Manager
 * Centralizes all configuration loading and validation
 */

require('dotenv').config();

const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',

  // AI Configuration
  ai: {
    provider: process.env.AI_PROVIDER || 'openai', // openai, anthropic
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL || 'gpt-4-turbo-preview',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 1000,
  },

  // Wallet Configuration
  wallets: {
    primary: process.env.PRIVATE_KEY_1,
    secondary: process.env.PRIVATE_KEY_2,
    tertiary: process.env.PRIVATE_KEY_3,
    // Dynamic wallets from PRIVATE_KEY_N pattern
    additional: Object.keys(process.env)
      .filter(key => key.startsWith('PRIVATE_KEY_'))
      .sort()
      .map(key => process.env[key])
      .filter(Boolean),
  },

  // Default trading parameters
  trading: {
    defaultSlippage: parseFloat(process.env.DEFAULT_SLIPPAGE) || 0.5, // 0.5%
    maxSlippage: parseFloat(process.env.MAX_SLIPPAGE) || 5.0, // 5%
    defaultDeadlineMinutes: parseInt(process.env.DEFAULT_DEADLINE) || 10,
    maxPriceImpact: parseFloat(process.env.MAX_PRICE_IMPACT) || 3.0, // 3%
    defaultSwapAmount: process.env.SWAP_AMOUNT || '25000000000000000', // 0.025 ETH
    defaultTransferAmount: process.env.TRANSFER_AMOUNT || '10000000', // 10 USDC
  },

  // Notification Configuration
  notifications: {
    discord: {
      enabled: !!process.env.DISCORD_WEBHOOK_URL,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    },
    telegram: {
      enabled: !!process.env.TELEGRAM_BOT_TOKEN,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    },
  },

  // Rate Limiting
  rateLimits: {
    maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_RPM) || 30,
    maxTransactionsPerHour: parseInt(process.env.RATE_LIMIT_TPH) || 20,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
};

/**
 * Validate required configuration
 */
function validateConfig() {
  const errors = [];

  // Check for at least one wallet
  if (!config.wallets.primary && config.wallets.additional.length === 0) {
    errors.push('At least one wallet private key is required (PRIVATE_KEY_1)');
  }

  // Validate slippage ranges
  if (config.trading.defaultSlippage < 0 || config.trading.defaultSlippage > 50) {
    errors.push('DEFAULT_SLIPPAGE must be between 0 and 50');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    // Don't throw in development to allow partial testing
    if (config.env === 'production') {
      throw new Error('Invalid configuration');
    }
  }

  return errors.length === 0;
}

/**
 * Get configuration for a specific chain
 */
function getChainConfig(chainId) {
  const chains = require('./chains');
  return chains.getChain(chainId);
}

/**
 * Get all configured wallets
 */
function getWallets() {
  return config.wallets.additional.filter(Boolean);
}

module.exports = {
  ...config,
  validateConfig,
  getChainConfig,
  getWallets,
};
