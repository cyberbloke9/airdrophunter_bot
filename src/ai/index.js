/**
 * AI Layer Entry Point
 * Natural language processing for Web3 commands
 */

const intentParser = require('./intentParser');
const entityExtractor = require('./entityExtractor');
const responseGenerator = require('./responseGenerator');
const { getSystemPrompt } = require('./prompts/system');
const logger = require('../utils/logger');
const config = require('../config');

// AI Provider clients
let aiClient = null;

/**
 * Initialize the AI client based on configuration
 */
async function initializeAI() {
  const provider = config.ai.provider;
  const apiKey = config.ai.apiKey;

  if (!apiKey) {
    logger.warn('AI API key not configured. Using rule-based parsing only.');
    return { initialized: false, provider: 'rule-based' };
  }

  try {
    if (provider === 'openai') {
      const { OpenAI } = require('openai');
      aiClient = new OpenAI({ apiKey });
    } else if (provider === 'anthropic') {
      const Anthropic = require('@anthropic-ai/sdk');
      aiClient = new Anthropic({ apiKey });
    }

    logger.info(`AI client initialized: ${provider}`);
    return { initialized: true, provider };
  } catch (error) {
    logger.error('Failed to initialize AI client:', error.message);
    return { initialized: false, error: error.message };
  }
}

/**
 * Process a natural language command
 */
async function processCommand(input, context = {}) {
  logger.ai('Processing command', { input, hasContext: !!context.userId });

  try {
    // Step 1: Parse intent (what the user wants to do)
    const intent = await intentParser.parseIntent(input, aiClient);
    logger.ai('Intent parsed', { intent: intent.type });

    // Step 2: Extract entities (tokens, amounts, addresses, etc.)
    const entities = await entityExtractor.extractEntities(input, intent, aiClient);
    logger.ai('Entities extracted', { entities });

    // Step 3: Validate the parsed command
    const validation = validateCommand(intent, entities);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        suggestions: validation.suggestions,
        requiresConfirmation: false,
      };
    }

    // Step 4: Check if confirmation is needed
    const needsConfirmation = shouldRequireConfirmation(intent, entities, context);

    // Step 5: Build the command object
    const command = buildCommand(intent, entities, context);

    return {
      success: true,
      intent: intent.type,
      command,
      entities,
      confidence: intent.confidence,
      requiresConfirmation: needsConfirmation,
      confirmationMessage: needsConfirmation
        ? responseGenerator.generateConfirmation(command)
        : null,
    };
  } catch (error) {
    logger.error('Command processing failed', { error: error.message });
    return {
      success: false,
      error: error.message,
      suggestions: getSuggestions(input),
    };
  }
}

/**
 * Validate a parsed command
 */
function validateCommand(intent, entities) {
  const errors = [];
  const suggestions = [];

  switch (intent.type) {
    case 'SWAP':
      if (!entities.fromToken) {
        errors.push('Source token not specified');
        suggestions.push('Try: "Swap 0.1 ETH for USDC"');
      }
      if (!entities.toToken) {
        errors.push('Destination token not specified');
      }
      if (!entities.amount) {
        errors.push('Amount not specified');
        suggestions.push('Include an amount like "0.5 ETH" or "100 USDC"');
      }
      break;

    case 'TRANSFER':
      if (!entities.token && !entities.amount) {
        errors.push('Token and amount not specified');
        suggestions.push('Try: "Send 100 USDC to 0x..."');
      }
      if (!entities.recipient) {
        errors.push('Recipient address not specified');
        suggestions.push('Include a recipient address or ENS name');
      }
      break;

    case 'BALANCE':
      // Balance check is always valid
      break;

    case 'QUOTE':
      if (!entities.fromToken || !entities.toToken) {
        errors.push('Both tokens must be specified for a quote');
        suggestions.push('Try: "Quote 1 ETH to USDC"');
      }
      break;

    case 'AIRDROP_CHECK':
      // Airdrop check may not need entities
      break;

    default:
      if (intent.confidence < 0.5) {
        errors.push('Could not understand the command');
        suggestions.push('Try commands like "swap", "send", "balance", or "check airdrop"');
      }
  }

  return {
    valid: errors.length === 0,
    error: errors.join('; '),
    suggestions,
  };
}

/**
 * Check if a command should require user confirmation
 */
function shouldRequireConfirmation(intent, entities, context) {
  // Always confirm for high-value transactions
  const highValueThreshold = parseFloat(process.env.HIGH_VALUE_THRESHOLD || '1000');

  if (entities.amountUsd && entities.amountUsd > highValueThreshold) {
    return true;
  }

  // Confirm swaps and transfers unless auto-confirm is enabled
  if (['SWAP', 'TRANSFER', 'BATCH_TRANSFER'].includes(intent.type)) {
    return !context.autoConfirm;
  }

  return false;
}

/**
 * Build a command object from parsed intent and entities
 */
function buildCommand(intent, entities, context) {
  const baseCommand = {
    type: intent.type,
    chainId: entities.chainId || context.defaultChainId || 1,
    walletAddress: entities.wallet || context.defaultWallet || 'primary',
    timestamp: Date.now(),
  };

  switch (intent.type) {
    case 'SWAP':
      return {
        ...baseCommand,
        params: {
          fromToken: entities.fromToken,
          toToken: entities.toToken,
          amount: entities.amount,
          slippage: entities.slippage || 0.5,
          dex: entities.dex || 'auto',
        },
      };

    case 'TRANSFER':
      return {
        ...baseCommand,
        params: {
          token: entities.token || entities.fromToken,
          amount: entities.amount,
          to: entities.recipient,
        },
      };

    case 'BATCH_TRANSFER':
      return {
        ...baseCommand,
        params: {
          token: entities.token,
          recipients: entities.recipients,
          totalAmount: entities.totalAmount,
          distribution: entities.distribution || 'equal',
        },
      };

    case 'BALANCE':
      return {
        ...baseCommand,
        params: {
          wallet: entities.wallet || 'primary',
          tokens: entities.tokens || [],
        },
      };

    case 'QUOTE':
      return {
        ...baseCommand,
        params: {
          fromToken: entities.fromToken,
          toToken: entities.toToken,
          amount: entities.amount,
        },
      };

    case 'AIRDROP_CHECK':
      return {
        ...baseCommand,
        params: {
          protocol: entities.protocol,
          wallet: entities.wallet || 'primary',
        },
      };

    case 'HELP':
      return {
        ...baseCommand,
        params: {
          topic: entities.topic,
        },
      };

    default:
      return {
        ...baseCommand,
        params: entities,
      };
  }
}

/**
 * Get suggestions for an unrecognized command
 */
function getSuggestions(input) {
  const suggestions = [
    'Swap tokens: "Swap 0.1 ETH for USDC on Arbitrum"',
    'Transfer tokens: "Send 100 USDC to 0x1234..."',
    'Check balance: "What\'s my balance on Polygon?"',
    'Get quote: "Quote 1 ETH to USDC"',
    'Check airdrops: "Check my airdrop eligibility"',
  ];

  // Try to match partial commands
  const lowerInput = input.toLowerCase();

  if (lowerInput.includes('swap') || lowerInput.includes('trade') || lowerInput.includes('exchange')) {
    return [suggestions[0]];
  }
  if (lowerInput.includes('send') || lowerInput.includes('transfer')) {
    return [suggestions[1]];
  }
  if (lowerInput.includes('balance') || lowerInput.includes('how much')) {
    return [suggestions[2]];
  }

  return suggestions.slice(0, 3);
}

/**
 * Generate a response for a completed action
 */
function generateResponse(result, command) {
  return responseGenerator.generate(result, command);
}

/**
 * Chat with the AI for general questions
 */
async function chat(message, context = {}) {
  if (!aiClient) {
    return {
      response: "I can help you with Web3 operations. Try commands like:\n" +
                "- Swap 0.1 ETH for USDC\n" +
                "- Send 100 USDC to vitalik.eth\n" +
                "- Check my balance\n" +
                "- Quote 1 ETH to USDC",
      isCommand: false,
    };
  }

  try {
    const systemPrompt = getSystemPrompt(context);

    if (config.ai.provider === 'openai') {
      const completion = await aiClient.chat.completions.create({
        model: config.ai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        max_tokens: config.ai.maxTokens,
      });

      return {
        response: completion.choices[0].message.content,
        isCommand: false,
      };
    } else if (config.ai.provider === 'anthropic') {
      const response = await aiClient.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      });

      return {
        response: response.content[0].text,
        isCommand: false,
      };
    }
  } catch (error) {
    logger.error('Chat failed:', error.message);
    return {
      response: 'Sorry, I encountered an error. Please try again.',
      isCommand: false,
      error: error.message,
    };
  }
}

module.exports = {
  initializeAI,
  processCommand,
  generateResponse,
  chat,
  validateCommand,
  buildCommand,
  getSuggestions,
};
