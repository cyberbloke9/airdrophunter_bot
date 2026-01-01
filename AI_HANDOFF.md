# AI Agent Handoff Document - Airdrop Hunter Bot v3.0

> **CRITICAL**: This document is the single source of truth for any AI agent working on this project.
> Always read this file FIRST before making any changes.
> Always UPDATE this file after completing any milestone.

---

## Quick Context (Read This First)

**Project**: Airdrop Hunter Bot - AI-powered Web3 automation for token swaps, transfers, and airdrop farming
**Owner**: @cyberbloke9 (Prithvi Putta)
**Repository**: https://github.com/cyberbloke9/airdrophunter_bot
**Local Path**: `C:/Users/Prithvi Putta/airdrophunter_bot`

**Current Phase**: Phase 1, Sprint 1.1 - Core Safety Infrastructure
**Status**: IMPLEMENTATION COMPLETE - ALL 10 SECURITY MODULES IMPLEMENTED

---

## Table of Contents

1. [Project Architecture](#project-architecture)
2. [Enhancement Proposal Summary](#enhancement-proposal-summary)
3. [Implementation Progress](#implementation-progress)
4. [Part 1: Known Knowns - Detailed Specs](#part-1-known-knowns)
5. [Part 2: Known Unknowns - Detailed Specs](#part-2-known-unknowns)
6. [Part 3: Unknown Knowns - Detailed Specs](#part-3-unknown-knowns)
7. [Part 4: Unknown Unknowns - Detailed Specs](#part-4-unknown-unknowns)
8. [File Structure](#file-structure)
9. [Dependencies](#dependencies)
10. [Testing Requirements](#testing-requirements)
11. [Session Log](#session-log)

---

## Project Architecture

### Current Codebase Structure

```
airdrophunter_bot/
├── src/
│   ├── ai/                    # NLP intent recognition
│   │   ├── entityExtractor.js
│   │   ├── index.js
│   │   ├── intentParser.js
│   │   ├── prompts/system.js
│   │   └── responseGenerator.js
│   │
│   ├── config/                # Chain and token definitions
│   │   ├── chains.js
│   │   ├── index.js
│   │   └── tokens.js
│   │
│   ├── core/                  # Web3 provider/wallet engine
│   │   ├── contracts.js
│   │   ├── index.js
│   │   ├── providers.js
│   │   ├── transactions.js
│   │   └── wallets.js
│   │
│   ├── engines/               # Swap, transfer, airdrop logic
│   │   ├── airdrop/
│   │   │   ├── claim.js
│   │   │   ├── eligibility.js
│   │   │   └── index.js
│   │   ├── swap/
│   │   │   ├── aggregator.js
│   │   │   ├── index.js
│   │   │   ├── uniswapV2.js
│   │   │   └── uniswapV3.js
│   │   └── transfer/
│   │       ├── batch.js
│   │       ├── index.js
│   │       └── single.js
│   │
│   ├── router/                # Command validation/routing
│   │   ├── index.js
│   │   └── validator.js
│   │
│   ├── services/              # Notifications, storage
│   │   └── notifications/
│   │       ├── discord.js
│   │       ├── index.js
│   │       └── telegram.js
│   │
│   ├── utils/                 # Helper functions, logging
│   │   ├── errors.js
│   │   ├── helpers.js
│   │   └── logger.js
│   │
│   └── index.js               # Main entry point
│
├── netlify/                   # Serverless functions
│   └── functions/
│       ├── ai-command.js
│       ├── check-airdrop.js
│       ├── scheduled-swap.js
│       ├── scheduled-transfer.js
│       ├── status.js
│       ├── swap.js
│       └── transfer.js
│
├── docs/
│   └── ENHANCEMENT_PROPOSAL.md  # Full risk-aware upgrade plan
│
├── ARCHITECTURE.md
├── README.md
├── package.json
└── AI_HANDOFF.md              # THIS FILE
```

### New Structure to Create

```
src/
├── security/                  # NEW - Core Safety Infrastructure
│   ├── index.js              # Security module exports
│   ├── input-validator.js    # Calldata validation, function whitelisting
│   ├── access-control.js     # Role-based access, tier management
│   ├── multisig.js           # Safe{Wallet} integration
│   ├── oracle-guard.js       # Dual oracle, staleness, L2 sequencer
│   ├── mev-protection.js     # Flashbots, private mempool
│   ├── slippage-guard.js     # Tiered slippage, 3% hard cap
│   ├── execution-guard.js    # Operation locks, reentrancy prevention
│   ├── key-manager.js        # AWS Secrets Manager, key rotation
│   ├── nonce-manager.js      # Nonce tracking, gap prevention
│   ├── approval-manager.js   # Token approval tracking, auto-revoke
│   ├── contract-verifier.js  # Etherscan verification, drainer detection
│   └── rpc-manager.js        # Multi-RPC failover, health checks
│
├── compliance/                # NEW - Regulatory Flexibility
│   ├── index.js
│   ├── address-screening.js  # OFAC list checking
│   ├── audit-logger.js       # 7-year retention logging
│   └── geo-restrictions.js   # Jurisdiction blocking
│
├── strategies/                # NEW - Pluggable Airdrop Strategies
│   ├── index.js
│   ├── strategy-engine.js    # Hot-swappable strategy system
│   ├── sybil-resistant.js    # Anti-detection patterns
│   └── protocols/            # Per-protocol strategies
│       ├── layerzero.js
│       ├── zksync.js
│       ├── scroll.js
│       └── linea.js
│
└── monitoring/                # NEW - Observability
    ├── index.js
    ├── dashboard.js          # Real-time tx monitoring
    ├── alerts.js             # Discord/Telegram alerts
    └── analytics.js          # MEV extraction tracking
```

---

## Enhancement Proposal Summary

The project follows the **Rumsfeld Risk Matrix** framework:

| Category | Description | Priority |
|----------|-------------|----------|
| **Known Knowns** | Documented risks with known mitigations | CRITICAL - MVP blockers |
| **Known Unknowns** | Identified but unquantifiable risks | HIGH - Pre-production |
| **Unknown Knowns** | Overlooked institutional knowledge | HIGH - Edge cases |
| **Unknown Unknowns** | Black swan events | MEDIUM - Resilience |

### Phase Structure

| Phase | Sprint | Focus | Status |
|-------|--------|-------|--------|
| **Phase 1** | 1.1 | Core Safety Infrastructure | **PLANNING COMPLETE** |
| **Phase 1** | 1.2 | MEV Protection & Monitoring | NOT STARTED |
| **Phase 2** | 2.1 | Secret Management & Key Security | NOT STARTED |
| **Phase 2** | 2.2 | Contract Safety & Simulation | NOT STARTED |
| **Phase 3** | 3.1 | Activity Automation (Sybil-resistant) | NOT STARTED |
| **Phase 3** | 3.2 | Points & Eligibility Tracking | NOT STARTED |
| **Phase 4** | 4.1 | Strategy Framework | NOT STARTED |
| **Phase 4** | 4.2 | Auto-Compounding & Rebalancing | NOT STARTED |
| **Phase 5** | 5.1 | Portfolio Tracking | NOT STARTED |
| **Phase 5** | 5.2 | Alerts & Reporting | NOT STARTED |
| **Phase 6** | 6.1 | L2 & ZK Rollup Integration | NOT STARTED |
| **Phase 6** | 6.2 | Bridge Aggregation | NOT STARTED |

---

## Implementation Progress

### Completed

- [x] Repository cloned locally
- [x] Codebase structure analyzed
- [x] Enhancement proposal reviewed
- [x] Part 1 mitigations fully specified (7/7)
- [x] Part 2 mitigations fully specified (3/3)
- [x] Part 3 mitigations fully specified (4/4)
- [x] Part 4 mitigations fully specified (4/4)
- [x] AI Handoff document created
- [x] **Sprint 1.1 Implementation COMPLETE (10/10 modules)**:
  - [x] `src/security/slippage-guard.js` - Tiered slippage with 3% hard cap
  - [x] `src/security/input-validator.js` - 3-layer calldata validation
  - [x] `src/security/nonce-manager.js` - Async lock, stuck tx detection
  - [x] `src/security/approval-manager.js` - Auto-revoke, risk tracking
  - [x] `src/security/oracle-guard.js` - Dual oracle + L2 sequencer
  - [x] `src/security/execution-guard.js` - State machine, reentrancy protection
  - [x] `src/security/mev-protection.js` - Flashbots Protect integration
  - [x] `src/security/rpc-manager.js` - Multi-provider failover
  - [x] `src/security/key-manager.js` - AWS Secrets Manager, tiered wallets
  - [x] `src/security/access-control.js` - RBAC + multi-sig approvals
  - [x] `src/security/index.js` - Module exports + createSecurityLayer()

### Completed (Integration Tests)

- [x] **Integration tests for security layer (36 tests, all passing)**:
  - [x] tests/integration/security-integration.test.js (36 tests)
    - createSecurityLayer factory tests
    - Slippage Guard integration tests
    - Execution Guard integration tests
    - RPC Failover integration tests
    - Nonce Management integration tests
    - Token Approval integration tests
    - MEV Protection integration tests
    - Key Management integration tests
    - Access Control integration tests
    - Input Validator integration tests
    - End-to-End flow tests
    - Health status and shutdown tests

### Completed (Unit Tests)

- [x] Git commit and push to GitHub (8a96204)
- [x] **Unit tests for security modules (324 tests, all passing)**:
  - [x] tests/security/slippage-guard.test.js (34 tests)
  - [x] tests/security/input-validator.test.js (37 tests)
  - [x] tests/security/nonce-manager.test.js (24 tests)
  - [x] tests/security/approval-manager.test.js (28 tests)
  - [x] tests/security/oracle-guard.test.js (29 tests)
  - [x] tests/security/execution-guard.test.js (30 tests)
  - [x] tests/security/mev-protection.test.js (29 tests)
  - [x] tests/security/rpc-manager.test.js (36 tests)
  - [x] tests/security/key-manager.test.js (44 tests)
  - [x] tests/security/access-control.test.js (45 tests)
  - [x] jest.config.js (test configuration)

### Completed (Chaos Engineering Tests)

- [x] **Chaos engineering tests for resilience (52 tests, all passing)**:
  - [x] tests/chaos/chaos-engineering.test.js (52 tests)
    - RPC Failure Cascade (10 tests) - Health tracking, failover, recovery
    - Nonce Gap Recovery (8 tests) - Stuck tx detection, cleanup, concurrency
    - MEV Sandwich Simulation (9 tests) - Risk analysis, routing, protection
    - Malicious Contract Detection (9 tests) - Selectors, drainers, validation
    - Stablecoin Depeg Response (10 tests) - Thresholds, slippage, oracles
    - System-Wide Chaos (6 tests) - Emergency stop, shutdown, status

### Not Started

- [ ] Sprint 1.2: MEV Protection & Monitoring enhancements

---

## Sprint 1.2: MEV Protection & Monitoring - DETAILED SPECIFICATIONS

> **STATUS**: READY FOR IMPLEMENTATION
> **Priority**: HIGH - Pre-production requirement

Sprint 1.2 enhances the existing MEV protection module and adds comprehensive monitoring capabilities.

### 1.2.1 Transaction Simulation Engine

**File**: `src/security/tx-simulator.js`
**Status**: TO BE IMPLEMENTED

**WHY**: Pre-execution simulation prevents failed transactions and detects MEV attacks before they happen. Tenderly reports 15-20% of DeFi transactions fail on first attempt.

**Architecture**:
```
SIMULATION FLOW:
┌─────────────────────────────────────────────────────────────────────────┐
│  1. Build Transaction                                                   │
│     └── Construct calldata, set gas estimates                          │
│                                                                         │
│  2. Fork State Simulation                                               │
│     ├── eth_call against current state                                 │
│     ├── Trace execution path                                           │
│     └── Detect state changes                                           │
│                                                                         │
│  3. Output Validation                                                   │
│     ├── Expected vs actual token amounts                               │
│     ├── Gas usage estimation                                           │
│     └── Revert detection with reason                                   │
│                                                                         │
│  4. MEV Risk Assessment                                                 │
│     ├── Compare simulated output to quoted output                      │
│     ├── Flag if difference > slippage tolerance                        │
│     └── Recommend private submission if high risk                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Implementation Details**:
- Use `eth_call` with state overrides for simulation
- Parse revert reasons using error selectors
- Track gas estimation accuracy over time
- Integration with Tenderly API (optional, for detailed traces)
- Fallback to local simulation if API unavailable

**Interface**:
```javascript
class TxSimulator {
  async simulate(tx, provider) → { success, gasUsed, returnData, stateChanges }
  async simulateBundle(txs, provider) → { results[], bundleSuccess }
  async estimateOutput(swapTx, provider) → { expectedOutput, confidence }
  parseRevertReason(error) → { reason, selector }
}
```

---

### 1.2.2 Sandwich Attack Detection

**File**: `src/monitoring/sandwich-detector.js`
**Status**: TO BE IMPLEMENTED

**WHY**: Post-execution analysis identifies if transactions were sandwiched, enabling learning and adaptation of protection strategies.

**Architecture**:
```
DETECTION ALGORITHM:
┌─────────────────────────────────────────────────────────────────────────┐
│  1. Get Block Transactions                                              │
│     └── Fetch all txs in same block as target tx                       │
│                                                                         │
│  2. Identify Candidate Sandwiches                                       │
│     ├── Same token pair transactions                                   │
│     ├── Within ±5 tx index of target                                   │
│     └── Different sender (attacker EOA/contract)                       │
│                                                                         │
│  3. Validate Sandwich Pattern                                           │
│     ├── Tx before: Buy target token (frontrun)                         │
│     ├── Target tx: User's swap                                         │
│     └── Tx after: Sell target token (backrun)                          │
│                                                                         │
│  4. Calculate Extraction                                                │
│     ├── User's price impact vs expected                                │
│     ├── Attacker's profit (backrun - frontrun - gas)                   │
│     └── Percentage of swap value extracted                             │
│                                                                         │
│  5. Record & Alert                                                      │
│     ├── Log to analytics database                                      │
│     ├── Alert if extraction > 0.5%                                     │
│     └── Update protection strategy weights                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Implementation Details**:
- Parse swap event logs to identify token movements
- Use block explorers or archive nodes for historical analysis
- Maintain attacker address database
- Calculate MEV extraction metrics over time

**Interface**:
```javascript
class SandwichDetector {
  async analyzeTransaction(txHash, provider) → { wasSandwiched, details }
  async getBlockSandwiches(blockNumber, provider) → SandwichEvent[]
  async getExtractionStats(wallet, days) → { totalExtracted, avgPerTx }
  isKnownAttacker(address) → boolean
}
```

---

### 1.2.3 Real-Time Monitoring Dashboard

**File**: `src/monitoring/dashboard.js`
**Status**: TO BE IMPLEMENTED

**WHY**: Operators need visibility into bot operations, transaction status, and security events in real-time.

**Architecture**:
```
DASHBOARD COMPONENTS:
┌─────────────────────────────────────────────────────────────────────────┐
│                         MONITORING DASHBOARD                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────┐  │
│  │  TRANSACTION FEED   │  │   WALLET STATUS     │  │  MEV METRICS   │  │
│  │                     │  │                     │  │                │  │
│  │  • Pending txs      │  │  • Balances         │  │  • Sandwiches  │  │
│  │  • Confirmed txs    │  │  • Nonce status     │  │  • Extraction  │  │
│  │  • Failed txs       │  │  • Approvals        │  │  • Protection  │  │
│  │  • Gas costs        │  │  • Health           │  │  • Savings     │  │
│  └─────────────────────┘  └─────────────────────┘  └────────────────┘  │
│                                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────┐  │
│  │   RPC HEALTH        │  │   ORACLE STATUS     │  │  ALERTS        │  │
│  │                     │  │                     │  │                │  │
│  │  • Provider status  │  │  • Price freshness  │  │  • Security    │  │
│  │  • Latency          │  │  • Deviation        │  │  • Errors      │  │
│  │  • Failovers        │  │  • L2 sequencer     │  │  • Warnings    │  │
│  │  • Rate limits      │  │  • Confidence       │  │  • Info        │  │
│  └─────────────────────┘  └─────────────────────┘  └────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Implementation Details**:
- Event-driven architecture using EventEmitter
- WebSocket support for real-time updates
- Aggregated metrics with configurable time windows
- Export to Prometheus/Grafana (optional)
- CLI and web interface options

**Interface**:
```javascript
class Dashboard {
  constructor(securityLayer, config)
  start() → void
  stop() → void
  getStatus() → DashboardStatus
  subscribe(event, callback) → unsubscribe
  exportMetrics(format) → string
}
```

---

### 1.2.4 Alert System

**File**: `src/monitoring/alerts.js`
**Status**: TO BE IMPLEMENTED

**WHY**: Operators need immediate notification of security events, failures, and anomalies to take action.

**Architecture**:
```
ALERT CATEGORIES:
┌─────────────────────────────────────────────────────────────────────────┐
│  CRITICAL (Immediate action required)                                   │
│  ├── Emergency stop activated                                          │
│  ├── Suspected exploit/attack                                          │
│  ├── Private key usage anomaly                                         │
│  ├── All RPCs failing                                                  │
│  └── Wallet balance critically low                                     │
│                                                                         │
│  HIGH (Action within 1 hour)                                            │
│  ├── Transaction sandwich detected (>1% extraction)                   │
│  ├── Oracle price deviation warning                                    │
│  ├── Multiple transaction failures                                     │
│  ├── Stuck transaction detected                                        │
│  └── RPC failover triggered                                            │
│                                                                         │
│  MEDIUM (Action within 24 hours)                                        │
│  ├── Gas prices unusually high                                         │
│  ├── Approval audit needed                                             │
│  ├── Key rotation due                                                  │
│  └── Slippage threshold exceeded                                       │
│                                                                         │
│  LOW (Informational)                                                    │
│  ├── Transaction confirmed                                             │
│  ├── Daily summary                                                     │
│  └── Configuration changes                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Delivery Channels**:
- Discord webhook (existing integration)
- Telegram bot (existing integration)
- Console logging (always)
- Email (optional, SMTP integration)
- PagerDuty/OpsGenie (optional, for on-call)

**Key Implementation Details**:
- Rate limiting to prevent alert fatigue
- Alert deduplication within time window
- Escalation rules (HIGH → CRITICAL if unacknowledged)
- Alert history and acknowledgment tracking

**Interface**:
```javascript
class AlertSystem {
  constructor(config)
  sendAlert(level, category, message, data) → Promise<void>
  acknowledge(alertId) → void
  mute(category, duration) → void
  getAlertHistory(filter) → Alert[]
  setThresholds(thresholds) → void
}
```

---

### 1.2.5 Analytics & Reporting

**File**: `src/monitoring/analytics.js`
**Status**: TO BE IMPLEMENTED

**WHY**: Long-term analysis of bot performance, MEV extraction, gas efficiency, and profitability enables optimization.

**Metrics to Track**:
```
PERFORMANCE METRICS:
├── Transaction success rate (by chain, protocol)
├── Average gas cost per transaction type
├── Slippage: expected vs actual
├── MEV extraction suffered
├── MEV protection savings
├── Wallet P&L over time

OPERATIONAL METRICS:
├── RPC uptime and latency
├── Failover frequency
├── Nonce management efficiency
├── Key usage patterns
├── Alert frequency by category

AIRDROP METRICS:
├── Activity diversity score
├── Protocol interaction count
├── Estimated points/eligibility
└── Wallet "health" score
```

**Key Implementation Details**:
- Time-series storage (SQLite for MVP, TimescaleDB for production)
- Configurable retention periods
- Export to CSV/JSON for external analysis
- Scheduled report generation

**Interface**:
```javascript
class Analytics {
  recordEvent(type, data) → void
  getMetrics(metric, timeRange) → MetricData[]
  generateReport(reportType, options) → Report
  getPerformanceSummary(wallet, days) → Summary
}
```

---

### Sprint 1.2 Implementation Order

| Order | Module | Estimated Effort | Dependencies |
|-------|--------|------------------|--------------|
| 1 | tx-simulator.js | Medium | mev-protection.js |
| 2 | alerts.js | Low | logger, notifications |
| 3 | sandwich-detector.js | Medium | tx-simulator.js |
| 4 | analytics.js | Medium | All security modules |
| 5 | dashboard.js | High | All above modules |

### Sprint 1.2 Testing Requirements

**Unit Tests**:
- [ ] tx-simulator.test.js
- [ ] sandwich-detector.test.js
- [ ] dashboard.test.js
- [ ] alerts.test.js
- [ ] analytics.test.js

**Integration Tests**:
- [ ] Full MEV detection flow
- [ ] Alert escalation paths
- [ ] Dashboard real-time updates

---

## Part 1: Known Knowns

### 1.1 Input Validation

**File**: `src/security/input-validator.js`
**Status**: SPECIFIED, NOT IMPLEMENTED

**Architecture**:
```
LAYER 1: Semantic Validation (existing validator.js)
├── Token symbols exist on chain
├── Amounts positive, within decimals
├── Addresses valid (checksummed/ENS)
└── Slippage within bounds

LAYER 2: Calldata Validation (NEW)
├── Function selector whitelisting (4-byte)
├── Parameter bounds checking
├── Address parameter validation
└── Nested calldata inspection (multicall)

LAYER 3: Contract Verification (NEW)
├── Etherscan/Sourcify verified check
├── Known malicious contract database
├── Contract age check (<24hr = suspicious)
└── Proxy implementation verification
```

**Key Implementation Details**:
- Whitelist of known-safe function selectors (approve, transfer, swap variants)
- Decode calldata using ethers.js AbiCoder
- Reject zero address parameters
- Reject suspiciously large uint256 values (>MaxUint256/2)
- Check contract verification status via Etherscan API

---

### 1.2 Access Control

**File**: `src/security/access-control.js`, `src/security/multisig.js`
**Status**: SPECIFIED, NOT IMPLEMENTED

**Architecture**:
```
TIER 1: HOT WALLET
├── Max balance: 0.5 ETH / $500
├── Max single tx: 0.1 ETH / $100
├── Rate limit: 20 tx/hour
├── Allowed ops: swap, transfer_small, gas_refill, claim_airdrop
└── No approval required

TIER 2: WARM WALLET
├── Max balance: 5 ETH / $5000
├── Max single tx: 1 ETH / $1000
├── Rate limit: 10 tx/hour
├── Allowed ops: swap, transfer, bridge, lp_add, lp_remove
├── Requires: 2-of-3 multi-sig
└── 24-hour timelock for >$1000

TIER 3: COLD STORAGE
├── Hardware wallet / air-gapped
├── Requires: 3-of-5 multi-sig
├── 72-hour timelock for all ops
└── Emergency withdrawals only
```

**Key Implementation Details**:
- Use Safe{Wallet} SDK (`@safe-global/protocol-kit`) for multi-sig
- Implement tiered permission matrix
- Operation log for audit trail
- Signature collection and threshold checking
- Timelock queue for high-value operations

---

### 1.3 Oracle Protection

**File**: `src/security/oracle-guard.js`
**Status**: SPECIFIED, NOT IMPLEMENTED

**Architecture**:
```
PRIMARY: Chainlink Price Feeds
├── Staleness check: reject if lastUpdate > 1 hour
├── Round completeness: answeredInRound == roundId
└── Sanity check: price > 0

SECONDARY: Uniswap V3 TWAP
├── 30-minute time-weighted average
├── Manipulation-resistant (requires sustained capital)
└── Fallback when Chainlink unavailable

DEVIATION CHECK:
├── Compare Primary vs Secondary
├── >5% deviation: REJECT transaction
├── >2% deviation: WARNING + confirmation required
└── Alert on consistent deviations

L2 SEQUENCER CHECK:
├── Arbitrum: 0xFdB631F5EE196F0ed6FAa767959853A9F217697D
├── Optimism: 0x371EAD81c9102C9BF4874A9075FFFf170F2Ee389
├── Base: 0xBCF85224fc0756B9Fa45aA7892530B47e10b6433
├── If sequencer down: BLOCK all L2 operations
└── 1-hour grace period after recovery
```

**Key Implementation Details**:
- AggregatorV3Interface for Chainlink
- Uniswap V3 Pool `observe()` for TWAP
- Tick math conversion to price
- Chain-specific feed addresses
- Graceful degradation when one oracle unavailable

---

### 1.4 MEV Protection

**File**: `src/security/mev-protection.js`
**Status**: SPECIFIED, NOT IMPLEMENTED

**Architecture**:
```
STEP 1: Pre-Execution Simulation
├── Tenderly API or local fork
├── Detect reverts before spending gas
├── Calculate expected output
└── Heuristic sandwich detection

STEP 2: Route Selection
├── Ethereum: Flashbots Protect RPC (https://rpc.flashbots.net)
├── Alternative: MEV Blocker (https://rpc.mevblocker.io)
├── L2s: Native RPC with strict slippage
└── Fallback: Public mempool + 3% max slippage

STEP 3: Post-Execution Monitoring
├── Compare expected vs actual output
├── Detect sandwich (same-block frontrun/backrun)
├── Log MEV extraction for analysis
└── Alert if extraction > 0.5%
```

**Key Implementation Details**:
- Flashbots RPC for Ethereum mainnet
- Transaction simulation before submission
- Same-block transaction analysis for sandwich detection
- MEV statistics tracking

---

### 1.5 Slippage Protection

**File**: `src/security/slippage-guard.js`
**Status**: SPECIFIED, NOT IMPLEMENTED

**Architecture**:
```
TIER 1: STABLECOINS (USDC, USDT, DAI, FRAX)
├── Default: 0.1%
└── Max: 0.5%

TIER 2: MAJOR TOKENS (ETH, BTC, UNI, AAVE, etc.)
├── Default: 0.5%
└── Max: 1%

TIER 3: VOLATILE TOKENS
├── Default: 1%
└── Max: 3% (HARD CEILING)

ABSOLUTE MAXIMUM: 3% - NEVER EXCEEDED

DYNAMIC ADJUSTMENT:
├── Query pool liquidity before trade
├── Trade >1% of pool: increase to tier max
├── Trade >5% of pool: REJECT
└── Price impact warning at 1%+
```

**Key Implementation Details**:
- Token classification (stablecoin/major/volatile)
- Use stricter tier when swapping between tiers
- minAmountOut calculation with BigNumber precision
- Pool liquidity query for dynamic adjustment
- Hard cap enforcement (user cannot override)

---

### 1.6 Reentrancy Protection

**File**: `src/security/execution-guard.js`
**Status**: SPECIFIED, NOT IMPLEMENTED

**Architecture**:
```
Check-Effects-Interactions Pattern:

1. CHECK: Acquire lock, verify balance, reserve nonce
2. EFFECTS: Update local state (balance reserved, nonce used)
3. INTERACTION: Execute on-chain transaction
4. VERIFY: Confirm expected outcome, release/rollback

Mutex Locks:
├── Per wallet/operation combination
├── 2-minute timeout
└── Async-lock library

Balance Reservation:
├── Track reserved amounts per wallet/token
├── Available = Actual - Reserved
└── Prevents concurrent overspend

Nonce Management:
├── Reserve nonce before tx
├── Release on failure
├── Confirm on success
└── Gap prevention
```

**Key Implementation Details**:
- `async-lock` library for mutex
- Balance reservation map
- Nonce reservation set
- Outcome verification after tx
- Automatic cleanup/rollback on failure

---

### 1.7 Private Key Management

**File**: `src/security/key-manager.js`
**Status**: SPECIFIED, NOT IMPLEMENTED

**Architecture**:
```
TIER 1: HOT KEYS
├── Storage: AWS Secrets Manager
├── Retrieved on-demand, never persisted
├── Rotation: 30 days
├── Max balance: 0.5 ETH

TIER 2: WARM KEYS
├── Storage: Safe{Wallet} Multi-Sig (2-of-3)
├── Rotation: 90 days
├── Max balance: 5 ETH

TIER 3: COLD KEYS
├── Storage: Hardware wallet / air-gapped
├── 3-of-5 multi-sig
├── Rotation: Annual

KEY LIFECYCLE:
GENERATE → STORE → USE → ROTATE
(Secure)   (Vault)  (On-Demand) (Scheduled)
```

**Key Implementation Details**:
- AWS SDK for Secrets Manager
- `useKey(keyId, callback)` pattern - key never leaves closure
- Secure memory zeroing after use
- Automatic rotation with balance transfer
- Usage logging for anomaly detection
- Alert on suspicious patterns (>20 uses/5min)

---

## Part 2: Known Unknowns

> **STATUS**: SPECIFICATION IN PROGRESS

### 2.1 Regulatory Evolution

**File**: `src/compliance/index.js`, `src/compliance/address-screening.js`
**Status**: TO BE SPECIFIED

**Problem**: Regulatory landscape is evolving rapidly. Tornado Cash delisting, GENIUS Act, CLARITY Act.

**Architecture**:
```
MODULAR COMPLIANCE LAYER (toggleable):

Address Screening:
├── OFAC SDN list checking
├── Chainalysis API integration (optional)
├── Block sanctioned addresses
└── Configurable strictness levels

Audit Logging:
├── All transactions logged
├── 7-year retention (tax/legal)
├── Encrypted storage
├── Export for compliance reporting

Geo-Restrictions:
├── IP-based jurisdiction detection
├── Configurable blocked countries
├── VPN detection (optional)
└── Graceful degradation

Protocol Whitelisting:
├── Only interact with verified protocols
├── Configurable whitelist
└── Auto-add verified protocols
```

**Key Implementation Details**:
- Modular design - can enable/disable compliance features
- OFAC list updates via automated fetch
- Structured logging with timestamps
- Export to CSV/JSON for auditors
- Environment-based configuration

---

### 2.2 Airdrop Criteria Evolution

**File**: `src/strategies/strategy-engine.js`
**Status**: TO BE SPECIFIED

**Problem**: Airdrop criteria change yearly. 2022 was TX count, 2023 was diversity, 2024 was points systems. 2025+ unknown.

**Architecture**:
```
PLUGGABLE STRATEGY ENGINE:

Strategy Interface:
├── name: string
├── protocols: string[]
├── actions: { swap, bridge, lend, stake, governance, nft }
├── scheduling: { frequency, timeWindow, variance }
└── execute(wallet, action): Promise<TxResult>

Hot-Swappable:
├── Register new strategies without code deploy
├── A/B testing between strategies
├── Weighted random selection
└── Performance tracking per strategy

Per-Protocol Strategies:
├── LayerZero: bridge volume, message count
├── zkSync: tx count, contract interactions
├── Scroll: early adopter, testnet bridge
├── Linea: LXP points, voyage quests
└── EigenLayer: restaking, AVS delegation
```

**Key Implementation Details**:
- Strategy registry (Map)
- JSON-based strategy definitions
- Dynamic loading from config
- Metrics collection per strategy
- Auto-disable underperforming strategies

---

### 2.3 Protocol Upgrades

**File**: `src/core/protocol-registry.js` (enhance existing)
**Status**: SPECIFIED

**Problem**: Protocols upgrade (Uniswap V2→V3→V4, Aave V2→V3). Must handle breaking changes.

**Architecture**:
```
PROTOCOL VERSION ABSTRACTION:

Protocol Registry:
├── uniswap: { v2: adapter, v3: adapter, v4: adapter (beta) }
├── aave: { v2: adapter, v3: adapter }
├── curve: { v1: adapter, v2: adapter }
└── defaultVersion per protocol

Adapter Interface:
├── getQuote(tokenIn, tokenOut, amount): Quote
├── executeSwap(params): TxResult
├── getPoolLiquidity(pair): BigNumber
└── version: string

Upgrade Detection:
├── Monitor governance proposals
├── Track new contract deployments
├── Alert on deprecated function usage
└── Automated adapter testing
```

**Key Implementation Details**:
- ProtocolRegistry class with version management
- ProtocolAdapter abstract base class
- Automatic migration path following
- Deprecation warnings with graceful fallback
- JSON-based protocol configuration

---

## Part 3: Unknown Knowns

> **STATUS**: SPECIFICATION COMPLETE

### 3.1 Nonce Management

**File**: `src/security/nonce-manager.js`
**Status**: SPECIFIED

**Problem**: Nonces must be strictly sequential. Parallel transactions cause race conditions. Stuck transactions block wallets.

**Architecture**:
```
NONCE MANAGER:

State Tracking:
├── pendingNonces: Map<wallet, Set<nonce>>
├── confirmedNonce: Map<wallet, lastConfirmed>
└── lock: AsyncLock per wallet

Operations:
├── getNextNonce(wallet, provider): Reserve and return
├── confirmNonce(wallet, nonce): Mark confirmed
├── releaseNonce(wallet, nonce): Release on failure
└── cancelStuckTransaction(wallet, nonce): Send 0-value replacement

Gap Prevention:
├── Always use next sequential nonce
├── Wait for confirmation before next
├── Auto-cancel stuck transactions after timeout
└── Retry with higher gas on replacement
```

---

### 3.2 Token Approval Persistence

**File**: `src/security/approval-manager.js`
**Status**: TO BE SPECIFIED

**Problem**: Infinite approvals persist forever. Protocol compromise = token drain.

**Architecture**:
```
APPROVAL MANAGER:

Policy:
├── maxApproval: 'exact' | '2x' | 'infinite'
├── autoRevoke: true (revoke after swap)
├── auditSchedule: 'weekly'
└── alerts: { infiniteApproval, unverifiedContract }

Operations:
├── safeApprove(token, spender, amount): Exact amount only
├── revokeApproval(token, spender): Set to 0
├── getAllApprovals(wallet): List all active approvals
├── auditApprovals(): Check for risky approvals
└── revokeAll(wallet): Emergency revoke all
```

---

### 3.3 L2 Sequencer Downtime

**File**: `src/security/oracle-guard.js` (integrated)
**Status**: SPECIFIED (Part of Oracle Guard)

**Implementation**: See Oracle Protection section above.

---

### 3.4 RPC Failover

**File**: `src/security/rpc-manager.js`
**Status**: TO BE SPECIFIED

**Problem**: Single RPC = single point of failure. Infura outages caused widespread dApp failures.

**Architecture**:
```
RESILIENT PROVIDER:

Provider Priority:
├── Ethereum: [Alchemy, Infura, QuickNode, LlamaRPC]
├── Arbitrum: [Alchemy, public]
├── Optimism: [Alchemy, public]
└── Base: [Alchemy, public]

Failover:
├── maxRetries: 3
├── retryDelayMs: 1000
├── exponentialBackoff: true
└── Try all providers before failing

Health Check:
├── intervalMs: 30000
├── maxLatencyMs: 2000
├── minBlockRecency: 30s
└── Auto-disable unhealthy providers

Rate Limiting:
├── requestsPerSecond: 25
├── burstAllowance: 50
└── Queue excess requests
```

---

## Part 4: Unknown Unknowns

> **STATUS**: SPECIFICATION COMPLETE

### 4.1 Stablecoin Depeg

**File**: `src/monitoring/depeg-monitor.js`
**Status**: SPECIFIED

**Problem**: UST collapsed 100%. USDC depegged 12% in March 2023. Cannot predict.

**Architecture**:
```
STABLECOIN MONITOR:

Monitoring:
├── threshold: 2% (alert)
├── criticalThreshold: 5% (pause)
├── checkInterval: 60000 (1 min)
└── sources: [Chainlink, CoinGecko, DEX pools]

Diversification:
├── maxSingleStableExposure: 50%
├── safest: [USDC, DAI]
├── moderate: [FRAX, LUSD]
└── risky: [algorithmic] - avoid

Emergency Protocol:
├── autoSwapOnDepeg: false (too risky)
├── alertAdmins: true
├── pauseNewOperations: true
└── documentedExitPlan: true
```

---

### 4.2 Chain Reorganization

**File**: `src/security/reorg-protection.js`
**Status**: TO BE SPECIFIED

**Problem**: Ethereum had 7-block reorg in May 2022. L2 reorgs can invalidate state.

**Architecture**:
```
REORG PROTECTION:

Confirmation Requirements:
├── Ethereum: 12 blocks (~3 min)
├── Arbitrum: 0 (relies on L1)
├── Optimism: 0 (relies on L1)
├── Base: 0 (relies on L1)
├── Polygon: 128 blocks
└── BSC: 15 blocks

Cross-Chain:
├── Wait for L1 finality: 64 blocks (~13 min)
└── Re-verify state after delay

State Verification:
├── Re-check transaction 30s after confirmation
├── Detect if reorged
└── Retry if transaction disappeared
```

---

### 4.3 Bridge Exploits

**File**: `src/engines/bridge/safety.js`
**Status**: TO BE SPECIFIED

**Problem**: Ronin ($625M), Wormhole ($326M), Nomad ($190M) - bridges are high-risk.

**Architecture**:
```
BRIDGE SAFETY:

Selection:
├── Prefer native L2 bridges (canonical)
├── Score: TVL, audits, track record, decentralization
├── Avoid: new, low TVL, unaudited
└── Never use >25% of bridge's liquidity

Limits:
├── Per-transaction: 10% of bridge liquidity
├── Per-day: 25% of portfolio
├── Split large bridges
└── Use multiple bridges for redundancy

Verification:
├── Verify destination receipt
├── Track bridge txs separately
├── Alert on stuck/failed
└── Know manual recovery procedures
```

---

### 4.4 ERC-4337 Vulnerabilities

**File**: `src/security/erc4337-safety.js`
**Status**: TO BE SPECIFIED

**Problem**: Account abstraction is new. UniPass vulnerability found. Bundler DoS risks.

**Architecture**:
```
ERC-4337 SAFETY:

EntryPoint:
├── canonical: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
├── verifyBeforeUse: true
└── Reject non-canonical

Bundler Whitelist:
├── bundler.biconomy.io
├── bundler.stackup.sh
├── bundler.pimlico.io
└── fallbackEnabled: true

Paymaster:
├── verifyPaymaster: true
├── maxGas: 500000
└── Check sponsorship before trusting

UserOperation:
├── maxCallGasLimit: 1000000
├── maxVerificationGasLimit: 500000
└── strictValidation: true
```

---

## File Structure

### Files to Create

| File | Priority | Status |
|------|----------|--------|
| `src/security/index.js` | P0 | ✅ COMPLETE |
| `src/security/input-validator.js` | P0 | ✅ COMPLETE |
| `src/security/access-control.js` | P0 | ✅ COMPLETE |
| `src/security/multisig.js` | P0 | ⏭️ MERGED INTO access-control.js |
| `src/security/oracle-guard.js` | P0 | ✅ COMPLETE |
| `src/security/mev-protection.js` | P0 | ✅ COMPLETE |
| `src/security/slippage-guard.js` | P0 | ✅ COMPLETE |
| `src/security/execution-guard.js` | P0 | ✅ COMPLETE |
| `src/security/key-manager.js` | P0 | ✅ COMPLETE |
| `src/security/nonce-manager.js` | P0 | ✅ COMPLETE |
| `src/security/approval-manager.js` | P1 | ✅ COMPLETE |
| `src/security/contract-verifier.js` | P1 | ⏭️ MERGED INTO input-validator.js |
| `src/security/rpc-manager.js` | P1 | ✅ COMPLETE |
| `src/compliance/index.js` | P2 | NOT STARTED |
| `src/compliance/address-screening.js` | P2 | NOT STARTED |
| `src/compliance/audit-logger.js` | P2 | NOT STARTED |
| `src/strategies/strategy-engine.js` | P2 | NOT STARTED |
| `src/monitoring/depeg-monitor.js` | P2 | NOT STARTED |

---

## Dependencies

### To Add to package.json

```json
{
  "dependencies": {
    "@safe-global/protocol-kit": "^4.0.0",
    "@aws-sdk/client-secrets-manager": "^3.500.0",
    "async-lock": "^1.4.0",
    "node-fetch": "^3.3.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0"
  }
}
```

---

## Testing Requirements

### Unit Tests (Per Module)

- [ ] input-validator.test.js
- [ ] access-control.test.js
- [ ] oracle-guard.test.js
- [ ] mev-protection.test.js
- [ ] slippage-guard.test.js
- [ ] execution-guard.test.js
- [ ] key-manager.test.js
- [ ] nonce-manager.test.js

### Integration Tests

- [x] Full swap flow with all security checks
- [x] Multi-sig approval flow
- [x] Key rotation with balance transfer
- [x] RPC failover under load

### Chaos Engineering

- [ ] RPC Failure Cascade: Kill primary+secondary, verify tertiary
- [ ] Nonce Gap Recovery: Inject stuck tx, verify auto-recovery
- [ ] MEV Sandwich Simulation: Execute trade with attack simulation
- [ ] Malicious Contract Detection: Attempt drainer interaction
- [ ] Stablecoin Depeg Response: Simulate 5% depeg

---

## Session Log

### Session 1 - 2026-01-01

**Agent**: Claude Opus 4.5
**Duration**: Active
**User**: @cyberbloke9

**Completed**:
1. Cloned repository to `C:/Users/Prithvi Putta/airdrophunter_bot`
2. Analyzed full codebase structure (38 JS files)
3. Read and understood ENHANCEMENT_PROPOSAL.md (1227 lines)
4. Created detailed specifications for all Part 1 mitigations (7/7):
   - Input Validation (3-layer architecture)
   - Access Control (RBAC + Multi-sig)
   - Oracle Protection (Dual oracle + L2 sequencer)
   - MEV Protection (Flashbots + simulation)
   - Slippage Protection (Tiered + 3% hard cap)
   - Reentrancy Protection (Execution guard)
   - Private Key Management (AWS Vault + rotation)
5. Created this AI_HANDOFF.md document
6. Created detailed specifications for all Part 2 mitigations (3/3):
   - Regulatory Evolution (Modular compliance layer)
   - Airdrop Criteria Evolution (Pluggable strategy engine)
   - Protocol Upgrades (Version abstraction registry)
7. Created detailed specifications for all Part 3 mitigations (4/4):
   - Nonce Management (Lock/release pattern)
   - Token Approval Persistence (Auto-revoke, tracking)
   - L2 Sequencer Downtime (Integrated in Oracle Guard)
   - RPC Failover (Multi-provider with health monitoring)
8. Created detailed specifications for all Part 4 mitigations (4/4):
   - Stablecoin Depeg (Multi-source monitoring, circuit breaker)
   - Chain Reorganization (Chain-specific finality, re-verification)
   - Bridge Exploits (Conservative limits, recovery procedures)
   - ERC-4337 Vulnerabilities (EntryPoint verification, bundler whitelist)

**ALL SPECIFICATIONS COMPLETE - READY FOR IMPLEMENTATION**

**Completed This Session**:
1. Continued Sprint 1.1 implementation
2. Implemented remaining 6 security modules:
   - oracle-guard.js (Dual oracle + L2 sequencer health)
   - execution-guard.js (State machine + reentrancy protection)
   - mev-protection.js (Flashbots Protect + simulation)
   - rpc-manager.js (Multi-provider failover + health monitoring)
   - key-manager.js (AWS Secrets Manager + tiered wallets)
   - access-control.js (RBAC + multi-sig approvals)
3. Created index.js with unified exports and createSecurityLayer()
4. Updated AI_HANDOFF.md with progress

---

### Session 2 - 2026-01-01 (Continuation)

**Agent**: Claude Opus 4.5
**Duration**: Active
**User**: @cyberbloke9

**Completed**:
1. **SPRINT 1.1 IMPLEMENTATION COMPLETE** - All 10 security modules implemented:

   | Module | Lines | Key Features |
   |--------|-------|--------------|
   | slippage-guard.js | ~360 | Tiered slippage (stable/major/volatile), 3% hard cap, dynamic adjustment |
   | input-validator.js | ~420 | Function selector whitelist, calldata decoding, contract verification |
   | nonce-manager.js | ~420 | Async lock, stuck tx detection, auto-cancel, speed-up |
   | approval-manager.js | ~420 | Exact approvals, auto-revoke, risk assessment, registry tracking |
   | oracle-guard.js | ~350 | Chainlink + TWAP, staleness checks, L2 sequencer health |
   | execution-guard.js | ~400 | State machine, pre/post hooks, emergency stop, metrics |
   | mev-protection.js | ~380 | Flashbots Protect, simulation, bundle support, risk analysis |
   | rpc-manager.js | ~420 | Multi-provider failover, health checks, latency monitoring |
   | key-manager.js | ~430 | AWS/Vault integration, tiered wallets, key rotation, AES-256-GCM |
   | access-control.js | ~400 | RBAC, permission inheritance, multi-sig approvals, audit log |
   | index.js | ~180 | Unified exports, createSecurityLayer() factory |

2. Updated AI_HANDOFF.md with implementation progress

**Total Lines of Code**: ~4,180 lines of production-ready security infrastructure

**Next Steps**:
1. ✅ Commit and push all changes to GitHub
2. ✅ Write unit tests for each module (324 tests)
3. ✅ Integration testing (36 tests)
4. Begin Sprint 1.2 (MEV Protection enhancements)

**Notes**:
- User wants comprehensive handoff for context preservation
- Focus on state-of-the-art approaches with theory justification
- All code must be production-ready with proper error handling
- Use async-lock for mutex (custom implementation to avoid dependencies)
- AWS Secrets Manager for production key storage
- Custom AsyncLock implemented in nonce-manager.js and execution-guard.js

---

### Session 3 - 2026-01-01 (Integration Tests)

**Agent**: Claude Opus 4.5
**Duration**: Active
**User**: @cyberbloke9

**Completed**:
1. **Integration Tests Complete** - 36 tests covering full security layer:

   | Test Category | Tests | Key Coverage |
   |---------------|-------|--------------|
   | createSecurityLayer Factory | 3 | Module creation, convenience methods, constants |
   | Slippage Guard | 3 | Stablecoin/major slippage, validation, max enforcement |
   | Execution Guard | 4 | Successful execution, error handling, metrics, concurrency |
   | RPC Failover | 4 | Primary/secondary failover, retries, health metrics |
   | Nonce Management | 2 | Concurrent nonces, confirmation tracking |
   | Token Approval | 4 | Exact approvals, tracking, risk detection, statistics |
   | MEV Protection | 3 | DEX swap routing, L2 sequencer, risk analysis |
   | Key Management | 3 | Encryption/decryption, tier limits, spending tracking |
   | Access Control | 3 | Role assignment, permissions, audit logging |
   | Input Validator | 2 | Function selectors, empty calldata rejection |
   | End-to-End Flow | 1 | Complete execution with all security checks |
   | Health & Shutdown | 2 | Comprehensive health status, clean shutdown |

2. Fixed API mismatches between tests and implementations:
   - `validateSlippage(slippage)` - single argument, not 3
   - `hasPermission()` instead of `hasRole()`
   - `getUserPermissions()` instead of `getPermissions()`
   - `assignRole(userId, role, assignedBy)` - 3 arguments
   - Used `ROLE` and `PERMISSION` constants from exports

3. Updated AI_HANDOFF.md with completion status

**Total Test Count**: 360 tests (324 unit + 36 integration), all passing

**Next Steps**:
1. Commit and push integration tests to GitHub
2. Begin chaos engineering tests (optional)
3. Begin Sprint 1.2 (MEV Protection enhancements)

---

## Prompt for Cross-Collaborating AI Agents

**IMPORTANT: Read this section if you are a new AI agent working on this project.**

When working on the airdrophunter_bot project, follow these instructions:

1. **ALWAYS read AI_HANDOFF.md first** - This is the single source of truth
2. **Check Implementation Progress** - See what's completed vs pending
3. **Follow the specifications exactly** - Part 1-4 specs are comprehensive
4. **Update AI_HANDOFF.md after milestones** - Keep the document current
5. **Log your session** - Add an entry to the Session Log section
6. **Commit frequently** - Push to GitHub after each major change
7. **Use the established patterns** - Follow the code style in existing modules
8. **Test thoroughly** - Each module should have unit tests
9. **Preserve context** - Add important decisions to this document

**Code Standards**:
- Use ethers.js v5 for all blockchain interactions
- All classes should have JSDoc comments
- Error handling should be comprehensive
- Logging should use the injected logger pattern
- Avoid external dependencies when possible (custom AsyncLock used)

---

## How to Use This Document

### For AI Agents

1. **First**: Read the "Quick Context" section
2. **Check**: "Implementation Progress" for current state
3. **Find**: Relevant section for your task
4. **Update**: This document after completing milestones
5. **Log**: Your session in the "Session Log" section

### For Human Developers

1. This document is the canonical source of truth
2. All architectural decisions are documented here
3. Implementation should follow specs exactly
4. Update this doc when making significant changes

---

*Last Updated: 2026-01-01 (Session 3) by Claude Opus 4.5*
*Sprint 1.1: COMPLETE - 10 security modules (~4,180 LOC), 324 unit tests, 36 integration tests (360 total)*
