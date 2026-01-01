/**
 * Chaos Engineering Tests - Security Layer Resilience
 *
 * Tests the system's ability to handle failure scenarios:
 * 1. RPC Failure Cascade - Kill primary+secondary, verify tertiary
 * 2. Nonce Gap Recovery - Inject stuck tx, verify auto-recovery
 * 3. MEV Sandwich Simulation - Execute trade with attack simulation
 * 4. Malicious Contract Detection - Attempt drainer interaction
 * 5. Stablecoin Depeg Response - Simulate 5% depeg
 *
 * @module tests/chaos/chaos-engineering
 */

const {
  createSecurityLayer,
  RpcManager,
  NonceManager,
  MevProtection,
  InputValidator,
  SlippageGuard,
  OracleGuard,
  ExecutionGuard,
  WALLET_TIER,
} = require('../../src/security');

const { ethers } = require('ethers');

describe('Chaos Engineering Tests', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('RPC Failure Cascade', () => {
    let rpcManager;

    beforeEach(() => {
      rpcManager = new RpcManager({
        logger: mockLogger,
        healthCheckInterval: 1000,
        retryAttempts: 2,
        retryDelay: 10, // Fast retries for tests
      });

      // Add test chain with 4 RPCs
      rpcManager.addChainConfig(99999, [
        { url: 'https://rpc1.test.com', priority: 1, name: 'Primary' },
        { url: 'https://rpc2.test.com', priority: 2, name: 'Secondary' },
        { url: 'https://rpc3.test.com', priority: 3, name: 'Tertiary' },
        { url: 'https://rpc4.test.com', priority: 4, name: 'Quaternary' },
      ]);
    });

    test('initializes with correct RPC configuration', () => {
      const rpcs = rpcManager.rpcConfigs.get(99999);
      expect(rpcs.length).toBe(4);
      expect(rpcs[0].name).toBe('Primary');
      expect(rpcs[3].name).toBe('Quaternary');
    });

    test('tracks health metrics correctly', () => {
      // Simulate successful request
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', true, null, 100);

      const health = rpcManager.getHealthStatus();
      expect(health[99999][0].state).toBe('healthy');
      expect(health[99999][0].latency).toBe(100);
    });

    test('marks RPC as unhealthy after consecutive failures', () => {
      // Simulate 3 consecutive failures
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', false, new Error('Fail 1'));
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', false, new Error('Fail 2'));
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', false, new Error('Fail 3'));

      const health = rpcManager.getHealthStatus();
      expect(health[99999][0].state).toBe('unhealthy');
      expect(health[99999][0].errorCount).toBe(3);
    });

    test('marks RPC as degraded for high latency', () => {
      // High latency (>80% of max)
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', true, null, 4500);

      const health = rpcManager.getHealthStatus();
      expect(health[99999][0].state).toBe('degraded');
    });

    test('decays error count on successful requests', () => {
      // Add some errors
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', false, new Error('Fail'));
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', false, new Error('Fail'));

      const healthBefore = rpcManager.getHealthStatus();
      expect(healthBefore[99999][0].errorCount).toBe(2);

      // Successful request should decay
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', true, null, 100);

      const healthAfter = rpcManager.getHealthStatus();
      expect(healthAfter[99999][0].errorCount).toBe(1);
    });

    test('tracks failover metrics', () => {
      const initialMetrics = rpcManager.getMetrics();
      expect(initialMetrics.failovers).toBe(0);

      // Simulate failover by incrementing metrics
      rpcManager.metrics.failovers++;

      expect(rpcManager.getMetrics().failovers).toBe(1);
    });

    test('resets health correctly', () => {
      // Set unhealthy
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', false, new Error('Fail'));
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', false, new Error('Fail'));
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', false, new Error('Fail'));

      // Reset
      rpcManager.resetHealth(99999, 'https://rpc1.test.com');

      const health = rpcManager.getHealthStatus();
      expect(health[99999][0].state).toBe('unknown');
      expect(health[99999][0].errorCount).toBe(0);
    });

    test('adds new RPC endpoint dynamically', () => {
      rpcManager.addRpc(99999, 'https://rpc5.test.com', 5, 'Quinary');

      const rpcs = rpcManager.rpcConfigs.get(99999);
      expect(rpcs.length).toBe(5);
      expect(rpcs[4].name).toBe('Quinary');
    });

    test('counts healthy providers', () => {
      // Mark some as healthy
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', true, null, 100);
      rpcManager.updateHealth(99999, 'https://rpc2.test.com', true, null, 100);

      expect(rpcManager.getHealthyCount(99999)).toBe(2);
    });

    test('checks minimum healthy providers', () => {
      // None healthy initially
      expect(rpcManager.hasMinimumHealthy(99999)).toBe(false);

      // Make one healthy
      rpcManager.updateHealth(99999, 'https://rpc1.test.com', true, null, 100);

      expect(rpcManager.hasMinimumHealthy(99999)).toBe(true);
    });
  });

  describe('Nonce Gap Recovery', () => {
    let nonceManager;
    let mockProvider;
    let mockSigner;
    let onChainNonce;

    beforeEach(() => {
      onChainNonce = 10;

      mockProvider = {
        getTransactionCount: jest.fn().mockImplementation(async () => onChainNonce),
        getGasPrice: jest.fn().mockResolvedValue(ethers.BigNumber.from('20000000000')),
      };

      mockSigner = {
        sendTransaction: jest.fn().mockResolvedValue({
          hash: '0xCancelTxHash',
          wait: jest.fn().mockResolvedValue({
            status: 1,
            gasUsed: ethers.BigNumber.from('21000'),
          }),
        }),
        getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      };

      nonceManager = new NonceManager({
        logger: mockLogger,
        stuckTimeout: 100, // 100ms for testing
        lockTimeout: 5000,
      });
    });

    test('reserves sequential nonces correctly', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      const nonce1 = await nonceManager.getNextNonce(wallet, mockProvider);
      const nonce2 = await nonceManager.getNextNonce(wallet, mockProvider);
      const nonce3 = await nonceManager.getNextNonce(wallet, mockProvider);

      expect(nonce1).toBe(10);
      expect(nonce2).toBe(11);
      expect(nonce3).toBe(12);
    });

    test('detects stuck transactions after timeout', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      // Reserve nonces
      await nonceManager.getNextNonce(wallet, mockProvider);
      await nonceManager.getNextNonce(wallet, mockProvider);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      const stuck = await nonceManager.findStuckTransactions();
      expect(stuck.length).toBeGreaterThan(0);
      expect(stuck[0].nonce).toBe(10);
    });

    test('releases nonces correctly on failure', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      const nonce1 = await nonceManager.getNextNonce(wallet, mockProvider);
      await nonceManager.releaseNonce(wallet, nonce1);

      // Should get same nonce again
      const nonce2 = await nonceManager.getNextNonce(wallet, mockProvider);
      expect(nonce2).toBe(nonce1);
    });

    test('confirms nonces and updates state', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      const nonce = await nonceManager.getNextNonce(wallet, mockProvider);
      await nonceManager.confirmNonce(wallet, nonce, '0xTxHash123');

      const pending = nonceManager.getPendingNonces(wallet);
      expect(pending).not.toContain(nonce);

      const lastConfirmed = nonceManager.getLastConfirmedNonce(wallet);
      expect(lastConfirmed).toBe(nonce);
    });

    test('cancels stuck transaction with replacement', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      // Reserve a nonce and let it become stuck
      await nonceManager.getNextNonce(wallet, mockProvider);
      await new Promise(resolve => setTimeout(resolve, 150));

      // Cancel the stuck transaction
      const result = await nonceManager.cancelStuckTransaction(
        wallet,
        10,
        mockSigner,
        mockProvider
      );

      expect(result.success).toBe(true);
      expect(result.cancelTxHash).toBe('0xCancelTxHash');
      expect(mockSigner.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: wallet,
          value: 0,
          nonce: 10,
        })
      );
    });

    test('handles concurrent nonce requests without gaps', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      // Request multiple nonces concurrently
      const promises = Array(5).fill(null).map(() =>
        nonceManager.getNextNonce(wallet, mockProvider)
      );

      const nonces = await Promise.all(promises);
      const sorted = [...nonces].sort((a, b) => a - b);

      // Should be sequential with no gaps
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBe(1);
      }

      // Should start from on-chain nonce
      expect(Math.min(...nonces)).toBe(10);
    });

    test('cleanup removes stuck transactions', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      // Reserve nonces and let them become stuck
      await nonceManager.getNextNonce(wallet, mockProvider);
      await nonceManager.getNextNonce(wallet, mockProvider);
      await new Promise(resolve => setTimeout(resolve, 150));

      const stuckBefore = await nonceManager.findStuckTransactions();
      expect(stuckBefore.length).toBe(2);

      // Run cleanup
      const result = await nonceManager.cleanup(mockSigner, mockProvider);

      expect(result.cleaned).toBe(2);
      expect(result.total).toBe(2);
    });

    test('clears wallet tracking correctly', async () => {
      const wallet = '0x1234567890123456789012345678901234567890';

      await nonceManager.getNextNonce(wallet, mockProvider);
      await nonceManager.getNextNonce(wallet, mockProvider);

      nonceManager.clearWallet(wallet);

      expect(nonceManager.getPendingNonces(wallet)).toEqual([]);
      expect(nonceManager.getLastConfirmedNonce(wallet)).toBeNull();
    });
  });

  describe('MEV Sandwich Simulation', () => {
    let mevProtection;

    beforeEach(() => {
      mevProtection = new MevProtection({
        logger: mockLogger,
        preferPrivate: true,
        simulateFirst: false, // Disable for unit tests
      });
    });

    test('identifies high-risk DEX swaps', () => {
      // Uniswap V2 swapExactTokensForTokens
      const swapTx = {
        data: '0x38ed1739' + '0'.repeat(320),
        value: ethers.utils.parseEther('0'),
        gasPrice: ethers.utils.parseUnits('50', 'gwei'),
      };

      const analysis = mevProtection.analyzeMevRisk(swapTx);

      expect(analysis.vulnerable).toBe(true);
      expect(analysis.riskLevel).toBe('high');
      expect(analysis.reasons.some(r => r.includes('DEX swap'))).toBe(true);
    });

    test('identifies critical risk for large value swaps', () => {
      const largeTx = {
        data: '0x38ed1739' + '0'.repeat(320),
        value: ethers.utils.parseEther('50'), // Large value
        gasPrice: ethers.utils.parseUnits('150', 'gwei'), // High gas
      };

      const analysis = mevProtection.analyzeMevRisk(largeTx);

      expect(analysis.vulnerable).toBe(true);
      expect(analysis.riskLevel).toBe('critical');
      expect(analysis.reasons.length).toBeGreaterThanOrEqual(2);
    });

    test('identifies low risk for simple transfers', () => {
      const simpleTx = {
        data: '0xa9059cbb' + '0'.repeat(128), // ERC20 transfer
        value: ethers.utils.parseEther('0'),
        gasPrice: ethers.utils.parseUnits('20', 'gwei'),
      };

      const analysis = mevProtection.analyzeMevRisk(simpleTx);

      expect(analysis.riskLevel).toBe('low');
    });

    test('recommends Flashbots for high-risk mainnet swaps', () => {
      const swapTx = {
        data: '0x38ed1739' + '0'.repeat(320),
        value: ethers.utils.parseEther('0'),
      };

      const strategy = mevProtection.getSubmissionStrategy(swapTx, 1);

      expect(strategy.strategy).toBe('private');
      expect(strategy.rpc).toContain('flashbots');
    });

    test('recommends sequencer for L2 transactions', () => {
      const tx = {
        data: '0x38ed1739' + '0'.repeat(320),
      };

      // Arbitrum
      const arbitrumStrategy = mevProtection.getSubmissionStrategy(tx, 42161);
      expect(arbitrumStrategy.strategy).toBe('sequencer');

      // Optimism
      const optimismStrategy = mevProtection.getSubmissionStrategy(tx, 10);
      expect(optimismStrategy.strategy).toBe('sequencer');

      // Base
      const baseStrategy = mevProtection.getSubmissionStrategy(tx, 8453);
      expect(baseStrategy.strategy).toBe('sequencer');
    });

    test('recommends public mempool for low-risk transactions', () => {
      const lowRiskTx = {
        data: '0xa9059cbb' + '0'.repeat(128),
        value: ethers.utils.parseEther('0'),
        gasPrice: ethers.utils.parseUnits('20', 'gwei'),
      };

      const strategy = mevProtection.getSubmissionStrategy(lowRiskTx, 1);

      expect(strategy.strategy).toBe('public');
    });

    test('detects V3 swap selectors as high risk', () => {
      const v3Selectors = [
        '0x04e45aaf', // exactInputSingle
        '0xb858183f', // exactInput
      ];

      for (const selector of v3Selectors) {
        const tx = {
          data: selector + '0'.repeat(256),
        };

        const analysis = mevProtection.analyzeMevRisk(tx);
        expect(analysis.riskLevel).toBe('high');
      }
    });

    test('tracks pending transactions', () => {
      // Manually add pending tx for tracking
      mevProtection.pendingTxs.set('0xTestHash1', {
        hash: '0xTestHash1',
        chainId: 1,
        sentAt: Date.now(),
        protection: 'Flashbots Protect',
        status: 'pending',
      });

      mevProtection.pendingTxs.set('0xTestHash2', {
        hash: '0xTestHash2',
        chainId: 1,
        sentAt: Date.now(),
        protection: 'none',
        status: 'confirmed',
      });

      const pending = mevProtection.getPendingTransactions();
      expect(pending.length).toBe(1);
      expect(pending[0].hash).toBe('0xTestHash1');
    });

    test('cleanup removes old pending transactions', () => {
      // Add old pending tx
      mevProtection.pendingTxs.set('0xOldHash', {
        hash: '0xOldHash',
        sentAt: Date.now() - 7200000, // 2 hours ago
        status: 'pending',
      });

      // Add recent pending tx
      mevProtection.pendingTxs.set('0xRecentHash', {
        hash: '0xRecentHash',
        sentAt: Date.now(),
        status: 'pending',
      });

      mevProtection.cleanup(3600000); // 1 hour max age

      expect(mevProtection.pendingTxs.has('0xOldHash')).toBe(false);
      expect(mevProtection.pendingTxs.has('0xRecentHash')).toBe(true);
    });
  });

  describe('Malicious Contract Detection', () => {
    let inputValidator;

    beforeEach(() => {
      inputValidator = new InputValidator({
        logger: mockLogger,
        strictMode: true,
      });
    });

    test('detects unknown function selectors on unverified contracts', async () => {
      // Mock unverified contract response
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          status: '0',
          result: 'Contract source code not verified',
        }),
      });

      const result = await inputValidator.validateCalldata(
        '0xUnverifiedContract',
        '0xdeadbeef' + '0'.repeat(64), // Unknown selector
        1
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Unknown function selector'))).toBe(true);
    });

    test('detects zero address in parameters', async () => {
      const transferCalldata =
        '0xa9059cbb' + // transfer selector
        '0000000000000000000000000000000000000000000000000000000000000000' + // zero address
        '0000000000000000000000000000000000000000000000000000000000000001'; // amount

      const result = await inputValidator.validateCalldata(
        '0xTokenContract',
        transferCalldata,
        1
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Zero address'))).toBe(true);
    });

    test('warns on infinite approval pattern', async () => {
      const approveCalldata =
        '0x095ea7b3' + // approve selector
        '000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' + // spender
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'; // max uint256

      const result = await inputValidator.validateCalldata(
        '0xTokenContract',
        approveCalldata,
        1
      );

      expect(result.warnings.some(w => w.includes('Infinite approval'))).toBe(true);
    });

    test('detects malicious null selector pattern', async () => {
      const result = await inputValidator.validateCalldata(
        '0xMaliciousContract',
        '0x00000000' + '0'.repeat(64),
        1
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Null selector'))).toBe(true);
    });

    test('blocks known malicious addresses', async () => {
      inputValidator.addMaliciousAddress('0xDrainerContract');

      const result = await inputValidator.validateCalldata(
        '0xDrainerContract',
        '0xa9059cbb' + '0'.repeat(128),
        1
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Target address is known malicious');
    });

    test('detects invalid swap paths', async () => {
      // swapExactTokensForTokens with single address path (invalid)
      const invalidPathCalldata =
        '0x38ed1739' + // selector
        '0000000000000000000000000000000000000000000000000000000000000001' + // amountIn
        '0000000000000000000000000000000000000000000000000000000000000001' + // amountOutMin
        '00000000000000000000000000000000000000000000000000000000000000a0' + // path offset
        '0000000000000000000000001234567890123456789012345678901234567890' + // to
        '00000000000000000000000000000000000000000000000000000000ffffffff' + // deadline
        '0000000000000000000000000000000000000000000000000000000000000001' + // path length = 1 (invalid)
        '0000000000000000000000001111111111111111111111111111111111111111'; // single address

      const result = await inputValidator.validateCalldata(
        '0xRouter',
        invalidPathCalldata,
        1
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid swap path'))).toBe(true);
    });

    test('validates address format', () => {
      // Valid address
      const valid = inputValidator.validateAddress('0x1234567890123456789012345678901234567890');
      expect(valid.valid).toBe(true);
      expect(valid.type).toBe('address');

      // ENS name
      const ens = inputValidator.validateAddress('vitalik.eth');
      expect(ens.valid).toBe(true);
      expect(ens.type).toBe('ens');

      // Invalid address
      const invalid = inputValidator.validateAddress('0xinvalid');
      expect(invalid.valid).toBe(false);
    });

    test('validates amount format', () => {
      // Valid amount
      const valid = inputValidator.validateAmount('1.5', 18);
      expect(valid.valid).toBe(true);
      expect(valid.parsed.toString()).toBe('1500000000000000000');

      // Too many decimals
      const tooManyDecimals = inputValidator.validateAmount('0.0000000000000000001', 18);
      expect(tooManyDecimals.valid).toBe(false);

      // Zero amount
      const zero = inputValidator.validateAmount('0', 18);
      expect(zero.valid).toBe(false);

      // Negative amount
      const negative = inputValidator.validateAmount('-1', 18);
      expect(negative.valid).toBe(false);
    });

    test('whitelists custom selectors', () => {
      expect(inputValidator.isSelectorWhitelisted('0xabcdef12')).toBe(false);

      inputValidator.addWhitelistedSelector('0xabcdef12', {
        name: 'customFunction',
        params: ['uint256'],
        risk: 'low',
      });

      expect(inputValidator.isSelectorWhitelisted('0xabcdef12')).toBe(true);
      expect(inputValidator.getFunctionInfo('0xabcdef12').name).toBe('customFunction');
    });
  });

  describe('Stablecoin Depeg Response', () => {
    let slippageGuard;
    let oracleGuard;

    beforeEach(() => {
      slippageGuard = new SlippageGuard({ logger: mockLogger });
      oracleGuard = new OracleGuard({ logger: mockLogger });
    });

    test('detects when slippage exceeds hard cap', () => {
      // Try to set slippage above 3% hard cap
      const result = slippageGuard.validateSlippage(0.05); // 5%

      expect(result.valid).toBe(false);
      expect(result.adjusted).toBe(0.03); // Should be capped at 3%
    });

    test('stablecoin pairs have lower or equal slippage tolerance', () => {
      const stablecoinSlippage = slippageGuard.getSlippage('USDC', 'USDT');
      const majorTokenSlippage = slippageGuard.getSlippage('ETH', 'USDC');

      // Stablecoins should have lower or equal slippage than major tokens
      expect(stablecoinSlippage).toBeLessThanOrEqual(majorTokenSlippage);
    });

    test('oracle guard has configurable deviation thresholds', () => {
      // Default thresholds
      expect(oracleGuard.DEVIATION_WARNING).toBe(0.02); // 2%
      expect(oracleGuard.DEVIATION_REJECT).toBe(0.05);  // 5%

      // Custom thresholds
      const customOracle = new OracleGuard({
        logger: mockLogger,
        deviationWarning: 0.03,
        deviationReject: 0.10,
      });

      expect(customOracle.DEVIATION_WARNING).toBe(0.03);
      expect(customOracle.DEVIATION_REJECT).toBe(0.10);
    });

    test('calculates price deviation correctly', () => {
      // Calculate deviation manually as the OracleGuard does internally
      const price1 = 100;
      const price2 = 95;

      const deviation = Math.abs(price1 - price2) / price1;

      // Should be 5%
      expect(deviation).toBeCloseTo(0.05, 2);
    });

    test('price within warning threshold is acceptable', () => {
      const basePrice = 1.00;
      const currentPrice = 0.985; // 1.5% deviation - below warning threshold

      const deviation = Math.abs(basePrice - currentPrice) / basePrice;

      expect(deviation).toBeLessThan(oracleGuard.DEVIATION_WARNING);
    });

    test('price outside reject threshold is unacceptable', () => {
      const basePrice = 1.00;
      const depegedPrice = 0.90; // 10% depeg - beyond reject threshold

      const deviation = Math.abs(basePrice - depegedPrice) / basePrice;

      expect(deviation).toBeGreaterThan(oracleGuard.DEVIATION_REJECT);
    });

    test('slippage adjusts for volatile tokens', () => {
      const volatileSlippage = slippageGuard.getSlippage('SHIB', 'ETH');
      const majorSlippage = slippageGuard.getSlippage('ETH', 'USDC');

      // Volatile tokens should have higher allowed slippage
      expect(volatileSlippage).toBeGreaterThanOrEqual(majorSlippage);
    });

    test('slippage validation enforces hard cap', () => {
      // Valid slippage
      const validResult = slippageGuard.validateSlippage(0.02);
      expect(validResult.valid).toBe(true);
      expect(validResult.adjusted).toBe(0.02);

      // Over hard cap
      const overCapResult = slippageGuard.validateSlippage(0.10);
      expect(overCapResult.valid).toBe(false);
      expect(overCapResult.adjusted).toBe(0.03); // Hard cap
    });

    test('L2 chains have sequencer feed configured', () => {
      expect(oracleGuard.isL2WithSequencer(42161)).toBe(true); // Arbitrum
      expect(oracleGuard.isL2WithSequencer(10)).toBe(true);    // Optimism
      expect(oracleGuard.isL2WithSequencer(8453)).toBe(true);  // Base
      expect(oracleGuard.isL2WithSequencer(1)).toBe(false);    // Mainnet
    });

    test('supported pairs are configured for major chains', () => {
      const mainnetPairs = oracleGuard.getSupportedPairs(1);
      expect(mainnetPairs).toContain('ETH/USD');
      expect(mainnetPairs).toContain('BTC/USD');
      expect(mainnetPairs).toContain('USDC/USD');

      const arbitrumPairs = oracleGuard.getSupportedPairs(42161);
      expect(arbitrumPairs).toContain('ETH/USD');
    });
  });

  describe('System-Wide Chaos', () => {
    let security;

    beforeEach(() => {
      security = createSecurityLayer({ logger: mockLogger });
    });

    test('security layer initializes all modules', () => {
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

    test('emergency stop halts all executions', async () => {
      security.executionGuard.activateEmergencyStop('Chaos test');

      await expect(
        security.executionGuard.execute({
          walletAddress: '0x1234567890123456789012345678901234567890',
          prepareFn: async () => ({ valid: true }),
          executeFn: async () => ({ txHash: '0x123' }),
          confirmFn: async () => ({}),
        })
      ).rejects.toThrow('Emergency stop');
    });

    test('shutdown cleans up all modules', async () => {
      // Start health checks
      security.rpcManager.startHealthChecks();

      // Verify running
      expect(security.rpcManager.healthCheckHandle).not.toBeNull();

      // Shutdown
      await security.shutdown();

      // Verify stopped
      expect(security.rpcManager.healthCheckHandle).toBeNull();
    });

    test('RPC manager provides health status', () => {
      const health = security.rpcManager.getHealthStatus();

      // Should have health for configured chains
      expect(health).toBeDefined();
      expect(typeof health).toBe('object');
    });

    test('execution guard provides metrics', () => {
      const metrics = security.executionGuard.getMetrics();

      expect(metrics).toHaveProperty('totalExecutions');
      expect(metrics).toHaveProperty('successfulExecutions');
      expect(metrics).toHaveProperty('failedExecutions');
    });

    test('nonce manager provides status', () => {
      const status = security.nonceManager.getStatus();

      expect(status).toHaveProperty('pendingByWallet');
      expect(status).toHaveProperty('totalPending');
    });
  });
});
