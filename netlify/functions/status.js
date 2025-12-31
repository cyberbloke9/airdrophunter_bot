/**
 * Status API
 * Returns system status and health information
 */

const bot = require('../../src');

// Initialize on cold start
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    try {
      await bot.initialize();
      initialized = true;
    } catch (error) {
      console.error('Initialization error:', error);
    }
  }
}

/**
 * Main handler
 */
exports.handler = async function (event, context) {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: '',
    };
  }

  try {
    await ensureInitialized();

    const status = await bot.getStatus();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'online',
        initialized,
        timestamp: new Date().toISOString(),
        ...status,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'error',
        initialized: false,
        error: error.message,
      }),
    };
  }
};
