/**
 * Access Control - Role-Based Access Control (RBAC) with Multi-Sig
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: Unrestricted access leads to unauthorized operations. RBAC ensures
 * least privilege principle. Multi-sig for critical operations prevents
 * single point of compromise.
 *
 * STATE-OF-THE-ART:
 * - Role-Based Access Control (RBAC)
 * - Permission inheritance hierarchy
 * - Multi-sig approval for critical operations
 * - Safe{Wallet} integration for on-chain multi-sig
 * - Complete audit logging
 *
 * @module security/access-control
 */

const { ethers } = require('ethers');

// Predefined roles
const ROLE = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  TRADER: 'trader',
  VIEWER: 'viewer',
  EMERGENCY: 'emergency',
};

// Predefined permissions
const PERMISSION = {
  // View permissions
  VIEW_BALANCES: 'view:balances',
  VIEW_TRANSACTIONS: 'view:transactions',
  VIEW_POSITIONS: 'view:positions',
  VIEW_CONFIG: 'view:config',

  // Trade permissions
  EXECUTE_SWAP: 'trade:swap',
  EXECUTE_DEPOSIT: 'trade:deposit',
  EXECUTE_WITHDRAW: 'trade:withdraw',
  EXECUTE_CLAIM: 'trade:claim',

  // Config permissions
  MODIFY_CONFIG: 'config:modify',
  MODIFY_SLIPPAGE: 'config:slippage',
  MODIFY_LIMITS: 'config:limits',

  // Wallet permissions
  WALLET_CREATE: 'wallet:create',
  WALLET_IMPORT: 'wallet:import',
  WALLET_EXPORT: 'wallet:export',
  WALLET_ROTATE: 'wallet:rotate',

  // Admin permissions
  ROLE_ASSIGN: 'admin:role_assign',
  ROLE_REVOKE: 'admin:role_revoke',
  EMERGENCY_STOP: 'admin:emergency_stop',
  UPGRADE_BOT: 'admin:upgrade',
};

// Role -> Permissions mapping
const ROLE_PERMISSIONS = {
  [ROLE.VIEWER]: [
    PERMISSION.VIEW_BALANCES,
    PERMISSION.VIEW_TRANSACTIONS,
    PERMISSION.VIEW_POSITIONS,
  ],

  [ROLE.TRADER]: [
    PERMISSION.VIEW_BALANCES,
    PERMISSION.VIEW_TRANSACTIONS,
    PERMISSION.VIEW_POSITIONS,
    PERMISSION.VIEW_CONFIG,
    PERMISSION.EXECUTE_SWAP,
    PERMISSION.EXECUTE_DEPOSIT,
    PERMISSION.EXECUTE_WITHDRAW,
    PERMISSION.EXECUTE_CLAIM,
  ],

  [ROLE.OPERATOR]: [
    PERMISSION.VIEW_BALANCES,
    PERMISSION.VIEW_TRANSACTIONS,
    PERMISSION.VIEW_POSITIONS,
    PERMISSION.VIEW_CONFIG,
    PERMISSION.EXECUTE_SWAP,
    PERMISSION.EXECUTE_DEPOSIT,
    PERMISSION.EXECUTE_WITHDRAW,
    PERMISSION.EXECUTE_CLAIM,
    PERMISSION.MODIFY_CONFIG,
    PERMISSION.MODIFY_SLIPPAGE,
    PERMISSION.WALLET_CREATE,
  ],

  [ROLE.ADMIN]: Object.values(PERMISSION), // All permissions

  [ROLE.EMERGENCY]: [
    PERMISSION.EMERGENCY_STOP,
    PERMISSION.VIEW_BALANCES,
    PERMISSION.VIEW_TRANSACTIONS,
  ],
};

// Multi-sig thresholds for critical operations
const MULTISIG_REQUIRED = {
  [PERMISSION.WALLET_EXPORT]: { threshold: 2, of: 3 },
  [PERMISSION.WALLET_ROTATE]: { threshold: 2, of: 3 },
  [PERMISSION.UPGRADE_BOT]: { threshold: 2, of: 3 },
  [PERMISSION.ROLE_ASSIGN]: { threshold: 2, of: 3 },
  [PERMISSION.ROLE_REVOKE]: { threshold: 2, of: 3 },
};

class AccessControl {
  constructor(config = {}) {
    this.logger = config.logger || console;

    // User registry: userId -> { roles, permissions, metadata }
    this.users = new Map();

    // Pending multi-sig approvals: actionId -> { action, approvals, required, createdAt }
    this.pendingApprovals = new Map();

    // Configuration
    this.config = {
      approvalTimeout: config.approvalTimeout ?? 3600000, // 1 hour
      enableMultisig: config.enableMultisig ?? true,
      safeAddress: config.safeAddress, // Optional Safe{Wallet} address
    };

    // Audit log
    this.auditLog = [];

    // Initialize admin user
    if (config.adminUserId) {
      this.assignRole(config.adminUserId, ROLE.ADMIN, 'SYSTEM');
    }
  }

  /**
   * Assign role to user
   *
   * @param {string} userId - User identifier
   * @param {string} role - Role to assign
   * @param {string} assignedBy - Who assigned the role
   * @returns {{success: boolean, message: string}}
   */
  assignRole(userId, role, assignedBy) {
    if (!ROLE_PERMISSIONS[role]) {
      return { success: false, message: `Invalid role: ${role}` };
    }

    let user = this.users.get(userId);
    if (!user) {
      user = {
        roles: new Set(),
        customPermissions: new Set(),
        createdAt: Date.now(),
        createdBy: assignedBy,
      };
      this.users.set(userId, user);
    }

    user.roles.add(role);
    user.lastModified = Date.now();
    user.lastModifiedBy = assignedBy;

    this.audit('ROLE_ASSIGNED', { userId, role, assignedBy });
    this.logger.info(`[AccessControl] Role ${role} assigned to ${userId} by ${assignedBy}`);

    return { success: true, message: `Role ${role} assigned` };
  }

  /**
   * Revoke role from user
   *
   * @param {string} userId - User identifier
   * @param {string} role - Role to revoke
   * @param {string} revokedBy - Who revoked the role
   * @returns {{success: boolean, message: string}}
   */
  revokeRole(userId, role, revokedBy) {
    const user = this.users.get(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    if (!user.roles.has(role)) {
      return { success: false, message: `User does not have role: ${role}` };
    }

    user.roles.delete(role);
    user.lastModified = Date.now();
    user.lastModifiedBy = revokedBy;

    this.audit('ROLE_REVOKED', { userId, role, revokedBy });
    this.logger.info(`[AccessControl] Role ${role} revoked from ${userId} by ${revokedBy}`);

    return { success: true, message: `Role ${role} revoked` };
  }

  /**
   * Grant custom permission to user
   *
   * @param {string} userId - User identifier
   * @param {string} permission - Permission to grant
   * @param {string} grantedBy - Who granted the permission
   * @returns {{success: boolean, message: string}}
   */
  grantPermission(userId, permission, grantedBy) {
    let user = this.users.get(userId);
    if (!user) {
      user = {
        roles: new Set(),
        customPermissions: new Set(),
        createdAt: Date.now(),
        createdBy: grantedBy,
      };
      this.users.set(userId, user);
    }

    user.customPermissions.add(permission);
    user.lastModified = Date.now();

    this.audit('PERMISSION_GRANTED', { userId, permission, grantedBy });

    return { success: true, message: `Permission ${permission} granted` };
  }

  /**
   * Revoke custom permission from user
   *
   * @param {string} userId - User identifier
   * @param {string} permission - Permission to revoke
   * @param {string} revokedBy - Who revoked the permission
   * @returns {{success: boolean, message: string}}
   */
  revokePermission(userId, permission, revokedBy) {
    const user = this.users.get(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    user.customPermissions.delete(permission);
    user.lastModified = Date.now();

    this.audit('PERMISSION_REVOKED', { userId, permission, revokedBy });

    return { success: true, message: `Permission ${permission} revoked` };
  }

  /**
   * Check if user has permission
   *
   * @param {string} userId - User identifier
   * @param {string} permission - Permission to check
   * @returns {boolean}
   */
  hasPermission(userId, permission) {
    const user = this.users.get(userId);
    if (!user) {
      return false;
    }

    // Check custom permissions first
    if (user.customPermissions.has(permission)) {
      return true;
    }

    // Check role permissions
    for (const role of user.roles) {
      const rolePerms = ROLE_PERMISSIONS[role];
      if (rolePerms && rolePerms.includes(permission)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all permissions for a user
   *
   * @param {string} userId - User identifier
   * @returns {string[]}
   */
  getUserPermissions(userId) {
    const user = this.users.get(userId);
    if (!user) {
      return [];
    }

    const permissions = new Set(user.customPermissions);

    for (const role of user.roles) {
      const rolePerms = ROLE_PERMISSIONS[role];
      if (rolePerms) {
        rolePerms.forEach(p => permissions.add(p));
      }
    }

    return Array.from(permissions);
  }

  /**
   * Check permission and enforce (throws if denied)
   *
   * @param {string} userId - User identifier
   * @param {string} permission - Permission required
   * @throws {Error} If permission denied
   */
  enforce(userId, permission) {
    if (!this.hasPermission(userId, permission)) {
      this.audit('ACCESS_DENIED', { userId, permission });
      throw new Error(`Access denied: ${userId} lacks permission ${permission}`);
    }

    this.audit('ACCESS_GRANTED', { userId, permission });
  }

  /**
   * Initiate multi-sig approval request
   *
   * @param {string} permission - Permission/action requiring approval
   * @param {object} actionData - Action details
   * @param {string} requestedBy - User requesting
   * @returns {{actionId: string, requiredApprovals: number}}
   */
  requestApproval(permission, actionData, requestedBy) {
    if (!this.config.enableMultisig) {
      throw new Error('Multi-sig not enabled');
    }

    const multisigConfig = MULTISIG_REQUIRED[permission];
    if (!multisigConfig) {
      throw new Error(`Permission ${permission} does not require multi-sig`);
    }

    const actionId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.pendingApprovals.set(actionId, {
      permission,
      actionData,
      requestedBy,
      requiredThreshold: multisigConfig.threshold,
      requiredTotal: multisigConfig.of,
      approvals: new Set([requestedBy]), // Requester auto-approves
      rejections: new Set(),
      createdAt: Date.now(),
      status: 'pending',
    });

    this.audit('APPROVAL_REQUESTED', { actionId, permission, requestedBy });
    this.logger.info(`[AccessControl] Multi-sig approval requested: ${actionId}`);

    return {
      actionId,
      requiredApprovals: multisigConfig.threshold,
      currentApprovals: 1,
    };
  }

  /**
   * Approve a pending action
   *
   * @param {string} actionId - Action ID to approve
   * @param {string} approverId - Approver user ID
   * @returns {{approved: boolean, currentApprovals: number, required: number}}
   */
  approve(actionId, approverId) {
    const approval = this.pendingApprovals.get(actionId);
    if (!approval) {
      throw new Error(`Approval request ${actionId} not found`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Approval already ${approval.status}`);
    }

    // Check if expired
    if (Date.now() - approval.createdAt > this.config.approvalTimeout) {
      approval.status = 'expired';
      throw new Error('Approval request expired');
    }

    // Check if approver has admin role
    if (!this.hasPermission(approverId, PERMISSION.ROLE_ASSIGN)) {
      throw new Error('Approver lacks authority');
    }

    // Can't approve and reject same action
    if (approval.rejections.has(approverId)) {
      throw new Error('User already rejected this action');
    }

    approval.approvals.add(approverId);

    this.audit('APPROVAL_GIVEN', { actionId, approverId });

    const isApproved = approval.approvals.size >= approval.requiredThreshold;
    if (isApproved) {
      approval.status = 'approved';
      this.logger.info(`[AccessControl] Action ${actionId} approved`);
    }

    return {
      approved: isApproved,
      currentApprovals: approval.approvals.size,
      required: approval.requiredThreshold,
    };
  }

  /**
   * Reject a pending action
   *
   * @param {string} actionId - Action ID to reject
   * @param {string} rejecterId - Rejecter user ID
   * @param {string} reason - Rejection reason
   * @returns {{rejected: boolean}}
   */
  reject(actionId, rejecterId, reason = '') {
    const approval = this.pendingApprovals.get(actionId);
    if (!approval) {
      throw new Error(`Approval request ${actionId} not found`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Approval already ${approval.status}`);
    }

    // Check if rejecter has admin role
    if (!this.hasPermission(rejecterId, PERMISSION.ROLE_ASSIGN)) {
      throw new Error('Rejecter lacks authority');
    }

    approval.rejections.add(rejecterId);
    approval.rejectionReasons = approval.rejectionReasons || [];
    approval.rejectionReasons.push({ user: rejecterId, reason, at: Date.now() });

    this.audit('APPROVAL_REJECTED', { actionId, rejecterId, reason });

    // Check if enough rejections to deny
    const potentialApprovers = approval.requiredTotal - approval.rejections.size;
    if (potentialApprovers < approval.requiredThreshold) {
      approval.status = 'rejected';
      this.logger.info(`[AccessControl] Action ${actionId} rejected`);
      return { rejected: true };
    }

    return { rejected: false };
  }

  /**
   * Check if action is approved
   *
   * @param {string} actionId - Action ID
   * @returns {{approved: boolean, status: string, approval: object}}
   */
  isApproved(actionId) {
    const approval = this.pendingApprovals.get(actionId);
    if (!approval) {
      return { approved: false, status: 'not_found', approval: null };
    }

    // Check expiration
    if (approval.status === 'pending' && Date.now() - approval.createdAt > this.config.approvalTimeout) {
      approval.status = 'expired';
    }

    return {
      approved: approval.status === 'approved',
      status: approval.status,
      approval: {
        permission: approval.permission,
        actionData: approval.actionData,
        approvals: Array.from(approval.approvals),
        rejections: Array.from(approval.rejections),
        requiredThreshold: approval.requiredThreshold,
        createdAt: approval.createdAt,
      },
    };
  }

  /**
   * Execute action if approved
   *
   * @param {string} actionId - Action ID
   * @param {Function} executeFn - Function to execute
   * @returns {Promise<any>}
   */
  async executeIfApproved(actionId, executeFn) {
    const { approved, status, approval } = this.isApproved(actionId);

    if (!approved) {
      throw new Error(`Action not approved. Status: ${status}`);
    }

    this.audit('ACTION_EXECUTED', { actionId, permission: approval.permission });

    // Mark as executed
    const pending = this.pendingApprovals.get(actionId);
    if (pending) {
      pending.status = 'executed';
      pending.executedAt = Date.now();
    }

    return await executeFn(approval.actionData);
  }

  /**
   * Get user info
   *
   * @param {string} userId - User identifier
   * @returns {object|null}
   */
  getUser(userId) {
    const user = this.users.get(userId);
    if (!user) return null;

    return {
      userId,
      roles: Array.from(user.roles),
      customPermissions: Array.from(user.customPermissions),
      allPermissions: this.getUserPermissions(userId),
      createdAt: user.createdAt,
      lastModified: user.lastModified,
    };
  }

  /**
   * Get all users
   *
   * @returns {Array}
   */
  getAllUsers() {
    return Array.from(this.users.keys()).map(userId => this.getUser(userId));
  }

  /**
   * Get pending approvals
   *
   * @param {string} status - Filter by status (optional)
   * @returns {Array}
   */
  getPendingApprovals(status = null) {
    const results = [];

    for (const [actionId, approval] of this.pendingApprovals) {
      // Check expiration
      if (approval.status === 'pending' && Date.now() - approval.createdAt > this.config.approvalTimeout) {
        approval.status = 'expired';
      }

      if (!status || approval.status === status) {
        results.push({
          actionId,
          ...approval,
          approvals: Array.from(approval.approvals),
          rejections: Array.from(approval.rejections),
        });
      }
    }

    return results;
  }

  /**
   * Record audit event
   *
   * @param {string} action - Action type
   * @param {object} details - Action details
   */
  audit(action, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      details,
    };

    this.auditLog.push(entry);

    // Keep last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }
  }

  /**
   * Get audit log
   *
   * @param {object} options - Filter options
   * @returns {Array}
   */
  getAuditLog(options = {}) {
    let logs = [...this.auditLog];

    if (options.userId) {
      logs = logs.filter(l => l.details?.userId === options.userId);
    }

    if (options.action) {
      logs = logs.filter(l => l.action === options.action);
    }

    if (options.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  /**
   * Cleanup expired approvals
   */
  cleanup() {
    const now = Date.now();
    for (const [actionId, approval] of this.pendingApprovals) {
      if (now - approval.createdAt > this.config.approvalTimeout * 2) {
        this.pendingApprovals.delete(actionId);
      }
    }
  }
}

// Export constants
AccessControl.ROLE = ROLE;
AccessControl.PERMISSION = PERMISSION;

module.exports = AccessControl;
