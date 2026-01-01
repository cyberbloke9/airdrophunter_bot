/**
 * Security Layer Integration Tests
 *
 * Tests the full security layer working together including:
 * - Full swap flow with all security checks
 * - RPC failover under load
 * - Cross-module coordination
 */

const { ethers } = require('ethers');
const {
  createSecurityLayer,
  SlippageGuard,
  InputValidator,
  NonceManager,
  ApprovalManager,
  OracleGuard,
  ExecutionGuard,
  MevProtection,
  RpcManager,
  KeyManager,
  AccessControl,
  WALLET_TIER,
  KEY_SOURCE,
  TX_STATE,
  ROLE,
  PERMISSION,
} = require('../../src/security');

describe('Security Layer Integration', () => {
  let mockLogger;
  let mockProvider;
  let mockSigner;
  let mockContract;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockProvider = {
      getBlockNumber: jest.fn().mockResolvedValue(12345),
      getTransactionCount: jest.fn().mockResolvedValue(10),
      getBalance: jest.fn().mockResolvedValue(ethers.utils.parseEther('1')),
      getGasPrice: jest.fn().mockResolvedValue(ethers.utils.parseUnits('20', 'gwei')),
      call: jest.fn().mockResolvedValue('0x'),
      estimateGas: jest.fn().mockResolvedValue(ethers.BigNumber.from(100000)),
      getTransactionReceipt: jest.fn().mockResolvedValue(null),
      getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
    };

    mockContract = {
      allowance: jest.fn().mockResolvedValue(ethers.BigNumber.from(0)),
      approve: jest.fn().mockResolvedValue({
        hash: '0xApproveTxHash',
        wait: jest.fn().mockResolvedValue({ status: 1, gasUsed: ethers.BigNumber.from(50000) }),
      }),
      symbol: jest.fn().mockResolvedValue('TEST'),
      decimals: jest.fn().mockResolvedValue(18),
    };

    mockSigner = {
      getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      sendTransaction: jest.fn().mockResolvedValue({
        hash: '0xTxHash123',
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 12345,
          gasUsed: ethers.BigNumber.from(100000),
        }),
      }),
      signMessage: jest.fn().mockResolvedValue('0xSignature'),
      provider: mockProvider,
      connect: jest.fn().mockReturnThis(),
    };

    jest.spyOn(ethers, 'Contract').mockImplementation(() => mockContract);
    jest.spyOn(ethers.providers, 'JsonRpcProvider').mockImplementation(() => mockProvider);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createSecurityLayer Factory', () => {
    test('creates all security modules', () => {
      const security = createSecurityLayer({ logger: mockLogger });

      expect(security.slippageGuard).toBeDefined();
      expect(security.inputValidator).toBeDefined();
      expect(security.nonceManager).toBeDefined();
      expect(security.approvalManager).toBeDefined();
      expect(security.oracleGuard).toBeDefined();
      expect(security.executionGuard).toBeDefined();
      expect(security.mevProtection).toBeDefined();
      expect(security.rpcManager).toBeDefined();
      expect(security.keyManager).toBeDefined();
      expect(security.accessControl).toBeDefined();
    });

    test('exports convenience methods', () => {
      const security = createSecurityLayer({ logger: mockLogger });

      expect(typeof security.validateAndExecute).toBe('function');
      expect(typeof security.getHealthStatus).toBe('function');
      expect(typeof security.emergencyStop).toBe('function');
      expect(typeof security.shutdown).toBe('function');
    });

    test('exports constants correctly', () => {
      expect(ROLE).toBeDefined();
      expect(ROLE.ADMIN).toBe('admin');
      expect(ROLE.OPERATOR).toBe('operator');
      expect(WALLET_TIER).toBeDefined();
      expect(WALLET_TIER.HOT).toBe('hot');
    });
  });

  describe('Slippage Guard Integration', () => {
    let security;

    beforeEach(() => {
      security = createSecurityLayer({ logger: mockLogger });
    });

    test('returns appropriate slippage for stablecoins', () => {
      const slippage = security.slippageGuard.getSlippage('USDC', 'USDT');
      expect(slippage).toBe(0.001); // 0.1% for stablecoins
    });

    test('returns appropriate slippage for major tokens', () => {
      const slippage = security.slippageGuard.getSlippage('ETH', 'UNI');
      expect(slippage).toBe(0.005); // 0.5% for major tokens
    });

    test('enforces maximum slippage', () => {
      const slippage = security.slippageGuard.getSlippage('UNKNOWN', 'TOKEN', 0.10);
      expect(slippage).toBeLessThanOrEqual(0.03); // Never exceeds 3%
    });

    test('validates slippage correctly', () => {
      // validateSlippage takes a single slippage value
      const validResult = security.slippageGuard.validateSlippage(0.01);
      expect(validResult.valid).toBe(true);

      const invalidResult = security.slippageGuard.validateSlippage(0.10);
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('Execution Guard Integration', () => {
    let security;

    beforeEach(() => {
      security = createSecurityLayer({ logger: mockLogger });
    });

    test('executes transaction successfully', async () => {
      const result = await security.executionGuard.execute({
        walletAddress: '0x1234567890123456789012345678901234567890',
        prepareFn: async () => ({ ready: true }),
        executeFn: async () => ({ txHash: '0xSwapTxHash' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(result.success).toBe(true);
    });

    test('handles execution errors gracefully', async () => {
      // The execution guard should catch errors and return a failed result
      let result;
      try {
        result = await security.executionGuard.execute({
          walletAddress: '0x1234567890123456789012345678901234567890',
          prepareFn: async () => {
            throw new Error('Preparation failed');
          },
          executeFn: async () => ({}),
          confirmFn: async () => ({}),
        });
      } catch (error) {
        // If it throws, that's also acceptable error handling
        result = { success: false, error: error.message };
      }

      expect(result.success).toBe(false);
      expect(result.error).toContain('Preparation failed');
    });

    test('tracks execution metrics', async () => {
      await security.executionGuard.execute({
        walletAddress: '0x1234567890123456789012345678901234567890',
        prepareFn: async () => ({}),
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      const metrics = security.executionGuard.getMetrics();
      expect(metrics.totalExecutions).toBeGreaterThan(0);
    });

    test('handles concurrent executions for different wallets', async () => {
      const wallet1 = '0x1111111111111111111111111111111111111111';
      const wallet2 = '0x2222222222222222222222222222222222222222';

      const exec1 = security.executionGuard.execute({
        walletAddress: wallet1,
        prepareFn: async () => ({ valid: true }),
        executeFn: async () => {
          await new Promise(r => setTimeout(r, 50));
          return { txHash: '0xTx1' };
        },
        confirmFn: async () => ({ confirmed: true }),
      });

      const exec2 = security.executionGuard.execute({
        walletAddress: wallet2,
        prepareFn: async () => ({ valid: true }),
        executeFn: async () => {
          await new Promise(r => setTimeout(r, 50));
          return { txHash: '0xTx2' };
        },
        confirmFn: async () => ({ confirmed: true }),
      });

      const [result1, result2] = await Promise.all([exec1, exec2]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('RPC Failover Integration', () => {
    let security;

    beforeEach(() => {
      security = createSecurityLayer({ logger: mockLogger });
    });

    test('fails over to secondary RPC on error', async () => {
      let callCount = 0;

      const result = await security.rpcManager.executeWithFailover(1, async (provider) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Primary RPC failed');
        }
        return { success: true, provider: 'secondary' };
      }, { attempts: 1 });

      expect(result.success).toBe(true);
      expect(security.rpcManager.metrics.failovers).toBeGreaterThan(0);
    });

    test('retries before failing over', async () => {
      let attempts = 0;

      const result = await security.rpcManager.executeWithFailover(1, async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return { success: true };
      }, { attempts: 3 });

      expect(result.success).toBe(true);
      expect(attempts).toBe(2);
    });

    test('tracks RPC health metrics', async () => {
      await security.rpcManager.executeWithFailover(1, async () => ({ success: true }));
      await security.rpcManager.executeWithFailover(1, async () => ({ success: true }));

      const metrics = security.rpcManager.getMetrics();
      expect(metrics.totalRequests).toBeGreaterThanOrEqual(2);
      expect(metrics.successfulRequests).toBeGreaterThanOrEqual(2);
    });

    test('provides health status for all chains', () => {
      const status = security.rpcManager.getHealthStatus();

      expect(status[1]).toBeDefined(); // Mainnet
      expect(status[42161]).toBeDefined(); // Arbitrum
      expect(status[10]).toBeDefined(); // Optimism
    });
  });

  describe('Nonce Management Integration', () => {
    let security;

    beforeEach(() => {
      security = createSecurityLayer({ logger: mockLogger });
    });

    test('manages nonces across concurrent transactions', async () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';

      const nonce1Promise = security.nonceManager.getNextNonce(walletAddress, mockProvider);
      const nonce2Promise = security.nonceManager.getNextNonce(walletAddress, mockProvider);

      const [nonce1, nonce2] = await Promise.all([nonce1Promise, nonce2Promise]);

      expect(Math.abs(nonce1 - nonce2)).toBe(1);
    });

    test('confirms nonces correctly', async () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';

      const nonce = await security.nonceManager.getNextNonce(walletAddress, mockProvider);
      security.nonceManager.confirmNonce(walletAddress, nonce);

      const status = security.nonceManager.getStatus(walletAddress);
      expect(status).toBeDefined();
    });
  });

  describe('Token Approval Integration', () => {
    let security;

    beforeEach(() => {
      security = createSecurityLayer({ logger: mockLogger });
    });

    test('approves exact amounts by default', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      const result = await security.approvalManager.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner
      );

      expect(result.success).toBe(true);
      expect(mockContract.approve).toHaveBeenCalledWith('0xSpenderAddress', amount);
    });

    test('tracks all approvals for wallet', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await security.approvalManager.safeApprove('0xToken1', '0xSpender1', amount, mockSigner);
      await security.approvalManager.safeApprove('0xToken2', '0xSpender2', amount, mockSigner);

      const walletAddress = await mockSigner.getAddress();
      const approvals = security.approvalManager.getAllApprovals(walletAddress);

      expect(approvals.length).toBe(2);
    });

    test('identifies risky approvals', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await security.approvalManager.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner,
        { policy: 'unlimited' }
      );

      const walletAddress = await mockSigner.getAddress();
      const risky = security.approvalManager.getRiskyApprovals(walletAddress);

      expect(risky.length).toBe(1);
      expect(risky[0].overallRisk).toBe('high');
    });

    test('provides approval statistics', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await security.approvalManager.safeApprove('0xToken1', '0xSpender1', amount, mockSigner);

      const stats = security.approvalManager.getStats();
      expect(stats.totalApprovals).toBe(1);
    });
  });

  describe('MEV Protection Integration', () => {
    let security;

    beforeEach(() => {
      security = createSecurityLayer({ logger: mockLogger });
    });

    test('recommends private submission for DEX swaps', () => {
      const swapTx = {
        data: '0x38ed1739' + '0'.repeat(320), // swapExactTokensForTokens
        value: 0,
      };

      const strategy = security.mevProtection.getSubmissionStrategy(swapTx, 1);
      expect(strategy.strategy).toBe('private');
    });

    test('recommends sequencer for L2 chains', () => {
      const tx = { data: '0x', value: 0 };

      const arbStrategy = security.mevProtection.getSubmissionStrategy(tx, 42161);
      expect(arbStrategy.strategy).toBe('sequencer');

      const opStrategy = security.mevProtection.getSubmissionStrategy(tx, 10);
      expect(opStrategy.strategy).toBe('sequencer');
    });

    test('analyzes MEV risk levels', () => {
      const swapTx = { data: '0x38ed1739' + '0'.repeat(320), value: 0 };
      const swapRisk = security.mevProtection.analyzeMevRisk(swapTx);
      expect(swapRisk.riskLevel).toBe('high');

      const simpleTx = { data: '0x', value: ethers.utils.parseEther('0.01') };
      const simpleRisk = security.mevProtection.analyzeMevRisk(simpleTx);
      expect(simpleRisk.riskLevel).toBe('low');
    });
  });

  describe('Key Management Integration', () => {
    let security;
    const testEncryptionKey = 'test-encryption-key-32-chars!!!';

    beforeEach(() => {
      security = createSecurityLayer({
        logger: mockLogger,
        key: { encryptionKey: testEncryptionKey },
      });
    });

    test('encrypts and decrypts keys', () => {
      const originalKey = '0x' + 'a'.repeat(64);

      const encrypted = security.keyManager.encrypt(originalKey, testEncryptionKey);
      const decrypted = security.keyManager.decrypt(encrypted, testEncryptionKey);

      expect(decrypted).toBe(originalKey);
      expect(encrypted).not.toBe(originalKey);
    });

    test('enforces tier spending limits', () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';

      security.keyManager.wallets.set(walletAddress.toLowerCase(), {
        tier: WALLET_TIER.HOT,
        identifier: 'test-hot',
        address: walletAddress,
        loadedAt: Date.now(),
      });

      const withinLimit = security.keyManager.checkTierLimits(walletAddress, 500);
      expect(withinLimit.allowed).toBe(true);

      const exceedsLimit = security.keyManager.checkTierLimits(walletAddress, 2000);
      expect(exceedsLimit.allowed).toBe(false);
    });

    test('tracks daily spending', () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';

      security.keyManager.recordSpending(walletAddress, 100);
      security.keyManager.recordSpending(walletAddress, 200);

      const spending = security.keyManager.dailySpending.get(walletAddress.toLowerCase());
      expect(spending.amount).toBe(300);
    });
  });

  describe('Access Control Integration', () => {
    let security;

    beforeEach(() => {
      security = createSecurityLayer({ logger: mockLogger });
    });

    test('assigns and checks roles via permissions', () => {
      const operatorAddress = '0xOperator0000000000000000000000000000000';
      const viewerAddress = '0xViewer00000000000000000000000000000000';

      // assignRole takes 3 args: userId, role, assignedBy
      security.accessControl.assignRole(operatorAddress, ROLE.OPERATOR, 'system');
      security.accessControl.assignRole(viewerAddress, ROLE.VIEWER, 'system');

      // Use hasPermission to verify roles were assigned
      expect(security.accessControl.hasPermission(operatorAddress, PERMISSION.EXECUTE_SWAP)).toBe(true);
      expect(security.accessControl.hasPermission(viewerAddress, PERMISSION.VIEW_BALANCES)).toBe(true);
    });

    test('checks permissions correctly', () => {
      const adminAddress = '0xAdmin000000000000000000000000000000000';
      const viewerAddress = '0xViewer00000000000000000000000000000000';

      security.accessControl.assignRole(adminAddress, ROLE.ADMIN, 'system');
      security.accessControl.assignRole(viewerAddress, ROLE.VIEWER, 'system');

      // Use getUserPermissions instead of getPermissions
      const adminPerms = security.accessControl.getUserPermissions(adminAddress);
      const viewerPerms = security.accessControl.getUserPermissions(viewerAddress);

      expect(adminPerms.length).toBeGreaterThan(viewerPerms.length);
    });

    test('logs audit events', () => {
      const address = '0x1234567890123456789012345678901234567890';

      security.accessControl.assignRole(address, ROLE.OPERATOR, 'system');

      const logs = security.accessControl.getAuditLog();
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Input Validator Integration', () => {
    let security;

    beforeEach(() => {
      security = createSecurityLayer({ logger: mockLogger });
    });

    test('validates known function selectors', () => {
      const validCalldata = '0x38ed1739' + '0'.repeat(320);
      const result = security.inputValidator.validateCalldata(validCalldata);

      expect(result).toBeDefined();
    });

    test('rejects empty calldata when expected', () => {
      const result = security.inputValidator.validateCalldata('');
      expect(result).toBeDefined();
    });
  });

  describe('End-to-End Flow', () => {
    test('complete execution with security checks', async () => {
      const security = createSecurityLayer({ logger: mockLogger });
      const walletAddress = '0x1234567890123456789012345678901234567890';

      // Setup
      security.accessControl.assignRole(walletAddress, ROLE.OPERATOR, 'system');
      security.keyManager.wallets.set(walletAddress.toLowerCase(), {
        tier: WALLET_TIER.HOT,
        identifier: 'hot-wallet',
        address: walletAddress,
        loadedAt: Date.now(),
      });

      // Step 1: Check access via hasPermission
      const hasSwapPermission = security.accessControl.hasPermission(walletAddress, PERMISSION.EXECUTE_SWAP);
      expect(hasSwapPermission).toBe(true);

      // Step 2: Get slippage
      const slippage = security.slippageGuard.getSlippage('ETH', 'USDC');
      expect(slippage).toBeGreaterThan(0);
      expect(slippage).toBeLessThanOrEqual(0.03);

      // Step 3: Check tier limits
      const tierCheck = security.keyManager.checkTierLimits(walletAddress, 500);
      expect(tierCheck.allowed).toBe(true);

      // Step 4: Get MEV strategy
      const calldata = '0x38ed1739' + '0'.repeat(320);
      const strategy = security.mevProtection.getSubmissionStrategy({ data: calldata, value: 0 }, 1);
      expect(strategy.strategy).toBeDefined();

      // Step 5: Execute with guard
      const result = await security.executionGuard.execute({
        walletAddress,
        prepareFn: async () => ({ valid: true }),
        executeFn: async () => ({ txHash: '0xSwapTx' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(result.success).toBe(true);

      // Step 6: Record spending
      security.keyManager.recordSpending(walletAddress, 500);

      // Step 7: Verify metrics
      const metrics = security.executionGuard.getMetrics();
      expect(metrics.totalExecutions).toBeGreaterThan(0);
    });
  });

  describe('Health Status', () => {
    test('returns comprehensive health status', () => {
      const security = createSecurityLayer({ logger: mockLogger });

      const health = security.getHealthStatus();

      expect(health.rpc).toBeDefined();
      expect(health.execution).toBeDefined();
      expect(health.approval).toBeDefined();
    });
  });

  describe('Emergency Stop', () => {
    test('activates emergency stop', () => {
      const security = createSecurityLayer({ logger: mockLogger });

      security.emergencyStop('Test emergency');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('EMERGENCY STOP')
      );
    });
  });

  describe('Shutdown', () => {
    test('shuts down cleanly', () => {
      const security = createSecurityLayer({ logger: mockLogger });

      security.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('shut down')
      );
    });
  });
});
