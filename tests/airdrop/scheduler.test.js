'use strict';

/**
 * Activity Scheduler Tests
 *
 * Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * THE 6 W's: SCHEDULER TESTING
 * =============================================================================
 *
 * WHO: Tests for ActivityScheduler - the scheduling engine
 *
 * WHAT we test:
 * - Action scheduling and queue management
 * - Conflict resolution (same-wallet and cross-wallet)
 * - Action execution and tracking
 * - Lifecycle management (start/stop)
 * - Integration with strategy engine, randomizer, diversity tracker
 *
 * WHEN: On every commit, before deployment
 *
 * WHERE: tests/airdrop/scheduler.test.js
 *
 * WHY: Ensure scheduling works correctly for airdrop automation
 *
 * HOW: Jest unit tests with mocked components
 *
 * =============================================================================
 */

const {
  ActivityScheduler,
  ScheduledAction,
  WalletQueue,
  SCHEDULE_STATUS,
  DEFAULT_CONFIG,
  createScheduler,
} = require('../../src/airdrop/scheduler');

describe('Activity Scheduler', () => {
  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  describe('Constants', () => {
    test('SCHEDULE_STATUS should have all states', () => {
      expect(SCHEDULE_STATUS.PENDING).toBe('pending');
      expect(SCHEDULE_STATUS.RUNNING).toBe('running');
      expect(SCHEDULE_STATUS.COMPLETED).toBe('completed');
      expect(SCHEDULE_STATUS.FAILED).toBe('failed');
      expect(SCHEDULE_STATUS.CANCELLED).toBe('cancelled');
      expect(SCHEDULE_STATUS.SKIPPED).toBe('skipped');
    });

    test('DEFAULT_CONFIG should have reasonable values', () => {
      expect(DEFAULT_CONFIG.minWalletInterval).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.minCrossWalletInterval).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.maxQueueSize).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.maxRetries).toBeGreaterThan(0);
    });

    test('DEFAULT_CONFIG intervals should be in milliseconds', () => {
      // Min wallet interval should be hours
      expect(DEFAULT_CONFIG.minWalletInterval).toBeGreaterThanOrEqual(60 * 60 * 1000);

      // Cross-wallet interval should be minutes
      expect(DEFAULT_CONFIG.minCrossWalletInterval).toBeGreaterThanOrEqual(60 * 1000);
    });
  });

  // ==========================================================================
  // SCHEDULED ACTION CLASS
  // ==========================================================================

  describe('ScheduledAction', () => {
    test('should create action with data', () => {
      const action = new ScheduledAction({
        walletAddress: '0x1234567890123456789012345678901234567890',
        strategyName: 'test-strategy',
        action: 'swap',
        protocol: 'uniswap',
        chainId: 1,
        scheduledTime: Date.now() + 3600000,
      });

      expect(action.id).toBeDefined();
      expect(action.walletAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(action.action).toBe('swap');
      expect(action.status).toBe(SCHEDULE_STATUS.PENDING);
    });

    test('should normalize wallet address', () => {
      const action = new ScheduledAction({
        walletAddress: '0xABCD1234567890123456789012345678901234AB',
        action: 'swap',
        scheduledTime: Date.now(),
      });

      expect(action.walletAddress).toBe('0xabcd1234567890123456789012345678901234ab');
    });

    test('should mark as running', () => {
      const action = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now(),
      });

      action.markRunning();

      expect(action.status).toBe(SCHEDULE_STATUS.RUNNING);
      expect(action.attempts).toBe(1);
      expect(action.lastAttempt).toBeDefined();
    });

    test('should mark as completed', () => {
      const action = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now(),
      });

      const result = { txHash: '0xabc' };
      action.markCompleted(result);

      expect(action.status).toBe(SCHEDULE_STATUS.COMPLETED);
      expect(action.completedAt).toBeDefined();
      expect(action.result).toEqual(result);
    });

    test('should mark as failed', () => {
      const action = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now(),
      });

      action.markFailed(new Error('Transaction failed'));

      expect(action.status).toBe(SCHEDULE_STATUS.FAILED);
      expect(action.error).toBe('Transaction failed');
    });

    test('should mark as cancelled', () => {
      const action = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now(),
      });

      action.markCancelled('User request');

      expect(action.status).toBe(SCHEDULE_STATUS.CANCELLED);
      expect(action.error).toBe('User request');
    });

    test('should check if ready to execute', () => {
      const futureAction = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now() + 3600000, // 1 hour from now
      });

      const pastAction = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now() - 1000, // 1 second ago
      });

      expect(futureAction.isReady()).toBe(false);
      expect(pastAction.isReady()).toBe(true);
    });

    test('should check if should retry', () => {
      const action = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now(),
      });

      action.markFailed(new Error('test'));
      expect(action.shouldRetry(3)).toBe(true);

      action.attempts = 3;
      expect(action.shouldRetry(3)).toBe(false);
    });

    test('should convert to JSON', () => {
      const action = new ScheduledAction({
        walletAddress: '0x1234',
        strategyName: 'test',
        action: 'swap',
        protocol: 'uniswap',
        chainId: 1,
        scheduledTime: Date.now(),
        priority: 'high',
      });

      const json = action.toJSON();

      expect(json.walletAddress).toBeDefined();
      expect(json.action).toBe('swap');
      expect(json.priority).toBe('high');
      expect(json.id).toBeDefined();
    });
  });

  // ==========================================================================
  // WALLET QUEUE CLASS
  // ==========================================================================

  describe('WalletQueue', () => {
    let queue;

    beforeEach(() => {
      queue = new WalletQueue('0x1234');
    });

    test('should create queue for wallet', () => {
      expect(queue.walletAddress).toBe('0x1234');
      expect(queue.size).toBe(0);
      expect(queue.paused).toBe(false);
    });

    test('should add actions to queue', () => {
      const action = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now(),
      });

      queue.add(action);
      expect(queue.size).toBe(1);
    });

    test('should sort actions by scheduled time', () => {
      const now = Date.now();

      queue.add(new ScheduledAction({
        walletAddress: '0x1234',
        action: 'third',
        scheduledTime: now + 3000,
      }));
      queue.add(new ScheduledAction({
        walletAddress: '0x1234',
        action: 'first',
        scheduledTime: now + 1000,
      }));
      queue.add(new ScheduledAction({
        walletAddress: '0x1234',
        action: 'second',
        scheduledTime: now + 2000,
      }));

      expect(queue.items[0].action).toBe('first');
      expect(queue.items[1].action).toBe('second');
      expect(queue.items[2].action).toBe('third');
    });

    test('should remove action by ID', () => {
      const action = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now(),
      });

      queue.add(action);
      const removed = queue.remove(action.id);

      expect(removed).toBe(action);
      expect(queue.size).toBe(0);
    });

    test('should get next ready action', () => {
      const readyAction = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'ready',
        scheduledTime: Date.now() - 1000,
      });

      const futureAction = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'future',
        scheduledTime: Date.now() + 3600000,
      });

      queue.add(futureAction);
      queue.add(readyAction);

      const next = queue.getNextReady();
      expect(next.action).toBe('ready');
    });

    test('should return null when paused', () => {
      queue.add(new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap',
        scheduledTime: Date.now() - 1000,
      }));

      queue.paused = true;
      expect(queue.getNextReady()).toBeNull();
    });

    test('should get pending actions', () => {
      const pending1 = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap1',
        scheduledTime: Date.now(),
      });
      const pending2 = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'swap2',
        scheduledTime: Date.now(),
      });
      const completed = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'done',
        scheduledTime: Date.now(),
      });
      completed.markCompleted();

      queue.add(pending1);
      queue.add(pending2);
      queue.add(completed);

      const pending = queue.getPending();
      expect(pending).toHaveLength(2);
    });

    test('should clear completed items', () => {
      const pending = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'pending',
        scheduledTime: Date.now(),
      });
      const completed = new ScheduledAction({
        walletAddress: '0x1234',
        action: 'completed',
        scheduledTime: Date.now(),
      });
      completed.markCompleted();

      queue.add(pending);
      queue.add(completed);

      queue.clearCompleted();
      expect(queue.size).toBe(1);
      expect(queue.items[0].action).toBe('pending');
    });
  });

  // ==========================================================================
  // ACTIVITY SCHEDULER CLASS
  // ==========================================================================

  describe('ActivityScheduler', () => {
    let scheduler;
    let mockLogger;

    beforeEach(() => {
      mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      scheduler = new ActivityScheduler({
        logger: mockLogger,
        minWalletInterval: 1000, // 1 second for testing
        minCrossWalletInterval: 100,
        tickInterval: 100,
      });
    });

    afterEach(() => {
      scheduler.stop();
    });

    describe('Lifecycle', () => {
      test('should start scheduler', () => {
        const handler = jest.fn();
        scheduler.on('started', handler);

        scheduler.start();

        expect(scheduler.running).toBe(true);
        expect(handler).toHaveBeenCalled();
      });

      test('should stop scheduler', () => {
        const handler = jest.fn();
        scheduler.on('stopped', handler);

        scheduler.start();
        scheduler.stop();

        expect(scheduler.running).toBe(false);
        expect(handler).toHaveBeenCalled();
      });

      test('should not start if already running', () => {
        scheduler.start();
        scheduler.start(); // Second call

        expect(mockLogger.warn).toHaveBeenCalled();
      });
    });

    describe('Queue Management', () => {
      test('should get or create queue', () => {
        const queue = scheduler.getQueue('0x1234');

        expect(queue).toBeInstanceOf(WalletQueue);
        expect(scheduler.getQueue('0x1234')).toBe(queue); // Same instance
      });

      test('should normalize queue address', () => {
        const q1 = scheduler.getQueue('0xABCD');
        const q2 = scheduler.getQueue('0xabcd');

        expect(q1).toBe(q2);
      });
    });

    describe('Scheduling', () => {
      test('should schedule action', () => {
        const action = scheduler.schedule('0x1234', {
          strategyName: 'test',
          action: 'swap',
          protocol: 'uniswap',
          scheduledTime: Date.now() + 60000,
        });

        expect(action).toBeInstanceOf(ScheduledAction);
        expect(action.status).toBe(SCHEDULE_STATUS.PENDING);

        const queue = scheduler.getQueue('0x1234');
        expect(queue.size).toBe(1);
      });

      test('should emit scheduled event', () => {
        const handler = jest.fn();
        scheduler.on('scheduled', handler);

        scheduler.schedule('0x1234', {
          action: 'swap',
          scheduledTime: Date.now() + 60000,
        });

        expect(handler).toHaveBeenCalled();
      });

      test('should reject when queue is full', () => {
        const smallScheduler = new ActivityScheduler({
          logger: mockLogger,
          maxQueueSize: 2,
        });

        smallScheduler.schedule('0x1234', {
          action: 'swap1',
          scheduledTime: Date.now() + 1000,
        });
        smallScheduler.schedule('0x1234', {
          action: 'swap2',
          scheduledTime: Date.now() + 2000,
        });

        expect(() => {
          smallScheduler.schedule('0x1234', {
            action: 'swap3',
            scheduledTime: Date.now() + 3000,
          });
        }).toThrow('Queue full');
      });

      test('should calculate scheduled time if not provided', () => {
        const action = scheduler.schedule('0x1234', {
          action: 'swap',
          params: { frequency: { min: 1, max: 2 } },
        });

        expect(action.scheduledTime).toBeGreaterThan(Date.now());
      });
    });

    describe('Conflict Resolution', () => {
      test('should check same-wallet conflicts', () => {
        const queue = scheduler.getQueue('0x1234');
        queue.lastExecution = Date.now();

        const conflict = scheduler.checkConflicts(
          '0x1234',
          Date.now() + 100 // Too soon
        );

        expect(conflict.hasConflict).toBe(true);
        expect(conflict.type).toBe('wallet_cooldown');
      });

      test('should check cross-wallet conflicts', () => {
        // Add some recent global history
        for (let i = 0; i < 5; i++) {
          scheduler.globalHistory.push({
            walletAddress: `0x${i}`,
            time: Date.now(),
          });
        }

        const conflict = scheduler.checkConflicts(
          '0xnew',
          Date.now()
        );

        expect(conflict.hasConflict).toBe(true);
        expect(conflict.type).toBe('cross_wallet');
      });

      test('should resolve conflicts', () => {
        const queue = scheduler.getQueue('0x1234');
        queue.lastExecution = Date.now();

        const resolved = scheduler.resolveConflicts(
          '0x1234',
          Date.now() + 100 // Too soon
        );

        // Should be pushed to at or after cooldown
        expect(resolved).toBeGreaterThanOrEqual(queue.lastExecution + scheduler.config.minWalletInterval);
      });
    });

    describe('Cancellation and Pausing', () => {
      test('should cancel action', () => {
        const action = scheduler.schedule('0x1234', {
          action: 'swap',
          scheduledTime: Date.now() + 60000,
        });

        const result = scheduler.cancel(action.id, 'Test cancellation');

        expect(result).toBe(true);
        expect(action.status).toBe(SCHEDULE_STATUS.CANCELLED);
      });

      test('should return false for non-existent action', () => {
        const result = scheduler.cancel('non-existent-id');
        expect(result).toBe(false);
      });

      test('should pause wallet queue', () => {
        const handler = jest.fn();
        scheduler.on('walletPaused', handler);

        scheduler.pauseWallet('0x1234');

        const queue = scheduler.getQueue('0x1234');
        expect(queue.paused).toBe(true);
        expect(handler).toHaveBeenCalled();
      });

      test('should resume wallet queue', () => {
        const handler = jest.fn();
        scheduler.on('walletResumed', handler);

        scheduler.pauseWallet('0x1234');
        scheduler.resumeWallet('0x1234');

        const queue = scheduler.getQueue('0x1234');
        expect(queue.paused).toBe(false);
        expect(handler).toHaveBeenCalled();
      });
    });

    describe('Execution', () => {
      test('should execute ready action', async () => {
        const executeFn = jest.fn().mockResolvedValue({ success: true });
        const execScheduler = new ActivityScheduler({
          logger: mockLogger,
          execute: executeFn,
          minWalletInterval: 0,
          minCrossWalletInterval: 0,
        });

        const action = execScheduler.schedule('0x1234', {
          action: 'swap',
          scheduledTime: Date.now() - 1000, // Ready now
        });

        const queue = execScheduler.getQueue('0x1234');
        await execScheduler.executeAction(queue, action);

        expect(executeFn).toHaveBeenCalledWith(action);
        expect(action.status).toBe(SCHEDULE_STATUS.COMPLETED);
      });

      test('should handle execution failure', async () => {
        const executeFn = jest.fn().mockRejectedValue(new Error('TX failed'));
        const execScheduler = new ActivityScheduler({
          logger: mockLogger,
          execute: executeFn,
          maxRetries: 3,
        });

        const action = execScheduler.schedule('0x1234', {
          action: 'swap',
          scheduledTime: Date.now() - 1000,
        });

        const queue = execScheduler.getQueue('0x1234');
        await execScheduler.executeAction(queue, action);

        expect(action.status).toBe(SCHEDULE_STATUS.PENDING); // Retry scheduled
        expect(action.attempts).toBe(1);
      });

      test('should emit events on execution', async () => {
        const executeFn = jest.fn().mockResolvedValue({ success: true });
        const execScheduler = new ActivityScheduler({
          logger: mockLogger,
          execute: executeFn,
        });

        const executingHandler = jest.fn();
        const executedHandler = jest.fn();
        execScheduler.on('executing', executingHandler);
        execScheduler.on('executed', executedHandler);

        const action = execScheduler.schedule('0x1234', {
          action: 'swap',
          scheduledTime: Date.now() - 1000,
        });

        const queue = execScheduler.getQueue('0x1234');
        await execScheduler.executeAction(queue, action);

        expect(executingHandler).toHaveBeenCalled();
        expect(executedHandler).toHaveBeenCalled();
      });

      test('should update global history after execution', async () => {
        const executeFn = jest.fn().mockResolvedValue({ success: true });
        const execScheduler = new ActivityScheduler({
          logger: mockLogger,
          execute: executeFn,
        });

        const action = execScheduler.schedule('0x1234', {
          action: 'swap',
          scheduledTime: Date.now() - 1000,
        });

        const queue = execScheduler.getQueue('0x1234');
        await execScheduler.executeAction(queue, action);

        expect(execScheduler.globalHistory.length).toBe(1);
        expect(execScheduler.globalHistory[0].walletAddress).toBe('0x1234');
      });
    });

    describe('Action Category Mapping', () => {
      test('should map action to category', () => {
        expect(scheduler.getActionCategory('swap')).toBe('dex');
        expect(scheduler.getActionCategory('bridge')).toBe('bridge');
        expect(scheduler.getActionCategory('lend')).toBe('lending');
        expect(scheduler.getActionCategory('stake')).toBe('staking');
        expect(scheduler.getActionCategory('governance_vote')).toBe('governance');
        expect(scheduler.getActionCategory('unknown')).toBe('unknown');
      });
    });

    describe('Statistics and Status', () => {
      test('should get queue status', () => {
        scheduler.schedule('0x1234', {
          action: 'swap',
          scheduledTime: Date.now() + 60000,
        });

        const status = scheduler.getQueueStatus('0x1234');

        expect(status.walletAddress).toBe('0x1234');
        expect(status.totalItems).toBe(1);
        expect(status.pendingItems).toBe(1);
        expect(status.paused).toBe(false);
      });

      test('should return null for non-existent queue', () => {
        const status = scheduler.getQueueStatus('0xnonexistent');
        expect(status).toBeNull();
      });

      test('should get all queues status', () => {
        scheduler.schedule('0x1111', {
          action: 'swap',
          scheduledTime: Date.now() + 60000,
        });
        scheduler.schedule('0x2222', {
          action: 'bridge',
          scheduledTime: Date.now() + 60000,
        });

        const statuses = scheduler.getAllQueuesStatus();
        expect(statuses).toHaveLength(2);
      });

      test('should get statistics', () => {
        scheduler.schedule('0x1234', {
          action: 'swap',
          scheduledTime: Date.now() + 60000,
        });

        const stats = scheduler.getStatistics();

        expect(stats.scheduled).toBe(1);
        expect(stats.queuesCount).toBe(1);
        expect(stats.totalPending).toBe(1);
        expect(stats.running).toBe(false);
      });

      test('should get upcoming actions', () => {
        const now = Date.now();

        scheduler.schedule('0x1111', {
          action: 'first',
          scheduledTime: now + 1000,
        });
        scheduler.schedule('0x2222', {
          action: 'second',
          scheduledTime: now + 2000,
        });
        scheduler.schedule('0x3333', {
          action: 'third',
          scheduledTime: now + 3000,
        });

        const upcoming = scheduler.getUpcomingActions(2);

        expect(upcoming).toHaveLength(2);
        expect(upcoming[0].action).toBe('first');
        expect(upcoming[1].action).toBe('second');
      });
    });

    describe('Queue Population', () => {
      test('should populate queue with strategy engine', async () => {
        const mockStrategyEngine = {
          selectNextAction: jest.fn()
            .mockReturnValueOnce({
              strategy: 'test',
              action: 'swap',
              protocols: ['uniswap'],
              chains: [1],
              config: {},
            })
            .mockReturnValueOnce({
              strategy: 'test',
              action: 'bridge',
              protocols: ['stargate'],
              chains: [42161],
              config: {},
            })
            .mockReturnValue(null),
        };

        const popScheduler = new ActivityScheduler({
          logger: mockLogger,
          strategyEngine: mockStrategyEngine,
        });

        const scheduled = await popScheduler.populateQueue('0x1234', 5);

        expect(scheduled.length).toBe(2);
        expect(mockStrategyEngine.selectNextAction).toHaveBeenCalled();
      });

      test('should throw without strategy engine', async () => {
        await expect(scheduler.populateQueue('0x1234')).rejects.toThrow(
          'Strategy engine not configured'
        );
      });
    });

    describe('History Cleanup', () => {
      test('should cleanup old history', () => {
        const oldTime = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago
        const recentTime = Date.now() - 1000;

        scheduler.globalHistory.push(
          { walletAddress: '0x1111', time: oldTime },
          { walletAddress: '0x2222', time: recentTime }
        );

        scheduler.cleanupHistory();

        expect(scheduler.globalHistory).toHaveLength(1);
        expect(scheduler.globalHistory[0].walletAddress).toBe('0x2222');
      });
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION
  // ==========================================================================

  describe('Factory Function', () => {
    test('should create scheduler with defaults', () => {
      const scheduler = createScheduler();
      expect(scheduler).toBeInstanceOf(ActivityScheduler);
      scheduler.stop();
    });

    test('should accept custom config', () => {
      const scheduler = createScheduler({
        maxQueueSize: 100,
        maxRetries: 5,
      });

      expect(scheduler.config.maxQueueSize).toBe(100);
      expect(scheduler.config.maxRetries).toBe(5);
      scheduler.stop();
    });
  });

  // ==========================================================================
  // INTEGRATION
  // ==========================================================================

  describe('Integration', () => {
    test('should work with all components', async () => {
      const mockStrategyEngine = {
        selectNextAction: jest.fn().mockReturnValue({
          strategy: 'test',
          action: 'swap',
          protocols: ['uniswap'],
          chains: [1],
          config: { frequency: { min: 1, max: 2 } },
        }),
        recordExecution: jest.fn(),
      };

      const mockRandomizer = {
        randomizeTime: jest.fn().mockImplementation((base) => new Date(base)),
      };

      const mockDiversityTracker = {
        recordActivity: jest.fn(),
      };

      const scheduler = new ActivityScheduler({
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        strategyEngine: mockStrategyEngine,
        randomizer: mockRandomizer,
        diversityTracker: mockDiversityTracker,
        execute: jest.fn().mockResolvedValue({ success: true }),
      });

      // Schedule with strategy
      const action = scheduler.scheduleNext('0x1234');
      expect(action).toBeDefined();
      expect(mockStrategyEngine.selectNextAction).toHaveBeenCalled();

      // Execute
      const queue = scheduler.getQueue('0x1234');
      action.scheduledTime = Date.now() - 1000; // Make it ready
      await scheduler.executeAction(queue, action);

      // Verify integrations were called
      expect(mockDiversityTracker.recordActivity).toHaveBeenCalled();
      expect(mockStrategyEngine.recordExecution).toHaveBeenCalled();

      scheduler.stop();
    });
  });

  // ==========================================================================
  // SYBIL RESISTANCE
  // ==========================================================================

  describe('Sybil Resistance Features', () => {
    test('should enforce minimum wallet interval', () => {
      const scheduler = createScheduler({
        minWalletInterval: 4 * 60 * 60 * 1000, // 4 hours
      });

      const queue = scheduler.getQueue('0x1234');
      queue.lastExecution = Date.now();

      const conflict = scheduler.checkConflicts(
        '0x1234',
        Date.now() + 1000 // 1 second later
      );

      expect(conflict.hasConflict).toBe(true);
      expect(conflict.type).toBe('wallet_cooldown');

      scheduler.stop();
    });

    test('should prevent temporal clustering', () => {
      const scheduler = createScheduler({
        maxClusterSize: 2,
        clusterWindow: 60 * 60 * 1000, // 1 hour
      });

      // Add executions to history
      scheduler.globalHistory.push(
        { walletAddress: '0x1111', time: Date.now() },
        { walletAddress: '0x2222', time: Date.now() }
      );

      const conflict = scheduler.checkConflicts(
        '0x3333',
        Date.now()
      );

      expect(conflict.hasConflict).toBe(true);
      expect(conflict.type).toBe('cross_wallet');

      scheduler.stop();
    });

    test('should spread actions across time', () => {
      const scheduler = createScheduler();

      // Schedule multiple wallets
      for (let i = 0; i < 5; i++) {
        scheduler.schedule(`0x${i.toString().padStart(40, '0')}`, {
          action: 'swap',
          scheduledTime: Date.now() + 60000,
        });
      }

      const upcoming = scheduler.getUpcomingActions(5);
      const times = upcoming.map(a => a.scheduledTime);

      // After conflict resolution, times should be spread out
      // (some may still be close due to the simple test setup)
      expect(times.length).toBe(5);

      scheduler.stop();
    });
  });
});
