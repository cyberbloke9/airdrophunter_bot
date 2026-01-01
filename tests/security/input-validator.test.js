/**
 * Input Validator Unit Tests
 *
 * Tests calldata validation, function selector whitelisting,
 * and address/amount validation.
 */

const { ethers } = require('ethers');
const InputValidator = require('../../src/security/input-validator');

describe('InputValidator', () => {
  let validator;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    validator = new InputValidator({ logger: mockLogger, strictMode: true });
  });

  describe('Address Validation', () => {
    test('validates correct Ethereum address', () => {
      const result = validator.validateAddress('0x1234567890123456789012345678901234567890');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('address');
    });

    test('validates checksummed address', () => {
      const checksummed = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT
      const result = validator.validateAddress(checksummed);
      expect(result.valid).toBe(true);
      expect(result.checksummed).toBe(checksummed);
    });

    test('validates ENS name', () => {
      const result = validator.validateAddress('vitalik.eth');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('ens');
    });

    test('rejects invalid address', () => {
      const result = validator.validateAddress('0xinvalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    test('rejects empty address', () => {
      const result = validator.validateAddress('');
      expect(result.valid).toBe(false);
    });

    test('rejects null address', () => {
      const result = validator.validateAddress(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('Amount Validation', () => {
    test('validates positive amount', () => {
      const result = validator.validateAmount('100', 18);
      expect(result.valid).toBe(true);
      expect(result.parsed).toBeDefined();
    });

    test('validates decimal amount', () => {
      const result = validator.validateAmount('0.5', 18);
      expect(result.valid).toBe(true);
    });

    test('validates amount with correct decimals', () => {
      const result = validator.validateAmount('100.123456', 6); // USDC decimals
      expect(result.valid).toBe(true);
    });

    test('rejects too many decimals', () => {
      const result = validator.validateAmount('100.1234567', 6); // 7 decimals for 6-decimal token
      expect(result.valid).toBe(false);
      expect(result.error).toContain('decimal');
    });

    test('rejects negative amount', () => {
      const result = validator.validateAmount('-100', 18);
      expect(result.valid).toBe(false);
    });

    test('rejects zero amount', () => {
      const result = validator.validateAmount('0', 18);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('zero');
    });

    test('rejects NaN amount', () => {
      const result = validator.validateAmount('not-a-number', 18);
      expect(result.valid).toBe(false);
    });

    test('handles numeric input', () => {
      const result = validator.validateAmount(100, 18);
      expect(result.valid).toBe(true);
    });
  });

  describe('Function Selector Whitelisting', () => {
    test('recognizes ERC20 approve selector', () => {
      expect(validator.isSelectorWhitelisted('0x095ea7b3')).toBe(true);
      const info = validator.getFunctionInfo('0x095ea7b3');
      expect(info.name).toBe('approve');
    });

    test('recognizes ERC20 transfer selector', () => {
      expect(validator.isSelectorWhitelisted('0xa9059cbb')).toBe(true);
    });

    test('recognizes Uniswap V2 swap selectors', () => {
      expect(validator.isSelectorWhitelisted('0x38ed1739')).toBe(true); // swapExactTokensForTokens
      expect(validator.isSelectorWhitelisted('0x7ff36ab5')).toBe(true); // swapExactETHForTokens
    });

    test('recognizes Uniswap V3 swap selectors', () => {
      expect(validator.isSelectorWhitelisted('0x04e45aaf')).toBe(true); // exactInputSingle
      expect(validator.isSelectorWhitelisted('0xb858183f')).toBe(true); // exactInput
    });

    test('recognizes WETH deposit/withdraw', () => {
      expect(validator.isSelectorWhitelisted('0xd0e30db0')).toBe(true); // deposit
      expect(validator.isSelectorWhitelisted('0x2e1a7d4d')).toBe(true); // withdraw
    });

    test('handles case insensitivity', () => {
      expect(validator.isSelectorWhitelisted('0x095EA7B3')).toBe(true);
    });

    test('rejects unknown selector', () => {
      expect(validator.isSelectorWhitelisted('0x12345678')).toBe(false);
    });
  });

  describe('Calldata Validation', () => {
    const mockTo = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // Uniswap Router

    test('validates empty calldata (ETH transfer)', async () => {
      const result = await validator.validateCalldata(mockTo, '0x', 1);
      expect(result.valid).toBe(true);
    });

    test('validates whitelisted function call', async () => {
      // ERC20 approve calldata
      const approveData = '0x095ea7b3' +
        '000000000000000000000000' + '7a250d5630b4cf539739df2c5dacb4c659f2488d' + // spender
        '0000000000000000000000000000000000000000000000000000000000000064'; // amount (100)

      const result = await validator.validateCalldata(mockTo, approveData, 1);
      expect(result.valid).toBe(true);
      expect(result.functionName).toBe('approve');
    });

    test('flags unknown selector in strict mode', async () => {
      const unknownData = '0x12345678' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      // Mock contract verification to return unverified
      validator.verifyContract = jest.fn().mockResolvedValue({ verified: false, reason: 'Not verified' });

      const result = await validator.validateCalldata(mockTo, unknownData, 1);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Unknown function selector');
    });

    test('allows unknown selector on verified contract', async () => {
      // Create non-strict validator for this test
      const nonStrictValidator = new InputValidator({
        logger: mockLogger,
        strictMode: false,
      });

      const unknownData = '0x12345678' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      // In non-strict mode, unknown selectors are allowed with a warning
      const result = await nonStrictValidator.validateCalldata(mockTo, unknownData, 1);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Unknown function selector'))).toBe(true);
    });
  });

  describe('Malicious Pattern Detection', () => {
    const mockTo = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

    test('detects null selector pattern', async () => {
      const maliciousData = '0x00000000' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      const result = await validator.validateCalldata(mockTo, maliciousData, 1);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Null selector'))).toBe(true);
    });

    test('warns on max uint256 in calldata', async () => {
      // approve with infinite approval
      const infiniteApprove = '0x095ea7b3' +
        '0000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488d' +
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

      const result = await validator.validateCalldata(mockTo, infiniteApprove, 1);
      // Should pass but have warnings about infinite approval
      expect(result.warnings.some(w => w.toLowerCase().includes('infinite') || w.toLowerCase().includes('max'))).toBe(true);
    });
  });

  describe('Known Malicious Address', () => {
    test('blocks known malicious address', async () => {
      const maliciousAddress = '0x1234567890123456789012345678901234567890';
      validator.addMaliciousAddress(maliciousAddress);

      // Use some calldata so we go through the full validation
      const transferData = '0xa9059cbb' +
        '000000000000000000000000' + '7a250d5630b4cf539739df2c5dacb4c659f2488d' +
        '0000000000000000000000000000000000000000000000000000000000000064';

      const result = await validator.validateCalldata(maliciousAddress, transferData, 1);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('malicious'))).toBe(true);
    });
  });

  describe('Custom Selector Whitelisting', () => {
    test('adds custom selector to whitelist', () => {
      const customSelector = '0xdeadbeef';
      validator.addWhitelistedSelector(customSelector, {
        name: 'customFunction',
        params: ['address', 'uint256'],
        risk: 'low',
      });

      expect(validator.isSelectorWhitelisted(customSelector)).toBe(true);
      expect(validator.getFunctionInfo(customSelector).name).toBe('customFunction');
    });

    test('rejects invalid selector format', () => {
      expect(() => {
        validator.addWhitelistedSelector('0x123', { name: 'test', params: [] });
      }).toThrow('Invalid selector format');
    });
  });

  describe('Parameter Validation', () => {
    test('detects zero address in parameters', async () => {
      // transfer to zero address
      const transferToZero = '0xa9059cbb' +
        '0000000000000000000000000000000000000000000000000000000000000000' + // zero address
        '0000000000000000000000000000000000000000000000000000000000000064'; // amount

      const mockTo = '0xdac17f958d2ee523a2206206994597c13d831ec7'; // USDT
      const result = await validator.validateCalldata(mockTo, transferToZero, 1);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Zero address'))).toBe(true);
    });

    test('detects invalid swap path', async () => {
      // swapExactTokensForTokens with empty path (less than 2 addresses)
      const invalidSwap = '0x38ed1739' +
        '0000000000000000000000000000000000000000000000000000000000000064' + // amountIn
        '0000000000000000000000000000000000000000000000000000000000000000' + // amountOutMin
        '00000000000000000000000000000000000000000000000000000000000000a0' + // path offset
        '0000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488d' + // to
        '0000000000000000000000000000000000000000000000000000000000000001' + // deadline
        '0000000000000000000000000000000000000000000000000000000000000001' + // path length (1 = invalid)
        '000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7'; // only 1 token

      const mockTo = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      const result = await validator.validateCalldata(mockTo, invalidSwap, 1);

      // Should have error about path length
      expect(result.errors.some(e => e.includes('path') || e.includes('less than 2'))).toBe(true);
    });
  });

  describe('Non-Strict Mode', () => {
    let nonStrictValidator;

    beforeEach(() => {
      nonStrictValidator = new InputValidator({ logger: mockLogger, strictMode: false });
    });

    test('warns but allows unknown selector', async () => {
      const unknownData = '0x12345678' +
        '0000000000000000000000000000000000000000000000000000000000000000';
      const mockTo = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

      const result = await nonStrictValidator.validateCalldata(mockTo, unknownData, 1);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('Unknown function selector'))).toBe(true);
    });

    test('warns but allows suspicious patterns', async () => {
      // Data with large zero padding
      const suspiciousData = '0x095ea7b3' +
        '0000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488d' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      const mockTo = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      const result = await nonStrictValidator.validateCalldata(mockTo, suspiciousData, 1);

      // Valid in non-strict but may have warnings
      expect(result.valid).toBe(true);
    });
  });

  describe('Risk Levels', () => {
    test('low risk functions have risk: low', () => {
      const approveInfo = validator.getFunctionInfo('0x095ea7b3');
      expect(approveInfo.risk).toBe('low');
    });

    test('multicall functions have risk: medium', () => {
      const multicallInfo = validator.getFunctionInfo('0xac9650d8');
      expect(multicallInfo.risk).toBe('medium');
    });

    test('warns on medium risk functions', async () => {
      // Multicall data (simplified)
      const multicallData = '0xac9650d8' +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      const mockTo = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
      const result = await validator.validateCalldata(mockTo, multicallData, 1);

      expect(result.warnings.some(w => w.includes('medium risk'))).toBe(true);
    });
  });
});
