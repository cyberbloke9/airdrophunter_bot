/**
 * Airdrop Claim Handler
 * Executes airdrop claims
 */

const { ethers } = require('ethers');
const { getConnectedWallet } = require('../../core/wallets');
const { getProvider } = require('../../core/providers');
const { getExplorerTxUrl } = require('../../config/chains');
const logger = require('../../utils/logger');

// Known claim contract addresses (would be updated as airdrops launch)
const CLAIM_CONTRACTS = {
  zksync: {
    address: null, // To be added when live
    chainId: 324,
    abi: [
      'function claim(uint256 amount, bytes32[] calldata merkleProof) external',
      'function isClaimed(address account) view returns (bool)',
    ],
  },
  // Add more as they become available
};

/**
 * Execute an airdrop claim
 */
async function execute(protocol, walletAddress) {
  const config = CLAIM_CONTRACTS[protocol.toLowerCase()];

  if (!config || !config.address) {
    return {
      success: false,
      protocol,
      message: `Claim not available for ${protocol}. Check back when the airdrop launches.`,
    };
  }

  logger.info('Executing airdrop claim', { protocol, walletAddress });

  try {
    // Get signer
    const signer = getConnectedWallet(walletAddress, config.chainId);
    const address = await signer.getAddress();

    // Create claim contract
    const claimContract = new ethers.Contract(
      config.address,
      config.abi,
      signer
    );

    // Check if already claimed
    const isClaimed = await claimContract.isClaimed(address);
    if (isClaimed) {
      return {
        success: false,
        protocol,
        message: 'Airdrop already claimed for this wallet',
      };
    }

    // Get claim data (merkle proof) - would be fetched from API in production
    const claimData = await getClaimData(protocol, address);

    if (!claimData) {
      return {
        success: false,
        protocol,
        message: 'No claimable airdrop found for this wallet',
      };
    }

    // Execute claim
    const tx = await claimContract.claim(claimData.amount, claimData.proof);

    logger.info('Claim transaction sent', { txHash: tx.hash });

    // Wait for confirmation
    const receipt = await tx.wait();

    return {
      success: receipt.status === 1,
      protocol,
      txHash: tx.hash,
      explorerUrl: getExplorerTxUrl(config.chainId, tx.hash),
      amount: claimData.formattedAmount,
      message: receipt.status === 1
        ? `Successfully claimed ${claimData.formattedAmount} tokens!`
        : 'Claim transaction failed',
    };
  } catch (error) {
    logger.error('Claim execution failed:', error.message);
    return {
      success: false,
      protocol,
      error: error.message,
      message: `Claim failed: ${error.message}`,
    };
  }
}

/**
 * Get claim data for a wallet (merkle proof, amount)
 */
async function getClaimData(protocol, address) {
  // In production, this would:
  // 1. Check an API or merkle tree file for the user's allocation
  // 2. Return the amount and merkle proof

  // Placeholder implementation
  logger.debug('Fetching claim data', { protocol, address });

  // Would query: https://api.{protocol}.io/claim/{address}
  // Return format:
  // {
  //   amount: ethers.BigNumber,
  //   formattedAmount: '1000 TOKEN',
  //   proof: ['0x...', '0x...']
  // }

  return null; // No data available yet
}

/**
 * Check if an address is eligible to claim
 */
async function checkClaimable(protocol, address) {
  const config = CLAIM_CONTRACTS[protocol.toLowerCase()];

  if (!config || !config.address) {
    return {
      claimable: false,
      message: 'Claim not available yet',
    };
  }

  try {
    const provider = getProvider(config.chainId);
    const claimContract = new ethers.Contract(
      config.address,
      config.abi,
      provider
    );

    const isClaimed = await claimContract.isClaimed(address);

    if (isClaimed) {
      return {
        claimable: false,
        message: 'Already claimed',
      };
    }

    const claimData = await getClaimData(protocol, address);

    if (!claimData) {
      return {
        claimable: false,
        message: 'Not eligible for this airdrop',
      };
    }

    return {
      claimable: true,
      amount: claimData.formattedAmount,
      message: `Eligible to claim ${claimData.formattedAmount}`,
    };
  } catch (error) {
    return {
      claimable: false,
      error: error.message,
    };
  }
}

/**
 * Estimate gas for claim
 */
async function estimateClaimGas(protocol, walletAddress) {
  const config = CLAIM_CONTRACTS[protocol.toLowerCase()];

  if (!config || !config.address) {
    return null;
  }

  try {
    const signer = getConnectedWallet(walletAddress, config.chainId);
    const address = await signer.getAddress();

    const claimData = await getClaimData(protocol, address);
    if (!claimData) {
      return null;
    }

    const claimContract = new ethers.Contract(
      config.address,
      config.abi,
      signer
    );

    const gasEstimate = await claimContract.estimateGas.claim(
      claimData.amount,
      claimData.proof
    );

    return {
      gasLimit: gasEstimate.toString(),
      protocol,
    };
  } catch {
    return null;
  }
}

module.exports = {
  execute,
  getClaimData,
  checkClaimable,
  estimateClaimGas,
};
