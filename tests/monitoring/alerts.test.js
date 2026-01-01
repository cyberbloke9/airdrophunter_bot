'use strict';

const { AlertSystem } = require('../../src/monitoring/alerts');

describe('AlertSystem', () => {
  let alertSystem;
  let mockNotificationService;

  beforeEach(() => {
    mockNotificationService = {
      notify: jest.fn().mockResolvedValue({ success: true }),
    };

    alertSystem = new AlertSystem({
      logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      notificationService: mockNotificationService,
      deduplicationWindowMs: 100, // Short for testing
      escalationTimeMs: 100, // Short for testing
    });
  });

  afterEach(() => {
    alertSystem.stop();
  });

  describe('constructor', () => {
    test('initializes with default thresholds', () => {
      const system = new AlertSystem();
      expect(system.thresholds.sandwichExtractionCritical).toBe(0.02);
      expect(system.thresholds.sandwichExtractionHigh).toBe(0.01);
    });

    test('accepts custom thresholds', () => {
      const system = new AlertSystem({
        thresholds: { sandwichExtractionCritical: 0.05 },
      });
      expect(system.thresholds.sandwichExtractionCritical).toBe(0.05);
    });

    test('initializes categories and levels', () => {
      expect(alertSystem.CATEGORIES.SECURITY).toBe('security');
      expect(alertSystem.LEVELS.CRITICAL).toBe('critical');
    });
  });

  describe('start/stop', () => {
    test('starts escalation checking', () => {
      alertSystem.start();
      expect(alertSystem.escalationInterval).not.toBeNull();
    });

    test('stops escalation checking', () => {
      alertSystem.start();
      alertSystem.stop();
      expect(alertSystem.escalationInterval).toBeNull();
    });
  });

  describe('sendAlert', () => {
    test('sends alert successfully', async () => {
      const result = await alertSystem.sendAlert('high', 'security', 'Test alert');

      expect(result.sent).toBe(true);
      expect(result.alert).toBeDefined();
      expect(result.alert.level).toBe('high');
      expect(result.alert.category).toBe('security');
      expect(result.alert.message).toBe('Test alert');
    });

    test('calls notification service', async () => {
      await alertSystem.sendAlert('critical', 'security', 'Critical alert');

      expect(mockNotificationService.notify).toHaveBeenCalled();
    });

    test('rejects invalid level', async () => {
      await expect(alertSystem.sendAlert('invalid', 'security', 'Test'))
        .rejects.toThrow('Invalid alert level');
    });

    test('stores alert in history', async () => {
      await alertSystem.sendAlert('high', 'security', 'Test alert');

      const history = alertSystem.getAlertHistory();
      expect(history).toHaveLength(1);
      expect(history[0].message).toBe('Test alert');
    });

    test('emits alert event', async () => {
      const listener = jest.fn();
      alertSystem.on('alert', listener);

      await alertSystem.sendAlert('high', 'security', 'Test');

      expect(listener).toHaveBeenCalled();
    });

    test('emits level-specific event', async () => {
      const listener = jest.fn();
      alertSystem.on('alert:critical', listener);

      await alertSystem.sendAlert('critical', 'security', 'Test');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    test('respects rate limits', async () => {
      // Set strict rate limit
      alertSystem.rateLimits.medium = { max: 2, windowMs: 60000 };

      await alertSystem.sendAlert('medium', 'test', 'Alert 1');
      await alertSystem.sendAlert('medium', 'test', 'Alert 2');
      const result = await alertSystem.sendAlert('medium', 'test', 'Alert 3');

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('rate_limited');
    });
  });

  describe('deduplication', () => {
    test('deduplicates identical alerts', async () => {
      await alertSystem.sendAlert('high', 'security', 'Same message');
      const result = await alertSystem.sendAlert('high', 'security', 'Same message');

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('duplicate');
    });

    test('allows different messages', async () => {
      await alertSystem.sendAlert('high', 'security', 'Message 1');
      const result = await alertSystem.sendAlert('high', 'security', 'Message 2');

      expect(result.sent).toBe(true);
    });

    test('allows same message after window expires', async () => {
      await alertSystem.sendAlert('high', 'security', 'Test');

      // Wait for dedup window
      await new Promise(resolve => setTimeout(resolve, 150));

      const result = await alertSystem.sendAlert('high', 'security', 'Test');
      expect(result.sent).toBe(true);
    });
  });

  describe('muting', () => {
    test('mutes category', async () => {
      alertSystem.mute('security', 1000);

      const result = await alertSystem.sendAlert('high', 'security', 'Test');

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('muted');
    });

    test('unmutes category', async () => {
      alertSystem.mute('security', 10000);
      alertSystem.unmute('security');

      const result = await alertSystem.sendAlert('high', 'security', 'Test');

      expect(result.sent).toBe(true);
    });

    test('auto-unmutes after duration', async () => {
      alertSystem.mute('security', 50);

      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await alertSystem.sendAlert('high', 'security', 'Test');
      expect(result.sent).toBe(true);
    });
  });

  describe('acknowledge', () => {
    test('acknowledges alert', async () => {
      const { alert } = await alertSystem.sendAlert('high', 'security', 'Test');

      const result = alertSystem.acknowledge(alert.id, 'admin');

      expect(result).toBe(true);
      expect(alert.acknowledged).toBe(true);
      expect(alert.acknowledgedBy).toBe('admin');
    });

    test('returns false for unknown alert', () => {
      const result = alertSystem.acknowledge('unknown_id');
      expect(result).toBe(false);
    });

    test('emits acknowledged event', async () => {
      const listener = jest.fn();
      alertSystem.on('alert:acknowledged', listener);

      const { alert } = await alertSystem.sendAlert('high', 'security', 'Test');
      alertSystem.acknowledge(alert.id);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getAlertHistory', () => {
    test('returns all alerts', async () => {
      await alertSystem.sendAlert('high', 'security', 'Alert 1');
      await alertSystem.sendAlert('medium', 'transaction', 'Alert 2');

      const history = alertSystem.getAlertHistory();
      expect(history).toHaveLength(2);
    });

    test('filters by level', async () => {
      await alertSystem.sendAlert('high', 'security', 'High');
      await alertSystem.sendAlert('medium', 'security', 'Medium');

      const history = alertSystem.getAlertHistory({ level: 'high' });
      expect(history).toHaveLength(1);
      expect(history[0].level).toBe('high');
    });

    test('filters by category', async () => {
      await alertSystem.sendAlert('high', 'security', 'Security');
      await alertSystem.sendAlert('high', 'transaction', 'Transaction');

      const history = alertSystem.getAlertHistory({ category: 'security' });
      expect(history).toHaveLength(1);
      expect(history[0].category).toBe('security');
    });

    test('limits results', async () => {
      await alertSystem.sendAlert('high', 'security', 'Alert 1');
      await alertSystem.sendAlert('high', 'security', 'Alert 2');
      await alertSystem.sendAlert('high', 'security', 'Alert 3');

      const history = alertSystem.getAlertHistory({ limit: 2 });
      expect(history).toHaveLength(2);
    });
  });

  describe('getActiveAlerts', () => {
    test('returns unacknowledged alerts', async () => {
      await alertSystem.sendAlert('high', 'security', 'Alert 1');
      const { alert } = await alertSystem.sendAlert('high', 'security', 'Alert 2');
      alertSystem.acknowledge(alert.id);

      const active = alertSystem.getActiveAlerts();
      expect(active).toHaveLength(1);
    });

    test('sorts by priority', async () => {
      await alertSystem.sendAlert('low', 'info', 'Low');
      await alertSystem.sendAlert('critical', 'security', 'Critical');
      await alertSystem.sendAlert('high', 'security', 'High');

      const active = alertSystem.getActiveAlerts();
      expect(active[0].level).toBe('critical');
      expect(active[1].level).toBe('high');
      expect(active[2].level).toBe('low');
    });
  });

  describe('setThresholds', () => {
    test('updates thresholds', () => {
      alertSystem.setThresholds({ sandwichExtractionCritical: 0.05 });
      expect(alertSystem.thresholds.sandwichExtractionCritical).toBe(0.05);
    });
  });

  describe('getStatistics', () => {
    test('returns statistics', async () => {
      await alertSystem.sendAlert('high', 'security', 'Alert 1');
      await alertSystem.sendAlert('critical', 'security', 'Alert 2');

      const stats = alertSystem.getStatistics();
      expect(stats.total).toBe(2);
      expect(stats.byLevel.high).toBe(1);
      expect(stats.byLevel.critical).toBe(1);
      expect(stats.byCategory.security).toBe(2);
    });
  });

  describe('convenience methods', () => {
    test('alertEmergencyStop sends critical alert', async () => {
      const result = await alertSystem.alertEmergencyStop('Test reason');

      expect(result.alert.level).toBe('critical');
      expect(result.alert.category).toBe('security');
    });

    test('alertSandwichAttack uses correct level based on extraction', async () => {
      const highResult = await alertSystem.alertSandwichAttack('0x123', 0.015);
      expect(highResult.alert.level).toBe('high');

      const critResult = await alertSystem.alertSandwichAttack('0x456', 0.025);
      expect(critResult.alert.level).toBe('critical');
    });

    test('alertLowBalance uses correct level based on amount', async () => {
      const highResult = await alertSystem.alertLowBalance('0x123', '0.08');
      expect(highResult.alert.level).toBe('high');

      const critResult = await alertSystem.alertLowBalance('0x456', '0.03');
      expect(critResult.alert.level).toBe('critical');
    });

    test('alertTransactionConfirmed sends low alert', async () => {
      const result = await alertSystem.alertTransactionConfirmed('0x123');

      expect(result.alert.level).toBe('low');
      expect(result.alert.category).toBe('transaction');
    });

    test('alertRpcFailure sends high alert', async () => {
      const result = await alertSystem.alertRpcFailure('https://rpc.test', 1, 'timeout');

      expect(result.alert.level).toBe('high');
      expect(result.alert.category).toBe('rpc');
    });

    test('alertAllRpcsFailing sends critical alert', async () => {
      const result = await alertSystem.alertAllRpcsFailing(1);

      expect(result.alert.level).toBe('critical');
      expect(result.alert.category).toBe('rpc');
    });
  });

  describe('escalation', () => {
    test('escalates unacknowledged HIGH alerts', async () => {
      // Override escalation check interval to be faster
      alertSystem.escalationTimeMs = 50;
      alertSystem.start();

      await alertSystem.sendAlert('high', 'security', 'Test');

      // Manually trigger escalation check after waiting for escalation time
      await new Promise(resolve => setTimeout(resolve, 100));
      alertSystem._checkEscalations();

      const active = alertSystem.getActiveAlerts();
      expect(active[0].escalated).toBe(true);
      expect(active[0].level).toBe('critical');
    });

    test('does not escalate acknowledged alerts', async () => {
      alertSystem.start();

      const { alert } = await alertSystem.sendAlert('high', 'security', 'Test');
      alertSystem.acknowledge(alert.id);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(alert.escalated).toBe(false);
    });
  });
});
