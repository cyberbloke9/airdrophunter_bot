# Airdrop Hunter Bot

**AI-Powered Web3 Automation for Token Swaps, Transfers, and Airdrop Hunting**

A comprehensive blockchain automation system that uses natural language processing to execute Web3 operations. Simply tell the bot what you want to do in plain English.

## Features

- **Natural Language Commands**: Execute Web3 operations with text prompts
- **Multi-Chain Support**: Ethereum, Arbitrum, Base, Polygon, Optimism, BSC
- **Token Swaps**: Uniswap V2/V3 with slippage protection
- **Batch Transfers**: Gas-efficient multi-recipient distributions
- **Airdrop Tracking**: Monitor eligibility for upcoming airdrops
- **Notifications**: Discord and Telegram alerts
- **Scheduled Operations**: Daily automated swaps and transfers

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd airdrophunter_bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required variables:
- `PRIVATE_KEY_1`: Your wallet private key
- `ALCHEMY_API_KEY`: For RPC access (or set individual `*_RPC_URL`)

Optional for AI features:
- `AI_PROVIDER`: `openai` or `anthropic`
- `AI_API_KEY`: Your API key

### 3. Run Locally

```bash
# Development mode with Netlify
npm run dev

# Or directly
node src/index.js
```

### 4. Deploy to Netlify

```bash
netlify deploy --prod
```

## Usage Examples

### Natural Language Commands

```javascript
const bot = require('./src');

// Initialize
await bot.initialize();

// Swap tokens
const result = await bot.processCommand(
  "Swap 0.1 ETH for USDC on Arbitrum with 1% slippage"
);

// Transfer tokens
await bot.processCommand(
  "Send 100 USDC to vitalik.eth"
);

// Check balance
await bot.processCommand(
  "What's my balance on Polygon?"
);

// Get quote
await bot.processCommand(
  "Quote 1 ETH to USDC"
);

// Check airdrops
await bot.processCommand(
  "Check my airdrop eligibility for LayerZero"
);
```

### Direct API

```javascript
// Direct swap
await bot.swap({
  fromToken: 'ETH',
  toToken: 'USDC',
  amount: '0.1',
  chainId: 42161, // Arbitrum
  slippage: 0.5,
});

// Batch transfer
await bot.batchTransfer({
  token: 'USDC',
  recipients: [
    { address: '0x...', amount: '100' },
    { address: '0x...', amount: '50' },
  ],
  chainId: 1,
});
```

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.netlify/functions/ai-command` | POST | Process natural language command |
| `/.netlify/functions/check-airdrop` | GET/POST | Check airdrop eligibility |
| `/.netlify/functions/status` | GET | System status |

**Example Request:**

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/ai-command \
  -H "Content-Type: application/json" \
  -d '{"command": "Swap 0.1 ETH for USDC on Arbitrum"}'
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     NATURAL LANGUAGE AI LAYER                   │
│         Intent Recognition → Entity Extraction → Routing        │
└─────────────────────────────────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  SWAP ENGINE    │    │ TRANSFER ENGINE │    │ AIRDROP ENGINE  │
│  Uniswap V2/V3  │    │  Single/Batch   │    │   Eligibility   │
│  DEX Aggregator │    │  Gas Optimized  │    │   Auto Claim    │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WEB3 CORE ENGINE                           │
│  Providers (Multi-chain) │ Wallets │ Gas Optimizer │ Contracts │
└─────────────────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation.

## Supported Chains

| Chain | ID | Status |
|-------|----|--------|
| Ethereum | 1 | ✅ Full Support |
| Arbitrum | 42161 | ✅ Full Support |
| Base | 8453 | ✅ Full Support |
| Polygon | 137 | ✅ Full Support |
| Optimism | 10 | ✅ Full Support |
| BSC | 56 | ✅ Full Support |

## Scheduled Operations

The bot can run automated operations on a schedule:

- **Daily Swap**: Convert ETH to stablecoins
- **Daily Transfer**: Distribute tokens to configured wallets

Configure via environment variables (see `.env.example`).

## Airdrop Tracking

Track eligibility for:
- LayerZero
- zkSync
- Starknet
- Scroll
- Linea
- EigenLayer
- Blast

```javascript
// Check specific protocol
await bot.checkAirdrop({ protocol: 'layerzero' });

// Check all protocols
await bot.checkAirdrop({});

// Get suggestions
const suggestions = bot.airdropEngine.getSuggestions('layerzero');
```

## Notifications

### Discord

```env
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

### Telegram

```env
TELEGRAM_BOT_TOKEN="123456:ABC..."
TELEGRAM_CHAT_ID="-1001234567890"
```

## Security

- Private keys stored in environment variables only
- Slippage protection on all swaps (default 0.5%)
- Price impact warnings for large trades
- High-value transaction confirmations
- Rate limiting to prevent abuse

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint code
npm run lint

# Local development
npm run dev
```

## Project Structure

```
airdrophunter_bot/
├── src/
│   ├── index.js           # Main entry point
│   ├── ai/                # Natural language processing
│   ├── core/              # Web3 engine (providers, wallets, contracts)
│   ├── engines/           # Swap, Transfer, Airdrop engines
│   ├── router/            # Command routing and validation
│   ├── services/          # Notifications, storage
│   ├── config/            # Configuration (chains, tokens)
│   └── utils/             # Helpers, logging, errors
├── netlify/
│   └── functions/         # API endpoints
├── .env.example           # Environment template
├── ARCHITECTURE.md        # Detailed architecture docs
└── README.md              # This file
```

## Technology Stack

- **Runtime**: Node.js 18+
- **Blockchain**: ethers.js v5
- **DEX**: Uniswap V2/V3, DEX Aggregators
- **AI**: OpenAI GPT-4 / Anthropic Claude (optional)
- **Hosting**: Netlify Functions
- **Notifications**: Discord, Telegram

## License

MIT

## Support

For issues and feature requests, please open a GitHub issue.
