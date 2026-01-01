/**
 * Provider Manager
 * Manages multi-chain RPC connections with failover support
 */

const { ethers } = require('ethers');
const { getChain, getSupportedChainIds } = require('../config/chains');
const logger = require('../utils/logger');

// Provider cache
const providers = new Map();
const providerHealth = new Map();

/**
 * Create a provider with fallback support
 */
function createProvider(chainId) {
  const chain = getChain(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const rpcUrls = chain.rpcUrls.filter(Boolean);
  if (rpcUrls.length === 0) {
    throw new Error(`No RPC URLs configured for chain ${chain.name}`);
  }

  // Create a FallbackProvider with multiple RPC endpoints
  if (rpcUrls.length > 1) {
    const providerConfigs = rpcUrls.map((url, index) => ({
      provider: new ethers.providers.JsonRpcProvider(url, chainId),
      priority: index,
      stallTimeout: 2000,
      weight: 1,
    }));

    return new ethers.providers.FallbackProvider(providerConfigs, 1);
  }

  // Single provider
  return new ethers.providers.JsonRpcProvider(rpcUrls[0], chainId);
}

/**
 * Get or create a provider for a chain
 */
function getProvider(chainId) {
  const normalizedChainId = typeof chainId === 'string' ?
    getChain(chainId)?.id : chainId;

  if (!normalizedChainId) {
    throw new Error(`Invalid chain: ${chainId}`);
  }

  if (!providers.has(normalizedChainId)) {
    const provider = createProvider(normalizedChainId);
    providers.set(normalizedChainId, provider);
    providerHealth.set(normalizedChainId, { healthy: true, lastCheck: Date.now() });
  }

  return providers.get(normalizedChainId);
}

/**
 * Check provider health
 */
async function checkProviderHealth(chainId) {
  try {
    const provider = getProvider(chainId);
    const blockNumber = await provider.getBlockNumber();

    providerHealth.set(chainId, {
      healthy: true,
      lastCheck: Date.now(),
      blockNumber,
    });

    return { healthy: true, blockNumber };
  } catch (error) {
    logger.error(`Provider health check failed for chain ${chainId}:`, error.message);

    providerHealth.set(chainId, {
      healthy: false,
      lastCheck: Date.now(),
      error: error.message,
    });

    return { healthy: false, error: error.message };
  }
}

/**
 * Get current gas price for a chain
 */
async function getGasPrice(chainId) {
  const provider = getProvider(chainId);
  const chain = getChain(chainId);

  try {
    // Try to get EIP-1559 fee data first
    const feeData = await provider.getFeeData();

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      return {
        type: 'eip1559',
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        gasLimit: chain.gasSettings?.gasLimit || 300000,
      };
    }

    // Fallback to legacy gas price
    return {
      type: 'legacy',
      gasPrice: feeData.gasPrice,
      gasLimit: chain.gasSettings?.gasLimit || 300000,
    };
  } catch (error) {
    logger.warn(`Failed to get gas price for chain ${chainId}, using defaults`);
    return {
      type: 'legacy',
      gasPrice: ethers.utils.parseUnits('30', 'gwei'),
      gasLimit: chain.gasSettings?.gasLimit || 300000,
    };
  }
}

/**
 * Get optimal gas settings for a transaction
 */
async function getOptimalGasSettings(chainId, options = {}) {
  const gasData = await getGasPrice(chainId);
  const { speedMultiplier = 1.0 } = options;

  if (gasData.type === 'eip1559') {
    return {
      maxFeePerGas: gasData.maxFeePerGas.mul(Math.floor(speedMultiplier * 100)).div(100),
      maxPriorityFeePerGas: gasData.maxPriorityFeePerGas.mul(Math.floor(speedMultiplier * 100)).div(100),
      gasLimit: options.gasLimit || gasData.gasLimit,
    };
  }

  return {
    gasPrice: gasData.gasPrice.mul(Math.floor(speedMultiplier * 100)).div(100),
    gasLimit: options.gasLimit || gasData.gasLimit,
  };
}

/**
 * Wait for transaction with timeout
 */
async function waitForTransaction(chainId, txHash, confirmations = 1, timeout = 60000) {
  const provider = getProvider(chainId);

  const receipt = await Promise.race([
    provider.waitForTransaction(txHash, confirmations),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Transaction confirmation timeout')), timeout)
    ),
  ]);

  return receipt;
}

/**
 * Get transaction receipt
 */
async function getTransactionReceipt(chainId, txHash) {
  const provider = getProvider(chainId);
  return provider.getTransactionReceipt(txHash);
}

/**
 * Get current block number
 */
async function getBlockNumber(chainId) {
  const provider = getProvider(chainId);
  return provider.getBlockNumber();
}

/**
 * Resolve ENS name to address
 */
async function resolveAddress(addressOrEns, chainId = 1) {
  // If it's already an address, return it
  if (ethers.utils.isAddress(addressOrEns)) {
    return addressOrEns;
  }

  // Try to resolve ENS (only on mainnet)
  if (addressOrEns.endsWith('.eth')) {
    try {
      const provider = getProvider(1); // ENS is on mainnet
      const resolved = await provider.resolveName(addressOrEns);
      if (resolved) {
        return resolved;
      }
    } catch (error) {
      logger.warn(`Failed to resolve ENS name: ${addressOrEns}`);
    }
  }

  throw new Error(`Invalid address or unresolvable ENS name: ${addressOrEns}`);
}

/**
 * Get all healthy providers
 */
function getHealthyProviders() {
  const healthy = [];

  for (const [chainId, health] of providerHealth.entries()) {
    if (health.healthy) {
      const chain = getChain(chainId);
      healthy.push({
        chainId,
        name: chain?.name,
        blockNumber: health.blockNumber,
        lastCheck: health.lastCheck,
      });
    }
  }

  return healthy;
}

/**
 * Initialize all providers
 */
async function initializeProviders() {
  const chainIds = getSupportedChainIds();
  const results = [];

  for (const chainId of chainIds) {
    try {
      const health = await checkProviderHealth(chainId);
      const chain = getChain(chainId);
      results.push({
        chainId,
        name: chain?.name,
        ...health,
      });
    } catch (error) {
      results.push({
        chainId,
        healthy: false,
        error: error.message,
      });
    }
  }

  return results;
}

module.exports = {
  getProvider,
  createProvider,
  checkProviderHealth,
  getGasPrice,
  getOptimalGasSettings,
  waitForTransaction,
  getTransactionReceipt,
  getBlockNumber,
  resolveAddress,
  getHealthyProviders,
  initializeProviders,
};
