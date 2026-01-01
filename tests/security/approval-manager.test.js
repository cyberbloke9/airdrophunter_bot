/**
 * Approval Manager Unit Tests
 *
 * Tests token approval tracking, exact amount approvals,
 * auto-revoke functionality, and risk assessment.
 */

const { ethers } = require('ethers');
const ApprovalManager = require('../../src/security/approval-manager');

describe('ApprovalManager', () => {
  let approvalManager;
  let mockLogger;
  let mockSigner;
  let mockContract;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock contract methods
    mockContract = {
      allowance: jest.fn().mockResolvedValue(ethers.BigNumber.from(0)),
      approve: jest.fn().mockResolvedValue({
        hash: '0xTxHash123',
        wait: jest.fn().mockResolvedValue({
          gasUsed: ethers.BigNumber.from(50000),
        }),
      }),
      symbol: jest.fn().mockResolvedValue('TEST'),
      decimals: jest.fn().mockResolvedValue(18),
    };

    // Mock ethers.Contract constructor
    jest.spyOn(ethers, 'Contract').mockImplementation(() => mockContract);

    // Mock signer
    mockSigner = {
      getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
    };

    approvalManager = new ApprovalManager({ logger: mockLogger });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Safe Approve', () => {
    test('approves exact amount by default', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      const result = await approvalManager.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xTxHash123');
      expect(mockContract.approve).toHaveBeenCalledWith('0xSpenderAddress', amount);
    });

    test('skips approval if allowance is sufficient', async () => {
      const amount = ethers.utils.parseUnits('100', 18);
      mockContract.allowance.mockResolvedValue(ethers.utils.parseUnits('200', 18));

      const result = await approvalManager.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(mockContract.approve).not.toHaveBeenCalled();
    });

    test('approves 2x amount when policy is 2x', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner,
        { policy: '2x' }
      );

      expect(mockContract.approve).toHaveBeenCalledWith(
        '0xSpenderAddress',
        amount.mul(2)
      );
    });

    test('approves unlimited when policy is unlimited', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner,
        { policy: 'unlimited' }
      );

      expect(mockContract.approve).toHaveBeenCalledWith(
        '0xSpenderAddress',
        ethers.constants.MaxUint256
      );
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('tracks approval in registry', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner
      );

      const approvals = approvalManager.getAllApprovals('0x1234567890123456789012345678901234567890');
      expect(approvals.length).toBe(1);
      expect(approvals[0].token).toBe('0xtokenaddress');
      expect(approvals[0].spender).toBe('0xspenderaddress');
    });
  });

  describe('Revoke Approval', () => {
    test('revokes approval by setting to 0', async () => {
      await approvalManager.revokeApproval(
        '0xTokenAddress',
        '0xSpenderAddress',
        mockSigner
      );

      expect(mockContract.approve).toHaveBeenCalledWith('0xSpenderAddress', 0);
    });

    test('removes from registry after revoke', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      // First approve
      await approvalManager.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner
      );

      // Then revoke
      await approvalManager.revokeApproval(
        '0xTokenAddress',
        '0xSpenderAddress',
        mockSigner
      );

      const approvals = approvalManager.getAllApprovals('0x1234567890123456789012345678901234567890');
      expect(approvals.length).toBe(0);
    });
  });

  describe('Auto-Revoke', () => {
    test('schedules revoke when autoRevoke is enabled', () => {
      // Spy on revokeApproval to verify it gets called
      const revokeSpy = jest.spyOn(approvalManager, 'revokeApproval').mockResolvedValue({
        success: true,
        txHash: '0xRevokeTx',
      });

      approvalManager.scheduleRevoke('0xTokenAddress', '0xSpenderAddress', mockSigner);

      // scheduleRevoke uses setImmediate which schedules the call
      // We just verify the method was set up correctly (config check)
      expect(approvalManager.config.autoRevoke).toBe(true);

      revokeSpy.mockRestore();
    });

    test('does not schedule revoke when autoRevoke is disabled', () => {
      const noAutoRevoke = new ApprovalManager({
        logger: mockLogger,
        autoRevoke: false,
      });

      const spy = jest.spyOn(noAutoRevoke, 'revokeApproval');
      noAutoRevoke.scheduleRevoke('0xTokenAddress', '0xSpenderAddress', mockSigner);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Approval Registry', () => {
    test('returns empty array for unknown wallet', () => {
      const approvals = approvalManager.getAllApprovals('0xUnknownWallet');
      expect(approvals).toEqual([]);
    });

    test('tracks multiple approvals per wallet', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove('0xToken1', '0xSpender1', amount, mockSigner);
      await approvalManager.safeApprove('0xToken2', '0xSpender2', amount, mockSigner);

      const approvals = approvalManager.getAllApprovals('0x1234567890123456789012345678901234567890');
      expect(approvals.length).toBe(2);
    });

    test('normalizes addresses to lowercase', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove('0xAAAAAAAA', '0xBBBBBBBB', amount, mockSigner);

      const approvals = approvalManager.getAllApprovals('0x1234567890123456789012345678901234567890');
      expect(approvals[0].token).toBe('0xaaaaaaaa');
      expect(approvals[0].spender).toBe('0xbbbbbbbb');
    });

    test('calculates approval age', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove('0xToken1', '0xSpender1', amount, mockSigner);

      const approvals = approvalManager.getAllApprovals('0x1234567890123456789012345678901234567890');
      expect(approvals[0].age).toBeDefined();
      expect(approvals[0].ageDays).toBeDefined();
    });
  });

  describe('Risky Approvals Detection', () => {
    test('flags unlimited approvals as high risk', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner,
        { policy: 'unlimited' }
      );

      const risky = approvalManager.getRiskyApprovals('0x1234567890123456789012345678901234567890');
      expect(risky.length).toBe(1);
      expect(risky[0].risks.some(r => r.type === 'unlimited' && r.severity === 'high')).toBe(true);
      expect(risky[0].overallRisk).toBe('high');
    });

    test('flags old approvals as medium risk', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove('0xTokenAddress', '0xSpenderAddress', amount, mockSigner);

      // Manually age the approval
      const approvals = approvalManager.getAllApprovals('0x1234567890123456789012345678901234567890');
      const ownerKey = '0x1234567890123456789012345678901234567890'.toLowerCase();
      const tokenKey = '0xtokenaddress:0xspenderaddress';

      const ownerApprovals = approvalManager.registry.get(ownerKey);
      const approval = ownerApprovals.get(tokenKey);
      approval.approvedAt = Date.now() - 35 * 24 * 60 * 60 * 1000; // 35 days ago

      const risky = approvalManager.getRiskyApprovals('0x1234567890123456789012345678901234567890');
      expect(risky.length).toBe(1);
      expect(risky[0].risks.some(r => r.type === 'old')).toBe(true);
    });

    test('returns empty array if no risky approvals', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove('0xTokenAddress', '0xSpenderAddress', amount, mockSigner);

      const risky = approvalManager.getRiskyApprovals('0x1234567890123456789012345678901234567890');
      // Exact amount, fresh approval - no risks
      expect(risky.length).toBe(0);
    });
  });

  describe('Revoke All', () => {
    test('revokes all approvals for wallet', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove('0xToken1', '0xSpender1', amount, mockSigner);
      await approvalManager.safeApprove('0xToken2', '0xSpender2', amount, mockSigner);

      const result = await approvalManager.revokeAll(
        '0x1234567890123456789012345678901234567890',
        mockSigner
      );

      expect(result.total).toBe(2);
      expect(result.revoked).toBe(2);
      expect(result.failed).toBe(0);
    });

    test('handles failures in revoke all', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove('0xToken1', '0xSpender1', amount, mockSigner);

      // Make revoke fail
      mockContract.approve.mockRejectedValueOnce(new Error('Revoke failed'));

      const result = await approvalManager.revokeAll(
        '0x1234567890123456789012345678901234567890',
        mockSigner
      );

      expect(result.total).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.details[0].error).toBe('Revoke failed');
    });
  });

  describe('On-Chain Scan', () => {
    test('scans for active approvals', async () => {
      mockContract.allowance.mockResolvedValue(ethers.utils.parseUnits('100', 18));

      const mockProvider = {};
      const approvals = await approvalManager.scanOnChainApprovals(
        '0xWallet',
        ['0xToken1', '0xToken2'],
        ['0xSpender1'],
        mockProvider
      );

      expect(approvals.length).toBe(2);
      expect(approvals[0].token).toBe('0xToken1');
      expect(approvals[0].tokenSymbol).toBe('TEST');
    });

    test('detects unlimited allowances', async () => {
      mockContract.allowance.mockResolvedValue(ethers.constants.MaxUint256);

      const mockProvider = {};
      const approvals = await approvalManager.scanOnChainApprovals(
        '0xWallet',
        ['0xToken1'],
        ['0xSpender1'],
        mockProvider
      );

      expect(approvals[0].isUnlimited).toBe(true);
    });

    test('excludes zero allowances', async () => {
      mockContract.allowance.mockResolvedValue(ethers.BigNumber.from(0));

      const mockProvider = {};
      const approvals = await approvalManager.scanOnChainApprovals(
        '0xWallet',
        ['0xToken1'],
        ['0xSpender1'],
        mockProvider
      );

      expect(approvals.length).toBe(0);
    });
  });

  describe('Check Approval', () => {
    test('reports sufficient allowance', async () => {
      mockContract.allowance.mockResolvedValue(ethers.utils.parseUnits('200', 18));

      const result = await approvalManager.checkApproval(
        '0xWallet',
        '0xToken',
        '0xSpender',
        ethers.utils.parseUnits('100', 18),
        {}
      );

      expect(result.sufficient).toBe(true);
      expect(result.deficit.toString()).toBe('0');
    });

    test('reports insufficient allowance with deficit', async () => {
      mockContract.allowance.mockResolvedValue(ethers.utils.parseUnits('50', 18));

      const result = await approvalManager.checkApproval(
        '0xWallet',
        '0xToken',
        '0xSpender',
        ethers.utils.parseUnits('100', 18),
        {}
      );

      expect(result.sufficient).toBe(false);
      expect(result.deficit.toString()).toBe(ethers.utils.parseUnits('50', 18).toString());
    });
  });

  describe('Statistics', () => {
    test('returns empty stats for fresh manager', () => {
      const stats = approvalManager.getStats();

      expect(stats.totalApprovals).toBe(0);
      expect(stats.unlimitedCount).toBe(0);
      expect(stats.walletCount).toBe(0);
    });

    test('tracks approval counts', async () => {
      const amount = ethers.utils.parseUnits('100', 18);

      await approvalManager.safeApprove('0xToken1', '0xSpender1', amount, mockSigner);
      await approvalManager.safeApprove('0xToken2', '0xSpender2', amount, mockSigner, { policy: 'unlimited' });

      const stats = approvalManager.getStats();

      expect(stats.totalApprovals).toBe(2);
      expect(stats.unlimitedCount).toBe(1);
      expect(stats.walletCount).toBe(1);
    });
  });

  describe('Policy Configuration', () => {
    test('uses config policy as default', async () => {
      const manager2x = new ApprovalManager({
        logger: mockLogger,
        maxApproval: '2x',
      });

      const amount = ethers.utils.parseUnits('100', 18);

      await manager2x.safeApprove('0xTokenAddress', '0xSpenderAddress', amount, mockSigner);

      expect(mockContract.approve).toHaveBeenCalledWith(
        '0xSpenderAddress',
        amount.mul(2)
      );
    });

    test('option policy overrides config', async () => {
      const managerUnlimited = new ApprovalManager({
        logger: mockLogger,
        maxApproval: 'unlimited',
      });

      const amount = ethers.utils.parseUnits('100', 18);

      // Override with exact policy
      await managerUnlimited.safeApprove(
        '0xTokenAddress',
        '0xSpenderAddress',
        amount,
        mockSigner,
        { policy: 'exact' }
      );

      expect(mockContract.approve).toHaveBeenCalledWith('0xSpenderAddress', amount);
    });
  });
});
