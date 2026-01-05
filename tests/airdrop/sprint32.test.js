'use strict';

/**
 * Sprint 3.2 Tests: Points & Eligibility Tracking
 *
 * Test coverage for:
 * - Points Aggregator
 * - Eligibility Checker
 * - Claim Automation
 * - ROI Tracker
 */

const {
  // Points Aggregator
  PointsAggregator,
  PointsRecord,
  PROTOCOLS,
  ESTIMATION_WEIGHTS,
  MULTIPLIER_TYPES,
  createPointsAggregator,

  // Eligibility Checker
  EligibilityChecker,
  EligibilityResult,
  CRITERION_TYPE,
  OPERATORS,
  ELIGIBILITY_STATUS,
  PROTOCOL_CRITERIA,
  createEligibilityChecker,

  // Claim Automation
  ClaimAutomation,
  ClaimRecord,
  CLAIM_STATUS,
  CLAIM_TYPE,
  CLAIM_STRATEGY,
  createClaimAutomation,

  // ROI Tracker
  ROITracker,
  CostRecord,
  ValueRecord,
  COST_TYPE,
  VALUE_TYPE,
  REPORT_PERIOD,
  CHAIN_NATIVE_TOKENS,
  CONFIDENCE_LEVELS,
  createROITracker,

  // Factory functions
  createTrackingSystem,
  createFullSystem,
} = require('../../src/airdrop');

// =============================================================================
// TEST UTILITIES
// =============================================================================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const TEST_WALLET = '0x1234567890123456789012345678901234567890';
const TEST_WALLET_2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

// =============================================================================
// POINTS AGGREGATOR TESTS
// =============================================================================

describe('Points Aggregator', () => {
  describe('Constants', () => {
    test('PROTOCOLS should contain supported protocols', () => {
      expect(PROTOCOLS).toBeDefined();
      expect(PROTOCOLS.LAYERZERO).toBeDefined();
      expect(PROTOCOLS.ZKSYNC).toBeDefined();
      expect(PROTOCOLS.EIGENLAYER).toBeDefined();
      expect(PROTOCOLS.SCROLL).toBeDefined();
      expect(PROTOCOLS.LINEA).toBeDefined();
      expect(PROTOCOLS.BASE).toBeDefined();
    });

    test('ESTIMATION_WEIGHTS should define weights for protocols', () => {
      expect(ESTIMATION_WEIGHTS).toBeDefined();
      expect(ESTIMATION_WEIGHTS.layerzero).toBeDefined();
      expect(ESTIMATION_WEIGHTS.layerzero.messagesSent).toBeGreaterThan(0);
    });

    test('MULTIPLIER_TYPES should define multiplier categories', () => {
      expect(MULTIPLIER_TYPES).toBeDefined();
      expect(MULTIPLIER_TYPES.EARLY_USER).toBeDefined();
      expect(MULTIPLIER_TYPES.VOLUME_TIER).toBeDefined();
    });
  });

  describe('PointsRecord Class', () => {
    test('should create a valid points record', () => {
      const record = new PointsRecord({
        walletAddress: TEST_WALLET,
        protocol: 'layerzero',
        rawPoints: 1000,
      });

      expect(record.walletAddress).toBe(TEST_WALLET.toLowerCase());
      expect(record.protocol).toBe('layerzero');
      expect(record.rawPoints).toBe(1000);
      expect(record.id).toBeDefined();
      expect(record.timestamp).toBeDefined();
    });

    test('should have toJSON method', () => {
      const record = new PointsRecord({
        walletAddress: TEST_WALLET,
        protocol: 'zksync',
        rawPoints: 500,
      });

      const json = record.toJSON();
      expect(json).toBeDefined();
      expect(json.protocol).toBe('zksync');
    });
  });

  describe('PointsAggregator Class', () => {
    let aggregator;

    beforeEach(() => {
      aggregator = createPointsAggregator({ logger: mockLogger });
    });

    test('should initialize with factory function', () => {
      expect(aggregator).toBeInstanceOf(PointsAggregator);
    });

    test('should initialize with constructor', () => {
      const agg = new PointsAggregator();
      expect(agg).toBeDefined();
    });

    test('should fetch points for a wallet', async () => {
      const activityData = {
        messagesSent: 50,
        uniqueChains: 5,
        volumeUSD: 10000,
        daysActive: 30,
      };

      const result = await aggregator.fetchPoints(TEST_WALLET, 'layerzero', activityData);
      expect(result).toBeDefined();
    });

    test('should estimate points from activity data', () => {
      const estimated = aggregator.estimatePoints('layerzero', {
        messagesSent: 50,
        uniqueChains: 5,
        volumeUSD: 10000,
        daysActive: 30,
      });

      expect(estimated).toBeDefined();
      expect(estimated.estimatedPoints).toBeGreaterThan(0);
    });

    test('should be an instance of PointsAggregator', () => {
      expect(aggregator).toBeInstanceOf(PointsAggregator);
    });

    test('should return statistics', () => {
      const stats = aggregator.getStatistics();
      expect(stats).toBeDefined();
    });
  });
});

// =============================================================================
// ELIGIBILITY CHECKER TESTS
// =============================================================================

describe('Eligibility Checker', () => {
  describe('Constants', () => {
    test('CRITERION_TYPE should define criterion types', () => {
      expect(CRITERION_TYPE.HARD).toBe('hard');
      expect(CRITERION_TYPE.SOFT).toBe('soft');
      expect(CRITERION_TYPE.EXCLUSION).toBe('exclusion');
      expect(CRITERION_TYPE.BONUS).toBe('bonus');
    });

    test('OPERATORS should define comparison operators', () => {
      expect(OPERATORS.GTE).toBeDefined();
      expect(OPERATORS.LTE).toBeDefined();
      expect(OPERATORS.EQ).toBeDefined();
      expect(OPERATORS.NEQ).toBeDefined();
      expect(OPERATORS.IN).toBeDefined();
    });

    test('ELIGIBILITY_STATUS should define status values', () => {
      expect(ELIGIBILITY_STATUS).toBeDefined();
      expect(typeof ELIGIBILITY_STATUS.ELIGIBLE).toBe('string');
    });

    test('PROTOCOL_CRITERIA should define criteria for protocols', () => {
      expect(PROTOCOL_CRITERIA).toBeDefined();
      expect(PROTOCOL_CRITERIA.layerzero).toBeDefined();
      expect(PROTOCOL_CRITERIA.layerzero.criteria).toBeInstanceOf(Array);
    });
  });

  describe('EligibilityResult Class', () => {
    test('should create a valid eligibility result', () => {
      const result = new EligibilityResult({
        walletAddress: TEST_WALLET,
        protocol: 'layerzero',
        status: ELIGIBILITY_STATUS.ELIGIBLE,
        score: 85,
        criteriaResults: [],
      });

      expect(result.walletAddress).toBe(TEST_WALLET.toLowerCase());
      expect(result.protocol).toBe('layerzero');
      expect(result.status).toBe(ELIGIBILITY_STATUS.ELIGIBLE);
      expect(result.score).toBe(85);
    });
  });

  describe('EligibilityChecker Class', () => {
    let checker;

    beforeEach(() => {
      checker = createEligibilityChecker({ logger: mockLogger });
    });

    test('should initialize with factory function', () => {
      expect(checker).toBeInstanceOf(EligibilityChecker);
    });

    test('should initialize with constructor', () => {
      const c = new EligibilityChecker();
      expect(c).toBeDefined();
    });

    test('should check eligibility with passing criteria', async () => {
      const walletData = {
        messagesSent: 50,
        uniqueChains: 5,
        volumeUSD: 10000,
        daysActive: 30,
        sybilFlagged: false,
      };

      const result = await checker.checkEligibility(TEST_WALLET, 'layerzero', walletData);
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });

    test('should get supported protocols', () => {
      const protocols = checker.getSupportedProtocols();
      expect(Array.isArray(protocols)).toBe(true);
      expect(protocols).toContain('layerzero');
    });

    test('should return statistics', () => {
      const stats = checker.getStatistics();
      expect(stats).toBeDefined();
    });
  });
});

// =============================================================================
// CLAIM AUTOMATION TESTS
// =============================================================================

describe('Claim Automation', () => {
  describe('Constants', () => {
    test('CLAIM_STATUS should define claim statuses', () => {
      expect(CLAIM_STATUS).toBeDefined();
      expect(typeof CLAIM_STATUS.PENDING).toBe('string');
    });

    test('CLAIM_TYPE should define claim types', () => {
      expect(CLAIM_TYPE.MERKLE).toBe('merkle');
      expect(CLAIM_TYPE.DIRECT).toBe('direct');
      expect(CLAIM_TYPE.SIGNATURE).toBe('signature');
      expect(CLAIM_TYPE.VESTED).toBe('vested');
    });

    test('CLAIM_STRATEGY should define strategies', () => {
      expect(CLAIM_STRATEGY.IMMEDIATE).toBe('immediate');
      expect(CLAIM_STRATEGY.GAS_OPTIMIZED).toBe('gas_optimized');
      expect(CLAIM_STRATEGY.SCHEDULED).toBe('scheduled');
    });
  });

  describe('ClaimRecord Class', () => {
    test('should create a valid claim record', () => {
      const record = new ClaimRecord({
        walletAddress: TEST_WALLET,
        airdropId: 'layerzero',
        token: 'ZRO',
        amount: '1000',
      });

      expect(record.walletAddress).toBe(TEST_WALLET.toLowerCase());
      expect(record.airdropId).toBe('layerzero');
      expect(record.amount).toBe('1000');
      expect(record.status).toBe(CLAIM_STATUS.PENDING);
    });

    test('should have toJSON method', () => {
      const record = new ClaimRecord({
        walletAddress: TEST_WALLET,
        airdropId: 'zksync',
        amount: '500',
      });

      const json = record.toJSON();
      expect(json).toBeDefined();
      expect(json.airdropId).toBe('zksync');
    });
  });

  describe('ClaimAutomation Class', () => {
    let automation;

    beforeEach(() => {
      automation = createClaimAutomation({ logger: mockLogger });
    });

    test('should initialize with factory function', () => {
      expect(automation).toBeInstanceOf(ClaimAutomation);
    });

    test('should initialize with constructor', () => {
      const auto = new ClaimAutomation();
      expect(auto).toBeDefined();
    });

    test('should register an airdrop', () => {
      automation.registerAirdrop('test-airdrop', {
        name: 'Test Airdrop',
        tokenSymbol: 'TEST',
        claimType: CLAIM_TYPE.MERKLE,
        chain: 1,
      });

      const airdrops = automation.getAllAirdrops();
      expect(airdrops).toBeDefined();
    });

    test('should get pending claims', () => {
      const pending = automation.getPendingClaims();
      expect(Array.isArray(pending)).toBe(true);
    });

    test('should get completed claims', () => {
      const completed = automation.getCompletedClaims();
      expect(Array.isArray(completed)).toBe(true);
    });

    test('should return statistics', () => {
      const stats = automation.getStatistics();
      expect(stats).toBeDefined();
    });
  });
});

// =============================================================================
// ROI TRACKER TESTS
// =============================================================================

describe('ROI Tracker', () => {
  describe('Constants', () => {
    test('COST_TYPE should define cost types', () => {
      expect(COST_TYPE.GAS).toBe('gas');
      expect(COST_TYPE.PROTOCOL_FEE).toBe('protocol_fee');
      expect(COST_TYPE.BRIDGE_FEE).toBe('bridge_fee');
    });

    test('VALUE_TYPE should define value types', () => {
      expect(VALUE_TYPE.ESTIMATED).toBe('estimated');
      expect(VALUE_TYPE.REALIZED).toBe('realized');
      expect(VALUE_TYPE.VESTING).toBe('vesting');
    });

    test('CHAIN_NATIVE_TOKENS should define chain tokens', () => {
      expect(CHAIN_NATIVE_TOKENS[1].symbol).toBe('ETH');
      expect(CHAIN_NATIVE_TOKENS[137].symbol).toBe('MATIC');
      expect(CHAIN_NATIVE_TOKENS[56].symbol).toBe('BNB');
    });

    test('CONFIDENCE_LEVELS should define confidence tiers', () => {
      expect(CONFIDENCE_LEVELS.HIGH.min).toBe(0.8);
      expect(CONFIDENCE_LEVELS.MEDIUM.min).toBe(0.5);
      expect(CONFIDENCE_LEVELS.LOW.min).toBe(0.2);
    });
  });

  describe('CostRecord Class', () => {
    test('should create a valid cost record', () => {
      const record = new CostRecord({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        chain: 1,
        type: COST_TYPE.GAS,
        gasUsed: 150000,
        gasPrice: 30e9,
        usdAmount: 10.5,
      });

      expect(record.wallet).toBe(TEST_WALLET.toLowerCase());
      expect(record.protocol).toBe('layerzero');
      expect(record.chain).toBe(1);
      expect(record.usdAmount).toBe(10.5);
    });
  });

  describe('ValueRecord Class', () => {
    test('should create a valid value record', () => {
      const record = new ValueRecord({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        type: VALUE_TYPE.ESTIMATED,
        tokenSymbol: 'ZRO',
        tokenAmount: 1000,
        tokenPriceUSD: 2.5,
      });

      expect(record.wallet).toBe(TEST_WALLET.toLowerCase());
      expect(record.totalValueUSD).toBe(2500);
    });

    test('should calculate risk-adjusted value for estimated', () => {
      const estimated = new ValueRecord({
        wallet: TEST_WALLET,
        protocol: 'zksync',
        type: VALUE_TYPE.ESTIMATED,
        tokenAmount: 1000,
        tokenPriceUSD: 1.0,
        confidence: 0.5,
      });

      const riskAdjusted = estimated.getRiskAdjustedValue();
      expect(riskAdjusted).toBeLessThan(1000);
      expect(riskAdjusted).toBeGreaterThan(0);
    });

    test('should return full value for realized', () => {
      const realized = new ValueRecord({
        wallet: TEST_WALLET,
        protocol: 'scroll',
        type: VALUE_TYPE.REALIZED,
        tokenAmount: 1000,
        tokenPriceUSD: 1.0,
      });

      const riskAdjusted = realized.getRiskAdjustedValue();
      expect(riskAdjusted).toBe(1000);
    });
  });

  describe('ROITracker Class', () => {
    let tracker;

    beforeEach(() => {
      tracker = createROITracker({ logger: mockLogger });
    });

    test('should initialize with factory function', () => {
      expect(tracker).toBeInstanceOf(ROITracker);
    });

    test('should initialize with constructor', () => {
      const t = new ROITracker();
      expect(t).toBeDefined();
    });

    test('should record gas cost', async () => {
      const record = await tracker.recordCost({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        chain: 1,
        type: COST_TYPE.GAS,
        gasUsed: 150000,
        gasPrice: 30e9,
        activityType: 'swap',
      });

      expect(record).toBeInstanceOf(CostRecord);
      expect(record.nativeAmount).toBeGreaterThan(0);
    });

    test('should get costs for wallet', async () => {
      await tracker.recordCost({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        chain: 1,
        gasUsed: 100000,
        gasPrice: 30e9,
      });

      const costs = tracker.getCosts(TEST_WALLET);
      expect(costs.totalRecords).toBe(1);
      expect(costs.byProtocol.layerzero).toBeDefined();
    });

    test('should update estimated value', () => {
      const record = tracker.updateEstimatedValue({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        tokenSymbol: 'ZRO',
        estimatedTokens: 1500,
        tokenPriceUSD: 2.5,
        confidence: 0.7,
      });

      expect(record).toBeInstanceOf(ValueRecord);
      expect(record.totalValueUSD).toBe(3750);
    });

    test('should record realized value', () => {
      const record = tracker.recordRealizedValue({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        tokenSymbol: 'ZRO',
        tokensReceived: 1200,
        tokenPriceUSD: 3.0,
        claimTxHash: '0xtxhash',
      });

      expect(record).toBeInstanceOf(ValueRecord);
      expect(record.type).toBe(VALUE_TYPE.REALIZED);
      expect(record.totalValueUSD).toBe(3600);
    });

    test('should get values for wallet', () => {
      tracker.updateEstimatedValue({
        wallet: TEST_WALLET,
        protocol: 'zksync',
        tokenSymbol: 'ZK',
        estimatedTokens: 500,
        tokenPriceUSD: 0.2,
        confidence: 0.6,
      });

      const values = tracker.getValues(TEST_WALLET);
      expect(values.totalEstimatedUSD).toBe(100);
    });

    test('should generate ROI report', async () => {
      await tracker.recordCost({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        chain: 1,
        nativeAmount: 0.1,
      });

      tracker.recordRealizedValue({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        tokenSymbol: 'ZRO',
        tokensReceived: 500,
        tokenPriceUSD: 2.5,
      });

      const report = tracker.getROIReport(TEST_WALLET);

      expect(report.wallet).toBe(TEST_WALLET);
      expect(report.realizedValueUSD).toBe(1250);
      expect(report.summary).toBeDefined();
    });

    test('should generate aggregate report', async () => {
      await tracker.recordCost({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        chain: 1,
        nativeAmount: 0.05,
      });
      tracker.recordRealizedValue({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        tokenSymbol: 'ZRO',
        tokensReceived: 500,
        tokenPriceUSD: 2.0,
      });

      await tracker.recordCost({
        wallet: TEST_WALLET_2,
        protocol: 'zksync',
        chain: 324,
        nativeAmount: 0.02,
      });
      tracker.recordRealizedValue({
        wallet: TEST_WALLET_2,
        protocol: 'zksync',
        tokenSymbol: 'ZK',
        tokensReceived: 1000,
        tokenPriceUSD: 0.5,
      });

      const report = tracker.getAggregateReport();

      expect(report.walletsTracked).toBe(2);
      expect(report.totalRealizedUSD).toBe(1500);
    });

    test('should export and import data', async () => {
      await tracker.recordCost({
        wallet: TEST_WALLET,
        protocol: 'base',
        chain: 8453,
        nativeAmount: 0.001,
      });

      tracker.recordRealizedValue({
        wallet: TEST_WALLET,
        protocol: 'base',
        tokenSymbol: 'BASE',
        tokensReceived: 100,
        tokenPriceUSD: 0.1,
      });

      const exported = tracker.exportData();
      expect(exported.version).toBe('1.0.0');

      const newTracker = createROITracker({ logger: mockLogger });
      newTracker.importData(exported);

      const report = newTracker.getROIReport(TEST_WALLET);
      expect(report.realizedValueUSD).toBe(10);
    });

    test('should clear all data', async () => {
      await tracker.recordCost({
        wallet: TEST_WALLET,
        protocol: 'linea',
        chain: 59144,
        nativeAmount: 0.001,
      });

      tracker.clear();

      const stats = tracker.getStatistics();
      expect(stats.totalCostRecords).toBe(0);
      expect(stats.totalValueRecords).toBe(0);
    });

    test('should return statistics', async () => {
      await tracker.recordCost({
        wallet: TEST_WALLET,
        protocol: 'scroll',
        chain: 534352,
        nativeAmount: 0.001,
      });

      const stats = tracker.getStatistics();
      expect(stats.totalCostsRecorded).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Sprint 3.2 Integration', () => {
  describe('createTrackingSystem', () => {
    test('should create complete tracking system', () => {
      const system = createTrackingSystem({ logger: mockLogger });

      expect(system.pointsAggregator).toBeInstanceOf(PointsAggregator);
      expect(system.eligibilityChecker).toBeInstanceOf(EligibilityChecker);
      expect(system.claimAutomation).toBeInstanceOf(ClaimAutomation);
      expect(system.roiTracker).toBeInstanceOf(ROITracker);
    });

    test('should provide convenience methods', () => {
      const system = createTrackingSystem({ logger: mockLogger });

      expect(typeof system.getStatistics).toBe('function');
      expect(typeof system.exportData).toBe('function');
      expect(typeof system.importData).toBe('function');
    });

    test('should aggregate statistics', () => {
      const system = createTrackingSystem({ logger: mockLogger });

      const stats = system.getStatistics();
      expect(stats.points).toBeDefined();
      expect(stats.eligibility).toBeDefined();
      expect(stats.claims).toBeDefined();
      expect(stats.roi).toBeDefined();
    });
  });

  describe('createFullSystem', () => {
    test('should create full system with Sprint 3.1 and 3.2', () => {
      const system = createFullSystem({ logger: mockLogger });

      // Sprint 3.1 components
      expect(system.strategyEngine).toBeDefined();
      expect(system.randomizer).toBeDefined();
      expect(system.diversityTracker).toBeDefined();
      expect(system.scheduler).toBeDefined();

      // Sprint 3.2 components
      expect(system.pointsAggregator).toBeDefined();
      expect(system.eligibilityChecker).toBeDefined();
      expect(system.claimAutomation).toBeDefined();
      expect(system.roiTracker).toBeDefined();
    });

    test('should provide unified statistics', () => {
      const system = createFullSystem({ logger: mockLogger });

      const stats = system.getStatistics();
      expect(stats.automation).toBeDefined();
      expect(stats.tracking).toBeDefined();
    });
  });

  describe('ROI Tracking Workflow', () => {
    test('should track costs and values through ROI tracker', async () => {
      const system = createTrackingSystem({ logger: mockLogger });
      const { roiTracker } = system;

      // Track costs
      await roiTracker.recordCost({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        chain: 1,
        nativeAmount: 0.05,
      });

      // Update estimated value
      roiTracker.updateEstimatedValue({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        tokenSymbol: 'ZRO',
        estimatedTokens: 1500,
        tokenPriceUSD: 2.0,
        confidence: 0.8,
      });

      // Record realized value
      roiTracker.recordRealizedValue({
        wallet: TEST_WALLET,
        protocol: 'layerzero',
        tokenSymbol: 'ZRO',
        tokensReceived: 1500,
        tokenPriceUSD: 2.5,
      });

      // Get final ROI report
      const report = roiTracker.getROIReport(TEST_WALLET);

      expect(report.isProfitable).toBe(true);
      expect(report.realizedValueUSD).toBe(3750);
      expect(report.protocolBreakdown.layerzero.realized).toBe(3750);
    });
  });
});
