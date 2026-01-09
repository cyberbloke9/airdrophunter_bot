'use strict';

/**
 * System Dependency Graph
 *
 * =============================================================================
 * THE 6 W's: DEPENDENCY GRAPH & REGRESSION TESTING
 * =============================================================================
 *
 * WHO:
 * ----
 * WHO uses this dependency graph:
 *
 * - DEVELOPERS: Understand module relationships before making changes
 *   - Know what will break if module X changes
 *   - Understand safe refactoring boundaries
 *   - Navigate codebase with confidence
 *
 * - CI/CD PIPELINES: Validate system integrity on every commit
 *   - Ensure all exports are stable
 *   - Verify cross-module compatibility
 *   - Detect breaking changes early
 *
 * - ARCHITECTS: Plan new features with full context
 *   - Identify integration points
 *   - Understand data flow paths
 *   - Make informed design decisions
 *
 * WHAT:
 * -----
 * WHAT this module provides:
 *
 * | Export | Description |
 * |--------|-------------|
 * | MODULES | Complete module inventory with metadata |
 * | DEPENDENCY_GRAPH | Directed graph of module dependencies |
 * | INTEGRATION_POINTS | Cross-layer connections |
 * | EXPORT_CONTRACTS | Expected exports per module |
 * | validateExports() | Runtime export validation |
 * | getDependents() | Find all modules that depend on X |
 * | getDependencies() | Find all modules that X depends on |
 * | getImpactAnalysis() | Analyze blast radius of changes |
 *
 * WHEN:
 * -----
 * WHEN to use this module:
 *
 * - BEFORE CHANGES: Run impact analysis
 * - DURING PR REVIEW: Verify no unintended breaks
 * - AFTER DEPLOYMENT: Regression test validation
 * - DURING ONBOARDING: Understand system structure
 *
 * WHERE:
 * ------
 * WHERE in the architecture:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                      AIRDROP HUNTER BOT ARCHITECTURE                        │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  ┌─────────────────────────────────────────────────────────────────────┐   │
 * │  │                         ENTRY POINT                                  │   │
 * │  │                        src/index.js                                  │   │
 * │  └─────────────────────────┬───────────────────────────────────────────┘   │
 * │                            │                                               │
 * │          ┌─────────────────┼─────────────────────────────┐                 │
 * │          ▼                 ▼                             ▼                 │
 * │  ┌───────────────┐ ┌───────────────┐            ┌───────────────┐         │
 * │  │     CORE      │ │      AI       │            │    CONFIG     │         │
 * │  │  (web3Core)   │ │  (NLP/Intent) │            │ (chains/tokens)│         │
 * │  └───────┬───────┘ └───────────────┘            └───────────────┘         │
 * │          │                                                                 │
 * │          ├─────────────────────────────────────────────────────────┐       │
 * │          ▼                                                         │       │
 * │  ┌───────────────────────────────────────────────────────────────┐ │       │
 * │  │                    SECURITY LAYER (Sprint 1.1)                 │ │       │
 * │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │ │       │
 * │  │  │ Slippage    │ │ Input       │ │ Oracle      │              │ │       │
 * │  │  │ Guard       │ │ Validator   │ │ Guard       │              │ │       │
 * │  │  └─────────────┘ └─────────────┘ └─────────────┘              │ │       │
 * │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │ │       │
 * │  │  │ Nonce       │ │ Approval    │ │ Execution   │              │ │       │
 * │  │  │ Manager     │ │ Manager     │ │ Guard       │              │ │       │
 * │  │  └─────────────┘ └─────────────┘ └─────────────┘              │ │       │
 * │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │ │       │
 * │  │  │ MEV         │ │ RPC         │ │ Key         │              │ │       │
 * │  │  │ Protection  │ │ Manager     │ │ Manager     │              │ │       │
 * │  │  └─────────────┘ └─────────────┘ └─────────────┘              │ │       │
 * │  │  ┌─────────────┐                                              │ │       │
 * │  │  │ Access      │                                              │ │       │
 * │  │  │ Control     │                                              │ │       │
 * │  │  └─────────────┘                                              │ │       │
 * │  └───────────────────────────────────────────────────────────────┘ │       │
 * │          │                                                         │       │
 * │          ▼                                                         │       │
 * │  ┌───────────────────────────────────────────────────────────────┐ │       │
 * │  │                  MONITORING LAYER (Sprint 1.2)                 │ │       │
 * │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │ │       │
 * │  │  │ Alert       │ │ Sandwich    │ │ Analytics   │              │ │       │
 * │  │  │ System      │ │ Detector    │ │             │              │ │       │
 * │  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘              │ │       │
 * │  │         │               │               │                     │ │       │
 * │  │         └───────────────┴───────────────┘                     │ │       │
 * │  │                         │                                     │ │       │
 * │  │                         ▼                                     │ │       │
 * │  │  ┌─────────────┐ ┌─────────────┐                              │ │       │
 * │  │  │ Dashboard   │ │ TX          │ ◄── from security/tx-simulator│ │       │
 * │  │  └─────────────┘ │ Simulator   │                              │ │       │
 * │  │                  └─────────────┘                              │ │       │
 * │  └───────────────────────────────────────────────────────────────┘ │       │
 * │          │                                                         │       │
 * │          ▼                                                         │       │
 * │  ┌───────────────────────────────────────────────────────────────┐ │       │
 * │  │                  COMPLIANCE LAYER (Sprint 2.1)                 │ │       │
 * │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │ │       │
 * │  │  │ Audit       │ │ Address     │ │ Geo         │              │ │       │
 * │  │  │ Logger      │ │ Screener    │ │ Restrictor  │              │ │       │
 * │  │  └─────────────┘ └─────────────┘ └─────────────┘              │ │       │
 * │  │                         │                                     │ │       │
 * │  │    Wraps Security + Monitoring Layer components               │ │       │
 * │  └───────────────────────────────────────────────────────────────┘ │       │
 * │          │                                                         │       │
 * │          ▼                                                         │       │
 * │  ┌───────────────────────────────────────────────────────────────┐ │       │
 * │  │                  AIRDROP LAYER (Sprint 3.1 + 3.2)              │◄┘       │
 * │  │  ┌─────────────────────────────────────────────────────────┐  │         │
 * │  │  │ Sprint 3.1: Activity Automation                         │  │         │
 * │  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │  │         │
 * │  │  │  │ Strategy     │ │ Randomizer   │ │ Diversity    │     │  │         │
 * │  │  │  │ Engine       │ │              │ │ Tracker      │     │  │         │
 * │  │  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘     │  │         │
 * │  │  │         │                │                │             │  │         │
 * │  │  │         └────────────────┴────────────────┘             │  │         │
 * │  │  │                          │                              │  │         │
 * │  │  │                          ▼                              │  │         │
 * │  │  │              ┌──────────────────┐                       │  │         │
 * │  │  │              │    Scheduler     │ ◄── Depends on all 3  │  │         │
 * │  │  │              └──────────────────┘                       │  │         │
 * │  │  └─────────────────────────────────────────────────────────┘  │         │
 * │  │  ┌─────────────────────────────────────────────────────────┐  │         │
 * │  │  │ Sprint 3.2: Points & Eligibility (INDEPENDENT)          │  │         │
 * │  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │  │         │
 * │  │  │  │ Points       │ │ Eligibility  │ │ Claim        │     │  │         │
 * │  │  │  │ Aggregator   │ │ Checker      │ │ Automation   │     │  │         │
 * │  │  │  └──────────────┘ └──────────────┘ └──────────────┘     │  │         │
 * │  │  │  ┌──────────────┐                                       │  │         │
 * │  │  │  │ ROI          │                                       │  │         │
 * │  │  │  │ Tracker      │                                       │  │         │
 * │  │  │  └──────────────┘                                       │  │         │
 * │  │  └─────────────────────────────────────────────────────────┘  │         │
 * │  └───────────────────────────────────────────────────────────────┘         │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * WHY:
 * ----
 * WHY dependency tracking matters:
 *
 * - PREVENT BREAKING CHANGES: Know impact before refactoring
 * - ENABLE SAFE UPDATES: Update modules with confidence
 * - IMPROVE TEST COVERAGE: Focus tests on integration points
 * - ACCELERATE ONBOARDING: Visual system understanding
 * - SUPPORT ARCHITECTURE DECISIONS: Data-driven planning
 *
 * HOW:
 * ----
 * HOW to use this module:
 *
 * ```javascript
 * const { getDependents, getImpactAnalysis, validateAllExports } = require('./dependency-graph');
 *
 * // Before changing SlippageGuard:
 * const impacted = getDependents('security/slippage-guard');
 * // Returns: ['security/index', 'compliance/index']
 *
 * // Full impact analysis:
 * const analysis = getImpactAnalysis('monitoring/alerts');
 * // Returns: { direct: [...], transitive: [...], testFiles: [...] }
 *
 * // Validate all exports in CI:
 * const valid = await validateAllExports();
 * // Returns: { passed: true, failures: [] }
 * ```
 *
 * =============================================================================
 */

// ============================================================================
// MODULE REGISTRY
// ============================================================================

/**
 * Complete inventory of all modules in the system
 */
const MODULES = {
  // ==================== ENTRY POINT ====================
  'index': {
    path: 'src/index.js',
    layer: 'entry',
    description: 'Main application entry point',
    sprint: 'foundation',
  },

  // ==================== CORE LAYER ====================
  'core/index': {
    path: 'src/core/index.js',
    layer: 'core',
    description: 'Web3 core engine hub',
    sprint: 'foundation',
  },
  'core/providers': {
    path: 'src/core/providers.js',
    layer: 'core',
    description: 'RPC provider management',
    sprint: 'foundation',
  },
  'core/wallets': {
    path: 'src/core/wallets.js',
    layer: 'core',
    description: 'Wallet management',
    sprint: 'foundation',
  },
  'core/contracts': {
    path: 'src/core/contracts.js',
    layer: 'core',
    description: 'Contract interactions',
    sprint: 'foundation',
  },
  'core/transactions': {
    path: 'src/core/transactions.js',
    layer: 'core',
    description: 'Transaction building and sending',
    sprint: 'foundation',
  },

  // ==================== CONFIG LAYER ====================
  'config/index': {
    path: 'src/config/index.js',
    layer: 'config',
    description: 'Configuration hub',
    sprint: 'foundation',
  },
  'config/chains': {
    path: 'src/config/chains.js',
    layer: 'config',
    description: 'Chain configurations',
    sprint: 'foundation',
  },
  'config/tokens': {
    path: 'src/config/tokens.js',
    layer: 'config',
    description: 'Token registry',
    sprint: 'foundation',
  },

  // ==================== AI LAYER ====================
  'ai/index': {
    path: 'src/ai/index.js',
    layer: 'ai',
    description: 'AI module hub',
    sprint: 'foundation',
  },
  'ai/intentParser': {
    path: 'src/ai/intentParser.js',
    layer: 'ai',
    description: 'Natural language intent parsing',
    sprint: 'foundation',
  },
  'ai/entityExtractor': {
    path: 'src/ai/entityExtractor.js',
    layer: 'ai',
    description: 'Entity extraction from text',
    sprint: 'foundation',
  },
  'ai/responseGenerator': {
    path: 'src/ai/responseGenerator.js',
    layer: 'ai',
    description: 'Response generation',
    sprint: 'foundation',
  },

  // ==================== SECURITY LAYER (Sprint 1.1) ====================
  'security/index': {
    path: 'src/security/index.js',
    layer: 'security',
    description: 'Security layer factory',
    sprint: '1.1',
  },
  'security/slippage-guard': {
    path: 'src/security/slippage-guard.js',
    layer: 'security',
    description: 'Slippage protection',
    sprint: '1.1',
  },
  'security/input-validator': {
    path: 'src/security/input-validator.js',
    layer: 'security',
    description: 'Input validation',
    sprint: '1.1',
  },
  'security/oracle-guard': {
    path: 'src/security/oracle-guard.js',
    layer: 'security',
    description: 'Oracle price validation',
    sprint: '1.1',
  },
  'security/nonce-manager': {
    path: 'src/security/nonce-manager.js',
    layer: 'security',
    description: 'Nonce tracking and management',
    sprint: '1.1',
  },
  'security/approval-manager': {
    path: 'src/security/approval-manager.js',
    layer: 'security',
    description: 'Token approval management',
    sprint: '1.1',
  },
  'security/execution-guard': {
    path: 'src/security/execution-guard.js',
    layer: 'security',
    description: 'Transaction execution protection',
    sprint: '1.1',
  },
  'security/mev-protection': {
    path: 'src/security/mev-protection.js',
    layer: 'security',
    description: 'MEV attack prevention',
    sprint: '1.1',
  },
  'security/rpc-manager': {
    path: 'src/security/rpc-manager.js',
    layer: 'security',
    description: 'RPC endpoint management',
    sprint: '1.1',
  },
  'security/key-manager': {
    path: 'src/security/key-manager.js',
    layer: 'security',
    description: 'Private key security',
    sprint: '1.1',
  },
  'security/access-control': {
    path: 'src/security/access-control.js',
    layer: 'security',
    description: 'Role-based access control',
    sprint: '1.1',
  },
  'security/tx-simulator': {
    path: 'src/security/tx-simulator.js',
    layer: 'security',
    description: 'Transaction simulation',
    sprint: '1.2',
  },
  'security/contract-verifier': {
    path: 'src/security/contract-verifier.js',
    layer: 'security',
    description: 'Contract verification',
    sprint: '1.1',
  },
  'security/drainer-detection': {
    path: 'src/security/drainer-detection.js',
    layer: 'security',
    description: 'Drainer contract detection',
    sprint: '1.1',
  },
  'security/bridge-safety': {
    path: 'src/security/bridge-safety.js',
    layer: 'security',
    description: 'Bridge safety checks',
    sprint: '1.1',
  },
  'security/erc4337-safety': {
    path: 'src/security/erc4337-safety.js',
    layer: 'security',
    description: 'Account abstraction safety',
    sprint: '1.1',
  },
  'security/reorg-protection': {
    path: 'src/security/reorg-protection.js',
    layer: 'security',
    description: 'Chain reorganization protection',
    sprint: '1.1',
  },

  // ==================== MONITORING LAYER (Sprint 1.2) ====================
  'monitoring/index': {
    path: 'src/monitoring/index.js',
    layer: 'monitoring',
    description: 'Monitoring layer factory',
    sprint: '1.2',
  },
  'monitoring/alerts': {
    path: 'src/monitoring/alerts.js',
    layer: 'monitoring',
    description: 'Alert system',
    sprint: '1.2',
  },
  'monitoring/sandwich-detector': {
    path: 'src/monitoring/sandwich-detector.js',
    layer: 'monitoring',
    description: 'Sandwich attack detection',
    sprint: '1.2',
  },
  'monitoring/analytics': {
    path: 'src/monitoring/analytics.js',
    layer: 'monitoring',
    description: 'Performance analytics',
    sprint: '1.2',
  },
  'monitoring/dashboard': {
    path: 'src/monitoring/dashboard.js',
    layer: 'monitoring',
    description: 'Monitoring dashboard',
    sprint: '1.2',
  },
  'monitoring/depeg-monitor': {
    path: 'src/monitoring/depeg-monitor.js',
    layer: 'monitoring',
    description: 'Stablecoin depeg monitoring',
    sprint: '1.2',
  },

  // ==================== COMPLIANCE LAYER (Sprint 2.1) ====================
  'compliance/index': {
    path: 'src/compliance/index.js',
    layer: 'compliance',
    description: 'Compliance layer factory',
    sprint: '2.1',
  },
  'compliance/audit-logger': {
    path: 'src/compliance/audit-logger.js',
    layer: 'compliance',
    description: 'Audit logging',
    sprint: '2.1',
  },
  'compliance/address-screening': {
    path: 'src/compliance/address-screening.js',
    layer: 'compliance',
    description: 'Sanctions screening',
    sprint: '2.1',
  },
  'compliance/geo-restrictions': {
    path: 'src/compliance/geo-restrictions.js',
    layer: 'compliance',
    description: 'Geographic restrictions',
    sprint: '2.1',
  },

  // ==================== AIRDROP LAYER (Sprint 3.1 + 3.2) ====================
  'airdrop/index': {
    path: 'src/airdrop/index.js',
    layer: 'airdrop',
    description: 'Airdrop module hub',
    sprint: '3.2',
  },
  'airdrop/strategy-engine': {
    path: 'src/airdrop/strategy-engine.js',
    layer: 'airdrop',
    description: 'Protocol strategy management',
    sprint: '3.1',
  },
  'airdrop/randomizer': {
    path: 'src/airdrop/randomizer.js',
    layer: 'airdrop',
    description: 'Human-like randomization',
    sprint: '3.1',
  },
  'airdrop/diversity-tracker': {
    path: 'src/airdrop/diversity-tracker.js',
    layer: 'airdrop',
    description: 'Protocol diversity tracking',
    sprint: '3.1',
  },
  'airdrop/scheduler': {
    path: 'src/airdrop/scheduler.js',
    layer: 'airdrop',
    description: 'Activity scheduling',
    sprint: '3.1',
  },
  'airdrop/points-aggregator': {
    path: 'src/airdrop/points-aggregator.js',
    layer: 'airdrop',
    description: 'Points tracking across protocols',
    sprint: '3.2',
  },
  'airdrop/eligibility-checker': {
    path: 'src/airdrop/eligibility-checker.js',
    layer: 'airdrop',
    description: 'Eligibility verification',
    sprint: '3.2',
  },
  'airdrop/claim-automation': {
    path: 'src/airdrop/claim-automation.js',
    layer: 'airdrop',
    description: 'Automated claim execution',
    sprint: '3.2',
  },
  'airdrop/roi-tracker': {
    path: 'src/airdrop/roi-tracker.js',
    layer: 'airdrop',
    description: 'ROI and profitability tracking',
    sprint: '3.2',
  },

  // ==================== ENGINES ====================
  'engines/swap/index': {
    path: 'src/engines/swap/index.js',
    layer: 'engines',
    description: 'Swap engine hub',
    sprint: 'foundation',
  },
  'engines/transfer/index': {
    path: 'src/engines/transfer/index.js',
    layer: 'engines',
    description: 'Transfer engine hub',
    sprint: 'foundation',
  },
  'engines/airdrop/index': {
    path: 'src/engines/airdrop/index.js',
    layer: 'engines',
    description: 'Airdrop engine hub',
    sprint: 'foundation',
  },

  // ==================== SERVICES ====================
  'services/notifications/index': {
    path: 'src/services/notifications/index.js',
    layer: 'services',
    description: 'Notification service hub',
    sprint: 'foundation',
  },

  // ==================== ROUTER ====================
  'router/index': {
    path: 'src/router/index.js',
    layer: 'router',
    description: 'Command router and dispatcher',
    sprint: 'foundation',
  },

  // ==================== UTILS ====================
  'utils/logger': {
    path: 'src/utils/logger.js',
    layer: 'utils',
    description: 'Logging utility',
    sprint: 'foundation',
  },
  'utils/errors': {
    path: 'src/utils/errors.js',
    layer: 'utils',
    description: 'Error definitions',
    sprint: 'foundation',
  },
  'utils/helpers': {
    path: 'src/utils/helpers.js',
    layer: 'utils',
    description: 'Helper functions',
    sprint: 'foundation',
  },
};

// ============================================================================
// DEPENDENCY GRAPH
// ============================================================================

/**
 * Directed dependency graph
 * Key: Module ID
 * Value: Array of module IDs that this module depends on
 */
const DEPENDENCY_GRAPH = {
  // Entry point
  'index': [
    'core/index',
    'ai/index',
    'router/index',
    'services/notifications/index',
    'engines/swap/index',
    'engines/transfer/index',
    'engines/airdrop/index',
    'config/index',
    'utils/logger',
  ],

  // Core layer - internal dependencies
  'core/index': [
    'core/providers',
    'core/wallets',
    'core/contracts',
    'core/transactions',
    'config/chains',
    'config/tokens',
    'utils/logger',
  ],
  'core/providers': ['config/chains', 'utils/logger'],
  'core/wallets': ['core/providers', 'config/chains', 'utils/logger'],
  'core/contracts': ['core/providers', 'config/chains'],
  'core/transactions': ['core/providers', 'config/chains', 'utils/logger'],

  // Config layer - no internal dependencies (leaf modules)
  'config/index': ['config/chains', 'config/tokens'],
  'config/chains': [],
  'config/tokens': [],

  // AI layer
  'ai/index': ['ai/intentParser', 'ai/entityExtractor', 'ai/responseGenerator'],
  'ai/intentParser': [],
  'ai/entityExtractor': [],
  'ai/responseGenerator': [],

  // Security layer (Sprint 1.1) - mostly independent modules
  'security/index': [
    'security/slippage-guard',
    'security/input-validator',
    'security/oracle-guard',
    'security/nonce-manager',
    'security/approval-manager',
    'security/execution-guard',
    'security/mev-protection',
    'security/rpc-manager',
    'security/key-manager',
    'security/access-control',
  ],
  'security/slippage-guard': [],
  'security/input-validator': [],
  'security/oracle-guard': [],
  'security/nonce-manager': [],
  'security/approval-manager': [],
  'security/execution-guard': [],
  'security/mev-protection': [],
  'security/rpc-manager': [],
  'security/key-manager': [],
  'security/access-control': [],
  'security/tx-simulator': [],
  'security/contract-verifier': [],
  'security/drainer-detection': [],
  'security/bridge-safety': [],
  'security/erc4337-safety': [],
  'security/reorg-protection': [],

  // Monitoring layer (Sprint 1.2) - has internal dependencies
  'monitoring/index': [
    'monitoring/alerts',
    'monitoring/sandwich-detector',
    'monitoring/analytics',
    'monitoring/dashboard',
    'security/tx-simulator', // Cross-layer dependency!
  ],
  'monitoring/alerts': [],
  'monitoring/sandwich-detector': ['monitoring/alerts'], // Internal dependency
  'monitoring/analytics': [],
  'monitoring/dashboard': [
    'monitoring/alerts',
    'monitoring/analytics',
    'monitoring/sandwich-detector',
    'security/tx-simulator',
  ],
  'monitoring/depeg-monitor': [],

  // Compliance layer (Sprint 2.1) - wraps security + monitoring
  'compliance/index': [
    'compliance/audit-logger',
    'compliance/address-screening',
    'compliance/geo-restrictions',
    // Wraps (optional dependencies):
    // 'security/index',
    // 'monitoring/index',
  ],
  'compliance/audit-logger': [],
  'compliance/address-screening': [],
  'compliance/geo-restrictions': [],

  // Airdrop layer (Sprint 3.1 + 3.2)
  'airdrop/index': [
    'airdrop/strategy-engine',
    'airdrop/randomizer',
    'airdrop/diversity-tracker',
    'airdrop/scheduler',
    'airdrop/points-aggregator',
    'airdrop/eligibility-checker',
    'airdrop/claim-automation',
    'airdrop/roi-tracker',
  ],
  // Sprint 3.1 - Activity Automation
  'airdrop/strategy-engine': [],
  'airdrop/randomizer': [],
  'airdrop/diversity-tracker': [],
  'airdrop/scheduler': [
    'airdrop/strategy-engine',
    'airdrop/randomizer',
    'airdrop/diversity-tracker',
  ],
  // Sprint 3.2 - Points & Eligibility (all independent)
  'airdrop/points-aggregator': [],
  'airdrop/eligibility-checker': [],
  'airdrop/claim-automation': [],
  'airdrop/roi-tracker': [],

  // Engines
  'engines/swap/index': [],
  'engines/transfer/index': [],
  'engines/airdrop/index': [],

  // Services
  'services/notifications/index': [],

  // Router
  'router/index': [],

  // Utils - leaf modules
  'utils/logger': [],
  'utils/errors': [],
  'utils/helpers': [],
};

// ============================================================================
// INTEGRATION POINTS
// ============================================================================

/**
 * Cross-layer integration points
 * Documents how layers connect to each other
 */
const INTEGRATION_POINTS = {
  // Monitoring uses security's TxSimulator
  'monitoring->security': {
    from: 'monitoring/index',
    to: 'security/tx-simulator',
    type: 'import',
    description: 'TxSimulator re-exported from monitoring for MEV analysis',
  },

  // Compliance wraps Security Layer
  'compliance->security': {
    from: 'compliance/index',
    to: 'security/index',
    type: 'wrapper',
    description: 'Compliance wraps security components for audit logging',
    wrappedComponents: [
      'inputValidator',
      'executionGuard',
      'accessControl',
      'keyManager',
      'approvalManager',
      'nonceManager',
      'mevProtection',
      'rpcManager',
      'oracleGuard',
      'slippageGuard',
    ],
  },

  // Compliance wraps Monitoring Layer
  'compliance->monitoring': {
    from: 'compliance/index',
    to: 'monitoring/index',
    type: 'wrapper',
    description: 'Compliance integrates with monitoring for alerts',
    wrappedComponents: [
      'alertSystem',
      'analytics',
      'dashboard',
      'sandwichDetector',
      'txSimulator',
    ],
  },

  // Scheduler uses other airdrop components
  'scheduler->airdrop': {
    from: 'airdrop/scheduler',
    to: ['airdrop/strategy-engine', 'airdrop/randomizer', 'airdrop/diversity-tracker'],
    type: 'composition',
    description: 'Scheduler composes strategy, randomizer, and diversity tracker',
  },
};

// ============================================================================
// EXPORT CONTRACTS
// ============================================================================

/**
 * Expected exports per module
 * Used for regression testing export stability
 */
const EXPORT_CONTRACTS = {
  // Security Layer
  'security/index': {
    classes: [
      'SlippageGuard',
      'InputValidator',
      'OracleGuard',
      'NonceManager',
      'ApprovalManager',
      'ExecutionGuard',
      'MevProtection',
      'RpcManager',
      'KeyManager',
      'AccessControl',
    ],
    factories: ['createSecurityLayer'],
    constants: ['WALLET_TIER', 'KEY_SOURCE', 'TX_STATE', 'ROLE', 'PERMISSION', 'HEALTH_STATE'],
  },

  // Monitoring Layer
  'monitoring/index': {
    classes: ['AlertSystem', 'SandwichDetector', 'Analytics', 'Dashboard', 'TxSimulator'],
    factories: ['createMonitoringLayer'],
    constants: ['ALERT_LEVEL', 'ALERT_CATEGORY'],
  },

  // Compliance Layer
  'compliance/index': {
    classes: ['ComplianceLayer', 'AuditLogger', 'AddressScreener', 'GeoRestrictor'],
    factories: ['createComplianceLayer', 'createAuditLogger', 'createAddressScreener', 'createGeoRestrictor'],
    constants: [
      'AUDIT_CATEGORIES',
      'SEVERITY_LEVELS',
      'EXPORT_FORMATS',
      'RISK_LEVELS',
      'SCREENING_SOURCES',
      'FALLBACK_MODES',
      'VPN_POLICIES',
    ],
    wrappers: [
      'wrapInputValidator',
      'wrapExecutionGuard',
      'wrapAccessControl',
      'wrapKeyManager',
      'wrapApprovalManager',
      'wrapNonceManager',
      'wrapMevProtection',
      'wrapRpcManager',
      'wrapOracleGuard',
      'wrapSlippageGuard',
      'wrapSandwichDetector',
      'wrapTxSimulator',
      'setupComplianceAlerts',
      'setupComplianceMetrics',
      'setupComplianceDashboard',
    ],
  },

  // Airdrop Layer
  'airdrop/index': {
    classes: [
      // Sprint 3.1
      'StrategyEngine',
      'Strategy',
      'HumanLikeRandomizer',
      'WalletPersonality',
      'DiversityTracker',
      'ActivityRecord',
      'ActivityScheduler',
      'ScheduledAction',
      'WalletQueue',
      // Sprint 3.2
      'PointsAggregator',
      'PointsRecord',
      'EligibilityChecker',
      'EligibilityResult',
      'ClaimAutomation',
      'ClaimRecord',
      'ROITracker',
      'CostRecord',
      'ValueRecord',
    ],
    factories: [
      'createStrategyEngine',
      'createBuiltInStrategies',
      'createRandomizer',
      'createDiversityTracker',
      'createScheduler',
      'createPointsAggregator',
      'createEligibilityChecker',
      'createClaimAutomation',
      'createROITracker',
      'createAirdropSystem',
      'createTrackingSystem',
      'createFullSystem',
    ],
    constants: [
      // Sprint 3.1
      'ACTION_TYPES',
      'PROTOCOL_CATEGORIES',
      'RISK_PROFILES',
      'CIRCADIAN_WEIGHTS',
      'DAY_WEIGHTS',
      'AMOUNT_VARIANCE',
      'TIMING_VARIANCE',
      'KNOWN_PROTOCOLS',
      'CHAIN_INFO',
      'DIVERSITY_THRESHOLDS',
      'SCHEDULE_STATUS',
      // Sprint 3.2
      'PROTOCOLS',
      'ESTIMATION_WEIGHTS',
      'MULTIPLIER_TYPES',
      'CRITERION_TYPE',
      'OPERATORS',
      'ELIGIBILITY_STATUS',
      'PROTOCOL_CRITERIA',
      'CLAIM_STATUS',
      'CLAIM_TYPE',
      'CLAIM_STRATEGY',
      'COST_TYPE',
      'VALUE_TYPE',
      'REPORT_PERIOD',
      'CHAIN_NATIVE_TOKENS',
      'CONFIDENCE_LEVELS',
    ],
    functions: [
      'gaussianRandom',
      'exponentialRandom',
      'betaRandom',
      'poissonRandom',
    ],
  },
};

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Get all modules that depend on the given module (reverse lookup)
 */
function getDependents(moduleId) {
  const dependents = [];

  for (const [module, deps] of Object.entries(DEPENDENCY_GRAPH)) {
    if (deps.includes(moduleId)) {
      dependents.push(module);
    }
  }

  return dependents;
}

/**
 * Get all dependencies of a module (forward lookup)
 */
function getDependencies(moduleId) {
  return DEPENDENCY_GRAPH[moduleId] || [];
}

/**
 * Get transitive dependencies (all dependencies recursively)
 */
function getTransitiveDependencies(moduleId, visited = new Set()) {
  if (visited.has(moduleId)) return [];
  visited.add(moduleId);

  const direct = getDependencies(moduleId);
  const transitive = [];

  for (const dep of direct) {
    transitive.push(dep);
    transitive.push(...getTransitiveDependencies(dep, visited));
  }

  return [...new Set(transitive)];
}

/**
 * Get transitive dependents (all modules that depend on this, recursively)
 */
function getTransitiveDependents(moduleId, visited = new Set()) {
  if (visited.has(moduleId)) return [];
  visited.add(moduleId);

  const direct = getDependents(moduleId);
  const transitive = [];

  for (const dep of direct) {
    transitive.push(dep);
    transitive.push(...getTransitiveDependents(dep, visited));
  }

  return [...new Set(transitive)];
}

/**
 * Full impact analysis for a module change
 */
function getImpactAnalysis(moduleId) {
  const module = MODULES[moduleId];
  if (!module) {
    return { error: `Module ${moduleId} not found` };
  }

  const directDependents = getDependents(moduleId);
  const transitiveDependents = getTransitiveDependents(moduleId);
  const directDependencies = getDependencies(moduleId);
  const transitiveDependencies = getTransitiveDependencies(moduleId);

  // Find affected test files
  const affectedTests = [];
  const moduleLayer = module.layer;
  const testPaths = [
    `tests/${moduleLayer}/${moduleId.split('/').pop()}.test.js`,
    `tests/integration/${moduleLayer}-integration.test.js`,
    `tests/system/phase1-system.test.js`,
  ];

  // Find integration points this module participates in
  const relatedIntegrations = [];
  for (const [key, integration] of Object.entries(INTEGRATION_POINTS)) {
    if (integration.from === moduleId ||
        integration.to === moduleId ||
        (Array.isArray(integration.to) && integration.to.includes(moduleId))) {
      relatedIntegrations.push({ key, ...integration });
    }
  }

  return {
    module: {
      id: moduleId,
      ...module,
    },
    impact: {
      directDependents,
      transitiveDependents,
      totalAffected: transitiveDependents.length,
    },
    dependencies: {
      direct: directDependencies,
      transitive: transitiveDependencies,
    },
    integrations: relatedIntegrations,
    suggestedTests: testPaths,
    riskLevel: transitiveDependents.length > 5 ? 'HIGH' :
               transitiveDependents.length > 2 ? 'MEDIUM' : 'LOW',
  };
}

/**
 * Validate that a module exports what it should
 */
function validateExports(moduleId) {
  const contract = EXPORT_CONTRACTS[moduleId];
  if (!contract) {
    return { valid: true, message: 'No export contract defined' };
  }

  const module = MODULES[moduleId];
  if (!module) {
    return { valid: false, errors: [`Module ${moduleId} not found in registry`] };
  }

  const errors = [];

  try {
    const exported = require(`../../src/${moduleId.replace('/', '/')}`);

    // Check classes
    if (contract.classes) {
      for (const cls of contract.classes) {
        if (!exported[cls]) {
          errors.push(`Missing class export: ${cls}`);
        } else if (typeof exported[cls] !== 'function') {
          errors.push(`${cls} is not a class/function`);
        }
      }
    }

    // Check factories
    if (contract.factories) {
      for (const factory of contract.factories) {
        if (!exported[factory]) {
          errors.push(`Missing factory export: ${factory}`);
        } else if (typeof exported[factory] !== 'function') {
          errors.push(`${factory} is not a function`);
        }
      }
    }

    // Check constants
    if (contract.constants) {
      for (const constant of contract.constants) {
        if (exported[constant] === undefined) {
          errors.push(`Missing constant export: ${constant}`);
        }
      }
    }

    // Check wrapper functions
    if (contract.wrappers) {
      for (const wrapper of contract.wrappers) {
        if (!exported[wrapper]) {
          errors.push(`Missing wrapper export: ${wrapper}`);
        } else if (typeof exported[wrapper] !== 'function') {
          errors.push(`${wrapper} is not a function`);
        }
      }
    }

    // Check utility functions
    if (contract.functions) {
      for (const fn of contract.functions) {
        if (!exported[fn]) {
          errors.push(`Missing function export: ${fn}`);
        } else if (typeof exported[fn] !== 'function') {
          errors.push(`${fn} is not a function`);
        }
      }
    }

  } catch (err) {
    errors.push(`Failed to require module: ${err.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate all modules with export contracts
 */
function validateAllExports() {
  const results = {};
  const failures = [];

  for (const moduleId of Object.keys(EXPORT_CONTRACTS)) {
    const result = validateExports(moduleId);
    results[moduleId] = result;

    if (!result.valid) {
      failures.push({ moduleId, errors: result.errors });
    }
  }

  return {
    passed: failures.length === 0,
    total: Object.keys(EXPORT_CONTRACTS).length,
    failed: failures.length,
    results,
    failures,
  };
}

/**
 * Get modules by layer
 */
function getModulesByLayer(layer) {
  return Object.entries(MODULES)
    .filter(([_, meta]) => meta.layer === layer)
    .map(([id, meta]) => ({ id, ...meta }));
}

/**
 * Get modules by sprint
 */
function getModulesBySprint(sprint) {
  return Object.entries(MODULES)
    .filter(([_, meta]) => meta.sprint === sprint)
    .map(([id, meta]) => ({ id, ...meta }));
}

/**
 * Detect circular dependencies
 */
function detectCircularDependencies() {
  const circular = [];

  for (const moduleId of Object.keys(DEPENDENCY_GRAPH)) {
    const visited = new Set();
    const stack = [moduleId];

    while (stack.length > 0) {
      const current = stack.pop();

      if (visited.has(current)) {
        if (current === moduleId) {
          circular.push(moduleId);
          break;
        }
        continue;
      }

      visited.add(current);
      const deps = DEPENDENCY_GRAPH[current] || [];

      for (const dep of deps) {
        if (dep === moduleId) {
          circular.push(`${moduleId} <- ${current}`);
        }
        stack.push(dep);
      }
    }
  }

  return circular;
}

/**
 * Get independent modules (no dependencies)
 */
function getIndependentModules() {
  return Object.entries(DEPENDENCY_GRAPH)
    .filter(([_, deps]) => deps.length === 0)
    .map(([id]) => id);
}

/**
 * Get hub modules (most dependents)
 */
function getHubModules(threshold = 3) {
  const dependentCounts = {};

  for (const moduleId of Object.keys(MODULES)) {
    dependentCounts[moduleId] = getDependents(moduleId).length;
  }

  return Object.entries(dependentCounts)
    .filter(([_, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, dependentCount: count }));
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Data
  MODULES,
  DEPENDENCY_GRAPH,
  INTEGRATION_POINTS,
  EXPORT_CONTRACTS,

  // Analysis functions
  getDependents,
  getDependencies,
  getTransitiveDependencies,
  getTransitiveDependents,
  getImpactAnalysis,

  // Validation
  validateExports,
  validateAllExports,

  // Queries
  getModulesByLayer,
  getModulesBySprint,
  getIndependentModules,
  getHubModules,
  detectCircularDependencies,
};
