/**
 * Multi-Chain Configuration
 * Defines all supported blockchain networks and their configurations
 */

const CHAINS = {
  // Ethereum Mainnet
  1: {
    id: 1,
    name: 'Ethereum',
    shortName: 'eth',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [
      process.env.ETH_RPC_URL || `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
    ],
    blockExplorer: 'https://etherscan.io',
    contracts: {
      weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      uniswapV2Router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      uniswapV2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      uniswapV3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      uniswapV3Quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
      multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
    gasSettings: {
      maxFeePerGas: null, // Dynamic
      maxPriorityFeePerGas: null, // Dynamic
      gasLimit: 300000,
    },
  },

  // Arbitrum One
  42161: {
    id: 42161,
    name: 'Arbitrum One',
    shortName: 'arb',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [
      process.env.ARB_RPC_URL || `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      'https://arb1.arbitrum.io/rpc',
      'https://rpc.ankr.com/arbitrum',
    ],
    blockExplorer: 'https://arbiscan.io',
    contracts: {
      weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      uniswapV3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      uniswapV3Quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
      sushiswapRouter: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
    gasSettings: {
      gasLimit: 3000000, // Arbitrum has higher limits
    },
  },

  // Base
  8453: {
    id: 8453,
    name: 'Base',
    shortName: 'base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [
      process.env.BASE_RPC_URL || `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
    ],
    blockExplorer: 'https://basescan.org',
    contracts: {
      weth: '0x4200000000000000000000000000000000000006',
      uniswapV3Router: '0x2626664c2603336E57B271c5C0b26F421741e481',
      uniswapV3Quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      aerodrome: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
    gasSettings: {
      gasLimit: 1000000,
    },
  },

  // Polygon
  137: {
    id: 137,
    name: 'Polygon',
    shortName: 'polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: [
      process.env.POLYGON_RPC_URL || `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      'https://polygon-rpc.com',
      'https://rpc.ankr.com/polygon',
    ],
    blockExplorer: 'https://polygonscan.com',
    contracts: {
      wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      uniswapV3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quickswapRouter: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
      multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
    gasSettings: {
      gasLimit: 500000,
    },
  },

  // Optimism
  10: {
    id: 10,
    name: 'Optimism',
    shortName: 'op',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [
      process.env.OP_RPC_URL || `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      'https://mainnet.optimism.io',
      'https://rpc.ankr.com/optimism',
    ],
    blockExplorer: 'https://optimistic.etherscan.io',
    contracts: {
      weth: '0x4200000000000000000000000000000000000006',
      uniswapV3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      velodrome: '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858',
      multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
    gasSettings: {
      gasLimit: 1000000,
    },
  },

  // BSC
  56: {
    id: 56,
    name: 'BNB Smart Chain',
    shortName: 'bsc',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: [
      process.env.BSC_RPC_URL,
      'https://bsc-dataseed.binance.org',
      'https://rpc.ankr.com/bsc',
    ].filter(Boolean),
    blockExplorer: 'https://bscscan.com',
    contracts: {
      wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      pancakeswapRouter: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
    gasSettings: {
      gasLimit: 500000,
    },
  },

  // Goerli Testnet (for testing)
  5: {
    id: 5,
    name: 'Goerli Testnet',
    shortName: 'goerli',
    isTestnet: true,
    nativeCurrency: { name: 'Goerli Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [
      process.env.RPC_URL || `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      'https://rpc.ankr.com/eth_goerli',
    ],
    blockExplorer: 'https://goerli.etherscan.io',
    contracts: {
      weth: process.env.WETH_ADDRESS || '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
      uniswapV2Router: process.env.V2_ROUTER_ADDRESS || '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      usdc: process.env.TOKEN_ADDRESS || '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
    },
    gasSettings: {
      gasLimit: 300000,
    },
  },
};

// Chain name aliases for natural language parsing
const CHAIN_ALIASES = {
  'ethereum': 1,
  'eth': 1,
  'mainnet': 1,
  'arbitrum': 42161,
  'arb': 42161,
  'arbitrum one': 42161,
  'base': 8453,
  'polygon': 137,
  'matic': 137,
  'optimism': 10,
  'op': 10,
  'bsc': 56,
  'bnb': 56,
  'binance': 56,
  'goerli': 5,
  'testnet': 5,
};

/**
 * Get chain configuration by ID or name
 */
function getChain(chainIdOrName) {
  if (typeof chainIdOrName === 'number') {
    return CHAINS[chainIdOrName];
  }

  const normalizedName = chainIdOrName.toLowerCase().trim();
  const chainId = CHAIN_ALIASES[normalizedName];

  if (chainId) {
    return CHAINS[chainId];
  }

  // Try to find by name
  return Object.values(CHAINS).find(
    chain => chain.name.toLowerCase() === normalizedName ||
             chain.shortName.toLowerCase() === normalizedName
  );
}

/**
 * Get all supported chain IDs
 */
function getSupportedChainIds() {
  return Object.keys(CHAINS).map(Number);
}

/**
 * Check if a chain is supported
 */
function isChainSupported(chainIdOrName) {
  return !!getChain(chainIdOrName);
}

/**
 * Get explorer URL for a transaction
 */
function getExplorerTxUrl(chainId, txHash) {
  const chain = getChain(chainId);
  if (!chain) return null;
  return `${chain.blockExplorer}/tx/${txHash}`;
}

/**
 * Get explorer URL for an address
 */
function getExplorerAddressUrl(chainId, address) {
  const chain = getChain(chainId);
  if (!chain) return null;
  return `${chain.blockExplorer}/address/${address}`;
}

module.exports = {
  CHAINS,
  CHAIN_ALIASES,
  getChain,
  getSupportedChainIds,
  isChainSupported,
  getExplorerTxUrl,
  getExplorerAddressUrl,
};
