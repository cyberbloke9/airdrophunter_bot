/**
 * Airdrop Hunter Bot - Main Entry Point
 * AI-Powered Web3 Automation
 */

const web3Core = require('./core');
const ai = require('./ai');
const router = require('./router');
const notifications = require('./services/notifications');
const swapEngine = require('./engines/swap');
const transferEngine = require('./engines/transfer');
const airdropEngine = require('./engines/airdrop');
const config = require('./config');
const logger = require('./utils/logger');

/**
 * Initialize all services
 */
async function initialize() {
  logger.info('Initializing Airdrop Hunter Bot...');

  // Validate configuration
  const configValid = config.validateConfig();
  if (!configValid && config.env === 'production') {
    throw new Error('Invalid configuration');
  }

  // Initialize Web3 Core
  const web3Status = await web3Core.initialize();
  logger.info('Web3 Core initialized', web3Status);

  // Initialize AI
  const aiStatus = await ai.initializeAI();
  logger.info('AI initialized', aiStatus);

  // Check notification services
  const notificationStatus = notifications.getStatus();
  logger.info('Notification services', notificationStatus);

  return {
    web3: web3Status,
    ai: aiStatus,
    notifications: notificationStatus,
    ready: true,
  };
}

/**
 * Process a natural language command
 */
async function processCommand(input, context = {}) {
  return router.processCommand(input, context);
}

/**
 * Execute a swap
 */
async function swap(params) {
  return swapEngine.executeSwap(params);
}

/**
 * Execute a transfer
 */
async function transfer(params) {
  return transferEngine.executeTransfer(params);
}

/**
 * Execute a batch transfer
 */
async function batchTransfer(params) {
  return transferEngine.executeBatchTransfer(params);
}

/**
 * Get balances
 */
async function getBalances(params) {
  return web3Core.getBalances(params);
}

/**
 * Get swap quote
 */
async function getQuote(params) {
  return swapEngine.getQuote(params);
}

/**
 * Check airdrop eligibility
 */
async function checkAirdrop(params) {
  return airdropEngine.checkEligibility(params);
}

/**
 * Send notification
 */
async function notify(message, options) {
  return notifications.notify(message, options);
}

/**
 * Get system status
 */
async function getStatus() {
  return web3Core.getStatus();
}

/**
 * Chat with AI assistant
 */
async function chat(message, context = {}) {
  return ai.chat(message, context);
}

// Export all functionality
module.exports = {
  // Initialization
  initialize,

  // Main entry points
  processCommand,
  chat,

  // Direct operations
  swap,
  transfer,
  batchTransfer,
  getBalances,
  getQuote,
  checkAirdrop,

  // Services
  notify,
  getStatus,

  // Submodules
  web3Core,
  ai,
  router,
  notifications,
  swapEngine,
  transferEngine,
  airdropEngine,
  config,
  logger,
};
