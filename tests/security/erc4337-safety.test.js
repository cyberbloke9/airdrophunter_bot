/**
 * ERC-4337 Safety Module Tests
 *
 * Tests for account abstraction security including:
 * - EntryPoint verification
 * - Bundler management
 * - Paymaster validation
 * - UserOperation validation
 * - Gas limit checks
 */

const {
  ERC4337Safety,
  createERC4337Safety,
  UserOperationValidator,
  EntryPointVerifier,
  BundlerManager,
  PaymasterVerifier,
  CANONICAL_ENTRYPOINTS,
  WHITELISTED_BUNDLERS,
  GAS_LIMITS,
  PAYMASTER_SETTINGS,
  DEFAULT_ENTRYPOINT_VERSION,
} = require('../../src/security/erc4337-safety');

describe('ERC-4337 Safety Module', () => {
  let erc4337Safety;

  beforeEach(() => {
    erc4337Safety = createERC4337Safety();
  });

  describe('Constants', () => {
    test('should have canonical EntryPoint v0.6.0', () => {
      expect(CANONICAL_ENTRYPOINTS['v0.6.0']).toBeDefined();
      expect(CANONICAL_ENTRYPOINTS['v0.6.0'].address).toBe(
        '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
      );
    });

    test('should have canonical EntryPoint v0.7.0', () => {
      expect(CANONICAL_ENTRYPOINTS['v0.7.0']).toBeDefined();
      expect(CANONICAL_ENTRYPOINTS['v0.7.0'].address).toBe(
        '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
      );
    });

    test('should have whitelisted bundlers', () => {
      expect(WHITELISTED_BUNDLERS.biconomy).toBeDefined();
      expect(WHITELISTED_BUNDLERS.stackup).toBeDefined();
      expect(WHITELISTED_BUNDLERS.pimlico).toBeDefined();
      expect(WHITELISTED_BUNDLERS.alchemy).toBeDefined();
    });

    test('should have gas limits', () => {
      expect(GAS_LIMITS.maxCallGasLimit).toBe(1_000_000);
      expect(GAS_LIMITS.maxVerificationGasLimit).toBe(500_000);
      expect(GAS_LIMITS.maxPreVerificationGas).toBe(200_000);
    });

    test('should have paymaster settings', () => {
      expect(PAYMASTER_SETTINGS.maxGas).toBe(500_000);
      expect(PAYMASTER_SETTINGS.minStake).toBe(0.5);
      expect(PAYMASTER_SETTINGS.minUnstakeDelay).toBe(86400);
    });

    test('should default to v0.6.0 EntryPoint', () => {
      expect(DEFAULT_ENTRYPOINT_VERSION).toBe('v0.6.0');
    });
  });

  describe('UserOperationValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new UserOperationValidator();
    });

    test('should validate complete UserOperation', () => {
      const userOp = {
        sender: '0x1234567890123456789012345678901234567890',
        nonce: '0x0',
        initCode: '0x',
        callData: '0x12345678',
        callGasLimit: '100000',
        verificationGasLimit: '100000',
        preVerificationGas: '50000',
        maxFeePerGas: '10000000000',
        maxPriorityFeePerGas: '1000000000',
        paymasterAndData: '0x',
        signature: '0x1234567890',
      };

      const result = validator.validate(userOp);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('should reject missing required fields', () => {
      const userOp = {
        sender: '0x1234567890123456789012345678901234567890',
      };

      const result = validator.validate(userOp);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject invalid sender address', () => {
      const userOp = {
        sender: 'invalid',
        nonce: '0x0',
        initCode: '0x',
        callData: '0x',
        callGasLimit: '100000',
        verificationGasLimit: '100000',
        preVerificationGas: '50000',
        maxFeePerGas: '10000000000',
        maxPriorityFeePerGas: '1000000000',
        paymasterAndData: '0x',
        signature: '0x1234567890',
      };

      const result = validator.validate(userOp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sender'))).toBe(true);
    });

    test('should reject callGasLimit exceeding maximum', () => {
      const userOp = {
        sender: '0x1234567890123456789012345678901234567890',
        nonce: '0x0',
        initCode: '0x',
        callData: '0x',
        callGasLimit: '2000000', // Exceeds 1M max
        verificationGasLimit: '100000',
        preVerificationGas: '50000',
        maxFeePerGas: '10000000000',
        maxPriorityFeePerGas: '1000000000',
        paymasterAndData: '0x',
        signature: '0x1234567890',
      };

      const result = validator.validate(userOp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('callGasLimit'))).toBe(true);
    });

    test('should reject verificationGasLimit exceeding maximum', () => {
      const userOp = {
        sender: '0x1234567890123456789012345678901234567890',
        nonce: '0x0',
        initCode: '0x',
        callData: '0x',
        callGasLimit: '100000',
        verificationGasLimit: '1000000', // Exceeds 500K max
        preVerificationGas: '50000',
        maxFeePerGas: '10000000000',
        maxPriorityFeePerGas: '1000000000',
        paymasterAndData: '0x',
        signature: '0x1234567890',
      };

      const result = validator.validate(userOp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('verificationGasLimit'))).toBe(true);
    });

    test('should reject priorityFee > maxFee', () => {
      const userOp = {
        sender: '0x1234567890123456789012345678901234567890',
        nonce: '0x0',
        initCode: '0x',
        callData: '0x',
        callGasLimit: '100000',
        verificationGasLimit: '100000',
        preVerificationGas: '50000',
        maxFeePerGas: '1000000000',
        maxPriorityFeePerGas: '10000000000', // Greater than maxFee
        paymasterAndData: '0x',
        signature: '0x1234567890',
      };

      const result = validator.validate(userOp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Priority'))).toBe(true);
    });

    test('should warn on very high gas fees', () => {
      const userOp = {
        sender: '0x1234567890123456789012345678901234567890',
        nonce: '0x0',
        initCode: '0x',
        callData: '0x12345678',
        callGasLimit: '100000',
        verificationGasLimit: '100000',
        preVerificationGas: '50000',
        maxFeePerGas: '1000000000000', // 1000 gwei - very high
        maxPriorityFeePerGas: '1000000000',
        paymasterAndData: '0x',
        signature: '0x1234567890',
      };

      const result = validator.validate(userOp);
      expect(result.warnings.some(w => w.includes('high'))).toBe(true);
    });

    test('should reject null signature attack', () => {
      const userOp = {
        sender: '0x1234567890123456789012345678901234567890',
        nonce: '0x0',
        initCode: '0x',
        callData: '0x',
        callGasLimit: '100000',
        verificationGasLimit: '100000',
        preVerificationGas: '50000',
        maxFeePerGas: '10000000000',
        maxPriorityFeePerGas: '1000000000',
        paymasterAndData: '0x',
        signature: '0x0000000000', // Null signature
      };

      const result = validator.validate(userOp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('null signature'))).toBe(true);
    });

    test('should calculate UserOp hash', () => {
      const userOp = {
        sender: '0x1234567890123456789012345678901234567890',
        nonce: '0x0',
        initCode: '0x',
        callData: '0x12345678',
        callGasLimit: '100000',
        verificationGasLimit: '100000',
        preVerificationGas: '50000',
        maxFeePerGas: '10000000000',
        maxPriorityFeePerGas: '1000000000',
        paymasterAndData: '0x',
        signature: '0x',
      };

      const hash = validator.calculateUserOpHash(
        userOp,
        '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
        1
      );

      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('EntryPointVerifier', () => {
    let verifier;

    beforeEach(() => {
      verifier = new EntryPointVerifier();
    });

    test('should verify canonical EntryPoint v0.6.0', () => {
      const result = verifier.verify(
        '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
        1
      );

      expect(result.valid).toBe(true);
      expect(result.canonical).toBe(true);
      expect(result.version).toBe('v0.6.0');
    });

    test('should verify canonical EntryPoint v0.7.0', () => {
      const result = verifier.verify(
        '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
        1
      );

      expect(result.valid).toBe(true);
      expect(result.canonical).toBe(true);
      expect(result.version).toBe('v0.7.0');
    });

    test('should reject non-canonical EntryPoint by default', () => {
      const result = verifier.verify(
        '0x1234567890123456789012345678901234567890',
        1
      );

      expect(result.valid).toBe(false);
      expect(result.canonical).toBe(false);
    });

    test('should allow non-canonical when configured', () => {
      const permissiveVerifier = new EntryPointVerifier({
        allowNonCanonical: true,
      });

      const result = permissiveVerifier.verify(
        '0x1234567890123456789012345678901234567890',
        1
      );

      expect(result.valid).toBe(true);
      expect(result.canonical).toBe(false);
      expect(result.warning).toBeDefined();
    });

    test('should reject EntryPoint not deployed on chain', () => {
      const result = verifier.verify(
        '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
        99999 // Unknown chain
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not deployed');
    });

    test('should get canonical EntryPoint for chain', () => {
      const ep = verifier.getCanonicalEntryPoint(1);

      expect(ep).toBeDefined();
      expect(ep.address).toBe('0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789');
      expect(ep.version).toBe('v0.6.0');
    });

    test('should return null for unsupported chain', () => {
      const ep = verifier.getCanonicalEntryPoint(99999);
      expect(ep).toBeNull();
    });

    test('should support custom EntryPoints', () => {
      verifier.addCustomEntryPoint(1, '0xCustomEntryPoint123456789012345678901234', 'Custom EP');

      const result = verifier.verify(
        '0xCustomEntryPoint123456789012345678901234',
        1
      );

      expect(result.valid).toBe(true);
      expect(result.custom).toBe(true);
    });
  });

  describe('BundlerManager', () => {
    let manager;

    beforeEach(() => {
      manager = new BundlerManager();
    });

    test('should get available bundlers for chain', () => {
      const bundlers = manager.getAvailableBundlers(1);

      expect(bundlers.length).toBeGreaterThan(0);
      expect(bundlers[0].endpoint).toBeDefined();
    });

    test('should select best bundler', () => {
      const result = manager.selectBundler(1);

      expect(result.selected).toBeDefined();
      expect(result.selected.reliability).toBeGreaterThan(0);
    });

    test('should filter by required features', () => {
      const result = manager.selectBundler(1, {
        requiredFeatures: ['sponsorship'],
      });

      if (result.selected) {
        expect(result.selected.features).toContain('sponsorship');
      }
    });

    test('should provide alternates', () => {
      const result = manager.selectBundler(1);

      expect(result.alternates).toBeDefined();
      expect(Array.isArray(result.alternates)).toBe(true);
    });

    test('should track bundler health', () => {
      manager.reportHealth('biconomy', false, { error: 'timeout' });

      const bundlers = manager.getAvailableBundlers(1);
      const biconomy = bundlers.find(b => b.id === 'biconomy');

      expect(biconomy.healthy).toBe(false);
    });

    test('should emit health change event', (done) => {
      manager.on('healthChange', (event) => {
        expect(event.bundlerId).toBe('stackup');
        expect(event.healthy).toBe(false);
        done();
      });

      manager.reportHealth('stackup', false);
    });

    test('should add custom bundler', () => {
      manager.addCustomBundler('custom', {
        endpoint: 'https://custom.bundler.io',
        name: 'Custom Bundler',
        supportedChains: [1, 137],
        features: ['batching'],
      });

      const bundlers = manager.getAvailableBundlers(1);
      const custom = bundlers.find(b => b.id === 'custom');

      expect(custom).toBeDefined();
      expect(custom.custom).toBe(true);
    });

    test('should remove custom bundler', () => {
      manager.addCustomBundler('toremove', {
        endpoint: 'https://remove.io',
        supportedChains: [1],
      });

      manager.removeCustomBundler('toremove');

      const bundlers = manager.getAvailableBundlers(1);
      const removed = bundlers.find(b => b.id === 'toremove');

      expect(removed).toBeUndefined();
    });

    test('should return statistics', () => {
      const stats = manager.getStatistics();

      expect(stats.whitelisted).toBeGreaterThan(0);
      expect(stats.healthy).toBeDefined();
      expect(stats.requestsByBundler).toBeDefined();
    });

    test('should handle fallback when all unhealthy', () => {
      // Mark all bundlers unhealthy
      Object.keys(WHITELISTED_BUNDLERS).forEach(id => {
        manager.reportHealth(id, false);
      });

      // With fallback enabled (default), should still return
      const result = manager.selectBundler(1);
      expect(result.selected).toBeDefined();
    });

    test('should fail when all unhealthy and fallback disabled', () => {
      const strictManager = new BundlerManager({ fallbackEnabled: false });

      // Mark all bundlers unhealthy
      Object.keys(WHITELISTED_BUNDLERS).forEach(id => {
        strictManager.reportHealth(id, false);
      });

      const result = strictManager.selectBundler(1);
      expect(result.selected).toBeNull();
      expect(result.reason).toContain('unhealthy');
    });
  });

  describe('PaymasterVerifier', () => {
    let verifier;

    beforeEach(() => {
      verifier = new PaymasterVerifier();
    });

    test('should allow no paymaster', () => {
      const result = verifier.verify('0x', 1);

      expect(result.valid).toBe(true);
      expect(result.hasPaymaster).toBe(false);
    });

    test('should reject invalid paymaster data', () => {
      const result = verifier.verify('0x1234', 1); // Too short

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('length');
    });

    test('should accept verified paymaster', () => {
      const paymasterAddress = '0x1234567890123456789012345678901234567890';

      verifier.registerVerifiedPaymaster(1, paymasterAddress, {
        name: 'Test Paymaster',
      });

      const result = verifier.verify(
        paymasterAddress + '0000000000000000',
        1
      );

      expect(result.valid).toBe(true);
      expect(result.verified).toBe(true);
    });

    test('should reject blacklisted paymaster', () => {
      // Create verifier that doesn't require verification
      const permissiveVerifier = new PaymasterVerifier({ requireVerification: false });
      const paymasterAddress = '0xBadPaymaster12345678901234567890123456';

      permissiveVerifier.blacklistPaymaster(paymasterAddress, 'Exploit detected');

      const result = permissiveVerifier.verify(
        paymasterAddress + '0000000000000000',
        1
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('blacklist');
    });

    test('should validate gas limits', () => {
      const userOp = {
        paymasterVerificationGasLimit: '1000000', // Exceeds 500K max
      };

      const result = verifier.validateGasLimits(userOp);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds');
    });

    test('should check paymaster stake', () => {
      const sufficientStake = verifier.checkStake({
        stake: '1.0',
        unstakeDelaySec: 100000,
      });

      expect(sufficientStake.sufficient).toBe(true);

      const insufficientStake = verifier.checkStake({
        stake: '0.1', // Below 0.5 min
        unstakeDelaySec: 100000,
      });

      expect(insufficientStake.sufficient).toBe(false);
    });
  });

  describe('ERC4337Safety', () => {
    describe('Initialization', () => {
      test('should create with default options', () => {
        const safety = new ERC4337Safety();
        expect(safety).toBeDefined();
        expect(safety.getStatus().healthy).toBe(true);
      });

      test('should accept custom options', () => {
        const safety = new ERC4337Safety({
          strictValidation: false,
          rejectNonCanonical: false,
        });

        const status = safety.getStatus();
        expect(status.strictMode).toBe(false);
        expect(status.rejectNonCanonical).toBe(false);
      });
    });

    describe('Full Validation', () => {
      test('should validate complete submission', async () => {
        const userOp = {
          sender: '0x1234567890123456789012345678901234567890',
          nonce: '0x0',
          initCode: '0x',
          callData: '0x12345678',
          callGasLimit: '100000',
          verificationGasLimit: '100000',
          preVerificationGas: '50000',
          maxFeePerGas: '10000000000',
          maxPriorityFeePerGas: '1000000000',
          paymasterAndData: '0x',
          signature: '0x1234567890',
        };

        const result = await erc4337Safety.validateSubmission(
          userOp,
          '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
          1
        );

        expect(result.valid).toBe(true);
        expect(result.entryPoint.valid).toBe(true);
        expect(result.userOp.valid).toBe(true);
        expect(result.bundler.selected).toBeDefined();
      });

      test('should reject invalid submission', async () => {
        const userOp = {
          sender: 'invalid',
          nonce: '0x0',
        };

        const result = await erc4337Safety.validateSubmission(
          userOp,
          '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
          1
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      test('should reject non-canonical EntryPoint', async () => {
        const userOp = {
          sender: '0x1234567890123456789012345678901234567890',
          nonce: '0x0',
          initCode: '0x',
          callData: '0x',
          callGasLimit: '100000',
          verificationGasLimit: '100000',
          preVerificationGas: '50000',
          maxFeePerGas: '10000000000',
          maxPriorityFeePerGas: '1000000000',
          paymasterAndData: '0x',
          signature: '0x1234567890',
        };

        const result = await erc4337Safety.validateSubmission(
          userOp,
          '0xFakeEntryPoint123456789012345678901234567',
          1
        );

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('EntryPoint'))).toBe(true);
      });
    });

    describe('Helper Methods', () => {
      test('should get canonical EntryPoint', () => {
        const ep = erc4337Safety.getEntryPoint(1);

        expect(ep).toBeDefined();
        expect(ep.address).toBeDefined();
        expect(ep.version).toBeDefined();
      });

      test('should get recommended bundler', () => {
        const result = erc4337Safety.getBundler(1);

        expect(result.selected).toBeDefined();
      });

      test('should register paymaster', () => {
        erc4337Safety.registerPaymaster(
          1,
          '0x1234567890123456789012345678901234567890',
          { name: 'Test PM' }
        );

        // Should not throw
        expect(true).toBe(true);
      });

      test('should blacklist paymaster', () => {
        const result = erc4337Safety.blacklistPaymaster(
          '0xBadPaymaster12345678901234567890123456',
          'Exploit'
        );

        expect(result.blacklistedAt).toBeDefined();
      });

      test('should report bundler health', () => {
        erc4337Safety.reportBundlerHealth('biconomy', true);
        // Should not throw
        expect(true).toBe(true);
      });

      test('should calculate UserOp hash', () => {
        const userOp = {
          sender: '0x1234567890123456789012345678901234567890',
          nonce: '0x0',
          initCode: '0x',
          callData: '0x',
          callGasLimit: '100000',
          verificationGasLimit: '100000',
          preVerificationGas: '50000',
          maxFeePerGas: '10000000000',
          maxPriorityFeePerGas: '1000000000',
          paymasterAndData: '0x',
          signature: '0x',
        };

        const hash = erc4337Safety.calculateUserOpHash(
          userOp,
          '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
          1
        );

        expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
      });
    });

    describe('Statistics', () => {
      test('should track validation statistics', async () => {
        const userOp = {
          sender: '0x1234567890123456789012345678901234567890',
          nonce: '0x0',
          initCode: '0x',
          callData: '0x',
          callGasLimit: '100000',
          verificationGasLimit: '100000',
          preVerificationGas: '50000',
          maxFeePerGas: '10000000000',
          maxPriorityFeePerGas: '1000000000',
          paymasterAndData: '0x',
          signature: '0x1234567890',
        };

        await erc4337Safety.validateSubmission(
          userOp,
          '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
          1
        );

        const stats = erc4337Safety.getStatistics();
        expect(stats.validation.validatedOps).toBeGreaterThan(0);
      });
    });

    describe('Status', () => {
      test('should return comprehensive status', () => {
        const status = erc4337Safety.getStatus();

        expect(status.healthy).toBe(true);
        expect(status.strictMode).toBeDefined();
        expect(status.entryPointVersions).toContain('v0.6.0');
        expect(status.bundlerCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Factory Function', () => {
    test('should create instance with defaults', () => {
      const safety = createERC4337Safety();
      expect(safety).toBeInstanceOf(ERC4337Safety);
    });

    test('should create instance with options', () => {
      const safety = createERC4337Safety({
        strictValidation: false,
      });
      expect(safety).toBeInstanceOf(ERC4337Safety);
    });
  });
});

describe('Integration Tests', () => {
  test('full UserOperation submission flow', async () => {
    const safety = createERC4337Safety();

    // 1. Get canonical EntryPoint
    const ep = safety.getEntryPoint(1);
    expect(ep.address).toBeDefined();

    // 2. Get bundler
    const bundler = safety.getBundler(1, {
      requiredFeatures: ['sponsorship'],
    });
    expect(bundler.selected).toBeDefined();

    // 3. Create and validate UserOp
    const userOp = {
      sender: '0x1234567890123456789012345678901234567890',
      nonce: '0x0',
      initCode: '0x',
      callData: '0xabcdef00',
      callGasLimit: '200000',
      verificationGasLimit: '150000',
      preVerificationGas: '50000',
      maxFeePerGas: '20000000000',
      maxPriorityFeePerGas: '2000000000',
      paymasterAndData: '0x',
      signature: '0x1234567890abcdef',
    };

    const validation = await safety.validateSubmission(userOp, ep.address, 1);

    expect(validation.valid).toBe(true);
    expect(validation.entryPoint.canonical).toBe(true);
    expect(validation.userOp.valid).toBe(true);

    // 4. Calculate hash for signing
    const hash = safety.calculateUserOpHash(userOp, ep.address, 1);
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);

    // 5. Check statistics
    const stats = safety.getStatistics();
    expect(stats.validation.validatedOps).toBeGreaterThan(0);
  });
});
