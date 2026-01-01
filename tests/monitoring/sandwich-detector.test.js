'use strict';

const { SandwichDetector } = require('../../src/monitoring/sandwich-detector');
const { ethers } = require('ethers');

describe('SandwichDetector', () => {
  let detector;
  let mockProvider;
  let mockAlertSystem;

  beforeEach(() => {
    mockAlertSystem = {
      alertSandwichAttack: jest.fn().mockResolvedValue({ sent: true }),
    };

    detector = new SandwichDetector({
      logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
      alertSystem: mockAlertSystem,
      searchRadius: 3,
      minExtractionAlert: 0.005,
    });

    mockProvider = {
      getTransactionReceipt: jest.fn(),
      getBlockWithTransactions: jest.fn(),
    };
  });

  describe('constructor', () => {
    test('initializes with default config', () => {
      const det = new SandwichDetector();
      expect(det.searchRadius).toBe(5);
      expect(det.minExtractionAlert).toBe(0.005);
    });

    test('accepts custom config', () => {
      const det = new SandwichDetector({
        searchRadius: 10,
        minExtractionAlert: 0.01,
      });
      expect(det.searchRadius).toBe(10);
      expect(det.minExtractionAlert).toBe(0.01);
    });

    test('initializes known DEX routers', () => {
      expect(detector.dexRouters.size).toBeGreaterThan(0);
      expect(detector.dexRouters.has('0x7a250d5630b4cf539739df2c5dacb4c659f2488d')).toBe(true);
    });

    test('initializes statistics', () => {
      const stats = detector.getStatistics();
      expect(stats.totalAnalyzed).toBe(0);
      expect(stats.sandwichesDetected).toBe(0);
    });
  });

  describe('analyzeTransaction', () => {
    test('returns not sandwiched for non-swap transactions', async () => {
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 12345,
        logs: [], // No swap events
      });
      mockProvider.getBlockWithTransactions.mockResolvedValue({
        transactions: [{ hash: '0xabc' }],
      });

      const result = await detector.analyzeTransaction('0xabc', mockProvider);

      expect(result.wasSandwiched).toBe(false);
      expect(result.reason).toBe('Not a swap transaction');
    });

    test('returns error for missing transaction', async () => {
      mockProvider.getTransactionReceipt.mockResolvedValue(null);

      const result = await detector.analyzeTransaction('0xabc', mockProvider);

      expect(result.wasSandwiched).toBe(false);
      expect(result.error).toBe('Transaction not found');
    });

    test('updates statistics on analysis', async () => {
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 12345,
        logs: [],
      });
      mockProvider.getBlockWithTransactions.mockResolvedValue({
        transactions: [{ hash: '0xabc' }],
      });

      await detector.analyzeTransaction('0xabc', mockProvider);

      const stats = detector.getStatistics();
      expect(stats.totalAnalyzed).toBe(1);
    });
  });

  describe('isKnownAttacker', () => {
    test('returns false for unknown address', () => {
      expect(detector.isKnownAttacker('0x1234567890123456789012345678901234567890')).toBe(false);
    });

    test('returns true for added attacker', () => {
      detector.addKnownAttackers(['0x1234567890123456789012345678901234567890']);
      expect(detector.isKnownAttacker('0x1234567890123456789012345678901234567890')).toBe(true);
    });

    test('handles case insensitivity', () => {
      detector.addKnownAttackers(['0xABCDEF1234567890123456789012345678901234']);
      expect(detector.isKnownAttacker('0xabcdef1234567890123456789012345678901234')).toBe(true);
    });
  });

  describe('addKnownAttackers', () => {
    test('adds multiple attackers', () => {
      detector.addKnownAttackers([
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ]);

      expect(detector.knownAttackers.size).toBe(2);
    });
  });

  describe('getExtractionStats', () => {
    test('returns empty stats for unknown wallet', () => {
      const stats = detector.getExtractionStats('0x1234567890123456789012345678901234567890');

      expect(stats.totalExtracted).toBe('0');
      expect(stats.count).toBe(0);
    });
  });

  describe('getStatistics', () => {
    test('returns complete statistics', () => {
      const stats = detector.getStatistics();

      expect(stats).toHaveProperty('totalAnalyzed');
      expect(stats).toHaveProperty('sandwichesDetected');
      expect(stats).toHaveProperty('detectionRate');
      expect(stats).toHaveProperty('totalExtracted');
      expect(stats).toHaveProperty('uniqueAttackers');
      expect(stats).toHaveProperty('knownAttackers');
      expect(stats).toHaveProperty('recentSandwiches');
    });
  });

  describe('resetStatistics', () => {
    test('resets all statistics', async () => {
      // Add some data
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 12345,
        logs: [],
      });
      mockProvider.getBlockWithTransactions.mockResolvedValue({
        transactions: [{ hash: '0xabc' }],
      });

      await detector.analyzeTransaction('0xabc', mockProvider);
      detector.resetStatistics();

      const stats = detector.getStatistics();
      expect(stats.totalAnalyzed).toBe(0);
    });
  });

  describe('swap event parsing', () => {
    test('detects Uniswap V2 swap events', () => {
      const swapEventSig = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
      expect(detector.swapEventSignatures.uniswapV2).toBe(swapEventSig);
    });

    test('detects Uniswap V3 swap events', () => {
      const swapEventSig = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
      expect(detector.swapEventSignatures.uniswapV3).toBe(swapEventSig);
    });
  });

  describe('_isSwapTransaction', () => {
    test('detects swap by DEX router', () => {
      const tx = {
        to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2 Router
        data: '0x38ed1739',
      };
      expect(detector._isSwapTransaction(tx)).toBe(true);
    });

    test('detects swap by function selector', () => {
      const tx = {
        to: '0x1234567890123456789012345678901234567890',
        data: '0x38ed1739', // swapExactTokensForTokens
      };
      expect(detector._isSwapTransaction(tx)).toBe(true);
    });

    test('returns false for non-swap transaction', () => {
      const tx = {
        to: '0x1234567890123456789012345678901234567890',
        data: '0xa9059cbb', // transfer
      };
      expect(detector._isSwapTransaction(tx)).toBe(false);
    });

    test('returns false for null to address', () => {
      expect(detector._isSwapTransaction({ to: null })).toBe(false);
    });
  });

  describe('getBlockSandwiches', () => {
    test('returns empty array for block without transactions', async () => {
      mockProvider.getBlockWithTransactions.mockResolvedValue({
        transactions: [],
      });

      const result = await detector.getBlockSandwiches(12345, mockProvider);
      expect(result).toEqual([]);
    });

    test('returns empty array for missing block', async () => {
      mockProvider.getBlockWithTransactions.mockResolvedValue(null);

      const result = await detector.getBlockSandwiches(12345, mockProvider);
      expect(result).toEqual([]);
    });

    test('handles provider errors gracefully', async () => {
      mockProvider.getBlockWithTransactions.mockRejectedValue(new Error('Network error'));

      const result = await detector.getBlockSandwiches(12345, mockProvider);
      expect(result).toEqual([]);
    });
  });
});
