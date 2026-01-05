'use strict';

/**
 * Airdrop Module - Sprint 3.2: Points & Eligibility Tracking
 *
 * =============================================================================
 * EXPORTS
 * =============================================================================
 *
 * This module provides a complete system for organic airdrop farming:
 *
 * SPRINT 3.1 - Activity Automation:
 * 1. STRATEGY ENGINE: Pluggable strategies for different protocols
 * 2. RANDOMIZER: Human-like randomization to avoid Sybil detection
 * 3. DIVERSITY TRACKER: Monitor and optimize protocol diversity
 * 4. SCHEDULER: Coordinate activity timing across wallets
 *
 * SPRINT 3.2 - Points & Eligibility:
 * 5. POINTS AGGREGATOR: Track and estimate points across protocols
 * 6. ELIGIBILITY CHECKER: Verify eligibility criteria per protocol
 * 7. CLAIM AUTOMATION: Automate airdrop claim execution
 * 8. ROI TRACKER: Track costs vs. value for profitability analysis
 *
 * =============================================================================
 */

// Sprint 3.1 modules
const strategyEngine = require('./strategy-engine');
const randomizer = require('./randomizer');
const diversityTracker = require('./diversity-tracker');
const scheduler = require('./scheduler');

// Sprint 3.2 modules
const pointsAggregator = require('./points-aggregator');
const eligibilityChecker = require('./eligibility-checker');
const claimAutomation = require('./claim-automation');
const roiTracker = require('./roi-tracker');

module.exports = {
  // ===========================================================================
  // SPRINT 3.1: ACTIVITY AUTOMATION
  // ===========================================================================

  // Strategy Engine
  StrategyEngine: strategyEngine.StrategyEngine,
  Strategy: strategyEngine.Strategy,
  ACTION_TYPES: strategyEngine.ACTION_TYPES,
  PROTOCOL_CATEGORIES: strategyEngine.PROTOCOL_CATEGORIES,
  RISK_PROFILES: strategyEngine.RISK_PROFILES,
  createStrategyEngine: strategyEngine.createStrategyEngine,
  createBuiltInStrategies: strategyEngine.createBuiltInStrategies,

  // Randomizer
  HumanLikeRandomizer: randomizer.HumanLikeRandomizer,
  WalletPersonality: randomizer.WalletPersonality,
  CIRCADIAN_WEIGHTS: randomizer.CIRCADIAN_WEIGHTS,
  DAY_WEIGHTS: randomizer.DAY_WEIGHTS,
  AMOUNT_VARIANCE: randomizer.AMOUNT_VARIANCE,
  TIMING_VARIANCE: randomizer.TIMING_VARIANCE,
  createRandomizer: randomizer.createRandomizer,
  gaussianRandom: randomizer.gaussianRandom,
  exponentialRandom: randomizer.exponentialRandom,
  betaRandom: randomizer.betaRandom,
  poissonRandom: randomizer.poissonRandom,

  // Diversity Tracker
  DiversityTracker: diversityTracker.DiversityTracker,
  ActivityRecord: diversityTracker.ActivityRecord,
  KNOWN_PROTOCOLS: diversityTracker.KNOWN_PROTOCOLS,
  CHAIN_INFO: diversityTracker.CHAIN_INFO,
  DIVERSITY_THRESHOLDS: diversityTracker.DIVERSITY_THRESHOLDS,
  createDiversityTracker: diversityTracker.createDiversityTracker,

  // Scheduler
  ActivityScheduler: scheduler.ActivityScheduler,
  ScheduledAction: scheduler.ScheduledAction,
  WalletQueue: scheduler.WalletQueue,
  SCHEDULE_STATUS: scheduler.SCHEDULE_STATUS,
  createScheduler: scheduler.createScheduler,

  // ===========================================================================
  // SPRINT 3.2: POINTS & ELIGIBILITY TRACKING
  // ===========================================================================

  // Points Aggregator
  PointsAggregator: pointsAggregator.PointsAggregator,
  PointsRecord: pointsAggregator.PointsRecord,
  PROTOCOLS: pointsAggregator.PROTOCOLS,
  ESTIMATION_WEIGHTS: pointsAggregator.ESTIMATION_WEIGHTS,
  MULTIPLIER_TYPES: pointsAggregator.MULTIPLIER_TYPES,
  createPointsAggregator: pointsAggregator.createPointsAggregator,

  // Eligibility Checker
  EligibilityChecker: eligibilityChecker.EligibilityChecker,
  EligibilityResult: eligibilityChecker.EligibilityResult,
  CRITERION_TYPE: eligibilityChecker.CRITERION_TYPE,
  OPERATORS: eligibilityChecker.OPERATORS,
  ELIGIBILITY_STATUS: eligibilityChecker.ELIGIBILITY_STATUS,
  PROTOCOL_CRITERIA: eligibilityChecker.PROTOCOL_CRITERIA,
  createEligibilityChecker: eligibilityChecker.createEligibilityChecker,

  // Claim Automation
  ClaimAutomation: claimAutomation.ClaimAutomation,
  ClaimRecord: claimAutomation.ClaimRecord,
  CLAIM_STATUS: claimAutomation.CLAIM_STATUS,
  CLAIM_TYPE: claimAutomation.CLAIM_TYPE,
  CLAIM_STRATEGY: claimAutomation.CLAIM_STRATEGY,
  GAS_STRATEGIES: claimAutomation.GAS_STRATEGIES,
  createClaimAutomation: claimAutomation.createClaimAutomation,

  // ROI Tracker
  ROITracker: roiTracker.ROITracker,
  CostRecord: roiTracker.CostRecord,
  ValueRecord: roiTracker.ValueRecord,
  COST_TYPE: roiTracker.COST_TYPE,
  VALUE_TYPE: roiTracker.VALUE_TYPE,
  REPORT_PERIOD: roiTracker.REPORT_PERIOD,
  CHAIN_NATIVE_TOKENS: roiTracker.CHAIN_NATIVE_TOKENS,
  CONFIDENCE_LEVELS: roiTracker.CONFIDENCE_LEVELS,
  createROITracker: roiTracker.createROITracker,

  // ===========================================================================
  // FACTORY FUNCTIONS
  // ===========================================================================

  /**
   * Create complete airdrop automation system (Sprint 3.1)
   */
  createAirdropSystem: (config = {}) => {
    const stratEng = strategyEngine.createStrategyEngine({
      logger: config.logger,
      includeBuiltIn: config.includeBuiltInStrategies ?? true,
      ...config.strategyEngine,
    });

    const rand = randomizer.createRandomizer({
      respectCircadian: true,
      avoidRoundNumbers: true,
      ...config.randomizer,
    });

    const divTracker = diversityTracker.createDiversityTracker({
      logger: config.logger,
      ...config.diversityTracker,
    });

    const sched = scheduler.createScheduler({
      logger: config.logger,
      strategyEngine: stratEng,
      randomizer: rand,
      diversityTracker: divTracker,
      execute: config.execute,
      ...config.scheduler,
    });

    return {
      strategyEngine: stratEng,
      randomizer: rand,
      diversityTracker: divTracker,
      scheduler: sched,

      // Convenience methods
      start: () => sched.start(),
      stop: () => sched.stop(),
      getStatistics: () => ({
        strategy: stratEng.getStatistics(),
        randomizer: rand.getStatistics(),
        diversity: divTracker.getStatistics(),
        scheduler: sched.getStatistics(),
      }),
    };
  },

  /**
   * Create complete tracking system (Sprint 3.2)
   */
  createTrackingSystem: (config = {}) => {
    const points = pointsAggregator.createPointsAggregator({
      logger: config.logger,
      ...config.pointsAggregator,
    });

    const eligibility = eligibilityChecker.createEligibilityChecker({
      logger: config.logger,
      ...config.eligibilityChecker,
    });

    const claims = claimAutomation.createClaimAutomation({
      logger: config.logger,
      ...config.claimAutomation,
    });

    const roi = roiTracker.createROITracker({
      logger: config.logger,
      priceProvider: config.priceProvider,
      ...config.roiTracker,
    });

    return {
      pointsAggregator: points,
      eligibilityChecker: eligibility,
      claimAutomation: claims,
      roiTracker: roi,

      // Convenience methods
      getStatistics: () => ({
        points: points.getStatistics(),
        eligibility: eligibility.getStatistics(),
        claims: claims.getStatistics(),
        roi: roi.getStatistics(),
      }),

      // Export all data for persistence
      exportData: () => ({
        points: points.exportData(),
        eligibility: eligibility.exportData(),
        claims: claims.exportData(),
        roi: roi.exportData(),
      }),

      // Import data from persistence
      importData: (data) => {
        if (data.points) points.importData(data.points);
        if (data.eligibility) eligibility.importData(data.eligibility);
        if (data.claims) claims.importData(data.claims);
        if (data.roi) roi.importData(data.roi);
      },
    };
  },

  /**
   * Create full airdrop hunting system (Sprint 3.1 + 3.2)
   */
  createFullSystem: (config = {}) => {
    const automation = module.exports.createAirdropSystem(config);
    const tracking = module.exports.createTrackingSystem(config);

    return {
      // Sprint 3.1 - Automation
      ...automation,

      // Sprint 3.2 - Tracking
      pointsAggregator: tracking.pointsAggregator,
      eligibilityChecker: tracking.eligibilityChecker,
      claimAutomation: tracking.claimAutomation,
      roiTracker: tracking.roiTracker,

      // Combined statistics
      getStatistics: () => ({
        automation: automation.getStatistics(),
        tracking: tracking.getStatistics(),
      }),

      // Data persistence
      exportData: tracking.exportData,
      importData: tracking.importData,
    };
  },
};
