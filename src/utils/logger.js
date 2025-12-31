/**
 * Logger Utility
 * Centralized logging with multiple output formats
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];
const isJson = process.env.LOG_FORMAT === 'json';

/**
 * Format a log message
 */
function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();

  if (isJson) {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
    });
  }

  const metaStr = Object.keys(meta).length > 0
    ? ' ' + JSON.stringify(meta)
    : '';

  return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
}

/**
 * Log at a specific level
 */
function log(level, message, meta = {}) {
  if (LOG_LEVELS[level] > currentLevel) return;

  const formatted = formatMessage(level, message, meta);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

const logger = {
  error: (message, meta = {}) => log('error', message, meta),
  warn: (message, meta = {}) => log('warn', message, meta),
  info: (message, meta = {}) => log('info', message, meta),
  debug: (message, meta = {}) => log('debug', message, meta),
  trace: (message, meta = {}) => log('trace', message, meta),

  // Transaction-specific logging
  tx: (action, txHash, details = {}) => {
    log('info', `[TX] ${action}`, { txHash, ...details });
  },

  // AI-specific logging
  ai: (action, details = {}) => {
    log('info', `[AI] ${action}`, details);
  },
};

module.exports = logger;
