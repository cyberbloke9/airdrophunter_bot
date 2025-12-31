/**
 * Airdrop Eligibility Checker
 * Checks wallet eligibility for various airdrops
 */

const { getProvider } = require('../../core/providers');
const { getChain } = require('../../config/chains');
const logger = require('../../utils/logger');

// Chain IDs for different L2s
const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  polygon: 137,
  zksync: 324,
  scroll: 534352,
  linea: 59144,
};

/**
 * Check eligibility for a specific protocol
 */
async function checkProtocol(protocol, address) {
  const checkers = {
    layerzero: checkLayerZero,
    zksync: checkZkSync,
    starknet: checkStarknet,
    scroll: checkScroll,
    linea: checkLinea,
    eigenlayer: checkEigenLayer,
    blast: checkBlast,
  };

  const checker = checkers[protocol.toLowerCase()];
  if (!checker) {
    return {
      eligible: null,
      message: 'Protocol checker not implemented',
    };
  }

  try {
    return await checker(address);
  } catch (error) {
    logger.warn(`Eligibility check failed for ${protocol}:`, error.message);
    return {
      eligible: null,
      error: error.message,
    };
  }
}

/**
 * Check LayerZero eligibility
 */
async function checkLayerZero(address) {
  // Check for cross-chain bridge activity
  // In production, would query LayerZero endpoints or TheGraph
  const criteria = {
    bridgeTransactions: 0,
    chainsUsed: [],
    volume: 0,
  };

  // Simulate checking multiple chains for bridge activity
  const chainsToCheck = [CHAIN_IDS.ethereum, CHAIN_IDS.arbitrum, CHAIN_IDS.optimism, CHAIN_IDS.base];

  for (const chainId of chainsToCheck) {
    try {
      const provider = getProvider(chainId);
      const txCount = await provider.getTransactionCount(address);
      if (txCount > 0) {
        criteria.chainsUsed.push(chainId);
      }
    } catch {
      // Chain not available or error
    }
  }

  const score = calculateLayerZeroScore(criteria);

  return {
    eligible: score > 50,
    score,
    details: {
      chainsUsed: criteria.chainsUsed.length,
      message: score > 50
        ? 'Good cross-chain activity detected'
        : 'Consider bridging to more chains',
    },
  };
}

/**
 * Calculate LayerZero eligibility score
 */
function calculateLayerZeroScore(criteria) {
  let score = 0;

  // Points for chains used
  score += criteria.chainsUsed.length * 15;

  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Check zkSync eligibility
 */
async function checkZkSync(address) {
  // In production, would check zkSync Era activity
  const criteria = {
    hasActivity: false,
    transactionCount: 0,
    uniqueContracts: 0,
  };

  // Check for zkSync Era activity
  try {
    const provider = getProvider(324); // zkSync Era
    const txCount = await provider.getTransactionCount(address);
    criteria.transactionCount = txCount;
    criteria.hasActivity = txCount > 0;
  } catch {
    // zkSync not configured
  }

  const score = calculateZkSyncScore(criteria);

  return {
    eligible: criteria.hasActivity && score > 30,
    score,
    details: {
      transactions: criteria.transactionCount,
      message: criteria.hasActivity
        ? `${criteria.transactionCount} transactions on zkSync Era`
        : 'No zkSync Era activity detected',
    },
  };
}

/**
 * Calculate zkSync eligibility score
 */
function calculateZkSyncScore(criteria) {
  let score = 0;

  if (criteria.hasActivity) score += 20;
  score += Math.min(criteria.transactionCount * 2, 40);
  score += criteria.uniqueContracts * 5;

  return Math.min(score, 100);
}

/**
 * Check Starknet eligibility
 */
async function checkStarknet(address) {
  // Starknet uses different address format
  // Would need Starknet-specific checks in production
  return {
    eligible: null,
    score: 0,
    details: {
      message: 'Starknet eligibility check requires Starknet address',
    },
  };
}

/**
 * Check Scroll eligibility
 */
async function checkScroll(address) {
  const criteria = {
    hasActivity: false,
    transactionCount: 0,
  };

  try {
    const provider = getProvider(534352); // Scroll
    const txCount = await provider.getTransactionCount(address);
    criteria.transactionCount = txCount;
    criteria.hasActivity = txCount > 0;
  } catch {
    // Scroll not configured
  }

  return {
    eligible: criteria.hasActivity,
    score: criteria.hasActivity ? 50 : 0,
    details: {
      transactions: criteria.transactionCount,
      message: criteria.hasActivity
        ? `Active on Scroll with ${criteria.transactionCount} transactions`
        : 'Bridge to Scroll to become eligible',
    },
  };
}

/**
 * Check Linea eligibility
 */
async function checkLinea(address) {
  const criteria = {
    hasActivity: false,
    transactionCount: 0,
  };

  try {
    const provider = getProvider(59144); // Linea
    const txCount = await provider.getTransactionCount(address);
    criteria.transactionCount = txCount;
    criteria.hasActivity = txCount > 0;
  } catch {
    // Linea not configured
  }

  return {
    eligible: criteria.hasActivity,
    score: criteria.hasActivity ? 50 : 0,
    details: {
      transactions: criteria.transactionCount,
      message: criteria.hasActivity
        ? `Active on Linea with ${criteria.transactionCount} transactions`
        : 'Bridge to Linea to become eligible',
    },
  };
}

/**
 * Check EigenLayer eligibility
 */
async function checkEigenLayer(address) {
  // Would check EigenLayer restaking contracts in production
  return {
    eligible: null,
    score: 0,
    details: {
      message: 'EigenLayer eligibility requires checking restaking contracts',
    },
  };
}

/**
 * Check Blast eligibility
 */
async function checkBlast(address) {
  // Blast has a points system
  return {
    eligible: null,
    score: 0,
    details: {
      message: 'Blast uses a points system - check blast.io directly',
    },
  };
}

/**
 * Calculate overall activity score for a wallet
 */
async function calculateActivityScore(address) {
  const breakdown = {
    chains: 0,
    transactions: 0,
    defi: 0,
    nft: 0,
    age: 0,
  };

  const recommendations = [];

  // Check activity on each chain
  const chainsToCheck = [
    CHAIN_IDS.ethereum,
    CHAIN_IDS.arbitrum,
    CHAIN_IDS.optimism,
    CHAIN_IDS.base,
    CHAIN_IDS.polygon,
  ];

  let totalTxCount = 0;
  let activeChains = 0;

  for (const chainId of chainsToCheck) {
    try {
      const provider = getProvider(chainId);
      const txCount = await provider.getTransactionCount(address);
      if (txCount > 0) {
        activeChains++;
        totalTxCount += txCount;
      }
    } catch {
      // Skip unavailable chains
    }
  }

  // Score chains
  breakdown.chains = Math.min(activeChains * 15, 30);
  if (activeChains < 3) {
    recommendations.push('Use more L2 chains (Arbitrum, Base, Optimism)');
  }

  // Score transactions
  breakdown.transactions = Math.min(Math.floor(totalTxCount / 10) * 5, 30);
  if (totalTxCount < 50) {
    recommendations.push('Increase transaction activity across chains');
  }

  // Calculate total
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    score: total,
    breakdown,
    recommendations,
    grade: getGrade(total),
  };
}

/**
 * Get letter grade from score
 */
function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

module.exports = {
  checkProtocol,
  checkLayerZero,
  checkZkSync,
  checkScroll,
  checkLinea,
  calculateActivityScore,
};
