/**
 * AI Command API Endpoint
 * Processes natural language Web3 commands
 */

const bot = require('../../src');

// Initialize on cold start
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await bot.initialize();
    initialized = true;
  }
}

/**
 * Main handler
 */
exports.handler = async function (event, context) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    await ensureInitialized();

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { command, userId, options = {} } = body;

    if (!command) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Command is required' }),
      };
    }

    // Process the command
    const result = await bot.processCommand(command, {
      userId,
      autoConfirm: options.autoConfirm,
      confirmed: options.confirmed,
      defaultChainId: options.chainId,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('AI Command Error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};
