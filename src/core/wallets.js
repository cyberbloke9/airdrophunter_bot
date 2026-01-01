/**
 * Wallet Manager
 * Secure wallet management with multi-account support
 */

const { ethers } = require('ethers');
const { getProvider } = require('./providers');
const { getChain } = require('../config/chains');
const { getNativeToken, formatAmount } = require('../config/tokens');
const logger = require('../utils/logger');

// Wallet cache (keyed by address for deduplication)
const wallets = new Map();

// Wallet aliases for natural language
const walletAliases = new Map();

/**
 * Initialize wallets from environment variables
 */
function initializeWallets() {
  const config = require('../config');
  const privateKeys = config.getWallets();

  privateKeys.forEach((privateKey, index) => {
    if (privateKey && privateKey.length > 0) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        const walletInfo = {
          wallet,
          address: wallet.address,
          index: index + 1,
          alias: `wallet${index + 1}`,
        };

        wallets.set(wallet.address.toLowerCase(), walletInfo);
        walletAliases.set(`wallet${index + 1}`, wallet.address.toLowerCase());
        walletAliases.set(`account${index + 1}`, wallet.address.toLowerCase());

        // Set primary/secondary/tertiary aliases
        if (index === 0) walletAliases.set('primary', wallet.address.toLowerCase());
        if (index === 1) walletAliases.set('secondary', wallet.address.toLowerCase());
        if (index === 2) walletAliases.set('tertiary', wallet.address.toLowerCase());

        logger.info(`Initialized wallet ${index + 1}: ${wallet.address}`);
      } catch (error) {
        logger.error(`Failed to initialize wallet ${index + 1}:`, error.message);
      }
    }
  });

  return wallets.size;
}

/**
 * Get wallet by address or alias
 */
function getWallet(addressOrAlias) {
  const normalized = addressOrAlias.toLowerCase().trim();

  // Check if it's an alias
  const resolvedAddress = walletAliases.get(normalized);
  if (resolvedAddress) {
    return wallets.get(resolvedAddress);
  }

  // Check if it's a direct address
  if (ethers.utils.isAddress(addressOrAlias)) {
    return wallets.get(normalized);
  }

  return null;
}

/**
 * Get wallet connected to a specific chain
 */
function getConnectedWallet(addressOrAlias, chainId) {
  const walletInfo = getWallet(addressOrAlias);
  if (!walletInfo) {
    throw new Error(`Wallet not found: ${addressOrAlias}`);
  }

  const provider = getProvider(chainId);
  return walletInfo.wallet.connect(provider);
}

/**
 * Get primary wallet connected to a chain
 */
function getPrimaryWallet(chainId) {
  return getConnectedWallet('primary', chainId);
}

/**
 * Get all configured wallet addresses
 */
function getAllWalletAddresses() {
  return Array.from(wallets.values()).map(w => ({
    address: w.address,
    alias: w.alias,
    index: w.index,
  }));
}

/**
 * Get wallet balance (native token)
 */
async function getBalance(addressOrAlias, chainId) {
  const walletInfo = getWallet(addressOrAlias);
  const address = walletInfo ? walletInfo.address : addressOrAlias;

  if (!ethers.utils.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const provider = getProvider(chainId);
  const balance = await provider.getBalance(address);
  const nativeToken = getNativeToken(chainId);

  return {
    raw: balance,
    formatted: formatAmount(balance, nativeToken.decimals),
    symbol: nativeToken.symbol,
  };
}

/**
 * Get token balance for a wallet
 */
async function getTokenBalance(addressOrAlias, tokenAddress, chainId) {
  const walletInfo = getWallet(addressOrAlias);
  const address = walletInfo ? walletInfo.address : addressOrAlias;

  if (!ethers.utils.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const provider = getProvider(chainId);
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
    provider
  );

  const [balance, decimals, symbol] = await Promise.all([
    tokenContract.balanceOf(address),
    tokenContract.decimals(),
    tokenContract.symbol(),
  ]);

  return {
    raw: balance,
    formatted: formatAmount(balance, decimals),
    symbol,
    decimals,
  };
}

/**
 * Get all balances for a wallet on a chain
 */
async function getAllBalances(addressOrAlias, chainId, tokenAddresses = []) {
  const walletInfo = getWallet(addressOrAlias);
  const address = walletInfo ? walletInfo.address : addressOrAlias;

  // Get native balance
  const nativeBalance = await getBalance(address, chainId);

  // Get token balances
  const tokenBalances = await Promise.all(
    tokenAddresses.map(async (tokenAddress) => {
      try {
        return await getTokenBalance(address, tokenAddress, chainId);
      } catch (error) {
        logger.warn(`Failed to get balance for token ${tokenAddress}:`, error.message);
        return null;
      }
    })
  );

  return {
    address,
    chainId,
    native: nativeBalance,
    tokens: tokenBalances.filter(Boolean),
  };
}

/**
 * Check if wallet has sufficient balance for a transaction
 */
async function hasSufficientBalance(addressOrAlias, chainId, amount, tokenAddress = null) {
  try {
    if (tokenAddress) {
      const balance = await getTokenBalance(addressOrAlias, tokenAddress, chainId);
      return balance.raw.gte(amount);
    }

    const balance = await getBalance(addressOrAlias, chainId);
    return balance.raw.gte(amount);
  } catch (error) {
    logger.error('Error checking balance:', error.message);
    return false;
  }
}

/**
 * Get nonce for a wallet on a chain
 */
async function getNonce(addressOrAlias, chainId) {
  const walletInfo = getWallet(addressOrAlias);
  const address = walletInfo ? walletInfo.address : addressOrAlias;

  const provider = getProvider(chainId);
  return provider.getTransactionCount(address, 'pending');
}

/**
 * Sign a message with a wallet
 */
async function signMessage(addressOrAlias, message) {
  const walletInfo = getWallet(addressOrAlias);
  if (!walletInfo) {
    throw new Error(`Wallet not found: ${addressOrAlias}`);
  }

  return walletInfo.wallet.signMessage(message);
}

/**
 * Resolve wallet identifier from natural language
 */
function resolveWalletIdentifier(input) {
  const normalized = input.toLowerCase().trim();

  // Direct alias match
  if (walletAliases.has(normalized)) {
    return walletAliases.get(normalized);
  }

  // Pattern matching for "my wallet", "my account", etc.
  if (normalized.includes('my') || normalized.includes('main')) {
    return walletAliases.get('primary');
  }

  // Numbered patterns like "wallet 1", "account 2"
  const numberMatch = normalized.match(/(?:wallet|account)\s*(\d+)/);
  if (numberMatch) {
    const key = `wallet${numberMatch[1]}`;
    return walletAliases.get(key);
  }

  // If it's an address, validate and return
  if (ethers.utils.isAddress(input)) {
    return input.toLowerCase();
  }

  return null;
}

// Initialize wallets on module load
let initialized = false;

function ensureInitialized() {
  if (!initialized) {
    initializeWallets();
    initialized = true;
  }
}

module.exports = {
  initializeWallets,
  getWallet,
  getConnectedWallet,
  getPrimaryWallet,
  getAllWalletAddresses,
  getBalance,
  getTokenBalance,
  getAllBalances,
  hasSufficientBalance,
  getNonce,
  signMessage,
  resolveWalletIdentifier,
  ensureInitialized,
};
