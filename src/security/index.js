/**
 * Security Module - Core Safety Infrastructure
 *
 * Sprint 1.1: Complete Security Layer
 *
 * This module provides comprehensive security infrastructure for the
 * airdrop hunter bot, implementing state-of-the-art protections against:
 * - MEV attacks (sandwich, frontrunning)
 * - Oracle manipulation
 * - Reentrancy-like race conditions
 * - Slippage exploitation
 * - Private key exposure
 * - Nonce management issues
 * - Token approval risks
 * - RPC failures
 *
 * @module security
 */

const SlippageGuard = require('./slippage-guard');
const InputValidator = require('./input-validator');
const OracleGuard = require('./oracle-guard');
const NonceManager = require('./nonce-manager');
const ApprovalManager = require('./approval-manager');
const ExecutionGuard = require('./execution-guard');
const MevProtection = require('./mev-protection');
const RpcManager = require('./rpc-manager');
const KeyManager = require('./key-manager');
const AccessControl = require('./access-control');

/**
 * Create a fully configured security layer
 *
 * @param {object} config - Configuration options
 * @returns {object} Security layer instance
 */
function createSecurityLayer(config = {}) {
  const logger = config.logger || console;

  // Initialize all security modules
  const slippageGuard = new SlippageGuard({
    logger,
    ...config.slippage,
  });

  const inputValidator = new InputValidator({
    logger,
    etherscanApiKey: config.etherscanApiKey,
    ...config.input,
  });

  const oracleGuard = new OracleGuard({
    logger,
    ...config.oracle,
  });

  const nonceManager = new NonceManager({
    logger,
    ...config.nonce,
  });

  const approvalManager = new ApprovalManager({
    logger,
    ...config.approval,
  });

  const executionGuard = new ExecutionGuard({
    logger,
    ...config.execution,
  });

  const mevProtection = new MevProtection({
    logger,
    ...config.mev,
  });

  const rpcManager = new RpcManager({
    logger,
    ...config.rpc,
  });

  const keyManager = new KeyManager({
    logger,
    ...config.key,
  });

  const accessControl = new AccessControl({
    logger,
    adminUserId: config.adminUserId,
    ...config.access,
  });

  // Start RPC health checks
  if (config.enableRpcHealthChecks !== false) {
    rpcManager.startHealthChecks();
  }

  // Register execution guard hooks
  if (config.enableExecutionHooks !== false) {
    // Pre-execution: validate inputs
    executionGuard.registerPreExecutionHook(async (txId, params) => {
      if (params.calldata) {
        const validation = await inputValidator.validateCalldata(
          params.to,
          params.calldata,
          params.chainId
        );
        if (!validation.valid) {
          throw new Error(`Input validation failed: ${validation.errors.join(', ')}`);
        }
      }
    });

    // Post-execution: schedule approval revoke
    executionGuard.registerPostExecutionHook(async (txId, result) => {
      if (result.success && result.approvalInfo) {
        approvalManager.scheduleRevoke(
          result.approvalInfo.token,
          result.approvalInfo.spender,
          result.approvalInfo.signer
        );
      }
    });
  }

  return {
    // Core guards
    slippageGuard,
    inputValidator,
    oracleGuard,
    nonceManager,
    approvalManager,
    executionGuard,
    mevProtection,
    rpcManager,
    keyManager,
    accessControl,

    // Convenience methods
    async getProvider(chainId) {
      return rpcManager.getProvider(chainId);
    },

    async validateAndExecute(params) {
      // Full validation pipeline
      const chainId = params.chainId;
      const provider = await rpcManager.getProvider(chainId);

      // Check sequencer (L2)
      const sequencerHealth = await oracleGuard.checkSequencerHealth(chainId, provider);
      if (!sequencerHealth.isUp) {
        throw new Error('L2 sequencer is down');
      }

      // Validate inputs
      if (params.calldata) {
        const validation = await inputValidator.validateCalldata(
          params.to,
          params.calldata,
          chainId
        );
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Get slippage
      const slippage = slippageGuard.getSlippage(
        params.fromToken,
        params.toToken,
        params.userSlippage
      );

      // Execute with protection
      return executionGuard.execute({
        walletAddress: params.walletAddress,
        prepareFn: params.prepareFn,
        simulateFn: params.simulateFn,
        approveFn: params.approveFn,
        executeFn: async (prepareResult) => {
          const nonce = await nonceManager.getNextNonce(params.walletAddress, provider);

          try {
            const result = await mevProtection.sendProtectedTransaction(
              params.signer,
              { ...prepareResult.tx, nonce },
              chainId
            );
            nonceManager.updateNonceTransaction(params.walletAddress, nonce, result.txHash);
            return result;
          } catch (error) {
            await nonceManager.releaseNonce(params.walletAddress, nonce);
            throw error;
          }
        },
        confirmFn: async (executeResult) => {
          const result = await mevProtection.waitForInclusion(
            executeResult.txHash,
            chainId
          );
          if (result.included) {
            await nonceManager.confirmNonce(
              params.walletAddress,
              executeResult.nonce,
              executeResult.txHash
            );
          }
          return { confirmed: result.included, ...result };
        },
      });
    },

    // Health check
    getHealthStatus() {
      return {
        rpc: rpcManager.getHealthStatus(),
        execution: executionGuard.getMetrics(),
        mev: mevProtection.getPendingTransactions().length,
        nonce: nonceManager.getStatus(),
        approval: approvalManager.getStats(),
      };
    },

    // Emergency stop
    emergencyStop(reason) {
      executionGuard.activateEmergencyStop(reason);
      logger.error(`[Security] EMERGENCY STOP: ${reason}`);
    },

    // Cleanup
    shutdown() {
      rpcManager.stopHealthChecks();
      executionGuard.cleanup();
      mevProtection.cleanup();
      logger.info('[Security] Security layer shut down');
    },
  };
}

module.exports = {
  // Classes
  SlippageGuard,
  InputValidator,
  OracleGuard,
  NonceManager,
  ApprovalManager,
  ExecutionGuard,
  MevProtection,
  RpcManager,
  KeyManager,
  AccessControl,

  // Factory function
  createSecurityLayer,

  // Constants
  WALLET_TIER: KeyManager.WALLET_TIER,
  KEY_SOURCE: KeyManager.KEY_SOURCE,
  TX_STATE: ExecutionGuard.TX_STATE,
  ROLE: AccessControl.ROLE,
  PERMISSION: AccessControl.PERMISSION,
  HEALTH_STATE: RpcManager.HEALTH_STATE,
};
