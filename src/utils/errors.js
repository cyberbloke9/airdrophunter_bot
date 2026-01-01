/**
 * Custom Error Classes
 * Standardized error handling across the application
 */

/**
 * Base error class for the application
 */
class AirdropHunterError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * Configuration errors
 */
class ConfigurationError extends AirdropHunterError {
  constructor(message, details = {}) {
    super(message, 'CONFIG_ERROR', details);
  }
}

/**
 * Wallet-related errors
 */
class WalletError extends AirdropHunterError {
  constructor(message, details = {}) {
    super(message, 'WALLET_ERROR', details);
  }
}

/**
 * Insufficient balance error
 */
class InsufficientBalanceError extends WalletError {
  constructor(token, required, available) {
    super(`Insufficient ${token} balance. Required: ${required}, Available: ${available}`, {
      token,
      required,
      available,
    });
    this.code = 'INSUFFICIENT_BALANCE';
  }
}

/**
 * Transaction errors
 */
class TransactionError extends AirdropHunterError {
  constructor(message, txHash = null, details = {}) {
    super(message, 'TRANSACTION_ERROR', { txHash, ...details });
    this.txHash = txHash;
  }
}

/**
 * Slippage exceeded error
 */
class SlippageExceededError extends TransactionError {
  constructor(expected, actual, maxSlippage) {
    super(`Slippage exceeded. Expected: ${expected}, Actual: ${actual}, Max: ${maxSlippage}%`, null, {
      expected,
      actual,
      maxSlippage,
    });
    this.code = 'SLIPPAGE_EXCEEDED';
  }
}

/**
 * Gas estimation error
 */
class GasEstimationError extends TransactionError {
  constructor(message, details = {}) {
    super(message, null, details);
    this.code = 'GAS_ESTIMATION_ERROR';
  }
}

/**
 * Chain/network errors
 */
class ChainError extends AirdropHunterError {
  constructor(message, chainId, details = {}) {
    super(message, 'CHAIN_ERROR', { chainId, ...details });
    this.chainId = chainId;
  }
}

/**
 * Unsupported chain error
 */
class UnsupportedChainError extends ChainError {
  constructor(chainId) {
    super(`Chain ${chainId} is not supported`, chainId);
    this.code = 'UNSUPPORTED_CHAIN';
  }
}

/**
 * RPC/Provider errors
 */
class ProviderError extends AirdropHunterError {
  constructor(message, chainId, details = {}) {
    super(message, 'PROVIDER_ERROR', { chainId, ...details });
    this.chainId = chainId;
  }
}

/**
 * AI/NLP errors
 */
class AIError extends AirdropHunterError {
  constructor(message, details = {}) {
    super(message, 'AI_ERROR', details);
  }
}

/**
 * Intent parsing error
 */
class IntentParsingError extends AIError {
  constructor(input, reason) {
    super(`Could not understand command: "${input}". ${reason}`, { input, reason });
    this.code = 'INTENT_PARSING_ERROR';
  }
}

/**
 * Rate limit error
 */
class RateLimitError extends AirdropHunterError {
  constructor(limitType, retryAfter = null) {
    super(`Rate limit exceeded for ${limitType}`, 'RATE_LIMIT', { limitType, retryAfter });
    this.retryAfter = retryAfter;
  }
}

/**
 * Validation error
 */
class ValidationError extends AirdropHunterError {
  constructor(field, message, value = undefined) {
    super(message, 'VALIDATION_ERROR', { field, value });
    this.field = field;
  }
}

/**
 * External API error
 */
class ExternalAPIError extends AirdropHunterError {
  constructor(service, message, statusCode = null) {
    super(`${service} API error: ${message}`, 'EXTERNAL_API_ERROR', { service, statusCode });
    this.service = service;
    this.statusCode = statusCode;
  }
}

/**
 * Wrap an error with additional context
 */
function wrapError(error, context = {}) {
  if (error instanceof AirdropHunterError) {
    error.details = { ...error.details, ...context };
    return error;
  }

  return new AirdropHunterError(error.message, 'UNKNOWN_ERROR', {
    originalError: error.name,
    ...context,
  });
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error) {
  const retryableCodes = [
    'PROVIDER_ERROR',
    'RATE_LIMIT',
    'EXTERNAL_API_ERROR',
  ];

  if (error instanceof AirdropHunterError) {
    return retryableCodes.includes(error.code);
  }

  // Check for common network errors
  const retryableMessages = [
    'timeout',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'network',
    'rate limit',
  ];

  const message = error.message?.toLowerCase() || '';
  return retryableMessages.some(m => message.includes(m));
}

module.exports = {
  AirdropHunterError,
  ConfigurationError,
  WalletError,
  InsufficientBalanceError,
  TransactionError,
  SlippageExceededError,
  GasEstimationError,
  ChainError,
  UnsupportedChainError,
  ProviderError,
  AIError,
  IntentParsingError,
  RateLimitError,
  ValidationError,
  ExternalAPIError,
  wrapError,
  isRetryableError,
};
