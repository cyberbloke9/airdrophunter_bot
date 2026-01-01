/**
 * Oracle Guard Unit Tests
 *
 * Tests dual oracle protection, staleness detection,
 * deviation thresholds, and L2 sequencer health checks.
 */

const { ethers } = require('ethers');
const OracleGuard = require('../../src/security/oracle-guard');

describe('OracleGuard', () => {
  let oracleGuard;
  let mockLogger;
  let mockProvider;
  let mockChainlinkContract;
  let mockPoolContract;
  let mockSequencerContract;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock Chainlink aggregator
    mockChainlinkContract = {
      latestRoundData: jest.fn().mockResolvedValue({
        roundId: ethers.BigNumber.from(100),
        answer: ethers.BigNumber.from('200000000000'), // $2000 with 8 decimals
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 60),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 60),
        answeredInRound: ethers.BigNumber.from(100),
      }),
      decimals: jest.fn().mockResolvedValue(8),
      description: jest.fn().mockResolvedValue('ETH / USD'),
    };

    // Mock Uniswap V3 pool
    mockPoolContract = {
      observe: jest.fn().mockResolvedValue([
        [ethers.BigNumber.from(0), ethers.BigNumber.from(1800000)], // tickCumulatives
        [ethers.BigNumber.from(0), ethers.BigNumber.from(0)],
      ]),
      slot0: jest.fn().mockResolvedValue({
        sqrtPriceX96: ethers.BigNumber.from('1234567890'),
        tick: 1000,
        observationIndex: 0,
        observationCardinality: 100,
        observationCardinalityNext: 100,
        feeProtocol: 0,
        unlocked: true,
      }),
      token0: jest.fn().mockResolvedValue('0xToken0'),
      token1: jest.fn().mockResolvedValue('0xToken1'),
    };

    // Mock sequencer uptime feed
    mockSequencerContract = {
      latestRoundData: jest.fn().mockResolvedValue({
        roundId: ethers.BigNumber.from(1),
        answer: ethers.BigNumber.from(0), // 0 = up
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 7200), // 2 hours ago
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 60),
        answeredInRound: ethers.BigNumber.from(1),
      }),
    };

    // Mock ethers.Contract to return appropriate mock based on address
    jest.spyOn(ethers, 'Contract').mockImplementation((address) => {
      if (address.includes('SEQUENCER') || address === '0xFdB631F5EE196F0ed6FAa767959853A9F217697D') {
        return mockSequencerContract;
      }
      if (address.includes('Pool') || address.includes('0xPool')) {
        return mockPoolContract;
      }
      return mockChainlinkContract;
    });

    mockProvider = {};

    oracleGuard = new OracleGuard({ logger: mockLogger });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Chainlink Price', () => {
    test('fetches price from Chainlink feed', async () => {
      const result = await oracleGuard.getChainlinkPrice('ETH/USD', 1, mockProvider);

      expect(result.price).toBe(2000);
      expect(result.decimals).toBe(8);
      expect(result.source).toBe('chainlink');
      expect(result.isStale).toBe(false);
    });

    test('detects stale price', async () => {
      // Set update time to 2 hours ago (exceeds 1 hour heartbeat)
      mockChainlinkContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(100),
        answer: ethers.BigNumber.from('200000000000'),
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 7200),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 7200), // 2 hours old
        answeredInRound: ethers.BigNumber.from(100),
      });

      const result = await oracleGuard.getChainlinkPrice('ETH/USD', 1, mockProvider);

      expect(result.isStale).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('throws on incomplete round', async () => {
      mockChainlinkContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(100),
        answer: ethers.BigNumber.from('200000000000'),
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        answeredInRound: ethers.BigNumber.from(99), // Less than roundId
      });

      await expect(
        oracleGuard.getChainlinkPrice('ETH/USD', 1, mockProvider)
      ).rejects.toThrow('round');
    });

    test('throws on invalid price', async () => {
      mockChainlinkContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(100),
        answer: ethers.BigNumber.from(0), // Zero price
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        answeredInRound: ethers.BigNumber.from(100),
      });

      await expect(
        oracleGuard.getChainlinkPrice('ETH/USD', 1, mockProvider)
      ).rejects.toThrow('Invalid');
    });

    test('throws for unsupported pair', async () => {
      await expect(
        oracleGuard.getChainlinkPrice('UNKNOWN/USD', 1, mockProvider)
      ).rejects.toThrow('No Chainlink feed');
    });
  });

  describe('TWAP Price', () => {
    test('calculates TWAP from tick cumulatives', async () => {
      const result = await oracleGuard.getTwapPrice('0xPoolAddress', mockProvider);

      expect(result.price).toBeDefined();
      expect(result.source).toBe('twap');
      expect(result.period).toBe(1800); // Default 30 min
    });

    test('falls back to spot price on OLD error', async () => {
      mockPoolContract.observe.mockRejectedValue(new Error('OLD'));

      const result = await oracleGuard.getTwapPrice('0xPoolAddress', mockProvider);

      expect(result.source).toBe('spot');
      expect(result.warning).toContain('using spot');
    });

    test('uses custom period', async () => {
      await oracleGuard.getTwapPrice('0xPoolAddress', mockProvider, 3600);

      expect(mockPoolContract.observe).toHaveBeenCalledWith([3600, 0]);
    });
  });

  describe('Sequencer Health', () => {
    test('reports sequencer up on mainnet (no sequencer feed)', async () => {
      const result = await oracleGuard.checkSequencerHealth(1, mockProvider);

      expect(result.isUp).toBe(true);
      expect(result.isL1).toBe(true);
    });

    test('checks sequencer on Arbitrum', async () => {
      const result = await oracleGuard.checkSequencerHealth(42161, mockProvider);

      expect(result.isUp).toBe(true);
      expect(result.gracePeriodActive).toBe(false);
    });

    test('detects sequencer down', async () => {
      mockSequencerContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(1),
        answer: ethers.BigNumber.from(1), // 1 = down
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        answeredInRound: ethers.BigNumber.from(1),
      });

      const result = await oracleGuard.checkSequencerHealth(42161, mockProvider);

      expect(result.isUp).toBe(false);
      expect(result.message).toContain('DO NOT EXECUTE');
    });

    test('detects grace period after recovery', async () => {
      // Sequencer came back up 30 minutes ago (within 1 hour grace period)
      mockSequencerContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(1),
        answer: ethers.BigNumber.from(0), // 0 = up
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 1800), // 30 min ago
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        answeredInRound: ethers.BigNumber.from(1),
      });

      const result = await oracleGuard.checkSequencerHealth(42161, mockProvider);

      expect(result.isUp).toBe(true);
      expect(result.gracePeriodActive).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Validated Price', () => {
    test('returns price with high confidence when both oracles agree', async () => {
      // Mock both oracles returning similar prices
      mockChainlinkContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(100),
        answer: ethers.BigNumber.from('200000000000'), // $2000
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 60),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 60),
        answeredInRound: ethers.BigNumber.from(100),
      });

      // TWAP returning ~$2000 (tick that corresponds to ~2000)
      mockPoolContract.observe.mockResolvedValue([
        [ethers.BigNumber.from(0), ethers.BigNumber.from(1800 * 76013)], // tick ~76013 gives price ~2000
        [ethers.BigNumber.from(0), ethers.BigNumber.from(0)],
      ]);

      const result = await oracleGuard.getValidatedPrice('ETH/USD', 1, mockProvider, '0xPoolAddress');

      expect(result.price).toBe(2000);
      expect(result.confidence).toBe('high');
      expect(result.sources.chainlink).toBeDefined();
      expect(result.sources.twap).toBeDefined();
    });

    test('throws on high oracle deviation', async () => {
      // Chainlink: $2000
      mockChainlinkContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(100),
        answer: ethers.BigNumber.from('200000000000'),
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 60),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 60),
        answeredInRound: ethers.BigNumber.from(100),
      });

      // TWAP: ~$2500 (25% deviation - exceeds 5% threshold)
      mockPoolContract.observe.mockResolvedValue([
        [ethers.BigNumber.from(0), ethers.BigNumber.from(1800 * 80000)],
        [ethers.BigNumber.from(0), ethers.BigNumber.from(0)],
      ]);

      await expect(
        oracleGuard.getValidatedPrice('ETH/USD', 1, mockProvider, '0xPoolAddress')
      ).rejects.toThrow('deviation too high');
    });

    test('warns on moderate deviation', async () => {
      // Chainlink: $2000
      mockChainlinkContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(100),
        answer: ethers.BigNumber.from('200000000000'),
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 60),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 60),
        answeredInRound: ethers.BigNumber.from(100),
      });

      // TWAP: ~$2060 (3% deviation - between 2% warning and 5% reject)
      mockPoolContract.observe.mockResolvedValue([
        [ethers.BigNumber.from(0), ethers.BigNumber.from(1800 * 76400)],
        [ethers.BigNumber.from(0), ethers.BigNumber.from(0)],
      ]);

      const result = await oracleGuard.getValidatedPrice('ETH/USD', 1, mockProvider, '0xPoolAddress');

      expect(result.warnings.some(w => w.includes('deviation'))).toBe(true);
    });

    test('returns medium confidence with Chainlink only', async () => {
      const result = await oracleGuard.getValidatedPrice('ETH/USD', 1, mockProvider);

      expect(result.price).toBe(2000);
      expect(result.confidence).toBe('medium');
      expect(result.warnings.some(w => w.includes('Single oracle'))).toBe(true);
    });

    test('throws when sequencer is down', async () => {
      mockSequencerContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(1),
        answer: ethers.BigNumber.from(1), // down
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000)),
        answeredInRound: ethers.BigNumber.from(1),
      });

      await expect(
        oracleGuard.getValidatedPrice('ETH/USD', 42161, mockProvider)
      ).rejects.toThrow('sequencer is down');
    });
  });

  describe('Quote Validation', () => {
    test('validates quote within tolerance', async () => {
      const result = await oracleGuard.validateQuote(
        2010, // 0.5% deviation from $2000
        'ETH/USD',
        1,
        mockProvider
      );

      expect(result.valid).toBe(true);
      expect(result.deviation).toBeLessThan(0.02);
    });

    test('rejects quote with high deviation', async () => {
      const result = await oracleGuard.validateQuote(
        2200, // 10% deviation
        'ETH/USD',
        1,
        mockProvider
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('deviates');
    });

    test('allows bypass in non-strict mode when oracle fails', async () => {
      mockChainlinkContract.latestRoundData.mockRejectedValue(new Error('Network error'));

      const result = await oracleGuard.validateQuote(
        2000,
        'ETH/USD',
        1,
        mockProvider,
        { requireOracle: false }
      );

      expect(result.valid).toBe(true);
      expect(result.bypassedValidation).toBe(true);
    });

    test('rejects in strict mode when oracle fails', async () => {
      mockChainlinkContract.latestRoundData.mockRejectedValue(new Error('Network error'));

      const result = await oracleGuard.validateQuote(
        2000,
        'ETH/USD',
        1,
        mockProvider,
        { requireOracle: true }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Oracle validation failed');
    });
  });

  describe('Configuration', () => {
    test('adds custom Chainlink feed', () => {
      oracleGuard.addChainlinkFeed(999, 'CUSTOM/USD', '0xCustomFeed');

      const pairs = oracleGuard.getSupportedPairs(999);
      expect(pairs).toContain('CUSTOM/USD');
    });

    test('sets custom asset heartbeat', () => {
      oracleGuard.setAssetHeartbeat('CUSTOM/USD', 7200);

      expect(oracleGuard.ASSET_HEARTBEATS['CUSTOM/USD']).toBe(7200);
    });

    test('returns supported pairs for chain', () => {
      const pairs = oracleGuard.getSupportedPairs(1);

      expect(pairs).toContain('ETH/USD');
      expect(pairs).toContain('BTC/USD');
      expect(pairs).not.toContain('SEQUENCER');
    });

    test('identifies L2 chains with sequencer', () => {
      expect(oracleGuard.isL2WithSequencer(1)).toBe(false);
      expect(oracleGuard.isL2WithSequencer(42161)).toBe(true);
      expect(oracleGuard.isL2WithSequencer(10)).toBe(true);
      expect(oracleGuard.isL2WithSequencer(8453)).toBe(true);
    });
  });

  describe('Deviation Thresholds', () => {
    test('uses custom deviation thresholds', async () => {
      const strictGuard = new OracleGuard({
        logger: mockLogger,
        deviationWarning: 0.01, // 1%
        deviationReject: 0.02,  // 2%
      });

      // Quote with 1.5% deviation - should warn but not reject with default, reject with strict
      const result = await strictGuard.validateQuote(
        2030, // 1.5% from $2000
        'ETH/USD',
        1,
        mockProvider
      );

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('deviates'))).toBe(true);
    });
  });

  describe('Asset Heartbeats', () => {
    test('uses default heartbeat for unknown assets', async () => {
      // Add a new feed for testing
      oracleGuard.addChainlinkFeed(1, 'NEWTOKEN/USD', '0xNewFeed');

      // Default heartbeat should be used (3600s)
      // Make price 2 hours old
      mockChainlinkContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(100),
        answer: ethers.BigNumber.from('100000000'),
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 7200),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 7200),
        answeredInRound: ethers.BigNumber.from(100),
      });

      const result = await oracleGuard.getChainlinkPrice('NEWTOKEN/USD', 1, mockProvider);
      expect(result.isStale).toBe(true);
    });

    test('uses longer heartbeat for stablecoins', async () => {
      // USDC has 24-hour heartbeat
      // Make price 12 hours old - should NOT be stale
      mockChainlinkContract.latestRoundData.mockResolvedValue({
        roundId: ethers.BigNumber.from(100),
        answer: ethers.BigNumber.from('100000000'), // $1
        startedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 43200),
        updatedAt: ethers.BigNumber.from(Math.floor(Date.now() / 1000) - 43200), // 12 hours
        answeredInRound: ethers.BigNumber.from(100),
      });

      const result = await oracleGuard.getChainlinkPrice('USDC/USD', 1, mockProvider);
      expect(result.isStale).toBe(false);
    });
  });
});
