/**
 * Check Airdrop Eligibility API
 * Checks wallet eligibility for tracked airdrops
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
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    await ensureInitialized();

    let protocol = null;
    let walletAddress = 'primary';

    // Parse parameters from query string or body
    if (event.httpMethod === 'GET') {
      protocol = event.queryStringParameters?.protocol;
      walletAddress = event.queryStringParameters?.wallet || 'primary';
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      protocol = body.protocol;
      walletAddress = body.wallet || 'primary';
    }

    // Check eligibility
    const result = await bot.checkAirdrop({
      protocol,
      walletAddress,
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
    console.error('Airdrop Check Error:', error);

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
