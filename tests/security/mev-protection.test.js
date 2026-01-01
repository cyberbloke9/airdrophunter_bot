/**
 * MEV Protection Unit Tests
 *
 * Tests Flashbots integration, transaction simulation,
 * MEV risk analysis, and submission strategies.
 */

const { ethers } = require('ethers');
const MevProtection = require('../../src/security/mev-protection');

describe('MevProtection', () => {
  let mevProtection;
  let mockLogger;
  let mockSigner;
  let mockProvider;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockSigner = {
      sendTransaction: jest.fn().mockResolvedValue({
        hash: '0xTxHash123',
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 12345,
        }),
      }),
      signTransaction: jest.fn().mockResolvedValue('0xSignedTx'),
      connect: jest.fn().mockReturnThis(),
    };

    mockProvider = {
      call: jest.fn().mockResolvedValue('0x'),
      estimateGas: jest.fn().mockResolvedValue(ethers.BigNumber.from(100000)),
      getBlockNumber: jest.fn().mockResolvedValue(12345),
      getTransactionReceipt: jest.fn().mockResolvedValue(null),
    };

    // Mock ethers.providers.JsonRpcProvider
    jest.spyOn(ethers.providers, 'JsonRpcProvider').mockImplementation(() => mockProvider);

    mevProtection = new MevProtection({ logger: mockLogger });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Protected Provider', () => {
    test('returns provider for supported chain', () => {
      const provider = mevProtection.getProtectedProvider(1);
      expect(provider).toBeDefined();
    });

    test('throws for unsupported chain', () => {
      expect(() => {
        mevProtection.getProtectedProvider(999);
      }).toThrow('No MEV protection RPC');
    });
  });

  describe('Protected Transaction Submission', () => {
    test('sends via Flashbots on mainnet', async () => {
      const result = await mevProtection.sendProtectedTransaction(
        mockSigner,
        { to: '0xRecipient', data: '0x', value: 0 },
        1
      );

      expect(result.txHash).toBe('0xTxHash123');
      expect(result.protectionUsed).toBe('Flashbots Protect');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('tracks pending transaction', async () => {
      await mevProtection.sendProtectedTransaction(
        mockSigner,
        { to: '0xRecipient', data: '0x', value: 0 },
        1
      );

      const pending = mevProtection.getPendingTransactions();
      expect(pending.length).toBe(1);
      expect(pending[0].hash).toBe('0xTxHash123');
    });

    test('falls back to public mempool when protection disabled', async () => {
      const noProtection = new MevProtection({
        logger: mockLogger,
        preferPrivate: false,
      });

      const result = await noProtection.sendProtectedTransaction(
        mockSigner,
        { to: '0xRecipient', data: '0x', value: 0 },
        1
      );

      expect(result.protectionUsed).toBe('none');
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Transaction Simulation', () => {
    test('simulates transaction on mainnet', async () => {
      const result = await mevProtection.simulateTransaction(
        {
          to: '0xRecipient',
          from: '0xSender',
          data: '0x',
          value: 0,
        },
        1
      );

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.gasUsed).toBeDefined();
    });

    test('skips simulation on non-mainnet chains', async () => {
      const result = await mevProtection.simulateTransaction(
        { to: '0xRecipient', data: '0x' },
        42161 // Arbitrum
      );

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(false);
    });

    test('handles simulation failure', async () => {
      mockProvider.call.mockRejectedValue(new Error('execution reverted'));

      const result = await mevProtection.simulateTransaction(
        { to: '0xRecipient', data: '0x' },
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('reverted');
    });
  });

  describe('MEV Risk Analysis', () => {
    test('identifies high-risk swap transactions', () => {
      const swapTx = {
        data: '0x38ed1739' + '0'.repeat(64), // swapExactTokensForTokens
        value: 0,
      };

      const analysis = mevProtection.analyzeMevRisk(swapTx);

      expect(analysis.vulnerable).toBe(true);
      expect(analysis.riskLevel).toBe('high');
      expect(analysis.reasons.some(r => r.includes('sandwich'))).toBe(true);
    });

    test('identifies Uniswap V3 swaps', () => {
      const v3Swap = {
        data: '0x04e45aaf' + '0'.repeat(64), // exactInputSingle
        value: 0,
      };

      const analysis = mevProtection.analyzeMevRisk(v3Swap);
      expect(analysis.vulnerable).toBe(true);
      expect(analysis.riskLevel).toBe('high');
    });

    test('flags large value transfers', () => {
      const largeTx = {
        data: '0x',
        value: ethers.utils.parseEther('100'),
      };

      const analysis = mevProtection.analyzeMevRisk(largeTx);

      expect(analysis.vulnerable).toBe(true);
      expect(analysis.reasons.some(r => r.includes('Large value'))).toBe(true);
    });

    test('flags high gas price transactions', () => {
      const highGasTx = {
        data: '0x',
        value: 0,
        gasPrice: ethers.utils.parseUnits('200', 'gwei'),
      };

      const analysis = mevProtection.analyzeMevRisk(highGasTx);

      expect(analysis.vulnerable).toBe(true);
      expect(analysis.reasons.some(r => r.includes('High gas'))).toBe(true);
    });

    test('low risk for simple transfers', () => {
      const simpleTx = {
        data: '0x',
        value: ethers.utils.parseEther('0.1'),
      };

      const analysis = mevProtection.analyzeMevRisk(simpleTx);

      expect(analysis.vulnerable).toBe(false);
      expect(analysis.riskLevel).toBe('low');
    });
  });

  describe('Submission Strategy', () => {
    test('recommends private submission for high-risk mainnet tx', () => {
      const swapTx = {
        data: '0x38ed1739' + '0'.repeat(64),
        value: 0,
      };

      const strategy = mevProtection.getSubmissionStrategy(swapTx, 1);

      expect(strategy.strategy).toBe('private');
      expect(strategy.rpc).toContain('flashbots');
    });

    test('recommends sequencer for L2 chains', () => {
      const anyTx = { data: '0x', value: 0 };

      // Arbitrum
      const arbStrategy = mevProtection.getSubmissionStrategy(anyTx, 42161);
      expect(arbStrategy.strategy).toBe('sequencer');
      expect(arbStrategy.reason).toContain('L2');

      // Optimism
      const opStrategy = mevProtection.getSubmissionStrategy(anyTx, 10);
      expect(opStrategy.strategy).toBe('sequencer');

      // Base
      const baseStrategy = mevProtection.getSubmissionStrategy(anyTx, 8453);
      expect(baseStrategy.strategy).toBe('sequencer');
    });

    test('recommends public for low-risk mainnet tx', () => {
      const simpleTx = {
        data: '0x',
        value: ethers.utils.parseEther('0.01'),
      };

      const strategy = mevProtection.getSubmissionStrategy(simpleTx, 1);

      expect(strategy.strategy).toBe('public');
      expect(strategy.reason).toContain('Low MEV risk');
    });
  });

  describe('Transaction Inclusion', () => {
    test('checks inclusion status', async () => {
      const result = await mevProtection.checkInclusion('0xTxHash', 1);

      expect(result.included).toBe(false);
      expect(result.status).toBe('pending');
    });

    test('reports confirmed transaction', async () => {
      mockProvider.getTransactionReceipt.mockResolvedValue({
        status: 1,
        blockNumber: 12345,
        gasUsed: ethers.BigNumber.from(50000),
      });

      const result = await mevProtection.checkInclusion('0xTxHash', 1);

      expect(result.included).toBe(true);
      expect(result.status).toBe('success');
      expect(result.block).toBe(12345);
    });

    test('reports reverted transaction', async () => {
      mockProvider.getTransactionReceipt.mockResolvedValue({
        status: 0,
        blockNumber: 12345,
        gasUsed: ethers.BigNumber.from(50000),
      });

      const result = await mevProtection.checkInclusion('0xTxHash', 1);

      expect(result.included).toBe(true);
      expect(result.status).toBe('reverted');
    });
  });

  describe('Bundle Submission', () => {
    test('throws when bundles disabled', async () => {
      await expect(
        mevProtection.submitBundle(mockSigner, [], 12345)
      ).rejects.toThrow('Bundle submission is not enabled');
    });

    test('allows bundle when enabled', async () => {
      const bundleEnabled = new MevProtection({
        logger: mockLogger,
        bundleEnabled: true,
      });

      // Mock fetch for bundle submission
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          result: { bundleHash: '0xBundleHash123' },
        }),
      });

      const result = await bundleEnabled.submitBundle(
        mockSigner,
        [{ to: '0xRecipient', data: '0x', nonce: 0 }],
        12346
      );

      expect(result.bundleHash).toBe('0xBundleHash123');
      expect(result.targetBlock).toBe(12346);

      delete global.fetch;
    });
  });

  describe('Public Transaction Fallback', () => {
    test('sends via public mempool', async () => {
      const result = await mevProtection.sendPublicTransaction(
        mockSigner,
        { to: '0xRecipient', data: '0x', value: 0 }
      );

      expect(result.txHash).toBe('0xTxHash123');
      expect(result.protectionUsed).toBe('none');
    });

    test('tracks public transaction', async () => {
      await mevProtection.sendPublicTransaction(
        mockSigner,
        { to: '0xRecipient', data: '0x', value: 0 }
      );

      const pending = mevProtection.getPendingTransactions();
      expect(pending[0].protection).toBe('none');
    });
  });

  describe('Pending Transactions', () => {
    test('returns only pending transactions', async () => {
      await mevProtection.sendPublicTransaction(
        mockSigner,
        { to: '0xRecipient', data: '0x', value: 0 }
      );

      // Manually mark as confirmed
      const txData = mevProtection.pendingTxs.get('0xTxHash123');
      txData.status = 'confirmed';

      const pending = mevProtection.getPendingTransactions();
      expect(pending.length).toBe(0);
    });
  });

  describe('Cleanup', () => {
    test('removes old transactions', async () => {
      await mevProtection.sendPublicTransaction(
        mockSigner,
        { to: '0xRecipient', data: '0x', value: 0 }
      );

      // Age the transaction
      const txData = mevProtection.pendingTxs.get('0xTxHash123');
      txData.sentAt = Date.now() - 7200000; // 2 hours ago

      mevProtection.cleanup(3600000); // 1 hour max age

      expect(mevProtection.pendingTxs.size).toBe(0);
    });

    test('keeps recent transactions', async () => {
      await mevProtection.sendPublicTransaction(
        mockSigner,
        { to: '0xRecipient', data: '0x', value: 0 }
      );

      mevProtection.cleanup(3600000);

      expect(mevProtection.pendingTxs.size).toBe(1);
    });
  });

  describe('Revert Reason Parsing', () => {
    test('parses revert reason from error data', () => {
      const error = {
        data: '0x08c379a0' + '0'.repeat(64) + '54657374' + '0'.repeat(56), // "Test"
      };

      const reason = mevProtection.parseRevertReason(error);
      expect(reason).toBeDefined();
    });

    test('returns null for error without data', () => {
      const error = { message: 'Error' };
      const reason = mevProtection.parseRevertReason(error);
      expect(reason).toBeNull();
    });
  });
});
