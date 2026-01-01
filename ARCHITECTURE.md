# Airdrop Hunter Bot - AI-Powered Web3 Architecture

## System Overview

This document describes the comprehensive architecture of the AI-powered Airdrop Hunter Bot, designed to execute Web3 tasks through natural language commands.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACES                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Telegram  │  │   Discord   │  │  REST API   │  │   Netlify   │        │
│  │     Bot     │  │     Bot     │  │  Endpoint   │  │   Scheduled │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          └────────────────┴────────────────┴────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     NATURAL LANGUAGE AI LAYER                                │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    AI Command Interpreter                          │     │
│  │  • Intent Recognition (swap, transfer, check, claim, etc.)        │     │
│  │  • Entity Extraction (amounts, tokens, addresses, chains)         │     │
│  │  • Context Management (conversation state, user preferences)       │     │
│  │  • Response Generation (human-readable confirmations/results)      │     │
│  └────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMMAND ROUTER                                       │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  Routes parsed intents to appropriate service handlers             │     │
│  │  • Validation Layer (security checks, balance verification)        │     │
│  │  • Rate Limiting (prevent abuse)                                   │     │
│  │  • Audit Logging (track all operations)                            │     │
│  └────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│   SWAP ENGINE     │   │  TRANSFER ENGINE  │   │  AIRDROP ENGINE   │
│                   │   │                   │   │                   │
│ • Uniswap V2/V3   │   │ • Single Transfer │   │ • Eligibility     │
│ • DEX Aggregator  │   │ • Batch Transfer  │   │   Checker         │
│ • Slippage Ctrl   │   │ • Multi-wallet    │   │ • Auto Claim      │
│ • Price Impact    │   │ • Gas Optimization│   │ • Protocol Track  │
│ • Route Finding   │   │ • Scheduling      │   │ • Points System   │
└─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WEB3 CORE ENGINE                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Provider Manager │  │  Wallet Manager  │  │  Gas Optimizer   │          │
│  │ • Multi-chain    │  │  • HD Wallets    │  │  • EIP-1559      │          │
│  │ • Failover       │  │  • Key Rotation  │  │  • Gas Station   │          │
│  │ • Load Balance   │  │  • Access Control│  │  • Priority Fee  │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Contract Factory │  │ Transaction Mgr  │  │  Token Registry  │          │
│  │ • ABI Registry   │  │ • Nonce Manager  │  │  • Metadata      │          │
│  │ • Proxy Support  │  │ • Retry Logic    │  │  • Price Feeds   │          │
│  │ • Verification   │  │ • Status Track   │  │  • Decimals      │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │           │           │           │           │
          ▼           ▼           ▼           ▼           ▼
     ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
     │Ethereum │ │Arbitrum │ │  Base   │ │Polygon  │ │Optimism │
     │ Mainnet │ │  One    │ │         │ │         │ │         │
     └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       SUPPORTING SERVICES                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Notification Svc │  │  Config Manager  │  │   State Store    │          │
│  │ • Discord        │  │  • Chain Configs │  │  • Transaction   │          │
│  │ • Telegram       │  │  • Token Lists   │  │    History       │          │
│  │ • Webhooks       │  │  • User Prefs    │  │  • User State    │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer Descriptions

### 1. User Interfaces Layer

Multiple entry points for interacting with the bot:

| Interface | Purpose | Use Case |
|-----------|---------|----------|
| **Telegram Bot** | Mobile-first chat interface | On-the-go commands via natural language |
| **Discord Bot** | Community integration | Team/DAO operations |
| **REST API** | Programmatic access | External integrations, dashboards |
| **Netlify Scheduled** | Automated tasks | Daily swaps, recurring operations |

### 2. Natural Language AI Layer

The brain of the system - interprets human commands into structured Web3 operations.

**Capabilities:**
- **Intent Recognition**: Classifies user commands (swap, transfer, check balance, claim airdrop)
- **Entity Extraction**: Parses amounts, token symbols, addresses, chain names
- **Validation**: Ensures commands are safe and executable
- **Response Generation**: Returns human-readable results

**Example Interactions:**
```
User: "Swap 0.1 ETH for USDC on Arbitrum with max 1% slippage"
AI Parses:
  - Intent: SWAP
  - Amount: 0.1
  - TokenIn: ETH (native)
  - TokenOut: USDC
  - Chain: Arbitrum
  - Slippage: 1%

User: "Send 100 USDC to vitalik.eth on mainnet"
AI Parses:
  - Intent: TRANSFER
  - Amount: 100
  - Token: USDC
  - Recipient: vitalik.eth (resolves to 0x...)
  - Chain: Ethereum Mainnet

User: "Check my airdrop eligibility for LayerZero"
AI Parses:
  - Intent: CHECK_AIRDROP
  - Protocol: LayerZero
  - Wallet: (from context/config)
```

### 3. Command Router

Central orchestration layer that:
- Routes parsed commands to appropriate engines
- Validates user permissions and balances
- Implements rate limiting
- Logs all operations for audit

### 4. Service Engines

#### Swap Engine
- **Uniswap V2/V3 Integration**: Direct DEX interaction
- **DEX Aggregation**: 1inch, Paraswap, 0x for best rates
- **Slippage Protection**: Configurable min output amounts
- **Price Impact Warning**: Alerts for large trades
- **Multi-hop Routing**: Optimal paths through liquidity

#### Transfer Engine
- **Single Transfers**: One-to-one token sends
- **Batch Transfers**: One-to-many distribution (gas efficient)
- **Multi-wallet Support**: Dynamic wallet management
- **Scheduling**: Recurring transfers

#### Airdrop Engine
- **Eligibility Checking**: Query protocols for qualification
- **Auto-claiming**: Execute claims when available
- **Protocol Tracking**: Monitor upcoming airdrops
- **Activity Farming**: Suggestions for qualification

### 5. Web3 Core Engine

The foundational blockchain interaction layer:

| Component | Responsibility |
|-----------|----------------|
| **Provider Manager** | Multi-chain RPC connections with failover |
| **Wallet Manager** | Secure key management, HD wallet support |
| **Gas Optimizer** | EIP-1559 fee estimation, gas price oracle |
| **Contract Factory** | ABI management, contract instantiation |
| **Transaction Manager** | Nonce handling, retry logic, status tracking |
| **Token Registry** | Token metadata, decimals, price feeds |

### 6. Supporting Services

- **Notification Service**: Real-time alerts via Discord/Telegram
- **Config Manager**: Chain configurations, token lists, user preferences
- **State Store**: Transaction history, user context, operation logs

---

## Directory Structure

```
airdrophunter_bot/
├── src/
│   ├── index.js                    # Main entry point
│   ├── config/
│   │   ├── index.js                # Configuration loader
│   │   ├── chains.js               # Chain configurations
│   │   └── tokens.js               # Token registry
│   │
│   ├── ai/
│   │   ├── index.js                # AI layer entry
│   │   ├── intentParser.js         # Intent recognition
│   │   ├── entityExtractor.js      # Entity extraction
│   │   ├── responseGenerator.js    # Human-readable responses
│   │   └── prompts/
│   │       └── system.js           # AI system prompts
│   │
│   ├── router/
│   │   ├── index.js                # Command router
│   │   └── validator.js            # Input validation
│   │
│   ├── engines/
│   │   ├── swap/
│   │   │   ├── index.js            # Swap engine entry
│   │   │   ├── uniswapV2.js        # Uniswap V2 handler
│   │   │   ├── uniswapV3.js        # Uniswap V3 handler
│   │   │   └── aggregator.js       # DEX aggregator
│   │   │
│   │   ├── transfer/
│   │   │   ├── index.js            # Transfer engine entry
│   │   │   ├── single.js           # Single transfers
│   │   │   └── batch.js            # Batch transfers
│   │   │
│   │   └── airdrop/
│   │       ├── index.js            # Airdrop engine entry
│   │       ├── eligibility.js      # Check eligibility
│   │       └── claim.js            # Claim airdrops
│   │
│   ├── core/
│   │   ├── index.js                # Web3 core entry
│   │   ├── providers.js            # Provider management
│   │   ├── wallets.js              # Wallet management
│   │   ├── gas.js                  # Gas optimization
│   │   ├── contracts.js            # Contract factory
│   │   └── transactions.js         # Transaction manager
│   │
│   ├── services/
│   │   ├── notifications/
│   │   │   ├── index.js            # Notification service
│   │   │   ├── discord.js          # Discord integration
│   │   │   └── telegram.js         # Telegram integration
│   │   │
│   │   └── storage/
│   │       └── index.js            # State storage
│   │
│   └── utils/
│       ├── logger.js               # Logging utility
│       ├── errors.js               # Error definitions
│       └── helpers.js              # Helper functions
│
├── netlify/
│   └── functions/
│       ├── ai-command.js           # AI command endpoint
│       ├── scheduled-swap.js       # Daily swap function
│       └── scheduled-transfer.js   # Daily transfer function
│
├── config/
│   └── default.json                # Default configuration
│
├── .env.example                    # Environment template
├── package.json                    # Dependencies
├── ARCHITECTURE.md                 # This document
└── README.md                       # Setup guide
```

---

## Data Flow Examples

### Example 1: Natural Language Swap

```
User Input: "Swap 0.5 ETH to USDC on Arbitrum"
                    │
                    ▼
            ┌───────────────┐
            │ AI Layer      │
            │ Parse Intent  │
            └───────┬───────┘
                    │
    Intent: SWAP, Amount: 0.5, From: ETH, To: USDC, Chain: Arbitrum
                    │
                    ▼
            ┌───────────────┐
            │ Command Router│
            │ Validate      │
            └───────┬───────┘
                    │
    Validated: Balance OK, Slippage OK, Gas OK
                    │
                    ▼
            ┌───────────────┐
            │ Swap Engine   │
            │ Find Route    │
            └───────┬───────┘
                    │
    Route: ETH → WETH → USDC (Uniswap V3, 0.05% pool)
                    │
                    ▼
            ┌───────────────┐
            │ Web3 Core     │
            │ Execute TX    │
            └───────┬───────┘
                    │
    TX Hash: 0x1234...
                    │
                    ▼
            ┌───────────────┐
            │ AI Response   │
            │ Generator     │
            └───────┬───────┘
                    │
                    ▼
Response: "✅ Swapped 0.5 ETH for 1,247.32 USDC on Arbitrum
           TX: https://arbiscan.io/tx/0x1234..."
```

### Example 2: Batch Transfer

```
User Input: "Distribute 1000 USDC equally to wallet2 and wallet3"
                    │
                    ▼
            ┌───────────────┐
            │ AI Layer      │
            │ Parse Intent  │
            └───────┬───────┘
                    │
    Intent: BATCH_TRANSFER
    Amount: 1000 USDC
    Recipients: [wallet2, wallet3]
    Distribution: EQUAL (500 each)
                    │
                    ▼
            ┌───────────────┐
            │Transfer Engine│
            │ Batch Handler │
            └───────┬───────┘
                    │
    Multicall: [transfer(wallet2, 500), transfer(wallet3, 500)]
                    │
                    ▼
            ┌───────────────┐
            │ Web3 Core     │
            │ Execute TX    │
            └───────┬───────┘
                    │
                    ▼
Response: "✅ Distributed 1000 USDC:
           • wallet2: 500 USDC
           • wallet3: 500 USDC
           Gas saved: 21% vs individual transfers"
```

---

## Security Model

### Private Key Management
```
┌─────────────────────────────────────┐
│     Environment Variables           │
│  (Netlify/Vercel encrypted store)   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      Wallet Manager                 │
│  • Keys never logged                │
│  • Memory-only operations           │
│  • Per-operation wallet selection   │
└─────────────────────────────────────┘
```

### Transaction Safety
1. **Slippage Protection**: Configurable min output (default 0.5%)
2. **Price Impact Limits**: Warn/block high-impact trades
3. **Deadline Enforcement**: 10-minute expiry on swaps
4. **Balance Verification**: Pre-check sufficient funds
5. **Gas Limits**: Prevent runaway transactions

### Access Control
- API key authentication for REST endpoints
- Telegram/Discord user whitelisting
- Rate limiting per user/IP

---

## Supported Chains

| Chain | Chain ID | Native Token | RPC Strategy |
|-------|----------|--------------|--------------|
| Ethereum Mainnet | 1 | ETH | Alchemy + Infura fallback |
| Arbitrum One | 42161 | ETH | Alchemy + Public RPC |
| Base | 8453 | ETH | Alchemy + Public RPC |
| Polygon | 137 | MATIC | Alchemy + Public RPC |
| Optimism | 10 | ETH | Alchemy + Public RPC |
| BSC | 56 | BNB | Public RPC (multiple) |

---

## API Reference

### POST /api/ai-command

Execute a natural language Web3 command.

**Request:**
```json
{
  "command": "Swap 0.1 ETH for USDC on Arbitrum",
  "userId": "user123",
  "options": {
    "dryRun": false,
    "maxSlippage": 1.0
  }
}
```

**Response:**
```json
{
  "success": true,
  "intent": "SWAP",
  "result": {
    "txHash": "0x1234...",
    "amountIn": "0.1 ETH",
    "amountOut": "312.45 USDC",
    "chain": "arbitrum",
    "explorerUrl": "https://arbiscan.io/tx/0x1234..."
  },
  "message": "Successfully swapped 0.1 ETH for 312.45 USDC on Arbitrum"
}
```

---

## Getting Started

See [README.md](./README.md) for setup and deployment instructions.
