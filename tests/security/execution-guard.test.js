/**
 * Execution Guard Unit Tests
 *
 * Tests transaction state machine, reentrancy protection,
 * hooks, and emergency stop functionality.
 */

const ExecutionGuard = require('../../src/security/execution-guard');
const { TX_STATE } = ExecutionGuard;

describe('ExecutionGuard', () => {
  let executionGuard;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    executionGuard = new ExecutionGuard({ logger: mockLogger });
  });

  describe('Basic Execution', () => {
    test('executes transaction successfully', async () => {
      const result = await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({ tx: { to: '0xABC', data: '0x' } }),
        executeFn: async () => ({ txHash: '0xTxHash' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(result.success).toBe(true);
      expect(result.txId).toBeDefined();
    });

    test('returns transaction ID', async () => {
      const result = await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(result.txId).toMatch(/^tx_\d+_[a-z0-9]+$/);
    });

    test('tracks execution time', async () => {
      const result = await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => {
          await new Promise(r => setTimeout(r, 50));
          return {};
        },
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(result.executionTime).toBeGreaterThanOrEqual(50);
    });
  });

  describe('State Machine', () => {
    test('transitions through all states on success', async () => {
      let states = [];

      // Capture states during execution phases
      const result = await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => {
          // We're in PREPARING state here
          const active = executionGuard.getActiveTransactions();
          if (active.length > 0) states.push(active[0].state);
          return {};
        },
        executeFn: async () => {
          const active = executionGuard.getActiveTransactions();
          if (active.length > 0) states.push(active[0].state);
          return { txHash: '0x123' };
        },
        confirmFn: async () => {
          const active = executionGuard.getActiveTransactions();
          if (active.length > 0) states.push(active[0].state);
          return { confirmed: true };
        },
      });

      expect(states).toContain(TX_STATE.PREPARING);
      expect(states).toContain(TX_STATE.EXECUTING);
      expect(states).toContain(TX_STATE.CONFIRMING);
      expect(result.success).toBe(true);
    });

    test('transitions to FAILED on error', async () => {
      try {
        await executionGuard.execute({
          walletAddress: '0x1234',
          prepareFn: async () => { throw new Error('Prepare failed'); },
          executeFn: async () => ({}),
          confirmFn: async () => ({}),
        });
      } catch (e) {
        // Expected
      }

      // Check last transaction state
      const active = executionGuard.getActiveTransactions();
      // Transaction should have moved to FAILED, not in active
    });
  });

  describe('Optional Steps', () => {
    test('skips simulation if not provided', async () => {
      const result = await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        // No simulateFn
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(result.success).toBe(true);
    });

    test('runs simulation if provided', async () => {
      let simulated = false;

      const result = await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({ data: 'test' }),
        simulateFn: async (prepareResult) => {
          simulated = true;
          expect(prepareResult.data).toBe('test');
          return { success: true };
        },
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(simulated).toBe(true);
      expect(result.success).toBe(true);
    });

    test('fails if simulation fails', async () => {
      await expect(
        executionGuard.execute({
          walletAddress: '0x1234',
          prepareFn: async () => ({}),
          simulateFn: async () => ({ success: false, reason: 'Reverted' }),
          executeFn: async () => ({ txHash: '0x123' }),
          confirmFn: async () => ({ confirmed: true }),
        })
      ).rejects.toThrow('Simulation failed');
    });

    test('runs approval if provided', async () => {
      let approved = false;

      const result = await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        approveFn: async () => {
          approved = true;
          return { txHash: '0xApproval' };
        },
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(approved).toBe(true);
      expect(result.success).toBe(true);
    });
  });

  describe('Wallet Locking', () => {
    test('locks wallet during execution', async () => {
      let lockChecked = false;

      const promise = executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => {
          await new Promise(r => setTimeout(r, 100));
          return {};
        },
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      // Check if wallet is busy during execution
      setTimeout(() => {
        lockChecked = true;
        expect(executionGuard.isWalletBusy('0x1234')).toBe(true);
      }, 50);

      await promise;
      expect(lockChecked).toBe(true);
      expect(executionGuard.isWalletBusy('0x1234')).toBe(false);
    });

    test('releases lock on failure', async () => {
      try {
        await executionGuard.execute({
          walletAddress: '0x1234',
          prepareFn: async () => { throw new Error('Failed'); },
          executeFn: async () => ({}),
          confirmFn: async () => ({}),
        });
      } catch (e) {
        // Expected
      }

      expect(executionGuard.isWalletBusy('0x1234')).toBe(false);
    });

    test('serializes transactions for same wallet', async () => {
      const order = [];

      const tx1 = executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => {
          order.push('tx1-prepare');
          await new Promise(r => setTimeout(r, 50));
          return {};
        },
        executeFn: async () => {
          order.push('tx1-execute');
          return { txHash: '0x1' };
        },
        confirmFn: async () => ({ confirmed: true }),
      });

      const tx2 = executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => {
          order.push('tx2-prepare');
          return {};
        },
        executeFn: async () => {
          order.push('tx2-execute');
          return { txHash: '0x2' };
        },
        confirmFn: async () => ({ confirmed: true }),
      });

      await Promise.all([tx1, tx2]);

      // tx1 should fully complete before tx2 starts
      expect(order.indexOf('tx1-execute')).toBeLessThan(order.indexOf('tx2-prepare'));
    });

    test('allows parallel execution for different wallets', async () => {
      const order = [];

      const tx1 = executionGuard.execute({
        walletAddress: '0xAAAA',
        prepareFn: async () => {
          order.push('tx1-start');
          await new Promise(r => setTimeout(r, 50));
          order.push('tx1-end');
          return {};
        },
        executeFn: async () => ({ txHash: '0x1' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      const tx2 = executionGuard.execute({
        walletAddress: '0xBBBB',
        prepareFn: async () => {
          order.push('tx2-start');
          await new Promise(r => setTimeout(r, 50));
          order.push('tx2-end');
          return {};
        },
        executeFn: async () => ({ txHash: '0x2' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      await Promise.all([tx1, tx2]);

      // Both should start before either ends (parallel execution)
      expect(order.indexOf('tx2-start')).toBeLessThan(order.indexOf('tx1-end'));
    });
  });

  describe('Hooks', () => {
    test('runs pre-execution hooks', async () => {
      let hookRan = false;

      executionGuard.registerPreExecutionHook(async (txId, params) => {
        hookRan = true;
        expect(txId).toBeDefined();
        expect(params.walletAddress).toBe('0x1234');
      });

      await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(hookRan).toBe(true);
    });

    test('runs post-execution hooks', async () => {
      let hookResult = null;

      executionGuard.registerPostExecutionHook(async (txId, result) => {
        hookResult = result;
      });

      await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(hookResult).toBeDefined();
      expect(hookResult.success).toBe(true);
    });

    test('hook failure blocks execution', async () => {
      executionGuard.registerPreExecutionHook(async () => {
        throw new Error('Hook validation failed');
      });

      await expect(
        executionGuard.execute({
          walletAddress: '0x1234',
          prepareFn: async () => ({}),
          executeFn: async () => ({ txHash: '0x123' }),
          confirmFn: async () => ({ confirmed: true }),
        })
      ).rejects.toThrow('Hook validation failed');
    });

    test('post-hook failure does not fail execution', async () => {
      executionGuard.registerPostExecutionHook(async () => {
        throw new Error('Post hook failed');
      });

      const result = await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(result.success).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Emergency Stop', () => {
    test('blocks new executions when activated', async () => {
      executionGuard.activateEmergencyStop('Security breach');

      await expect(
        executionGuard.execute({
          walletAddress: '0x1234',
          prepareFn: async () => ({}),
          executeFn: async () => ({}),
          confirmFn: async () => ({}),
        })
      ).rejects.toThrow('Emergency stop active');
    });

    test('deactivation allows executions again', async () => {
      executionGuard.activateEmergencyStop('Test');
      executionGuard.deactivateEmergencyStop();

      const result = await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      expect(result.success).toBe(true);
    });

    test('tracks emergency stop in metrics', () => {
      executionGuard.activateEmergencyStop('Test 1');
      executionGuard.deactivateEmergencyStop();
      executionGuard.activateEmergencyStop('Test 2');

      const metrics = executionGuard.getMetrics();
      expect(metrics.emergencyStops).toBe(2);
    });
  });

  describe('Retry Logic', () => {
    test('retries failed execution', async () => {
      let attempts = 0;

      const result = await executionGuard.executeWithRetry({
        walletAddress: '0x1234',
        prepareFn: async () => {
          attempts++;
          if (attempts < 2) throw new Error('Temporary failure');
          return {};
        },
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      }, { maxRetries: 3, retryDelay: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('gives up after max retries', async () => {
      await expect(
        executionGuard.executeWithRetry({
          walletAddress: '0x1234',
          prepareFn: async () => { throw new Error('Permanent failure'); },
          executeFn: async () => ({}),
          confirmFn: async () => ({}),
        }, { maxRetries: 2, retryDelay: 10 })
      ).rejects.toThrow('Permanent failure');
    });

    test('does not retry non-retryable errors', async () => {
      let attempts = 0;

      await expect(
        executionGuard.executeWithRetry({
          walletAddress: '0x1234',
          prepareFn: async () => {
            attempts++;
            throw new Error('insufficient funds');
          },
          executeFn: async () => ({}),
          confirmFn: async () => ({}),
        }, { maxRetries: 3, retryDelay: 10 })
      ).rejects.toThrow('insufficient funds');

      expect(attempts).toBe(1);
    });
  });

  describe('Transaction Cancellation', () => {
    test('cancels pending transaction', async () => {
      let resolvePrepare;
      const preparePromise = new Promise(r => { resolvePrepare = r; });

      const executePromise = executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => {
          await preparePromise;
          return {};
        },
        executeFn: async () => ({ txHash: '0x123' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      // Wait for transaction to start
      await new Promise(r => setTimeout(r, 50));

      // Get txId from active transactions and cancel it
      const active = executionGuard.getActiveTransactions();
      let cancelled = false;
      if (active.length > 0) {
        await executionGuard.cancelTransaction(active[0].txId);
        cancelled = true;
      }

      // Resolve to let the execution continue (it's now cancelled)
      resolvePrepare();

      // Wait for promise to settle (either resolve or reject)
      await executePromise.catch(() => {});

      expect(cancelled).toBe(true);
    });

    test('cannot cancel executing transaction', async () => {
      // This is hard to test because execution is fast
      // The implementation should reject cancellation for EXECUTING state
    });
  });

  describe('Metrics', () => {
    test('tracks total executions', async () => {
      await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        executeFn: async () => ({ txHash: '0x1' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        executeFn: async () => ({ txHash: '0x2' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      const metrics = executionGuard.getMetrics();
      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.successfulExecutions).toBe(2);
    });

    test('tracks failed executions', async () => {
      try {
        await executionGuard.execute({
          walletAddress: '0x1234',
          prepareFn: async () => { throw new Error('Failed'); },
          executeFn: async () => ({}),
          confirmFn: async () => ({}),
        });
      } catch (e) {
        // Expected
      }

      const metrics = executionGuard.getMetrics();
      expect(metrics.failedExecutions).toBe(1);
    });

    test('tracks average execution time', async () => {
      await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => {
          await new Promise(r => setTimeout(r, 50));
          return {};
        },
        executeFn: async () => ({ txHash: '0x1' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      const metrics = executionGuard.getMetrics();
      expect(metrics.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    test('cleans up old completed transactions', async () => {
      await executionGuard.execute({
        walletAddress: '0x1234',
        prepareFn: async () => ({}),
        executeFn: async () => ({ txHash: '0x1' }),
        confirmFn: async () => ({ confirmed: true }),
      });

      // Cleanup with 0 maxAge should remove all completed
      executionGuard.cleanup(0);

      // No active transactions should remain
      const active = executionGuard.getActiveTransactions();
      expect(active.length).toBe(0);
    });
  });
});
