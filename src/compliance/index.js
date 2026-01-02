'use strict';

/**
 * Compliance Layer - Factory & Integration Hub
 *
 * Sprint 2.1: Regulatory Compliance Infrastructure
 *
 * This module creates and wires together all compliance components,
 * integrating with the Security Layer (Sprint 1.1) and Monitoring Layer (Sprint 1.2)
 */

const EventEmitter = require('events');

const {
  AuditLogger,
  createAuditLogger,
  AUDIT_CATEGORIES,
  SEVERITY_LEVELS,
  EXPORT_FORMATS,
} = require('./audit-logger');

const {
  AddressScreener,
  createAddressScreener,
  RISK_LEVELS,
  SCREENING_SOURCES,
} = require('./address-screening');

const {
  GeoRestrictor,
  createGeoRestrictor,
  FALLBACK_MODES,
  VPN_POLICIES,
} = require('./geo-restrictions');

// ============ Wrapper Functions for Security Layer ============

/**
 * Wrap InputValidator to add address screening and audit logging
 */
function wrapInputValidator(inputValidator, addressScreener, auditLogger) {
  if (!inputValidator) return;

  const originalValidateAddress = inputValidator.validateAddress?.bind(inputValidator);
  const originalValidateTransaction = inputValidator.validateTransaction?.bind(inputValidator);

  if (originalValidateAddress) {
    inputValidator.validateAddress = async function (address, options = {}) {
      // First validate format
      const formatResult = originalValidateAddress(address, options);

      if (!formatResult.valid) {
        auditLogger.log(AUDIT_CATEGORIES.ACCESS, 'address_validation_failed', {
          address,
          reason: formatResult.reason,
        });
        return formatResult;
      }

      // Then screen against sanctions
      if (options.skipScreening !== true) {
        const screenResult = await addressScreener.checkAddress(address);
        if (!screenResult.allowed) {
          auditLogger.logViolation('sanctions_blocked', {
            address,
            risk: screenResult.risk,
            matches: screenResult.matches,
          }, SEVERITY_LEVELS.CRITICAL);

          return {
            valid: false,
            reason: 'Address blocked by compliance screening',
            screening: screenResult,
          };
        }
      }

      return formatResult;
    };
  }

  if (originalValidateTransaction) {
    inputValidator.validateTransaction = async function (tx, options = {}) {
      const result = originalValidateTransaction(tx, options);

      auditLogger.log(AUDIT_CATEGORIES.ACCESS, 'transaction_validation', {
        txHash: tx.hash,
        valid: result.valid,
        to: tx.to,
        value: tx.value?.toString(),
      });

      return result;
    };
  }
}

/**
 * Wrap ExecutionGuard to add audit logging
 */
function wrapExecutionGuard(executionGuard, auditLogger, addressScreener) {
  if (!executionGuard) return;

  const originalExecute = executionGuard.execute?.bind(executionGuard);
  const originalValidateExecution = executionGuard.validateExecution?.bind(executionGuard);

  if (originalExecute) {
    executionGuard.execute = async function (wallet, tx, options = {}) {
      // Pre-execution screening
      if (tx.to) {
        const screenResult = await addressScreener.checkAddress(tx.to);
        if (!screenResult.allowed) {
          auditLogger.logViolation('execution_blocked', {
            wallet,
            to: tx.to,
            risk: screenResult.risk,
          }, SEVERITY_LEVELS.CRITICAL);

          throw new Error(`Execution blocked: destination address is sanctioned`);
        }
      }

      try {
        const result = await originalExecute(wallet, tx, options);

        // Log successful execution
        auditLogger.logExecution(wallet, tx, {
          success: true,
          hash: result.hash,
          gasUsed: result.gasUsed,
          blockNumber: result.blockNumber,
        });

        return result;
      } catch (err) {
        // Log failed execution
        auditLogger.logExecution(wallet, tx, {
          success: false,
          revertReason: err.message,
        });

        throw err;
      }
    };
  }
}

/**
 * Wrap AccessControl to add audit logging and geo restrictions
 */
function wrapAccessControl(accessControl, auditLogger, geoRestrictor) {
  if (!accessControl) return;

  const originalCheckPermission = accessControl.checkPermission?.bind(accessControl);
  const originalGrantRole = accessControl.grantRole?.bind(accessControl);
  const originalRevokeRole = accessControl.revokeRole?.bind(accessControl);

  if (originalCheckPermission) {
    accessControl.checkPermission = async function (userId, permission, context = {}) {
      // Check geo if IP provided
      if (context.ip) {
        const geoResult = await geoRestrictor.checkIp(context.ip);
        if (!geoResult.allowed) {
          auditLogger.logAccess(userId, permission, false, {
            reason: 'geo_blocked',
            country: geoResult.countryCode,
          });
          return { granted: false, reason: geoResult.reason };
        }
      }

      const result = originalCheckPermission(userId, permission, context);

      auditLogger.logAccess(userId, permission, result.granted || result === true, {
        resource: context.resource,
        ip: context.ip,
      });

      return result;
    };
  }

  if (originalGrantRole) {
    accessControl.grantRole = function (userId, role, grantedBy) {
      const result = originalGrantRole(userId, role, grantedBy);

      auditLogger.logAccess(userId, `role:${role}`, true, {
        action: 'grant',
        grantedBy,
      });

      return result;
    };
  }

  if (originalRevokeRole) {
    accessControl.revokeRole = function (userId, role, revokedBy) {
      const result = originalRevokeRole(userId, role, revokedBy);

      auditLogger.logAccess(userId, `role:${role}`, false, {
        action: 'revoke',
        revokedBy,
      });

      return result;
    };
  }
}

/**
 * Wrap KeyManager to add audit logging (never log actual keys!)
 */
function wrapKeyManager(keyManager, auditLogger) {
  if (!keyManager) return;

  const originalGetKey = keyManager.getKey?.bind(keyManager);
  const originalSign = keyManager.sign?.bind(keyManager);
  const originalRotateKey = keyManager.rotateKey?.bind(keyManager);

  if (originalGetKey) {
    keyManager.getKey = function (keyId, wallet) {
      auditLogger.logKeyUsage(keyId, 'access', wallet, {
        purpose: 'key_retrieval',
      });

      return originalGetKey(keyId, wallet);
    };
  }

  if (originalSign) {
    keyManager.sign = async function (keyId, message, wallet) {
      auditLogger.logKeyUsage(keyId, 'sign', wallet, {
        purpose: 'transaction_signing',
        messageHash: typeof message === 'string' ? message.slice(0, 10) : 'object',
      });

      return originalSign(keyId, message, wallet);
    };
  }

  if (originalRotateKey) {
    keyManager.rotateKey = async function (keyId, wallet) {
      auditLogger.logKeyUsage(keyId, 'rotation', wallet, {
        purpose: 'key_rotation',
        severity: SEVERITY_LEVELS.WARN,
      });

      return originalRotateKey(keyId, wallet);
    };
  }
}

/**
 * Wrap ApprovalManager to add audit logging
 */
function wrapApprovalManager(approvalManager, auditLogger) {
  if (!approvalManager) return;

  const originalApprove = approvalManager.approve?.bind(approvalManager);
  const originalRevoke = approvalManager.revoke?.bind(approvalManager);

  if (originalApprove) {
    approvalManager.approve = async function (wallet, token, spender, amount) {
      auditLogger.logApproval(wallet, token, spender, amount);

      const result = await originalApprove(wallet, token, spender, amount);

      return result;
    };
  }

  if (originalRevoke) {
    approvalManager.revoke = async function (wallet, token, spender) {
      auditLogger.logApproval(wallet, token, spender, '0');

      return originalRevoke(wallet, token, spender);
    };
  }
}

/**
 * Wrap NonceManager to add audit logging
 */
function wrapNonceManager(nonceManager, auditLogger) {
  if (!nonceManager) return;

  const originalReserve = nonceManager.reserve?.bind(nonceManager);
  const originalConfirm = nonceManager.confirm?.bind(nonceManager);
  const originalRelease = nonceManager.release?.bind(nonceManager);

  if (originalReserve) {
    nonceManager.reserve = async function (wallet, chainId) {
      const nonce = await originalReserve(wallet, chainId);

      auditLogger.logNonce(wallet, nonce, 'reserve', { chainId });

      return nonce;
    };
  }

  if (originalConfirm) {
    nonceManager.confirm = function (wallet, nonce, chainId) {
      auditLogger.logNonce(wallet, nonce, 'confirm', { chainId });

      return originalConfirm(wallet, nonce, chainId);
    };
  }

  if (originalRelease) {
    nonceManager.release = function (wallet, nonce, chainId) {
      auditLogger.logNonce(wallet, nonce, 'release', { chainId });

      return originalRelease(wallet, nonce, chainId);
    };
  }
}

/**
 * Wrap MevProtection to add audit logging
 */
function wrapMevProtection(mevProtection, auditLogger) {
  if (!mevProtection) return;

  const originalSubmit = mevProtection.submit?.bind(mevProtection);
  const originalChooseRoute = mevProtection.chooseRoute?.bind(mevProtection);

  if (originalChooseRoute) {
    mevProtection.chooseRoute = function (tx, options = {}) {
      const route = originalChooseRoute(tx, options);

      auditLogger.logMevProtection(tx, route.route || route, route.reason || 'auto', {
        value: tx.value?.toString(),
      });

      return route;
    };
  }

  if (originalSubmit) {
    mevProtection.submit = async function (tx, route, options = {}) {
      auditLogger.logMevProtection(tx, route, 'submission', {
        bundleId: options.bundleId,
      });

      return originalSubmit(tx, route, options);
    };
  }
}

/**
 * Wrap RpcManager to add audit logging
 */
function wrapRpcManager(rpcManager, auditLogger) {
  if (!rpcManager) return;

  // Listen to RPC events
  if (rpcManager.on) {
    rpcManager.on('connected', (data) => {
      auditLogger.logRpc(data.chainId, data.provider, 'connected');
    });

    rpcManager.on('disconnected', (data) => {
      auditLogger.logRpc(data.chainId, data.provider, 'disconnected');
    });

    rpcManager.on('failover', (data) => {
      auditLogger.logRpc(data.chainId, data.newProvider, 'failover', {
        previousProvider: data.previousProvider,
        reason: data.reason,
      });
    });

    rpcManager.on('error', (data) => {
      auditLogger.logRpc(data.chainId, data.provider, 'error', {
        errorCode: data.code,
        errorMessage: data.message,
        severity: SEVERITY_LEVELS.ERROR,
      });
    });
  }
}

/**
 * Wrap OracleGuard to add audit logging
 */
function wrapOracleGuard(oracleGuard, auditLogger) {
  if (!oracleGuard) return;

  const originalGetPrice = oracleGuard.getPrice?.bind(oracleGuard);
  const originalValidatePrice = oracleGuard.validatePrice?.bind(oracleGuard);

  if (originalGetPrice) {
    oracleGuard.getPrice = async function (pair, options = {}) {
      const result = await originalGetPrice(pair, options);

      auditLogger.logOracle(pair, result.price, result.source || 'aggregated', result.confidence || 1.0, {
        deviation: result.deviation,
        staleness: result.staleness,
      });

      return result;
    };
  }
}

/**
 * Wrap SlippageGuard to add audit logging
 */
function wrapSlippageGuard(slippageGuard, auditLogger) {
  if (!slippageGuard) return;

  const originalGetSlippage = slippageGuard.getSlippage?.bind(slippageGuard);
  const originalValidateSlippage = slippageGuard.validateSlippage?.bind(slippageGuard);

  if (originalGetSlippage) {
    slippageGuard.getSlippage = function (tokenIn, tokenOut, options = {}) {
      const result = originalGetSlippage(tokenIn, tokenOut, options);

      auditLogger.logSlippage(`${tokenIn}/${tokenOut}`, result, result, {
        tokenTier: slippageGuard.classifyToken?.(tokenIn),
      });

      return result;
    };
  }

  if (originalValidateSlippage) {
    slippageGuard.validateSlippage = function (expected, actual, maxSlippage) {
      const result = originalValidateSlippage(expected, actual, maxSlippage);

      if (!result.valid) {
        auditLogger.logSlippage('validation', expected, actual, {
          wasRejected: true,
          priceImpact: result.priceImpact,
          severity: SEVERITY_LEVELS.WARN,
        });
      }

      return result;
    };
  }
}

// ============ Wrapper Functions for Monitoring Layer ============

/**
 * Setup compliance alerts in the alert system
 */
function setupComplianceAlerts(alertSystem, addressScreener, geoRestrictor) {
  if (!alertSystem) return;

  // Forward sanctions matches as critical alerts
  addressScreener.on('sanctionsMatch', ({ address, result }) => {
    alertSystem.sendAlert?.({
      level: 'critical',
      category: 'compliance',
      message: `Sanctions match: ${address} (${result.matches?.[0]?.listName || 'unknown list'})`,
      data: result,
    });
  });

  addressScreener.on('transactionBlocked', ({ tx, result }) => {
    alertSystem.sendAlert?.({
      level: 'critical',
      category: 'compliance',
      message: `Transaction blocked by compliance: ${tx.hash || 'pending'}`,
      data: { tx: tx.hash, riskSummary: result.riskSummary },
    });
  });

  // Forward geo blocks as high alerts
  geoRestrictor.on('geoBlocked', ({ ip, result }) => {
    alertSystem.sendAlert?.({
      level: 'high',
      category: 'compliance',
      message: `Geo-blocked access from ${result.countryCode}`,
      data: { countryCode: result.countryCode, reason: result.reason },
    });
  });

  geoRestrictor.on('vpnBlocked', ({ ip, result }) => {
    alertSystem.sendAlert?.({
      level: 'medium',
      category: 'compliance',
      message: `VPN/Proxy blocked: ${result.countryCode}`,
      data: result,
    });
  });
}

/**
 * Setup compliance metrics in analytics
 */
function setupComplianceMetrics(analytics, auditLogger) {
  if (!analytics) return;

  // Track audit entries as metrics
  auditLogger.on('entry', (entry) => {
    analytics.recordEvent?.({
      type: 'compliance_audit',
      category: entry.category,
      action: entry.action,
      severity: entry.metadata.severity,
    });
  });

  auditLogger.on('entry:violation', (entry) => {
    analytics.recordEvent?.({
      type: 'compliance_violation',
      violationType: entry.action,
      severity: entry.metadata.severity,
    });
  });
}

/**
 * Setup compliance dashboard widgets
 */
function setupComplianceDashboard(dashboard, auditLogger, addressScreener) {
  if (!dashboard) return;

  // Add method to get compliance status
  dashboard.getComplianceStatus = function () {
    return {
      auditLog: auditLogger.getStatistics(),
      screening: addressScreener.getScreeningStats(),
      timestamp: Date.now(),
    };
  };

  // Add method to export compliance report
  dashboard.exportComplianceReport = function (format, filter) {
    return auditLogger.export(format, filter);
  };
}

/**
 * Wrap SandwichDetector to add audit logging
 */
function wrapSandwichDetector(sandwichDetector, auditLogger) {
  if (!sandwichDetector) return;

  if (sandwichDetector.on) {
    sandwichDetector.on('sandwichDetected', (data) => {
      auditLogger.logMevIncident(
        data.victimTx || data.txHash,
        data.attackerAddress || data.attacker,
        data.extractedValue || data.extraction,
        {
          frontrunTx: data.frontrunTx,
          backrunTx: data.backrunTx,
          pool: data.pool,
        }
      );
    });
  }
}

/**
 * Wrap TxSimulator to add audit logging
 */
function wrapTxSimulator(txSimulator, auditLogger) {
  if (!txSimulator) return;

  const originalSimulate = txSimulator.simulate?.bind(txSimulator);

  if (originalSimulate) {
    txSimulator.simulate = async function (tx, options = {}) {
      const result = await originalSimulate(tx, options);

      auditLogger.logSimulation(tx, result);

      return result;
    };
  }
}

// ============ Compliance Layer Factory ============

class ComplianceLayer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      logger: options.logger || console,
      securityLayer: options.securityLayer,
      monitoringLayer: options.monitoringLayer,
      ...options.config,
    };

    // Create core compliance modules
    this.auditLogger = createAuditLogger({
      logger: this.config.logger,
      storage: this.config.auditStorage,
      retentionDays: this.config.retentionDays || 2555,
      hashChain: this.config.enableHashChain !== false,
    });

    this.addressScreener = createAddressScreener({
      logger: this.config.logger,
      auditLogger: this.auditLogger,
      ofacEnabled: this.config.ofacEnabled !== false,
      chainalysisApiKey: this.config.chainalysisApiKey,
      cacheTtl: this.config.screeningCacheTtl || 3600000,
    });

    this.geoRestrictor = createGeoRestrictor({
      logger: this.config.logger,
      auditLogger: this.auditLogger,
      blockedCountries: this.config.blockedCountries,
      vpnDetection: this.config.vpnDetection || false,
      maxmindLicenseKey: this.config.maxmindLicenseKey,
    });

    // Wire up integrations
    this.setupIntegrations();

    // Track state
    this.started = false;
    this.startTime = Date.now();
  }

  setupIntegrations() {
    const { securityLayer, monitoringLayer } = this.config;

    // Security Layer Integrations (Sprint 1.1)
    if (securityLayer) {
      wrapInputValidator(securityLayer.inputValidator, this.addressScreener, this.auditLogger);
      wrapExecutionGuard(securityLayer.executionGuard, this.auditLogger, this.addressScreener);
      wrapAccessControl(securityLayer.accessControl, this.auditLogger, this.geoRestrictor);
      wrapKeyManager(securityLayer.keyManager, this.auditLogger);
      wrapApprovalManager(securityLayer.approvalManager, this.auditLogger);
      wrapNonceManager(securityLayer.nonceManager, this.auditLogger);
      wrapMevProtection(securityLayer.mevProtection, this.auditLogger);
      wrapRpcManager(securityLayer.rpcManager, this.auditLogger);
      wrapOracleGuard(securityLayer.oracleGuard, this.auditLogger);
      wrapSlippageGuard(securityLayer.slippageGuard, this.auditLogger);

      this.config.logger.info?.('Compliance layer integrated with Security Layer');
    }

    // Monitoring Layer Integrations (Sprint 1.2)
    if (monitoringLayer) {
      setupComplianceAlerts(monitoringLayer.alertSystem, this.addressScreener, this.geoRestrictor);
      setupComplianceMetrics(monitoringLayer.analytics, this.auditLogger);
      setupComplianceDashboard(monitoringLayer.dashboard, this.auditLogger, this.addressScreener);
      wrapSandwichDetector(monitoringLayer.sandwichDetector, this.auditLogger);
      wrapTxSimulator(monitoringLayer.txSimulator, this.auditLogger);

      this.config.logger.info?.('Compliance layer integrated with Monitoring Layer');
    }
  }

  // ============ Convenience Methods ============

  screenAddress(address) {
    return this.addressScreener.checkAddress(address);
  }

  screenTransaction(tx) {
    return this.addressScreener.checkTransaction(tx);
  }

  checkGeo(ip) {
    return this.geoRestrictor.checkIp(ip);
  }

  getAuditLog(filter = {}, options = {}) {
    return this.auditLogger.query(filter, options);
  }

  exportAudit(format, filter = {}, options = {}) {
    return this.auditLogger.export(format, filter, options);
  }

  verifyAuditIntegrity(startTime, endTime) {
    return this.auditLogger.verifyIntegrity(startTime, endTime);
  }

  // ============ List Management ============

  blockAddress(address, reason) {
    this.addressScreener.addToBlocklist(address, reason);
  }

  allowAddress(address, reason) {
    this.addressScreener.addToAllowlist(address, reason);
  }

  blockCountry(countryCode, reason) {
    this.geoRestrictor.blockCountry(countryCode, reason);
  }

  unblockCountry(countryCode) {
    this.geoRestrictor.unblockCountry(countryCode);
  }

  // ============ Lifecycle ============

  start() {
    if (this.started) return;

    this.started = true;
    this.startTime = Date.now();

    this.auditLogger.logConfig('compliance_started', {
      timestamp: this.startTime,
      securityLayerConnected: !!this.config.securityLayer,
      monitoringLayerConnected: !!this.config.monitoringLayer,
    });

    this.emit('started');
    this.config.logger.info?.('Compliance layer started');
  }

  stop() {
    if (!this.started) return;

    this.addressScreener.stop();
    this.geoRestrictor.stop();

    this.auditLogger.logConfig('compliance_stopped', {
      uptime: Date.now() - this.startTime,
    });

    this.started = false;
    this.emit('stopped');
    this.config.logger.info?.('Compliance layer stopped');
  }

  getStatus() {
    return {
      started: this.started,
      uptime: this.started ? Date.now() - this.startTime : 0,
      auditLogger: this.auditLogger.getStatistics(),
      addressScreener: this.addressScreener.getScreeningStats(),
      geoRestrictor: this.geoRestrictor.getGeoStats(),
      integrations: {
        securityLayer: !!this.config.securityLayer,
        monitoringLayer: !!this.config.monitoringLayer,
      },
    };
  }

  getSnapshot() {
    return {
      timestamp: Date.now(),
      status: this.getStatus(),
      recentAuditEntries: this.auditLogger.query({}, { limit: 10 }),
      blockedAddresses: this.addressScreener.getBlockedAddresses(),
      blockedCountries: this.geoRestrictor.getBlockedCountries(),
    };
  }
}

// ============ Factory Function ============

function createComplianceLayer(options = {}) {
  return new ComplianceLayer(options);
}

// ============ Module Exports ============

module.exports = {
  // Main factory
  createComplianceLayer,
  ComplianceLayer,

  // Core modules
  AuditLogger,
  AddressScreener: require('./address-screening').AddressScreener,
  GeoRestrictor: require('./geo-restrictions').GeoRestrictor,

  // Module factories
  createAuditLogger,
  createAddressScreener,
  createGeoRestrictor,

  // Constants
  AUDIT_CATEGORIES,
  SEVERITY_LEVELS,
  EXPORT_FORMATS,
  RISK_LEVELS,
  SCREENING_SOURCES,
  FALLBACK_MODES,
  VPN_POLICIES,

  // Wrapper functions (for custom integrations)
  wrapInputValidator,
  wrapExecutionGuard,
  wrapAccessControl,
  wrapKeyManager,
  wrapApprovalManager,
  wrapNonceManager,
  wrapMevProtection,
  wrapRpcManager,
  wrapOracleGuard,
  wrapSlippageGuard,
  wrapSandwichDetector,
  wrapTxSimulator,
  setupComplianceAlerts,
  setupComplianceMetrics,
  setupComplianceDashboard,
};
