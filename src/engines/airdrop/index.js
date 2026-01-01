/**
 * Airdrop Engine
 * Tracks airdrop eligibility and manages claims
 */

const eligibility = require('./eligibility');
const claim = require('./claim');
const { getWallet, getAllWalletAddresses } = require('../../core/wallets');
const logger = require('../../utils/logger');

// Known airdrop protocols and their status
const KNOWN_AIRDROPS = {
  layerzero: {
    name: 'LayerZero',
    status: 'upcoming',
    checkUrl: 'https://layerzero.network/',
    criteria: ['Bridge transactions', 'Message passing', 'Multiple chains'],
  },
  zksync: {
    name: 'zkSync',
    status: 'claimable',
    checkUrl: 'https://zksync.io/',
    criteria: ['Bridge to zkSync', 'Transactions on zkSync Era', 'Liquidity provision'],
  },
  starknet: {
    name: 'Starknet',
    status: 'upcoming',
    checkUrl: 'https://starknet.io/',
    criteria: ['Bridge to Starknet', 'dApp usage', 'Early adoption'],
  },
  scroll: {
    name: 'Scroll',
    status: 'upcoming',
    checkUrl: 'https://scroll.io/',
    criteria: ['Bridge to Scroll', 'Testnet usage', 'dApp interaction'],
  },
  linea: {
    name: 'Linea',
    status: 'upcoming',
    checkUrl: 'https://linea.build/',
    criteria: ['Bridge usage', 'DeFi activity', 'NFT minting'],
  },
  eigenlayer: {
    name: 'EigenLayer',
    status: 'upcoming',
    checkUrl: 'https://eigenlayer.xyz/',
    criteria: ['ETH restaking', 'Early deposit'],
  },
  blast: {
    name: 'Blast',
    status: 'points',
    checkUrl: 'https://blast.io/',
    criteria: ['ETH/USDB deposits', 'Referrals', 'dApp usage'],
  },
};

/**
 * Check eligibility for a specific protocol
 */
async function checkEligibility(params) {
  const { protocol, walletAddress = 'primary' } = params;

  logger.info('Checking airdrop eligibility', { protocol, walletAddress });

  // Get wallet info
  const wallet = getWallet(walletAddress);
  if (!wallet) {
    throw new Error(`Wallet not found: ${walletAddress}`);
  }

  const address = wallet.address;

  if (protocol) {
    // Check specific protocol
    const protocolInfo = KNOWN_AIRDROPS[protocol.toLowerCase()];
    if (!protocolInfo) {
      return {
        success: true,
        protocol,
        eligible: null,
        message: `Unknown protocol: ${protocol}. Try: ${Object.keys(KNOWN_AIRDROPS).join(', ')}`,
      };
    }

    const result = await eligibility.checkProtocol(protocol, address);
    return {
      success: true,
      protocol: protocolInfo.name,
      status: protocolInfo.status,
      eligible: result.eligible,
      criteria: protocolInfo.criteria,
      score: result.score,
      details: result.details,
      checkUrl: protocolInfo.checkUrl,
    };
  }

  // Check all known protocols
  const results = await checkAllProtocols(address);
  return {
    success: true,
    wallet: address,
    protocols: results,
    summary: {
      eligible: results.filter(r => r.eligible).length,
      pending: results.filter(r => r.eligible === null).length,
      total: results.length,
    },
  };
}

/**
 * Check all known protocols for a wallet
 */
async function checkAllProtocols(address) {
  const results = [];

  for (const [key, info] of Object.entries(KNOWN_AIRDROPS)) {
    try {
      const result = await eligibility.checkProtocol(key, address);
      results.push({
        protocol: info.name,
        status: info.status,
        eligible: result.eligible,
        score: result.score,
        criteria: info.criteria,
      });
    } catch (error) {
      results.push({
        protocol: info.name,
        status: info.status,
        eligible: null,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Get activity suggestions to improve eligibility
 */
function getSuggestions(protocol = null) {
  if (protocol) {
    const info = KNOWN_AIRDROPS[protocol.toLowerCase()];
    if (!info) {
      return null;
    }

    return {
      protocol: info.name,
      status: info.status,
      criteria: info.criteria,
      suggestions: generateSuggestions(protocol),
    };
  }

  // General suggestions
  return {
    general: [
      'Bridge assets to L2 chains (Arbitrum, Optimism, Base)',
      'Use popular DeFi protocols on multiple chains',
      'Participate in governance voting',
      'Provide liquidity to DEXes',
      'Mint NFTs on emerging chains',
    ],
    protocols: Object.entries(KNOWN_AIRDROPS).map(([key, info]) => ({
      protocol: info.name,
      status: info.status,
      topCriteria: info.criteria[0],
    })),
  };
}

/**
 * Generate specific suggestions for a protocol
 */
function generateSuggestions(protocol) {
  const suggestions = {
    layerzero: [
      'Bridge tokens using Stargate Finance',
      'Use LayerZero-powered bridges on multiple chains',
      'Interact with omnichain NFTs',
      'Use messaging protocols built on LayerZero',
    ],
    zksync: [
      'Bridge ETH to zkSync Era',
      'Trade on zkSync DEXes (SyncSwap, Mute)',
      'Provide liquidity on zkSync',
      'Mint NFTs on zkSync',
    ],
    starknet: [
      'Bridge ETH to Starknet',
      'Use Starknet dApps (JediSwap, mySwap)',
      'Deploy contracts or interact with protocols',
    ],
    scroll: [
      'Bridge to Scroll mainnet',
      'Use Scroll DeFi applications',
      'Regular transaction activity',
    ],
    eigenlayer: [
      'Restake ETH through EigenLayer',
      'Delegate to operators',
      'Early participation matters',
    ],
    blast: [
      'Deposit ETH or USDB',
      'Invite friends for points',
      'Use Blast dApps when available',
    ],
  };

  return suggestions[protocol.toLowerCase()] || [];
}

/**
 * Claim an available airdrop
 */
async function claimAirdrop(params) {
  const { protocol, walletAddress = 'primary' } = params;

  logger.info('Attempting to claim airdrop', { protocol, walletAddress });

  // Check if protocol is claimable
  const protocolInfo = KNOWN_AIRDROPS[protocol.toLowerCase()];
  if (!protocolInfo) {
    throw new Error(`Unknown protocol: ${protocol}`);
  }

  if (protocolInfo.status !== 'claimable') {
    return {
      success: false,
      protocol: protocolInfo.name,
      message: `${protocolInfo.name} airdrop is not currently claimable. Status: ${protocolInfo.status}`,
    };
  }

  // Attempt claim
  const result = await claim.execute(protocol, walletAddress);
  return result;
}

/**
 * Get list of tracked airdrops
 */
function getTrackedAirdrops() {
  return Object.entries(KNOWN_AIRDROPS).map(([key, info]) => ({
    id: key,
    name: info.name,
    status: info.status,
    criteria: info.criteria,
    checkUrl: info.checkUrl,
  }));
}

/**
 * Check wallet activity score
 */
async function getActivityScore(walletAddress = 'primary') {
  const wallet = getWallet(walletAddress);
  if (!wallet) {
    throw new Error(`Wallet not found: ${walletAddress}`);
  }

  const address = wallet.address;
  const score = await eligibility.calculateActivityScore(address);

  return {
    wallet: address,
    score,
    breakdown: score.breakdown,
    recommendations: score.recommendations,
  };
}

module.exports = {
  checkEligibility,
  checkAllProtocols,
  getSuggestions,
  claimAirdrop,
  getTrackedAirdrops,
  getActivityScore,
  KNOWN_AIRDROPS,
};
