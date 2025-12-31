/**
 * Entity Extractor
 * Extracts structured data from natural language input
 */

const { ethers } = require('ethers');
const { resolveTokenSymbol, TOKENS } = require('../config/tokens');
const { CHAIN_ALIASES } = require('../config/chains');
const logger = require('../utils/logger');

// Regex patterns for entity extraction
const PATTERNS = {
  // Amount patterns: "0.5 ETH", "100 USDC", "1,000.50"
  amount: /(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*([A-Za-z]+)?/g,

  // Ethereum address
  address: /0x[a-fA-F0-9]{40}/g,

  // ENS name
  ens: /[a-zA-Z0-9-]+\.eth/g,

  // Percentage/slippage: "1%", "0.5%", "with 2% slippage"
  percentage: /(\d+(?:\.\d+)?)\s*%/g,

  // Chain mentions
  chain: /(?:on|via|using|chain)\s+([a-zA-Z]+)/gi,

  // Wallet references
  wallet: /(?:from|to|my|wallet|account)\s*(?:#?\d+|primary|secondary|main)/gi,

  // "to" recipient patterns
  recipient: /(?:to|for|recipient)\s+(0x[a-fA-F0-9]{40}|[a-zA-Z0-9-]+\.eth)/i,

  // Protocol names
  protocol: /(?:for|on|from|check)\s+(layerzero|aave|uniswap|compound|maker|lido|eigenlayer|zksync|starknet|scroll|linea|blur|opensea)/i,
};

// Known token symbols for faster matching
const KNOWN_TOKENS = Object.keys(TOKENS).map(t => t.toLowerCase());

/**
 * Extract all entities from natural language input
 */
async function extractEntities(input, intent, aiClient = null) {
  const entities = {};

  // Extract based on intent type
  switch (intent.type) {
    case 'SWAP':
      Object.assign(entities, extractSwapEntities(input));
      break;

    case 'TRANSFER':
      Object.assign(entities, extractTransferEntities(input));
      break;

    case 'BATCH_TRANSFER':
      Object.assign(entities, extractBatchTransferEntities(input));
      break;

    case 'BALANCE':
      Object.assign(entities, extractBalanceEntities(input));
      break;

    case 'QUOTE':
      Object.assign(entities, extractSwapEntities(input)); // Same as swap
      break;

    case 'AIRDROP_CHECK':
      Object.assign(entities, extractAirdropEntities(input));
      break;

    default:
      Object.assign(entities, extractGenericEntities(input));
  }

  // Always try to extract chain
  const chain = extractChain(input);
  if (chain) {
    entities.chainId = chain;
  }

  // Extract slippage if mentioned
  const slippage = extractSlippage(input);
  if (slippage !== null) {
    entities.slippage = slippage;
  }

  // If AI is available and we're missing entities, try AI extraction
  if (aiClient && hasMissingRequiredEntities(intent, entities)) {
    try {
      const aiEntities = await extractEntitiesWithAI(input, intent, aiClient);
      Object.assign(entities, aiEntities);
    } catch (error) {
      logger.warn('AI entity extraction failed:', error.message);
    }
  }

  return entities;
}

/**
 * Extract swap-related entities
 */
function extractSwapEntities(input) {
  const entities = {};
  const normalizedInput = input.toLowerCase();

  // Try to match swap patterns
  const swapPatterns = [
    /swap\s+(\d+(?:\.\d+)?)\s*([a-z]+)\s+(?:for|to)\s+([a-z]+)/i,
    /(?:buy|get)\s+([a-z]+)\s+with\s+(\d+(?:\.\d+)?)\s*([a-z]+)/i,
    /convert\s+(\d+(?:\.\d+)?)\s*([a-z]+)\s+to\s+([a-z]+)/i,
    /trade\s+(\d+(?:\.\d+)?)\s*([a-z]+)\s+for\s+([a-z]+)/i,
    /exchange\s+(\d+(?:\.\d+)?)\s*([a-z]+)\s+(?:for|to)\s+([a-z]+)/i,
  ];

  for (const pattern of swapPatterns) {
    const match = input.match(pattern);
    if (match) {
      if (pattern.toString().includes('buy|get')) {
        // "Buy USDC with 0.5 ETH" format
        entities.toToken = resolveTokenSymbol(match[1]);
        entities.amount = match[2];
        entities.fromToken = resolveTokenSymbol(match[3]);
      } else {
        // Standard "Swap 0.5 ETH for USDC" format
        entities.amount = match[1];
        entities.fromToken = resolveTokenSymbol(match[2]);
        entities.toToken = resolveTokenSymbol(match[3]);
      }
      break;
    }
  }

  // Fallback: try to extract tokens and amount separately
  if (!entities.fromToken || !entities.toToken) {
    const tokens = extractTokensFromText(input);
    if (tokens.length >= 2) {
      entities.fromToken = entities.fromToken || tokens[0];
      entities.toToken = entities.toToken || tokens[1];
    }

    const amounts = extractAmounts(input);
    if (amounts.length > 0 && !entities.amount) {
      entities.amount = amounts[0].value;
    }
  }

  return entities;
}

/**
 * Extract transfer-related entities
 */
function extractTransferEntities(input) {
  const entities = {};

  // Match "send/transfer X TOKEN to ADDRESS" patterns
  const transferPatterns = [
    /(?:send|transfer|pay)\s+(\d+(?:\.\d+)?)\s*([a-z]+)\s+to\s+(0x[a-fA-F0-9]{40}|[a-zA-Z0-9-]+\.eth)/i,
    /(?:send|transfer)\s+([a-z]+)\s+(\d+(?:\.\d+)?)\s+to\s+(0x[a-fA-F0-9]{40}|[a-zA-Z0-9-]+\.eth)/i,
  ];

  for (const pattern of transferPatterns) {
    const match = input.match(pattern);
    if (match) {
      if (/^\d/.test(match[1])) {
        entities.amount = match[1];
        entities.token = resolveTokenSymbol(match[2]);
        entities.recipient = match[3];
      } else {
        entities.token = resolveTokenSymbol(match[1]);
        entities.amount = match[2];
        entities.recipient = match[3];
      }
      break;
    }
  }

  // Fallback extraction
  if (!entities.recipient) {
    const addresses = extractAddresses(input);
    const ensNames = extractENSNames(input);
    entities.recipient = addresses[0] || ensNames[0];
  }

  if (!entities.token) {
    const tokens = extractTokensFromText(input);
    if (tokens.length > 0) {
      entities.token = tokens[0];
    }
  }

  if (!entities.amount) {
    const amounts = extractAmounts(input);
    if (amounts.length > 0) {
      entities.amount = amounts[0].value;
    }
  }

  return entities;
}

/**
 * Extract batch transfer entities
 */
function extractBatchTransferEntities(input) {
  const entities = extractTransferEntities(input);

  // Look for multiple addresses
  const addresses = extractAddresses(input);
  const ensNames = extractENSNames(input);
  const allRecipients = [...addresses, ...ensNames];

  if (allRecipients.length > 1) {
    entities.recipients = allRecipients.map(addr => ({ address: addr }));
  }

  // Check for "equal" or "equally" keywords
  if (input.toLowerCase().includes('equal')) {
    entities.distribution = 'equal';
  }

  // Extract total amount
  if (entities.amount) {
    entities.totalAmount = entities.amount;
  }

  return entities;
}

/**
 * Extract balance-related entities
 */
function extractBalanceEntities(input) {
  const entities = {};

  // Extract specific tokens mentioned
  const tokens = extractTokensFromText(input);
  if (tokens.length > 0) {
    entities.tokens = tokens;
  }

  // Extract wallet reference
  const walletMatch = input.match(/(?:wallet|account)\s*#?(\d+)/i);
  if (walletMatch) {
    entities.wallet = `wallet${walletMatch[1]}`;
  }

  return entities;
}

/**
 * Extract airdrop-related entities
 */
function extractAirdropEntities(input) {
  const entities = {};

  const protocolMatch = input.match(PATTERNS.protocol);
  if (protocolMatch) {
    entities.protocol = protocolMatch[1].toLowerCase();
  }

  return entities;
}

/**
 * Extract generic entities
 */
function extractGenericEntities(input) {
  return {
    amounts: extractAmounts(input),
    tokens: extractTokensFromText(input),
    addresses: extractAddresses(input),
    chain: extractChain(input),
  };
}

/**
 * Extract amounts from text
 */
function extractAmounts(input) {
  const amounts = [];
  const matches = input.matchAll(PATTERNS.amount);

  for (const match of matches) {
    const value = match[1].replace(/,/g, '');
    const token = match[2] ? resolveTokenSymbol(match[2]) : null;

    // Ignore standalone numbers that are likely not amounts
    if (parseFloat(value) > 0) {
      amounts.push({ value, token });
    }
  }

  return amounts;
}

/**
 * Extract token symbols from text
 */
function extractTokensFromText(input) {
  const tokens = [];
  const words = input.toLowerCase().split(/\s+/);

  for (const word of words) {
    const cleaned = word.replace(/[^a-z]/g, '');
    if (KNOWN_TOKENS.includes(cleaned) || cleaned.length <= 5) {
      const resolved = resolveTokenSymbol(cleaned);
      if (resolved && !tokens.includes(resolved)) {
        tokens.push(resolved);
      }
    }
  }

  return tokens;
}

/**
 * Extract Ethereum addresses
 */
function extractAddresses(input) {
  const matches = input.match(PATTERNS.address);
  return matches || [];
}

/**
 * Extract ENS names
 */
function extractENSNames(input) {
  const matches = input.match(PATTERNS.ens);
  return matches || [];
}

/**
 * Extract chain from input
 */
function extractChain(input) {
  const chainMatch = input.match(PATTERNS.chain);
  if (chainMatch) {
    const chainName = chainMatch[1].toLowerCase();
    return CHAIN_ALIASES[chainName];
  }

  // Check for direct chain mentions
  for (const [alias, chainId] of Object.entries(CHAIN_ALIASES)) {
    if (input.toLowerCase().includes(alias)) {
      return chainId;
    }
  }

  return null;
}

/**
 * Extract slippage from input
 */
function extractSlippage(input) {
  const slippagePatterns = [
    /(?:slippage|slip)\s*(?:of|:)?\s*(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:slippage|max)/i,
    /max\s*(\d+(?:\.\d+)?)\s*%/i,
  ];

  for (const pattern of slippagePatterns) {
    const match = input.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }

  return null;
}

/**
 * Check if required entities are missing
 */
function hasMissingRequiredEntities(intent, entities) {
  switch (intent.type) {
    case 'SWAP':
      return !entities.fromToken || !entities.toToken || !entities.amount;
    case 'TRANSFER':
      return !entities.token || !entities.amount || !entities.recipient;
    default:
      return false;
  }
}

/**
 * Extract entities using AI
 */
async function extractEntitiesWithAI(input, intent, aiClient) {
  const config = require('../config');

  const prompt = `Extract the following entities from this ${intent.type} command:
"${input}"

Return JSON with these fields (null if not found):
{
  "fromToken": "token symbol",
  "toToken": "token symbol",
  "amount": "numeric value",
  "recipient": "address or ENS",
  "chainId": "chain name",
  "slippage": "percentage number"
}`;

  try {
    if (config.ai.provider === 'openai') {
      const completion = await aiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0,
      });

      return JSON.parse(completion.choices[0].message.content);
    } else if (config.ai.provider === 'anthropic') {
      const response = await aiClient.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });

      return JSON.parse(response.content[0].text);
    }
  } catch (error) {
    logger.warn('AI entity extraction failed:', error.message);
    return {};
  }
}

module.exports = {
  extractEntities,
  extractSwapEntities,
  extractTransferEntities,
  extractBalanceEntities,
  extractAmounts,
  extractTokensFromText,
  extractAddresses,
  extractENSNames,
  extractChain,
  extractSlippage,
};
