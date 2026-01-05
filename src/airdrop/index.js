'use strict';

/**
 * Airdrop Module - Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * EXPORTS
 * =============================================================================
 *
 * This module provides a complete system for organic airdrop farming:
 *
 * 1. STRATEGY ENGINE: Pluggable strategies for different protocols
 * 2. RANDOMIZER: Human-like randomization to avoid Sybil detection
 * 3. DIVERSITY TRACKER: Monitor and optimize protocol diversity
 * 4. SCHEDULER: Coordinate activity timing across wallets
 *
 * =============================================================================
 */

const strategyEngine = require('./strategy-engine');
const randomizer = require('./randomizer');
const diversityTracker = require('./diversity-tracker');
const scheduler = require('./scheduler');

module.exports = {
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

  // Factory function for complete system
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
};
