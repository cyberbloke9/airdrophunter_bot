/**
 * Response Generator
 * Generates human-readable responses for Web3 operations
 */

const { getChain, getExplorerTxUrl } = require('../config/chains');
const { formatNumber, truncateAddress } = require('../utils/helpers');

/**
 * Generate a response for a completed action
 */
function generate(result, command) {
  switch (command.type) {
    case 'SWAP':
      return generateSwapResponse(result, command);
    case 'TRANSFER':
      return generateTransferResponse(result, command);
    case 'BATCH_TRANSFER':
      return generateBatchTransferResponse(result, command);
    case 'BALANCE':
      return generateBalanceResponse(result, command);
    case 'QUOTE':
      return generateQuoteResponse(result, command);
    case 'AIRDROP_CHECK':
      return generateAirdropResponse(result, command);
    case 'GAS':
      return generateGasResponse(result, command);
    default:
      return generateGenericResponse(result, command);
  }
}

/**
 * Generate swap response
 */
function generateSwapResponse(result, command) {
  const chain = getChain(command.chainId);
  const chainName = chain?.name || 'Unknown';

  if (!result.success) {
    return {
      text: `Swap failed: ${result.error || 'Unknown error'}`,
      success: false,
      details: result,
    };
  }

  const text = [
    `Swapped ${result.amountIn} ${result.fromToken} for ${result.amountOut} ${result.toToken}`,
    `Chain: ${chainName}`,
    `DEX: ${result.dex || 'Uniswap'}`,
    `TX: ${result.explorerUrl}`,
  ].join('\n');

  return {
    text,
    success: true,
    summary: `Swapped ${result.amountIn} ${result.fromToken} -> ${result.amountOut} ${result.toToken}`,
    details: {
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
      gasUsed: result.gasUsed,
      slippage: result.slippage,
      priceImpact: result.priceImpact,
    },
  };
}

/**
 * Generate transfer response
 */
function generateTransferResponse(result, command) {
  const chain = getChain(command.chainId);
  const chainName = chain?.name || 'Unknown';

  if (!result.success) {
    return {
      text: `Transfer failed: ${result.error || 'Unknown error'}`,
      success: false,
      details: result,
    };
  }

  const recipientDisplay = result.to.endsWith('.eth')
    ? result.to
    : truncateAddress(result.to);

  const text = [
    `Sent ${result.amount} ${result.token} to ${recipientDisplay}`,
    `Chain: ${chainName}`,
    `TX: ${result.explorerUrl}`,
  ].join('\n');

  return {
    text,
    success: true,
    summary: `Sent ${result.amount} ${result.token}`,
    details: {
      from: result.from,
      to: result.to,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
      gasUsed: result.gasUsed,
    },
  };
}

/**
 * Generate batch transfer response
 */
function generateBatchTransferResponse(result, command) {
  if (!result.success && !result.partialSuccess) {
    return {
      text: `Batch transfer failed: ${result.error || 'Unknown error'}`,
      success: false,
      details: result,
    };
  }

  const lines = [
    `Distributed ${result.totalAmount} ${result.token} to ${result.recipientCount} recipients`,
  ];

  if (result.method === 'multicall') {
    lines.push(`Method: Multicall (saved ${result.gasSavedPercent}% gas)`);
  }

  if (result.partialSuccess) {
    lines.push(`Warning: ${result.failedCount}/${result.recipientCount} transfers failed`);
  }

  lines.push(`TX: ${result.explorerUrl || 'Multiple transactions'}`);

  return {
    text: lines.join('\n'),
    success: result.success,
    partialSuccess: result.partialSuccess,
    summary: `Distributed ${result.totalAmount} ${result.token}`,
    details: result,
  };
}

/**
 * Generate balance response
 */
function generateBalanceResponse(result, command) {
  const chain = getChain(command.chainId);
  const chainName = chain?.name || 'Unknown';

  const lines = [
    `Balances on ${chainName}:`,
    `${result.native.symbol}: ${formatNumber(result.native.formatted, 4)}`,
  ];

  if (result.tokens && result.tokens.length > 0) {
    for (const token of result.tokens) {
      lines.push(`${token.symbol}: ${formatNumber(token.formatted, 2)}`);
    }
  }

  return {
    text: lines.join('\n'),
    success: true,
    summary: `${result.native.formatted} ${result.native.symbol}`,
    details: result,
  };
}

/**
 * Generate quote response
 */
function generateQuoteResponse(result, command) {
  if (!result || !result.amountOut) {
    return {
      text: 'Could not get quote. The trading pair may not have liquidity.',
      success: false,
    };
  }

  const lines = [
    `Quote: ${result.amountIn} ${result.fromToken} = ${result.amountOut} ${result.toToken}`,
    `Rate: 1 ${result.fromToken} = ${result.rate} ${result.toToken}`,
  ];

  if (result.priceImpact) {
    lines.push(`Price Impact: ${result.priceImpact}%`);
  }

  if (result.dex) {
    lines.push(`Best route via: ${result.dex}`);
  }

  return {
    text: lines.join('\n'),
    success: true,
    summary: `${result.amountIn} ${result.fromToken} = ${result.amountOut} ${result.toToken}`,
    details: result,
  };
}

/**
 * Generate airdrop response
 */
function generateAirdropResponse(result, command) {
  if (!result.eligible && !result.protocols) {
    return {
      text: 'Could not check airdrop eligibility. Please try again later.',
      success: false,
    };
  }

  if (result.eligible === false) {
    return {
      text: `Not currently eligible for ${result.protocol || 'checked'} airdrop.`,
      success: true,
      details: result,
    };
  }

  const lines = ['Airdrop Eligibility:'];

  if (result.protocols) {
    for (const protocol of result.protocols) {
      const status = protocol.eligible ? '✓' : '✗';
      lines.push(`${status} ${protocol.name}: ${protocol.status}`);
    }
  } else {
    lines.push(`${result.protocol}: ${result.eligible ? 'Eligible!' : 'Not eligible'}`);
    if (result.amount) {
      lines.push(`Estimated amount: ${result.amount}`);
    }
  }

  return {
    text: lines.join('\n'),
    success: true,
    details: result,
  };
}

/**
 * Generate gas response
 */
function generateGasResponse(result, command) {
  const chain = getChain(command.chainId);
  const chainName = chain?.name || 'Unknown';

  const lines = [
    `Gas Prices on ${chainName}:`,
    `Base: ${result.baseFee} gwei`,
    `Priority: ${result.priorityFee} gwei`,
    `Estimated for swap: $${result.swapCostUsd}`,
    `Estimated for transfer: $${result.transferCostUsd}`,
  ];

  return {
    text: lines.join('\n'),
    success: true,
    details: result,
  };
}

/**
 * Generate generic response
 */
function generateGenericResponse(result, command) {
  if (result.error) {
    return {
      text: `Error: ${result.error}`,
      success: false,
      details: result,
    };
  }

  return {
    text: 'Operation completed successfully.',
    success: true,
    details: result,
  };
}

/**
 * Generate confirmation message before execution
 */
function generateConfirmation(command) {
  switch (command.type) {
    case 'SWAP':
      return generateSwapConfirmation(command);
    case 'TRANSFER':
      return generateTransferConfirmation(command);
    case 'BATCH_TRANSFER':
      return generateBatchTransferConfirmation(command);
    default:
      return 'Confirm this action?';
  }
}

/**
 * Generate swap confirmation
 */
function generateSwapConfirmation(command) {
  const { params, chainId } = command;
  const chain = getChain(chainId);

  const lines = [
    'Please confirm this swap:',
    `Swap: ${params.amount} ${params.fromToken} → ${params.toToken}`,
    `Chain: ${chain?.name || chainId}`,
    `Max Slippage: ${params.slippage}%`,
    '',
    'Reply "yes" to confirm or "no" to cancel.',
  ];

  return lines.join('\n');
}

/**
 * Generate transfer confirmation
 */
function generateTransferConfirmation(command) {
  const { params, chainId } = command;
  const chain = getChain(chainId);
  const recipientDisplay = params.to.endsWith('.eth')
    ? params.to
    : truncateAddress(params.to);

  const lines = [
    'Please confirm this transfer:',
    `Send: ${params.amount} ${params.token}`,
    `To: ${recipientDisplay}`,
    `Chain: ${chain?.name || chainId}`,
    '',
    'Reply "yes" to confirm or "no" to cancel.',
  ];

  return lines.join('\n');
}

/**
 * Generate batch transfer confirmation
 */
function generateBatchTransferConfirmation(command) {
  const { params, chainId } = command;
  const chain = getChain(chainId);

  const lines = [
    'Please confirm this batch transfer:',
    `Token: ${params.token}`,
    `Total: ${params.totalAmount}`,
    `Recipients: ${params.recipients.length}`,
    `Distribution: ${params.distribution}`,
    `Chain: ${chain?.name || chainId}`,
    '',
    'Reply "yes" to confirm or "no" to cancel.',
  ];

  return lines.join('\n');
}

/**
 * Generate error response
 */
function generateError(error, context = {}) {
  const friendlyMessages = {
    INSUFFICIENT_BALANCE: 'You don\'t have enough balance for this transaction.',
    SLIPPAGE_EXCEEDED: 'The price moved too much. Try increasing slippage or reducing amount.',
    UNSUPPORTED_CHAIN: 'This blockchain is not yet supported.',
    INVALID_ADDRESS: 'The address provided is not valid.',
    TRANSACTION_FAILED: 'The transaction failed on-chain. Please check the explorer for details.',
    RATE_LIMIT: 'Too many requests. Please wait a moment and try again.',
  };

  const message = friendlyMessages[error.code] || error.message || 'An unexpected error occurred.';

  return {
    text: message,
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
    suggestions: error.suggestions || [],
  };
}

/**
 * Generate help response
 */
function generateHelp(topic = null) {
  if (!topic) {
    return {
      text: [
        'I can help you with these Web3 operations:',
        '',
        '**Swap tokens:**',
        '• "Swap 0.1 ETH for USDC"',
        '• "Trade 100 USDC to ETH on Arbitrum"',
        '',
        '**Send tokens:**',
        '• "Send 50 USDC to 0x1234..."',
        '• "Transfer 0.5 ETH to vitalik.eth"',
        '',
        '**Check balances:**',
        '• "What\'s my balance?"',
        '• "Show my ETH on Polygon"',
        '',
        '**Get quotes:**',
        '• "Quote 1 ETH to USDC"',
        '',
        '**Check airdrops:**',
        '• "Am I eligible for any airdrops?"',
        '',
        'Ask me anything!',
      ].join('\n'),
      success: true,
    };
  }

  // Topic-specific help
  const helpTopics = {
    swap: 'To swap tokens, say something like "Swap 0.1 ETH for USDC on Arbitrum with 1% slippage"',
    transfer: 'To transfer tokens, say "Send 100 USDC to 0x..." or use an ENS name like "vitalik.eth"',
    balance: 'To check balances, ask "What\'s my balance?" or specify a chain like "Show my balance on Polygon"',
    airdrop: 'To check airdrops, ask "Check my airdrop eligibility" or specify a protocol like "Am I eligible for LayerZero?"',
  };

  return {
    text: helpTopics[topic.toLowerCase()] || 'I don\'t have specific help for that topic.',
    success: true,
  };
}

module.exports = {
  generate,
  generateConfirmation,
  generateError,
  generateHelp,
  generateSwapResponse,
  generateTransferResponse,
  generateBalanceResponse,
  generateQuoteResponse,
};
