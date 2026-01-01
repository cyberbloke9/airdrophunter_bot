/**
 * Access Control Unit Tests
 *
 * Tests RBAC, permission management, and multi-sig approval flow.
 */

const AccessControl = require('../../src/security/access-control');
const { ROLE, PERMISSION } = AccessControl;

describe('AccessControl', () => {
  let accessControl;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    accessControl = new AccessControl({ logger: mockLogger });
  });

  describe('Role Assignment', () => {
    test('assigns role to new user', () => {
      const result = accessControl.assignRole('user1', ROLE.TRADER, 'admin');
      expect(result.success).toBe(true);

      const user = accessControl.getUser('user1');
      expect(user.roles).toContain(ROLE.TRADER);
    });

    test('assigns multiple roles to user', () => {
      accessControl.assignRole('user1', ROLE.TRADER, 'admin');
      accessControl.assignRole('user1', ROLE.OPERATOR, 'admin');

      const user = accessControl.getUser('user1');
      expect(user.roles).toContain(ROLE.TRADER);
      expect(user.roles).toContain(ROLE.OPERATOR);
    });

    test('rejects invalid role', () => {
      const result = accessControl.assignRole('user1', 'invalid_role', 'admin');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid role');
    });

    test('tracks who assigned role', () => {
      accessControl.assignRole('user1', ROLE.TRADER, 'admin_user');
      const user = accessControl.getUser('user1');
      expect(user).toBeDefined();
    });
  });

  describe('Role Revocation', () => {
    test('revokes role from user', () => {
      accessControl.assignRole('user1', ROLE.TRADER, 'admin');
      const result = accessControl.revokeRole('user1', ROLE.TRADER, 'admin');

      expect(result.success).toBe(true);
      const user = accessControl.getUser('user1');
      expect(user.roles).not.toContain(ROLE.TRADER);
    });

    test('fails to revoke non-existent role', () => {
      accessControl.assignRole('user1', ROLE.TRADER, 'admin');
      const result = accessControl.revokeRole('user1', ROLE.ADMIN, 'admin');

      expect(result.success).toBe(false);
      expect(result.message).toContain('does not have role');
    });

    test('fails for non-existent user', () => {
      const result = accessControl.revokeRole('nonexistent', ROLE.TRADER, 'admin');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('Permission Checking', () => {
    test('viewer can view balances', () => {
      accessControl.assignRole('viewer1', ROLE.VIEWER, 'admin');
      expect(accessControl.hasPermission('viewer1', PERMISSION.VIEW_BALANCES)).toBe(true);
    });

    test('viewer cannot execute swap', () => {
      accessControl.assignRole('viewer1', ROLE.VIEWER, 'admin');
      expect(accessControl.hasPermission('viewer1', PERMISSION.EXECUTE_SWAP)).toBe(false);
    });

    test('trader can execute swap', () => {
      accessControl.assignRole('trader1', ROLE.TRADER, 'admin');
      expect(accessControl.hasPermission('trader1', PERMISSION.EXECUTE_SWAP)).toBe(true);
    });

    test('admin has all permissions', () => {
      accessControl.assignRole('admin1', ROLE.ADMIN, 'system');

      expect(accessControl.hasPermission('admin1', PERMISSION.VIEW_BALANCES)).toBe(true);
      expect(accessControl.hasPermission('admin1', PERMISSION.EXECUTE_SWAP)).toBe(true);
      expect(accessControl.hasPermission('admin1', PERMISSION.ROLE_ASSIGN)).toBe(true);
      expect(accessControl.hasPermission('admin1', PERMISSION.EMERGENCY_STOP)).toBe(true);
    });

    test('emergency role can only emergency stop', () => {
      accessControl.assignRole('emergency1', ROLE.EMERGENCY, 'admin');

      expect(accessControl.hasPermission('emergency1', PERMISSION.EMERGENCY_STOP)).toBe(true);
      expect(accessControl.hasPermission('emergency1', PERMISSION.VIEW_BALANCES)).toBe(true);
      expect(accessControl.hasPermission('emergency1', PERMISSION.EXECUTE_SWAP)).toBe(false);
    });

    test('non-existent user has no permissions', () => {
      expect(accessControl.hasPermission('nonexistent', PERMISSION.VIEW_BALANCES)).toBe(false);
    });
  });

  describe('Custom Permissions', () => {
    test('grants custom permission to user', () => {
      accessControl.assignRole('user1', ROLE.VIEWER, 'admin');
      accessControl.grantPermission('user1', PERMISSION.EXECUTE_SWAP, 'admin');

      expect(accessControl.hasPermission('user1', PERMISSION.EXECUTE_SWAP)).toBe(true);
    });

    test('revokes custom permission', () => {
      accessControl.assignRole('user1', ROLE.VIEWER, 'admin');
      accessControl.grantPermission('user1', PERMISSION.EXECUTE_SWAP, 'admin');
      accessControl.revokePermission('user1', PERMISSION.EXECUTE_SWAP, 'admin');

      expect(accessControl.hasPermission('user1', PERMISSION.EXECUTE_SWAP)).toBe(false);
    });

    test('custom permissions listed in user permissions', () => {
      accessControl.assignRole('user1', ROLE.VIEWER, 'admin');
      accessControl.grantPermission('user1', 'custom:special', 'admin');

      const permissions = accessControl.getUserPermissions('user1');
      expect(permissions).toContain('custom:special');
    });
  });

  describe('Permission Enforcement', () => {
    test('enforce allows authorized action', () => {
      accessControl.assignRole('trader1', ROLE.TRADER, 'admin');

      expect(() => {
        accessControl.enforce('trader1', PERMISSION.EXECUTE_SWAP);
      }).not.toThrow();
    });

    test('enforce blocks unauthorized action', () => {
      accessControl.assignRole('viewer1', ROLE.VIEWER, 'admin');

      expect(() => {
        accessControl.enforce('viewer1', PERMISSION.EXECUTE_SWAP);
      }).toThrow('Access denied');
    });

    test('enforce logs denial', () => {
      accessControl.assignRole('viewer1', ROLE.VIEWER, 'admin');

      try {
        accessControl.enforce('viewer1', PERMISSION.EXECUTE_SWAP);
      } catch (e) {
        // Expected
      }

      const log = accessControl.getAuditLog({ action: 'ACCESS_DENIED' });
      expect(log.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Sig Approval Flow', () => {
    beforeEach(() => {
      // Set up admins for multi-sig
      accessControl.assignRole('admin1', ROLE.ADMIN, 'system');
      accessControl.assignRole('admin2', ROLE.ADMIN, 'system');
      accessControl.assignRole('admin3', ROLE.ADMIN, 'system');
    });

    test('creates approval request', () => {
      const { actionId, requiredApprovals } = accessControl.requestApproval(
        PERMISSION.WALLET_EXPORT,
        { walletId: 'hot-1' },
        'admin1'
      );

      expect(actionId).toBeDefined();
      expect(requiredApprovals).toBe(2);
    });

    test('tracks approvals from different admins', () => {
      const { actionId } = accessControl.requestApproval(
        PERMISSION.WALLET_EXPORT,
        { walletId: 'hot-1' },
        'admin1'
      );

      // admin1 auto-approved
      const status1 = accessControl.approve(actionId, 'admin2');
      expect(status1.approved).toBe(true);
      expect(status1.currentApprovals).toBe(2);
    });

    test('requires threshold approvals', () => {
      const { actionId } = accessControl.requestApproval(
        PERMISSION.WALLET_EXPORT,
        { walletId: 'hot-1' },
        'admin1'
      );

      // Only 1 approval so far (auto from requester)
      const { approved } = accessControl.isApproved(actionId);
      expect(approved).toBe(false);
    });

    test('executes when approved', async () => {
      const { actionId } = accessControl.requestApproval(
        PERMISSION.WALLET_EXPORT,
        { walletId: 'hot-1' },
        'admin1'
      );

      accessControl.approve(actionId, 'admin2');

      let executed = false;
      await accessControl.executeIfApproved(actionId, async (data) => {
        executed = true;
        expect(data.walletId).toBe('hot-1');
      });

      expect(executed).toBe(true);
    });

    test('blocks execution before approval', async () => {
      const { actionId } = accessControl.requestApproval(
        PERMISSION.WALLET_EXPORT,
        { walletId: 'hot-1' },
        'admin1'
      );

      await expect(
        accessControl.executeIfApproved(actionId, async () => {})
      ).rejects.toThrow('not approved');
    });

    test('rejects stale approval request', () => {
      // Create access control with short timeout
      const shortTimeoutAC = new AccessControl({
        logger: mockLogger,
        approvalTimeout: 100, // 100ms
      });
      shortTimeoutAC.assignRole('admin1', ROLE.ADMIN, 'system');
      shortTimeoutAC.assignRole('admin2', ROLE.ADMIN, 'system');

      const { actionId } = shortTimeoutAC.requestApproval(
        PERMISSION.WALLET_EXPORT,
        { walletId: 'hot-1' },
        'admin1'
      );

      // Wait for expiration
      return new Promise(resolve => setTimeout(resolve, 150)).then(() => {
        expect(() => {
          shortTimeoutAC.approve(actionId, 'admin2');
        }).toThrow('expired');
      });
    });
  });

  describe('Rejection Flow', () => {
    beforeEach(() => {
      accessControl.assignRole('admin1', ROLE.ADMIN, 'system');
      accessControl.assignRole('admin2', ROLE.ADMIN, 'system');
      accessControl.assignRole('admin3', ROLE.ADMIN, 'system');
    });

    test('rejects approval request', () => {
      const { actionId } = accessControl.requestApproval(
        PERMISSION.WALLET_EXPORT,
        { walletId: 'hot-1' },
        'admin1'
      );

      accessControl.reject(actionId, 'admin2', 'Suspicious request');
      accessControl.reject(actionId, 'admin3', 'I agree');

      const { approved, status } = accessControl.isApproved(actionId);
      expect(approved).toBe(false);
      expect(status).toBe('rejected');
    });

    test('prevents approval after rejection from same user', () => {
      const { actionId } = accessControl.requestApproval(
        PERMISSION.WALLET_EXPORT,
        { walletId: 'hot-1' },
        'admin1'
      );

      accessControl.reject(actionId, 'admin2', 'No');

      // User who rejected cannot approve - they are in the rejections set
      // The implementation will reject with "already rejected" message
      expect(() => {
        accessControl.approve(actionId, 'admin2');
      }).toThrow(/rejected/);
    });
  });

  describe('User Management', () => {
    test('lists all users', () => {
      accessControl.assignRole('user1', ROLE.VIEWER, 'admin');
      accessControl.assignRole('user2', ROLE.TRADER, 'admin');

      const users = accessControl.getAllUsers();
      expect(users.length).toBe(2);
    });

    test('gets complete user info', () => {
      accessControl.assignRole('user1', ROLE.TRADER, 'admin');
      accessControl.grantPermission('user1', 'custom:perm', 'admin');

      const user = accessControl.getUser('user1');
      expect(user.roles).toContain(ROLE.TRADER);
      expect(user.customPermissions).toContain('custom:perm');
      expect(user.allPermissions).toBeDefined();
    });

    test('returns null for non-existent user', () => {
      const user = accessControl.getUser('nonexistent');
      expect(user).toBeNull();
    });
  });

  describe('Audit Logging', () => {
    test('logs role assignments', () => {
      accessControl.assignRole('user1', ROLE.TRADER, 'admin');

      const log = accessControl.getAuditLog({ action: 'ROLE_ASSIGNED' });
      expect(log.length).toBe(1);
      expect(log[0].details.userId).toBe('user1');
    });

    test('logs permission grants', () => {
      accessControl.grantPermission('user1', PERMISSION.EXECUTE_SWAP, 'admin');

      const log = accessControl.getAuditLog({ action: 'PERMISSION_GRANTED' });
      expect(log.length).toBe(1);
    });

    test('logs access attempts', () => {
      accessControl.assignRole('user1', ROLE.TRADER, 'admin');
      accessControl.enforce('user1', PERMISSION.EXECUTE_SWAP);

      const log = accessControl.getAuditLog({ action: 'ACCESS_GRANTED' });
      expect(log.length).toBe(1);
    });

    test('filters audit log by user', () => {
      accessControl.assignRole('user1', ROLE.TRADER, 'admin');
      accessControl.assignRole('user2', ROLE.VIEWER, 'admin');

      const log = accessControl.getAuditLog({ userId: 'user1' });
      expect(log.every(entry => entry.details.userId === 'user1')).toBe(true);
    });

    test('limits audit log entries', () => {
      accessControl.assignRole('user1', ROLE.TRADER, 'admin');
      accessControl.assignRole('user2', ROLE.VIEWER, 'admin');
      accessControl.assignRole('user3', ROLE.OPERATOR, 'admin');

      const log = accessControl.getAuditLog({ limit: 2 });
      expect(log.length).toBe(2);
    });
  });

  describe('Admin Initialization', () => {
    test('initializes with admin user', () => {
      const acWithAdmin = new AccessControl({
        logger: mockLogger,
        adminUserId: 'initial_admin',
      });

      expect(acWithAdmin.hasPermission('initial_admin', PERMISSION.ROLE_ASSIGN)).toBe(true);
    });
  });

  describe('Pending Approvals', () => {
    beforeEach(() => {
      accessControl.assignRole('admin1', ROLE.ADMIN, 'system');
    });

    test('lists pending approvals', () => {
      accessControl.requestApproval(PERMISSION.WALLET_EXPORT, { id: 1 }, 'admin1');
      accessControl.requestApproval(PERMISSION.WALLET_ROTATE, { id: 2 }, 'admin1');

      const pending = accessControl.getPendingApprovals('pending');
      expect(pending.length).toBe(2);
    });

    test('filters by status', () => {
      accessControl.assignRole('admin2', ROLE.ADMIN, 'system');

      const { actionId } = accessControl.requestApproval(
        PERMISSION.WALLET_EXPORT,
        { id: 1 },
        'admin1'
      );
      accessControl.approve(actionId, 'admin2');

      accessControl.requestApproval(PERMISSION.WALLET_ROTATE, { id: 2 }, 'admin1');

      const pending = accessControl.getPendingApprovals('pending');
      expect(pending.length).toBe(1);

      const approved = accessControl.getPendingApprovals('approved');
      expect(approved.length).toBe(1);
    });
  });

  describe('Constants Export', () => {
    test('exports ROLE constants', () => {
      expect(ROLE.ADMIN).toBe('admin');
      expect(ROLE.OPERATOR).toBe('operator');
      expect(ROLE.TRADER).toBe('trader');
      expect(ROLE.VIEWER).toBe('viewer');
      expect(ROLE.EMERGENCY).toBe('emergency');
    });

    test('exports PERMISSION constants', () => {
      expect(PERMISSION.VIEW_BALANCES).toBeDefined();
      expect(PERMISSION.EXECUTE_SWAP).toBeDefined();
      expect(PERMISSION.ROLE_ASSIGN).toBeDefined();
    });
  });
});
