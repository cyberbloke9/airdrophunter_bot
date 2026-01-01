'use strict';

const { TxSimulator } = require('../../src/security/tx-simulator');
const { ethers } = require('ethers');

describe('TxSimulator', () => {
  let simulator;
  let mockProvider;

  beforeEach(() => {
    simulator = new TxSimulator({
      logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
    });

    mockProvider = {
      call: jest.fn(),
      estimateGas: jest.fn(),
    };
  });

  describe('constructor', () => {
    test('initializes with default config', () => {
      const sim = new TxSimulator();
      expect(sim.gasBuffer).toBe(1.2);
      expect(sim.maxGasLimit).toBe(10_000_000);
      expect(sim.tenderlyApiKey).toBeNull();
    });

    test('accepts custom config', () => {
      const sim = new TxSimulator({
        gasBuffer: 1.5,
        maxGasLimit: 5_000_000,
        tenderlyApiKey: 'test-key',
      });
      expect(sim.gasBuffer).toBe(1.5);
      expect(sim.maxGasLimit).toBe(5_000_000);
      expect(sim.tenderlyApiKey).toBe('test-key');
    });

    test('initializes metrics', () => {
      const metrics = simulator.getMetrics();
      expect(metrics.totalSimulations).toBe(0);
      expect(metrics.successfulSimulations).toBe(0);
      expect(metrics.failedSimulations).toBe(0);
    });
  });

  describe('simulate', () => {
    test('simulates successful transaction', async () => {
      mockProvider.call.mockResolvedValue('0x1234');
      mockProvider.estimateGas.mockResolvedValue(ethers.BigNumber.from(100000));

      const result = await simulator.simulate(
        { to: '0x1234567890123456789012345678901234567890', data: '0x' },
        mockProvider
      );

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(100000);
      expect(result.returnData).toBe('0x1234');
    });

    test('handles failed transaction', async () => {
      mockProvider.call.mockRejectedValue(new Error('execution reverted: Insufficient balance'));

      const result = await simulator.simulate(
        { to: '0x1234567890123456789012345678901234567890', data: '0x' },
        mockProvider
      );

      expect(result.success).toBe(false);
      expect(result.revertReason).toContain('Insufficient balance');
    });

    test('validates transaction object', async () => {
      const result = await simulator.simulate(null, mockProvider);
      expect(result.success).toBe(false);
      expect(result.revertReason).toContain('Transaction object required');
    });

    test('validates to address', async () => {
      await expect(simulator.simulate({ to: 'invalid' }, mockProvider)).resolves.toMatchObject({
        success: false,
        error: 'Valid "to" address required',
      });
    });

    test('updates metrics on success', async () => {
      mockProvider.call.mockResolvedValue('0x');
      mockProvider.estimateGas.mockResolvedValue(ethers.BigNumber.from(21000));

      await simulator.simulate(
        { to: '0x1234567890123456789012345678901234567890' },
        mockProvider
      );

      const metrics = simulator.getMetrics();
      expect(metrics.totalSimulations).toBe(1);
      expect(metrics.successfulSimulations).toBe(1);
    });

    test('updates metrics on failure', async () => {
      mockProvider.call.mockRejectedValue(new Error('fail'));

      await simulator.simulate(
        { to: '0x1234567890123456789012345678901234567890' },
        mockProvider
      );

      const metrics = simulator.getMetrics();
      expect(metrics.totalSimulations).toBe(1);
      expect(metrics.failedSimulations).toBe(1);
    });
  });

  describe('simulateBundle', () => {
    test('simulates bundle of transactions', async () => {
      mockProvider.call.mockResolvedValue('0x');
      mockProvider.estimateGas.mockResolvedValue(ethers.BigNumber.from(50000));

      const txs = [
        { to: '0x1234567890123456789012345678901234567890', data: '0x' },
        { to: '0x1234567890123456789012345678901234567890', data: '0x' },
      ];

      const result = await simulator.simulateBundle(txs, mockProvider);

      expect(result.bundleSuccess).toBe(true);
      expect(result.transactionCount).toBe(2);
      expect(result.successfulCount).toBe(2);
      expect(result.totalGasUsed).toBe(100000);
    });

    test('reports partial bundle failure', async () => {
      mockProvider.call
        .mockResolvedValueOnce('0x')
        .mockRejectedValueOnce(new Error('fail'));
      mockProvider.estimateGas.mockResolvedValue(ethers.BigNumber.from(50000));

      const txs = [
        { to: '0x1234567890123456789012345678901234567890', data: '0x' },
        { to: '0x1234567890123456789012345678901234567890', data: '0x' },
      ];

      const result = await simulator.simulateBundle(txs, mockProvider);

      expect(result.bundleSuccess).toBe(false);
      expect(result.successfulCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });
  });

  describe('estimateOutput', () => {
    test('estimates swap output', async () => {
      // Mock return data as amounts array
      const amounts = ethers.utils.defaultAbiCoder.encode(
        ['uint256[]'],
        [[ethers.utils.parseEther('1'), ethers.utils.parseEther('1000')]]
      );
      mockProvider.call.mockResolvedValue(amounts);
      mockProvider.estimateGas.mockResolvedValue(ethers.BigNumber.from(150000));

      const result = await simulator.estimateOutput(
        { to: '0x1234567890123456789012345678901234567890', data: '0x38ed1739' },
        mockProvider
      );

      expect(result.simulationSuccess).toBe(true);
      expect(result.expectedOutput).toBe(ethers.utils.parseEther('1000').toString());
      expect(result.confidence).toBe(0.9);
    });

    test('handles failed simulation', async () => {
      mockProvider.call.mockRejectedValue(new Error('fail'));

      const result = await simulator.estimateOutput(
        { to: '0x1234567890123456789012345678901234567890', data: '0x' },
        mockProvider
      );

      expect(result.simulationSuccess).toBe(false);
      expect(result.expectedOutput).toBeNull();
      expect(result.confidence).toBe(0);
    });

    test('calculates slippage estimate with quoted output', async () => {
      const amounts = ethers.utils.defaultAbiCoder.encode(
        ['uint256[]'],
        [[ethers.utils.parseEther('1'), ethers.utils.parseEther('990')]]
      );
      mockProvider.call.mockResolvedValue(amounts);
      mockProvider.estimateGas.mockResolvedValue(ethers.BigNumber.from(150000));

      const result = await simulator.estimateOutput(
        { to: '0x1234567890123456789012345678901234567890', data: '0x38ed1739' },
        mockProvider,
        { quotedOutput: ethers.utils.parseEther('1000').toString() }
      );

      expect(result.slippageEstimate).toBeCloseTo(0.01, 2);
    });
  });

  describe('parseRevertReason', () => {
    test('parses Error(string) revert', () => {
      const errorData = '0x08c379a0' + ethers.utils.defaultAbiCoder.encode(
        ['string'],
        ['Insufficient balance']
      ).slice(2);

      const result = simulator.parseRevertReason({ data: errorData });

      expect(result.type).toBe('Error');
      expect(result.reason).toBe('Insufficient balance');
    });

    test('parses Panic error', () => {
      const errorData = '0x4e487b71' + ethers.utils.defaultAbiCoder.encode(
        ['uint256'],
        [0x11] // Overflow
      ).slice(2);

      const result = simulator.parseRevertReason({ data: errorData });

      expect(result.type).toBe('Panic');
      expect(result.reason).toBe('Arithmetic overflow/underflow');
    });

    test('handles plain text error', () => {
      const result = simulator.parseRevertReason({ message: 'Something went wrong' });

      expect(result.type).toBe('Message');
      expect(result.reason).toBe('Something went wrong');
    });

    test('handles execution reverted message', () => {
      const result = simulator.parseRevertReason({
        message: 'execution reverted: Transfer failed',
      });

      expect(result.type).toBe('Revert');
      expect(result.reason).toBe('Transfer failed');
    });

    test('handles unknown selector', () => {
      const result = simulator.parseRevertReason({ data: '0xdeadbeef00000000' });

      expect(result.type).toBe('Unknown');
      expect(result.selector).toBe('0xdeadbeef');
    });
  });

  describe('isSwapTransaction', () => {
    test('detects Uniswap V2 swap', () => {
      expect(simulator.isSwapTransaction({
        data: '0x38ed1739' + '0'.repeat(64), // swapExactTokensForTokens
      })).toBe(true);
    });

    test('detects Uniswap V3 exactInputSingle', () => {
      expect(simulator.isSwapTransaction({
        data: '0x414bf389' + '0'.repeat(64),
      })).toBe(true);
    });

    test('returns false for non-swap', () => {
      expect(simulator.isSwapTransaction({
        data: '0xa9059cbb' + '0'.repeat(64), // transfer
      })).toBe(false);
    });

    test('handles missing data', () => {
      expect(simulator.isSwapTransaction({})).toBe(false);
      expect(simulator.isSwapTransaction({ data: '0x' })).toBe(false);
    });
  });

  describe('updateGasAccuracy', () => {
    test('updates gas accuracy metrics', () => {
      simulator.updateGasAccuracy(100000, 95000);

      const metrics = simulator.getMetrics();
      expect(metrics.recentGasEstimates).toHaveLength(1);
      expect(metrics.recentGasEstimates[0].accuracy).toBeCloseTo(0.95, 2);
    });

    test('maintains rolling window', () => {
      for (let i = 0; i < 150; i++) {
        simulator.updateGasAccuracy(100000, 95000);
      }

      const metrics = simulator.getMetrics();
      expect(metrics.recentGasEstimates.length).toBeLessThanOrEqual(100);
    });

    test('ignores invalid values', () => {
      simulator.updateGasAccuracy(0, 100000);
      simulator.updateGasAccuracy(100000, 0);
      simulator.updateGasAccuracy(null, 100000);

      const metrics = simulator.getMetrics();
      expect(metrics.recentGasEstimates).toHaveLength(0);
    });
  });

  describe('resetMetrics', () => {
    test('resets all metrics', async () => {
      mockProvider.call.mockResolvedValue('0x');
      mockProvider.estimateGas.mockResolvedValue(ethers.BigNumber.from(21000));

      await simulator.simulate(
        { to: '0x1234567890123456789012345678901234567890' },
        mockProvider
      );

      simulator.resetMetrics();

      const metrics = simulator.getMetrics();
      expect(metrics.totalSimulations).toBe(0);
      expect(metrics.successfulSimulations).toBe(0);
    });
  });
});
