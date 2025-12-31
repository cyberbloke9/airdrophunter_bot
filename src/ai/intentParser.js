/**
 * Intent Parser
 * Recognizes user intent from natural language input
 */

const logger = require('../utils/logger');

// Intent definitions
const INTENTS = {
  SWAP: {
    keywords: ['swap', 'exchange', 'trade', 'convert', 'buy', 'sell'],
    patterns: [
      /swap\s+(.+)\s+(?:for|to)\s+(.+)/i,
      /(?:buy|get)\s+(.+)\s+with\s+(.+)/i,
      /sell\s+(.+)\s+for\s+(.+)/i,
      /convert\s+(.+)\s+to\s+(.+)/i,
      /trade\s+(.+)\s+for\s+(.+)/i,
      /exchange\s+(.+)\s+(?:for|to)\s+(.+)/i,
    ],
  },

  TRANSFER: {
    keywords: ['send', 'transfer', 'pay', 'give'],
    patterns: [
      /send\s+(.+)\s+to\s+(.+)/i,
      /transfer\s+(.+)\s+to\s+(.+)/i,
      /pay\s+(.+)\s+to\s+(.+)/i,
    ],
  },

  BATCH_TRANSFER: {
    keywords: ['distribute', 'airdrop', 'batch send', 'send to all', 'split'],
    patterns: [
      /distribute\s+(.+)\s+to\s+(.+)/i,
      /batch\s+(?:send|transfer)\s+(.+)/i,
      /split\s+(.+)\s+(?:between|among)\s+(.+)/i,
      /send\s+(.+)\s+to\s+(?:all|multiple|wallets)/i,
    ],
  },

  BALANCE: {
    keywords: ['balance', 'holdings', 'portfolio', 'how much', 'what do i have'],
    patterns: [
      /(?:check|show|get|what(?:'s| is))\s*(?:my)?\s*balance/i,
      /how\s+much\s+(?:do\s+i\s+have|.+\s+have\s+i)/i,
      /(?:my|show)\s+(?:portfolio|holdings)/i,
      /what(?:'s| do)\s+(?:i\s+have|my\s+.+\s+balance)/i,
    ],
  },

  QUOTE: {
    keywords: ['quote', 'price', 'rate', 'how much would', 'what would i get'],
    patterns: [
      /quote\s+(.+)\s+(?:for|to)\s+(.+)/i,
      /(?:what|how\s+much)\s+(?:would|will)\s+(?:i\s+get|.+\s+be)/i,
      /price\s+(?:of|for)\s+(.+)/i,
      /(?:check|get)\s+(?:the\s+)?(?:swap\s+)?(?:rate|quote)/i,
    ],
  },

  AIRDROP_CHECK: {
    keywords: ['airdrop', 'eligibility', 'eligible', 'claim', 'drop'],
    patterns: [
      /check\s+(?:my\s+)?(?:airdrop|eligibility)/i,
      /am\s+i\s+eligible/i,
      /(?:any|check)\s+airdrops/i,
      /claim\s+(?:my\s+)?airdrop/i,
    ],
  },

  GAS: {
    keywords: ['gas', 'fees', 'gwei'],
    patterns: [
      /(?:check|what(?:'s| is)|show)\s+(?:the\s+)?gas/i,
      /gas\s+(?:price|fees|cost)/i,
      /current\s+(?:gas|fees)/i,
    ],
  },

  STATUS: {
    keywords: ['status', 'transaction', 'tx', 'pending'],
    patterns: [
      /(?:check|show|what(?:'s| is))\s+(?:the\s+)?(?:tx|transaction)\s+status/i,
      /status\s+of\s+(?:tx|transaction)/i,
      /pending\s+transactions/i,
    ],
  },

  HELP: {
    keywords: ['help', 'how do', 'what can', 'commands', 'guide'],
    patterns: [
      /(?:help|how\s+do\s+i|what\s+can)/i,
      /(?:show|list)\s+commands/i,
      /guide\s+me/i,
    ],
  },
};

/**
 * Parse intent from natural language input
 */
async function parseIntent(input, aiClient = null) {
  // First try rule-based parsing
  const ruleBasedResult = parseIntentRuleBased(input);

  if (ruleBasedResult.confidence >= 0.8) {
    return ruleBasedResult;
  }

  // If rule-based has low confidence and AI is available, use AI
  if (aiClient && ruleBasedResult.confidence < 0.6) {
    try {
      const aiResult = await parseIntentWithAI(input, aiClient);
      if (aiResult.confidence > ruleBasedResult.confidence) {
        return aiResult;
      }
    } catch (error) {
      logger.warn('AI intent parsing failed, using rule-based result');
    }
  }

  return ruleBasedResult;
}

/**
 * Rule-based intent parsing
 */
function parseIntentRuleBased(input) {
  const normalizedInput = input.toLowerCase().trim();
  let bestMatch = { type: 'UNKNOWN', confidence: 0, matchedPattern: null };

  for (const [intentType, intentDef] of Object.entries(INTENTS)) {
    // Check keywords
    let keywordScore = 0;
    for (const keyword of intentDef.keywords) {
      if (normalizedInput.includes(keyword)) {
        keywordScore += 0.3;
      }
    }

    // Check patterns
    let patternScore = 0;
    let matchedPattern = null;
    for (const pattern of intentDef.patterns) {
      const match = normalizedInput.match(pattern);
      if (match) {
        patternScore = 0.7;
        matchedPattern = match;
        break;
      }
    }

    const totalScore = Math.min(keywordScore + patternScore, 1.0);

    if (totalScore > bestMatch.confidence) {
      bestMatch = {
        type: intentType,
        confidence: totalScore,
        matchedPattern,
        matchedKeywords: intentDef.keywords.filter(k => normalizedInput.includes(k)),
      };
    }
  }

  return bestMatch;
}

/**
 * AI-based intent parsing
 */
async function parseIntentWithAI(input, aiClient) {
  const intentTypes = Object.keys(INTENTS).join(', ');

  const prompt = `Classify the following user command into one of these intents: ${intentTypes}, UNKNOWN.

User command: "${input}"

Respond with JSON only:
{
  "intent": "INTENT_TYPE",
  "confidence": 0.0-1.0
}`;

  try {
    const config = require('../config');

    if (config.ai.provider === 'openai') {
      const completion = await aiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0,
      });

      const response = JSON.parse(completion.choices[0].message.content);
      return {
        type: response.intent,
        confidence: response.confidence,
        source: 'ai',
      };
    } else if (config.ai.provider === 'anthropic') {
      const response = await aiClient.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      });

      const parsed = JSON.parse(response.content[0].text);
      return {
        type: parsed.intent,
        confidence: parsed.confidence,
        source: 'ai',
      };
    }
  } catch (error) {
    logger.warn('AI parsing failed:', error.message);
    throw error;
  }
}

/**
 * Get examples for an intent type
 */
function getIntentExamples(intentType) {
  const examples = {
    SWAP: [
      'Swap 0.1 ETH for USDC',
      'Buy 100 USDC with ETH',
      'Trade my WBTC for ETH on Arbitrum',
    ],
    TRANSFER: [
      'Send 100 USDC to 0x1234...',
      'Transfer 0.5 ETH to vitalik.eth',
      'Pay 50 DAI to my friend',
    ],
    BALANCE: [
      'Check my balance',
      'What\'s my ETH balance on Polygon?',
      'Show my portfolio',
    ],
    QUOTE: [
      'Quote 1 ETH to USDC',
      'How much USDC for 0.5 ETH?',
      'Price of ETH in USDC',
    ],
    AIRDROP_CHECK: [
      'Check my airdrop eligibility',
      'Any airdrops available?',
      'Am I eligible for the LayerZero airdrop?',
    ],
  };

  return examples[intentType] || [];
}

module.exports = {
  parseIntent,
  parseIntentRuleBased,
  parseIntentWithAI,
  getIntentExamples,
  INTENTS,
};
