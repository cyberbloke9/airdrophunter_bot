'use strict';

/**
 * System Regression Test Suite
 *
 * =============================================================================
 * THE 6 W's: REGRESSION TESTING
 * =============================================================================
 *
 * WHO:
 * ----
 * - Developers: Ensure changes don't break existing functionality
 * - CI/CD: Automated validation on every commit
 * - QA: Comprehensive system health verification
 *
 * WHAT:
 * -----
 * - Export contract validation
 * - Module loading verification
 * - Dependency chain integrity
 * - Cross-module integration
 * - Interface stability testing
 *
 * WHEN:
 * -----
 * - Before every commit (via pre-commit hook)
 * - On every PR (via CI)
 * - After deployments (smoke tests)
 *
 * WHERE:
 * ------
 * - tests/regression/regression.test.js (this file)
 * - tests/regression/dependency-graph.js (dependency data)
 *
 * WHY:
 * ----
 * - Prevent breaking changes from reaching production
 * - Ensure backwards compatibility
 * - Validate system architecture integrity
 *
 * HOW:
 * ----
 * ```bash
 * npm test -- tests/regression/regression.test.js
 * ```
 *
 * =============================================================================
 */

const path = require('path');

const {
  MODULES,
  DEPENDENCY_GRAPH,
  INTEGRATION_POINTS,
  EXPORT_CONTRACTS,
  getDependents,
  getDependencies,
  getTransitiveDependencies,
  getImpactAnalysis,
  validateExports,
  validateAllExports,
  getModulesByLayer,
  getIndependentModules,
  getHubModules,
  detectCircularDependencies,
} = require('./dependency-graph');

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Safely require a module and return it or null
 */
function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (err) {
    return null;
  }
}

/**
 * Get full path to a source module
 */
function getModulePath(moduleId) {
  return path.resolve(__dirname, '../../src', moduleId);
}

// ============================================================================
// SECTION 1: MODULE REGISTRY TESTS
// ============================================================================

describe('Module Registry', () => {
  describe('Module Inventory', () => {
    test('should have all expected layers', () => {
      const layers = new Set(Object.values(MODULES).map(m => m.layer));

      expect(layers.has('entry')).toBe(true);
      expect(layers.has('core')).toBe(true);
      expect(layers.has('config')).toBe(true);
      expect(layers.has('security')).toBe(true);
      expect(layers.has('monitoring')).toBe(true);
      expect(layers.has('compliance')).toBe(true);
      expect(layers.has('airdrop')).toBe(true);
    });

    test('should have all expected sprints', () => {
      const sprints = new Set(Object.values(MODULES).map(m => m.sprint));

      expect(sprints.has('foundation')).toBe(true);
      expect(sprints.has('1.1')).toBe(true);
      expect(sprints.has('1.2')).toBe(true);
      expect(sprints.has('2.1')).toBe(true);
      expect(sprints.has('3.1')).toBe(true);
      expect(sprints.has('3.2')).toBe(true);
    });

    test('should have path defined for all modules', () => {
      for (const [moduleId, meta] of Object.entries(MODULES)) {
        expect(meta.path).toBeDefined();
        expect(meta.path.startsWith('src/')).toBe(true);
      }
    });

    test('should have description for all modules', () => {
      for (const [moduleId, meta] of Object.entries(MODULES)) {
        expect(meta.description).toBeDefined();
        expect(meta.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Layer Distribution', () => {
    test('security layer should have expected module count', () => {
      const securityModules = getModulesByLayer('security');
      expect(securityModules.length).toBeGreaterThanOrEqual(10);
    });

    test('monitoring layer should have expected module count', () => {
      const monitoringModules = getModulesByLayer('monitoring');
      expect(monitoringModules.length).toBeGreaterThanOrEqual(5);
    });

    test('airdrop layer should have expected module count', () => {
      const airdropModules = getModulesByLayer('airdrop');
      expect(airdropModules.length).toBeGreaterThanOrEqual(8);
    });
  });
});

// ============================================================================
// SECTION 2: DEPENDENCY GRAPH TESTS
// ============================================================================

describe('Dependency Graph', () => {
  describe('Graph Structure', () => {
    test('all modules in MODULES should have dependency entry', () => {
      for (const moduleId of Object.keys(MODULES)) {
        // Not all modules need dependency entries (utilities, etc.)
        // But index files should have them
        if (moduleId.endsWith('/index') || moduleId.includes('scheduler')) {
          expect(DEPENDENCY_GRAPH[moduleId]).toBeDefined();
        }
      }
    });

    test('all dependencies should reference valid modules', () => {
      for (const [moduleId, deps] of Object.entries(DEPENDENCY_GRAPH)) {
        for (const dep of deps) {
          // Dependencies may reference modules not in MODULES (like router/index)
          // but they should be in the dependency graph
          expect(
            MODULES[dep] !== undefined || DEPENDENCY_GRAPH[dep] !== undefined
          ).toBe(true);
        }
      }
    });

    test('should not have circular dependencies', () => {
      const circular = detectCircularDependencies();
      expect(circular.length).toBe(0);
    });
  });

  describe('Dependency Analysis', () => {
    test('getDependents should return correct dependents for security modules', () => {
      const slippageGuardDependents = getDependents('security/slippage-guard');
      expect(slippageGuardDependents).toContain('security/index');
    });

    test('getDependencies should return correct dependencies for scheduler', () => {
      const schedulerDeps = getDependencies('airdrop/scheduler');
      expect(schedulerDeps).toContain('airdrop/strategy-engine');
      expect(schedulerDeps).toContain('airdrop/randomizer');
      expect(schedulerDeps).toContain('airdrop/diversity-tracker');
    });

    test('getTransitiveDependencies should work recursively', () => {
      const transitive = getTransitiveDependencies('airdrop/index');
      // airdrop/index depends on scheduler, which depends on strategy-engine
      expect(transitive).toContain('airdrop/scheduler');
      expect(transitive).toContain('airdrop/strategy-engine');
    });

    test('monitoring/dashboard should have cross-layer dependency', () => {
      const dashboardDeps = getDependencies('monitoring/dashboard');
      expect(dashboardDeps).toContain('security/tx-simulator');
    });
  });

  describe('Independent Modules', () => {
    test('should identify leaf modules with no dependencies', () => {
      const independent = getIndependentModules();

      // Sprint 3.2 modules should be independent
      expect(independent).toContain('airdrop/points-aggregator');
      expect(independent).toContain('airdrop/eligibility-checker');
      expect(independent).toContain('airdrop/claim-automation');
      expect(independent).toContain('airdrop/roi-tracker');

      // Config modules should be independent
      expect(independent).toContain('config/chains');
      expect(independent).toContain('config/tokens');
    });

    test('should identify hub modules with many dependents', () => {
      const hubs = getHubModules(1);

      // Hub modules have at least one dependent
      expect(hubs.length).toBeGreaterThan(0);

      // Each hub should have dependentCount property
      for (const hub of hubs) {
        expect(hub.dependentCount).toBeGreaterThanOrEqual(1);
      }
    });
  });
});

// ============================================================================
// SECTION 3: MODULE LOADING TESTS
// ============================================================================

describe('Module Loading', () => {
  describe('Security Layer Modules', () => {
    test('should load security/index without errors', () => {
      const security = safeRequire(getModulePath('security/index'));
      expect(security).not.toBeNull();
    });

    test('should load all security component modules', () => {
      const components = [
        'slippage-guard',
        'input-validator',
        'oracle-guard',
        'nonce-manager',
        'approval-manager',
        'execution-guard',
        'mev-protection',
        'rpc-manager',
        'key-manager',
        'access-control',
      ];

      for (const component of components) {
        const module = safeRequire(getModulePath(`security/${component}`));
        expect(module).not.toBeNull();
      }
    });
  });

  describe('Monitoring Layer Modules', () => {
    test('should load monitoring/index without errors', () => {
      const monitoring = safeRequire(getModulePath('monitoring/index'));
      expect(monitoring).not.toBeNull();
    });

    test('should load all monitoring component modules', () => {
      const components = ['alerts', 'sandwich-detector', 'analytics', 'dashboard'];

      for (const component of components) {
        const module = safeRequire(getModulePath(`monitoring/${component}`));
        expect(module).not.toBeNull();
      }
    });
  });

  describe('Compliance Layer Modules', () => {
    test('should load compliance/index without errors', () => {
      const compliance = safeRequire(getModulePath('compliance/index'));
      expect(compliance).not.toBeNull();
    });

    test('should load all compliance component modules', () => {
      const components = ['audit-logger', 'address-screening', 'geo-restrictions'];

      for (const component of components) {
        const module = safeRequire(getModulePath(`compliance/${component}`));
        expect(module).not.toBeNull();
      }
    });
  });

  describe('Airdrop Layer Modules', () => {
    test('should load airdrop/index without errors', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));
      expect(airdrop).not.toBeNull();
    });

    test('should load all Sprint 3.1 modules', () => {
      const components = ['strategy-engine', 'randomizer', 'diversity-tracker', 'scheduler'];

      for (const component of components) {
        const module = safeRequire(getModulePath(`airdrop/${component}`));
        expect(module).not.toBeNull();
      }
    });

    test('should load all Sprint 3.2 modules', () => {
      const components = ['points-aggregator', 'eligibility-checker', 'claim-automation', 'roi-tracker'];

      for (const component of components) {
        const module = safeRequire(getModulePath(`airdrop/${component}`));
        expect(module).not.toBeNull();
      }
    });
  });
});

// ============================================================================
// SECTION 4: EXPORT CONTRACT TESTS
// ============================================================================

describe('Export Contracts', () => {
  describe('Security Layer Exports', () => {
    let security;

    beforeAll(() => {
      security = safeRequire(getModulePath('security/index'));
    });

    test('should export all expected classes', () => {
      const expectedClasses = EXPORT_CONTRACTS['security/index'].classes;

      for (const cls of expectedClasses) {
        expect(security[cls]).toBeDefined();
        expect(typeof security[cls]).toBe('function');
      }
    });

    test('should export createSecurityLayer factory', () => {
      expect(security.createSecurityLayer).toBeDefined();
      expect(typeof security.createSecurityLayer).toBe('function');
    });

    test('should export all expected constants', () => {
      const expectedConstants = EXPORT_CONTRACTS['security/index'].constants;

      for (const constant of expectedConstants) {
        expect(security[constant]).toBeDefined();
      }
    });
  });

  describe('Monitoring Layer Exports', () => {
    let monitoring;

    beforeAll(() => {
      monitoring = safeRequire(getModulePath('monitoring/index'));
    });

    test('should export all expected classes', () => {
      const expectedClasses = EXPORT_CONTRACTS['monitoring/index'].classes;

      for (const cls of expectedClasses) {
        expect(monitoring[cls]).toBeDefined();
        expect(typeof monitoring[cls]).toBe('function');
      }
    });

    test('should export createMonitoringLayer factory', () => {
      expect(monitoring.createMonitoringLayer).toBeDefined();
      expect(typeof monitoring.createMonitoringLayer).toBe('function');
    });

    test('should export ALERT_LEVEL and ALERT_CATEGORY constants', () => {
      expect(monitoring.ALERT_LEVEL).toBeDefined();
      expect(monitoring.ALERT_CATEGORY).toBeDefined();
    });
  });

  describe('Compliance Layer Exports', () => {
    let compliance;

    beforeAll(() => {
      compliance = safeRequire(getModulePath('compliance/index'));
    });

    test('should export all expected classes', () => {
      const expectedClasses = EXPORT_CONTRACTS['compliance/index'].classes;

      for (const cls of expectedClasses) {
        expect(compliance[cls]).toBeDefined();
        expect(typeof compliance[cls]).toBe('function');
      }
    });

    test('should export all expected factories', () => {
      const expectedFactories = EXPORT_CONTRACTS['compliance/index'].factories;

      for (const factory of expectedFactories) {
        expect(compliance[factory]).toBeDefined();
        expect(typeof compliance[factory]).toBe('function');
      }
    });

    test('should export all wrapper functions', () => {
      const expectedWrappers = EXPORT_CONTRACTS['compliance/index'].wrappers;

      for (const wrapper of expectedWrappers) {
        expect(compliance[wrapper]).toBeDefined();
        expect(typeof compliance[wrapper]).toBe('function');
      }
    });
  });

  describe('Airdrop Layer Exports', () => {
    let airdrop;

    beforeAll(() => {
      airdrop = safeRequire(getModulePath('airdrop/index'));
    });

    test('should export Sprint 3.1 classes', () => {
      const sprint31Classes = [
        'StrategyEngine',
        'Strategy',
        'HumanLikeRandomizer',
        'WalletPersonality',
        'DiversityTracker',
        'ActivityRecord',
        'ActivityScheduler',
        'ScheduledAction',
        'WalletQueue',
      ];

      for (const cls of sprint31Classes) {
        expect(airdrop[cls]).toBeDefined();
        expect(typeof airdrop[cls]).toBe('function');
      }
    });

    test('should export Sprint 3.2 classes', () => {
      const sprint32Classes = [
        'PointsAggregator',
        'PointsRecord',
        'EligibilityChecker',
        'EligibilityResult',
        'ClaimAutomation',
        'ClaimRecord',
        'ROITracker',
        'CostRecord',
        'ValueRecord',
      ];

      for (const cls of sprint32Classes) {
        expect(airdrop[cls]).toBeDefined();
        expect(typeof airdrop[cls]).toBe('function');
      }
    });

    test('should export all factory functions', () => {
      const factories = EXPORT_CONTRACTS['airdrop/index'].factories;

      for (const factory of factories) {
        expect(airdrop[factory]).toBeDefined();
        expect(typeof airdrop[factory]).toBe('function');
      }
    });

    test('should export Sprint 3.1 constants', () => {
      const sprint31Constants = [
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
      ];

      for (const constant of sprint31Constants) {
        expect(airdrop[constant]).toBeDefined();
      }
    });

    test('should export Sprint 3.2 constants', () => {
      const sprint32Constants = [
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
      ];

      for (const constant of sprint32Constants) {
        expect(airdrop[constant]).toBeDefined();
      }
    });

    test('should export random distribution functions', () => {
      const randomFunctions = ['gaussianRandom', 'exponentialRandom', 'betaRandom', 'poissonRandom'];

      for (const fn of randomFunctions) {
        expect(airdrop[fn]).toBeDefined();
        expect(typeof airdrop[fn]).toBe('function');
      }
    });
  });
});

// ============================================================================
// SECTION 5: CROSS-MODULE INTEGRATION TESTS
// ============================================================================

describe('Cross-Module Integration', () => {
  describe('Monitoring -> Security Integration', () => {
    test('monitoring layer should re-export TxSimulator from security', () => {
      const monitoring = safeRequire(getModulePath('monitoring/index'));
      const security = safeRequire(getModulePath('security/tx-simulator'));

      expect(monitoring.TxSimulator).toBeDefined();
      expect(monitoring.TxSimulator).toBe(security.TxSimulator);
    });
  });

  describe('Airdrop Scheduler Dependencies', () => {
    test('scheduler should work with strategy engine', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));

      const strategyEngine = airdrop.createStrategyEngine();
      const randomizer = airdrop.createRandomizer();
      const diversityTracker = airdrop.createDiversityTracker();

      const scheduler = airdrop.createScheduler({
        strategyEngine,
        randomizer,
        diversityTracker,
        execute: async () => ({ success: true }),
      });

      expect(scheduler).toBeDefined();
      expect(typeof scheduler.schedule).toBe('function');
    });
  });

  describe('Factory Function Integration', () => {
    test('createAirdropSystem should create integrated system', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));

      const system = airdrop.createAirdropSystem({
        execute: async () => ({ success: true }),
      });

      expect(system.strategyEngine).toBeDefined();
      expect(system.randomizer).toBeDefined();
      expect(system.diversityTracker).toBeDefined();
      expect(system.scheduler).toBeDefined();
      expect(typeof system.start).toBe('function');
      expect(typeof system.stop).toBe('function');
      expect(typeof system.getStatistics).toBe('function');
    });

    test('createTrackingSystem should create integrated tracking', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));

      const tracking = airdrop.createTrackingSystem();

      expect(tracking.pointsAggregator).toBeDefined();
      expect(tracking.eligibilityChecker).toBeDefined();
      expect(tracking.claimAutomation).toBeDefined();
      expect(tracking.roiTracker).toBeDefined();
      expect(typeof tracking.getStatistics).toBe('function');
      expect(typeof tracking.exportData).toBe('function');
      expect(typeof tracking.importData).toBe('function');
    });

    test('createFullSystem should combine automation and tracking', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));

      const fullSystem = airdrop.createFullSystem({
        execute: async () => ({ success: true }),
      });

      // Sprint 3.1 components
      expect(fullSystem.strategyEngine).toBeDefined();
      expect(fullSystem.randomizer).toBeDefined();
      expect(fullSystem.diversityTracker).toBeDefined();
      expect(fullSystem.scheduler).toBeDefined();

      // Sprint 3.2 components
      expect(fullSystem.pointsAggregator).toBeDefined();
      expect(fullSystem.eligibilityChecker).toBeDefined();
      expect(fullSystem.claimAutomation).toBeDefined();
      expect(fullSystem.roiTracker).toBeDefined();

      // Combined methods
      expect(typeof fullSystem.getStatistics).toBe('function');
      expect(typeof fullSystem.start).toBe('function');
      expect(typeof fullSystem.stop).toBe('function');
    });
  });

  describe('Security Layer Factory', () => {
    test('createSecurityLayer should create integrated layer', () => {
      const security = safeRequire(getModulePath('security/index'));

      const layer = security.createSecurityLayer({
        enableRpcHealthChecks: false,
        enableExecutionHooks: false,
      });

      expect(layer.slippageGuard).toBeDefined();
      expect(layer.inputValidator).toBeDefined();
      expect(layer.oracleGuard).toBeDefined();
      expect(layer.nonceManager).toBeDefined();
      expect(layer.approvalManager).toBeDefined();
      expect(layer.executionGuard).toBeDefined();
      expect(layer.mevProtection).toBeDefined();
      expect(layer.rpcManager).toBeDefined();
      expect(layer.keyManager).toBeDefined();
      expect(layer.accessControl).toBeDefined();

      // Cleanup
      layer.shutdown();
    });
  });

  describe('Monitoring Layer Factory', () => {
    test('createMonitoringLayer should create integrated layer', () => {
      const monitoring = safeRequire(getModulePath('monitoring/index'));

      const layer = monitoring.createMonitoringLayer();

      expect(layer.alertSystem).toBeDefined();
      expect(layer.sandwichDetector).toBeDefined();
      expect(layer.analytics).toBeDefined();
      expect(layer.dashboard).toBeDefined();
      expect(layer.txSimulator).toBeDefined();

      expect(typeof layer.start).toBe('function');
      expect(typeof layer.stop).toBe('function');
      expect(typeof layer.getStatus).toBe('function');
    });
  });
});

// ============================================================================
// SECTION 6: INTERFACE STABILITY TESTS
// ============================================================================

describe('Interface Stability', () => {
  describe('Points Aggregator Interface', () => {
    test('should have stable method signatures', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));
      const aggregator = new airdrop.PointsAggregator();

      // Core methods (actual method names from implementation)
      expect(typeof aggregator.fetchPoints).toBe('function');
      expect(typeof aggregator.getWalletPoints).toBe('function');
      expect(typeof aggregator.estimatePoints).toBe('function');
      expect(typeof aggregator.getStatistics).toBe('function');
      expect(typeof aggregator.storePoints).toBe('function');
      expect(typeof aggregator.refreshPoints).toBe('function');
    });
  });

  describe('Eligibility Checker Interface', () => {
    test('should have stable method signatures', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));
      const checker = new airdrop.EligibilityChecker();

      // Core methods (actual method names from implementation)
      expect(typeof checker.checkEligibility).toBe('function');
      expect(typeof checker.checkAllProtocols).toBe('function');
      expect(typeof checker.getStatistics).toBe('function');
      expect(typeof checker.getSupportedProtocols).toBe('function');
      expect(typeof checker.generateReport).toBe('function');
    });
  });

  describe('Claim Automation Interface', () => {
    test('should have stable method signatures', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));
      const automation = new airdrop.ClaimAutomation();

      // Core methods (actual method names from implementation)
      expect(typeof automation.registerAirdrop).toBe('function');
      expect(typeof automation.executeClaim).toBe('function');
      expect(typeof automation.getClaim).toBe('function');
      expect(typeof automation.queueClaim).toBe('function');
      expect(typeof automation.getStatistics).toBe('function');
    });
  });

  describe('ROI Tracker Interface', () => {
    test('should have stable method signatures', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));
      const tracker = new airdrop.ROITracker();

      // Core methods (actual method names from implementation)
      expect(typeof tracker.recordCost).toBe('function');
      expect(typeof tracker.recordRealizedValue).toBe('function');
      expect(typeof tracker.getROIReport).toBe('function');
      expect(typeof tracker.getStatistics).toBe('function');
      expect(typeof tracker.exportData).toBe('function');
    });
  });

  describe('Scheduler Interface', () => {
    test('should have stable method signatures', () => {
      const airdrop = safeRequire(getModulePath('airdrop/index'));
      const scheduler = new airdrop.ActivityScheduler({
        execute: async () => ({ success: true }),
      });

      // Core methods (actual method names from implementation)
      expect(typeof scheduler.schedule).toBe('function');
      expect(typeof scheduler.start).toBe('function');
      expect(typeof scheduler.stop).toBe('function');
      expect(typeof scheduler.getStatistics).toBe('function');
      expect(typeof scheduler.cancel).toBe('function');
    });
  });
});

// ============================================================================
// SECTION 7: IMPACT ANALYSIS TESTS
// ============================================================================

describe('Impact Analysis', () => {
  describe('Module Impact Assessment', () => {
    test('should analyze security module impact correctly', () => {
      const impact = getImpactAnalysis('security/slippage-guard');

      expect(impact.module.layer).toBe('security');
      expect(impact.impact.directDependents).toContain('security/index');
      expect(impact.riskLevel).toBeDefined();
    });

    test('should analyze airdrop scheduler impact', () => {
      const impact = getImpactAnalysis('airdrop/scheduler');

      // Scheduler depends on multiple modules
      expect(impact.dependencies.direct.length).toBeGreaterThan(0);
      expect(impact.dependencies.direct).toContain('airdrop/strategy-engine');
    });

    test('should identify cross-layer dependencies', () => {
      const impact = getImpactAnalysis('monitoring/dashboard');

      // Dashboard depends on TxSimulator from security
      expect(impact.dependencies.direct).toContain('security/tx-simulator');
    });
  });
});

// ============================================================================
// SECTION 8: VALIDATION FRAMEWORK TESTS
// ============================================================================

describe('Validation Framework', () => {
  describe('Export Validation', () => {
    test('validateExports should work for security layer', () => {
      const result = validateExports('security/index');

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
    });

    test('validateExports should work for monitoring layer', () => {
      const result = validateExports('monitoring/index');

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
    });

    test('validateExports should work for airdrop layer', () => {
      const result = validateExports('airdrop/index');

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
    });

    test('validateAllExports should check all contracts', () => {
      const results = validateAllExports();

      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('total');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('results');
      expect(results.total).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// SECTION 9: SPRINT COVERAGE TESTS
// ============================================================================

describe('Sprint Coverage', () => {
  describe('Sprint 1.1 - Security Layer', () => {
    test('should have all Sprint 1.1 modules', () => {
      const sprint11Modules = Object.entries(MODULES)
        .filter(([_, meta]) => meta.sprint === '1.1')
        .map(([id]) => id);

      expect(sprint11Modules.length).toBeGreaterThanOrEqual(10);

      // Core security modules
      expect(sprint11Modules).toContain('security/index');
      expect(sprint11Modules).toContain('security/slippage-guard');
      expect(sprint11Modules).toContain('security/execution-guard');
      expect(sprint11Modules).toContain('security/key-manager');
    });
  });

  describe('Sprint 1.2 - Monitoring Layer', () => {
    test('should have all Sprint 1.2 modules', () => {
      const sprint12Modules = Object.entries(MODULES)
        .filter(([_, meta]) => meta.sprint === '1.2')
        .map(([id]) => id);

      expect(sprint12Modules.length).toBeGreaterThanOrEqual(4);

      // Core monitoring modules
      expect(sprint12Modules).toContain('monitoring/index');
    });
  });

  describe('Sprint 2.1 - Compliance Layer', () => {
    test('should have all Sprint 2.1 modules', () => {
      const sprint21Modules = Object.entries(MODULES)
        .filter(([_, meta]) => meta.sprint === '2.1')
        .map(([id]) => id);

      expect(sprint21Modules.length).toBeGreaterThanOrEqual(3);

      // Core compliance modules
      expect(sprint21Modules).toContain('compliance/index');
      expect(sprint21Modules).toContain('compliance/audit-logger');
    });
  });

  describe('Sprint 3.1 - Activity Automation', () => {
    test('should have all Sprint 3.1 modules', () => {
      const sprint31Modules = Object.entries(MODULES)
        .filter(([_, meta]) => meta.sprint === '3.1')
        .map(([id]) => id);

      expect(sprint31Modules.length).toBeGreaterThanOrEqual(4);

      // Core airdrop automation modules
      expect(sprint31Modules).toContain('airdrop/strategy-engine');
      expect(sprint31Modules).toContain('airdrop/randomizer');
      expect(sprint31Modules).toContain('airdrop/diversity-tracker');
      expect(sprint31Modules).toContain('airdrop/scheduler');
    });
  });

  describe('Sprint 3.2 - Points & Eligibility', () => {
    test('should have all Sprint 3.2 modules', () => {
      const sprint32Modules = Object.entries(MODULES)
        .filter(([_, meta]) => meta.sprint === '3.2')
        .map(([id]) => id);

      expect(sprint32Modules.length).toBeGreaterThanOrEqual(4);

      // Core points/eligibility modules
      expect(sprint32Modules).toContain('airdrop/points-aggregator');
      expect(sprint32Modules).toContain('airdrop/eligibility-checker');
      expect(sprint32Modules).toContain('airdrop/claim-automation');
      expect(sprint32Modules).toContain('airdrop/roi-tracker');
    });
  });
});

// ============================================================================
// SECTION 10: ARCHITECTURE INVARIANTS
// ============================================================================

describe('Architecture Invariants', () => {
  describe('Layer Boundaries', () => {
    test('config layer should have no dependencies on other layers', () => {
      const configDeps = getDependencies('config/index');

      // Config should only depend on other config modules
      for (const dep of configDeps) {
        expect(dep.startsWith('config/')).toBe(true);
      }
    });

    test('Sprint 3.2 modules should be independent', () => {
      const sprint32Modules = [
        'airdrop/points-aggregator',
        'airdrop/eligibility-checker',
        'airdrop/claim-automation',
        'airdrop/roi-tracker',
      ];

      for (const moduleId of sprint32Modules) {
        const deps = getDependencies(moduleId);
        expect(deps.length).toBe(0);
      }
    });

    test('utils layer should have no dependencies', () => {
      const utilModules = ['utils/logger', 'utils/errors', 'utils/helpers'];

      for (const moduleId of utilModules) {
        const deps = getDependencies(moduleId);
        expect(deps.length).toBe(0);
      }
    });
  });

  describe('Integration Point Correctness', () => {
    test('all integration points should reference valid modules', () => {
      for (const [key, integration] of Object.entries(INTEGRATION_POINTS)) {
        expect(MODULES[integration.from] || DEPENDENCY_GRAPH[integration.from]).toBeDefined();

        if (Array.isArray(integration.to)) {
          for (const to of integration.to) {
            expect(MODULES[to] || DEPENDENCY_GRAPH[to]).toBeDefined();
          }
        } else {
          expect(MODULES[integration.to] || DEPENDENCY_GRAPH[integration.to]).toBeDefined();
        }
      }
    });
  });
});
