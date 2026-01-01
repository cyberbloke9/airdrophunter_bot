'use strict';

/**
 * Monitoring Module - Real-time observability and analytics
 *
 * This module provides comprehensive monitoring capabilities:
 * - AlertSystem: Security event notifications with rate limiting
 * - SandwichDetector: Post-execution MEV attack detection
 * - Analytics: Long-term performance tracking and reporting
 * - Dashboard: Real-time monitoring interface
 *
 * Sprint 1.2 deliverables for MEV Protection & Monitoring.
 */

const { AlertSystem } = require('./alerts');
const { SandwichDetector } = require('./sandwich-detector');
const { Analytics } = require('./analytics');
const { Dashboard } = require('./dashboard');

// Re-export TxSimulator from security (it's tightly coupled with MEV protection)
const { TxSimulator } = require('../security/tx-simulator');

/**
 * Create a complete monitoring layer with all components
 * @param {Object} config - Configuration options
 * @param {Object} [config.logger] - Logger instance
 * @param {Object} [config.securityLayer] - Security layer instance
 * @param {Object} [config.notificationService] - Notification service
 * @param {Object} [config.alerts] - Alert system config
 * @param {Object} [config.analytics] - Analytics config
 * @param {Object} [config.dashboard] - Dashboard config
 * @param {Object} [config.sandwichDetector] - Sandwich detector config
 * @param {Object} [config.txSimulator] - Transaction simulator config
 * @returns {Object} Monitoring layer
 */
function createMonitoringLayer(config = {}) {
  const logger = config.logger || console;

  // Create transaction simulator
  const txSimulator = new TxSimulator({
    logger,
    ...config.txSimulator,
  });

  // Create alert system
  const alertSystem = new AlertSystem({
    logger,
    notificationService: config.notificationService,
    ...config.alerts,
  });

  // Create sandwich detector
  const sandwichDetector = new SandwichDetector({
    logger,
    alertSystem,
    ...config.sandwichDetector,
  });

  // Create analytics
  const analytics = new Analytics({
    logger,
    ...config.analytics,
  });

  // Create dashboard
  const dashboard = new Dashboard({
    logger,
    securityLayer: config.securityLayer,
    alertSystem,
    analytics,
    sandwichDetector,
    txSimulator,
    ...config.dashboard,
  });

  return {
    // Components
    alertSystem,
    sandwichDetector,
    analytics,
    dashboard,
    txSimulator,

    // Lifecycle methods
    start() {
      alertSystem.start();
      dashboard.start();
      logger.info?.('Monitoring layer started');
    },

    stop() {
      alertSystem.stop();
      dashboard.stop();
      logger.info?.('Monitoring layer stopped');
    },

    // Quick access methods
    sendAlert: alertSystem.sendAlert.bind(alertSystem),
    analyzeTransaction: sandwichDetector.analyzeTransaction.bind(sandwichDetector),
    recordEvent: analytics.recordEvent.bind(analytics),
    getSnapshot: dashboard.getSnapshot.bind(dashboard),
    simulate: txSimulator.simulate.bind(txSimulator),

    // Status
    getStatus() {
      return {
        alertSystem: alertSystem.getStatistics(),
        sandwichDetector: sandwichDetector.getStatistics(),
        analytics: analytics.getCounters(),
        dashboard: dashboard.getStatus(),
        txSimulator: txSimulator.getMetrics(),
      };
    },
  };
}

// Alert levels for convenience
const ALERT_LEVEL = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

// Alert categories for convenience
const ALERT_CATEGORY = {
  SECURITY: 'security',
  TRANSACTION: 'transaction',
  BALANCE: 'balance',
  RPC: 'rpc',
  ORACLE: 'oracle',
  MEV: 'mev',
  SYSTEM: 'system',
  KEY: 'key',
  CONFIG: 'config',
};

module.exports = {
  // Classes
  AlertSystem,
  SandwichDetector,
  Analytics,
  Dashboard,
  TxSimulator,

  // Factory
  createMonitoringLayer,

  // Constants
  ALERT_LEVEL,
  ALERT_CATEGORY,
};
