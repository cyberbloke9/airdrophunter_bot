/**
 * Token Registry
 * Common token addresses across chains for natural language resolution
 */

const TOKENS = {
  // Stablecoins
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',      // Ethereum
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  // Arbitrum (native)
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',   // Base
      137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',    // Polygon
      10: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',     // Optimism
      56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',     // BSC
      5: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',      // Goerli
    },
  },

  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    addresses: {
      1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      10: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      56: '0x55d398326f99059fF775485246999027B3197955',
    },
  },

  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    addresses: {
      1: '0x6B175474E89094C44Da98b954EesdeE1D3dBaB9FE8',
      42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    },
  },

  // Wrapped Native Tokens
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    addresses: {
      1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      8453: '0x4200000000000000000000000000000000000006',
      137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      10: '0x4200000000000000000000000000000000000006',
      5: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    },
  },

  WMATIC: {
    symbol: 'WMATIC',
    name: 'Wrapped Matic',
    decimals: 18,
    addresses: {
      137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    },
  },

  WBNB: {
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    decimals: 18,
    addresses: {
      56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    },
  },

  // Popular DeFi Tokens
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    addresses: {
      1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      42161: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      137: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
      10: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
    },
  },

  LINK: {
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
    addresses: {
      1: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      42161: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
      137: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
    },
  },

  UNI: {
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    addresses: {
      1: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      42161: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0',
      137: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f',
    },
  },

  ARB: {
    symbol: 'ARB',
    name: 'Arbitrum',
    decimals: 18,
    addresses: {
      42161: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    },
  },

  OP: {
    symbol: 'OP',
    name: 'Optimism',
    decimals: 18,
    addresses: {
      10: '0x4200000000000000000000000000000000000042',
    },
  },
};

// Token symbol aliases for NL parsing
const TOKEN_ALIASES = {
  'usd coin': 'USDC',
  'usdc': 'USDC',
  'tether': 'USDT',
  'usdt': 'USDT',
  'dai': 'DAI',
  'ethereum': 'ETH',
  'ether': 'ETH',
  'eth': 'ETH',
  'weth': 'WETH',
  'wrapped ether': 'WETH',
  'wrapped ethereum': 'WETH',
  'bitcoin': 'WBTC',
  'btc': 'WBTC',
  'wbtc': 'WBTC',
  'wrapped bitcoin': 'WBTC',
  'matic': 'MATIC',
  'polygon': 'MATIC',
  'wmatic': 'WMATIC',
  'bnb': 'BNB',
  'binance': 'BNB',
  'wbnb': 'WBNB',
  'chainlink': 'LINK',
  'link': 'LINK',
  'uniswap': 'UNI',
  'uni': 'UNI',
  'arbitrum': 'ARB',
  'arb': 'ARB',
  'optimism': 'OP',
  'op': 'OP',
};

// Native tokens by chain
const NATIVE_TOKENS = {
  1: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  42161: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  8453: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  10: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  137: { symbol: 'MATIC', name: 'MATIC', decimals: 18 },
  56: { symbol: 'BNB', name: 'BNB', decimals: 18 },
  5: { symbol: 'ETH', name: 'Goerli Ether', decimals: 18 },
};

/**
 * Resolve token symbol from natural language input
 */
function resolveTokenSymbol(input) {
  const normalized = input.toLowerCase().trim();
  return TOKEN_ALIASES[normalized] || input.toUpperCase();
}

/**
 * Get token info by symbol and chain
 */
function getToken(symbol, chainId) {
  const resolvedSymbol = resolveTokenSymbol(symbol);
  const token = TOKENS[resolvedSymbol];

  if (!token) {
    return null;
  }

  const address = token.addresses[chainId];
  if (!address) {
    return null;
  }

  return {
    ...token,
    address,
    chainId,
  };
}

/**
 * Check if token is native (ETH, MATIC, BNB)
 */
function isNativeToken(symbol) {
  const resolved = resolveTokenSymbol(symbol);
  return ['ETH', 'MATIC', 'BNB'].includes(resolved);
}

/**
 * Get native token for a chain
 */
function getNativeToken(chainId) {
  return NATIVE_TOKENS[chainId] || NATIVE_TOKENS[1];
}

/**
 * Get wrapped native token address for a chain
 */
function getWrappedNativeAddress(chainId) {
  const chain = require('./chains').getChain(chainId);
  if (!chain) return null;

  return chain.contracts.weth ||
         chain.contracts.wmatic ||
         chain.contracts.wbnb;
}

/**
 * Parse amount with token decimals
 */
function parseAmount(amount, decimals) {
  const { ethers } = require('ethers');
  return ethers.utils.parseUnits(amount.toString(), decimals);
}

/**
 * Format amount with token decimals
 */
function formatAmount(amount, decimals) {
  const { ethers } = require('ethers');
  return ethers.utils.formatUnits(amount, decimals);
}

module.exports = {
  TOKENS,
  TOKEN_ALIASES,
  NATIVE_TOKENS,
  resolveTokenSymbol,
  getToken,
  isNativeToken,
  getNativeToken,
  getWrappedNativeAddress,
  parseAmount,
  formatAmount,
};
