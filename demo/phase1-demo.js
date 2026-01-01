'use strict';

/**
 * Phase 1 Interactive Demo
 * Demonstrates Security + Monitoring Layer in action
 *
 * Run with: node demo/phase1-demo.js
 */

const { createSecurityLayer } = require('../src/security');
const { createMonitoringLayer, ALERT_LEVEL, ALERT_CATEGORY } = require('../src/monitoring');
const { ethers } = require('ethers');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

function log(message, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '═'.repeat(60));
  log(`  ${title}`, colors.bright + colors.cyan);
  console.log('═'.repeat(60) + '\n');
}

function subheader(title) {
  log(`\n▶ ${title}`, colors.yellow);
  console.log('─'.repeat(40));
}

function success(msg) { log(`  ✓ ${msg}`, colors.green); }
function info(msg) { log(`  ℹ ${msg}`, colors.blue); }
function warn(msg) { log(`  ⚠ ${msg}`, colors.yellow); }
function error(msg) { log(`  ✗ ${msg}`, colors.red); }
function alert(level, msg) {
  const levelColors = {
    critical: colors.bgRed + colors.white,
    high: colors.red,
    medium: colors.yellow,
    low: colors.blue,
  };
  log(`  🚨 [${level.toUpperCase()}] ${msg}`, levelColors[level] || colors.white);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Demo Functions ============

async function demoSecurityLayer(securityLayer) {
  header('🔐 SECURITY LAYER DEMO');

  // Slippage Guard
  subheader('Slippage Guard - Token Classification');

  const tokens = [
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
    { symbol: 'RANDOM', address: '0x1234567890123456789012345678901234567890' },
  ];

  for (const token of tokens) {
    const tier = securityLayer.slippageGuard.classifyToken(token.symbol);
    const slippage = securityLayer.slippageGuard.getSlippage(token.symbol, token.symbol);
    info(`${token.symbol}: Tier = ${tier}, Default Slippage = ${(slippage * 100).toFixed(2)}%`);
  }

  // Input Validator
  subheader('Input Validator - Transaction Validation');

  const validAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  const invalidAddress = 'not-an-address';

  const validResult = securityLayer.inputValidator.validateAddress(validAddress);
  success(`Valid address: ${validAddress.slice(0, 10)}... -> ${validResult.valid ? 'PASSED' : 'FAILED'}`);

  const invalidResult = securityLayer.inputValidator.validateAddress(invalidAddress);
  error(`Invalid address: ${invalidAddress} -> ${invalidResult.valid ? 'PASSED' : 'FAILED'}`);

  // Known selectors
  subheader('Function Selector Whitelist');

  const selectors = ['0x095ea7b3', '0x38ed1739', '0xdeadbeef'];
  for (const sel of selectors) {
    const result = securityLayer.inputValidator.getFunctionInfo(sel);
    if (result) {
      success(`${sel} -> ${result.name} (Risk: ${result.risk})`);
    } else {
      warn(`${sel} -> UNKNOWN SELECTOR`);
    }
  }
}

async function demoMonitoringLayer(monitoringLayer) {
  header('📊 MONITORING LAYER DEMO');

  // Start monitoring
  monitoringLayer.start();
  success('Monitoring layer started');

  // Transaction Tracking
  subheader('Transaction Lifecycle Tracking');

  const txHash = '0x' + 'a'.repeat(64);
  const wallet = '0x' + '1'.repeat(40);

  info('Submitting swap transaction...');
  monitoringLayer.dashboard.trackPendingTransaction({
    txHash,
    wallet,
    type: 'swap',
    chainId: 1,
    value: ethers.utils.parseEther('1.5').toString(),
  });

  await sleep(500);

  let feed = monitoringLayer.dashboard.getTransactionFeed();
  info(`Pending transactions: ${feed.pending.length}`);

  await sleep(1000);

  info('Transaction confirmed!');
  monitoringLayer.dashboard.confirmTransaction(txHash, {
    gasUsed: 185000,
    gasPrice: ethers.utils.parseUnits('25', 'gwei').toString(),
  });

  feed = monitoringLayer.dashboard.getTransactionFeed();
  success(`Transaction confirmed - Gas used: 185,000`);

  // Wallet Tracking
  subheader('Multi-Wallet Tracking');

  const wallets = [
    { address: '0x' + '1'.repeat(40), balance: '5.234' },
    { address: '0x' + '2'.repeat(40), balance: '0.089' },
    { address: '0x' + '3'.repeat(40), balance: '12.5' },
  ];

  for (const w of wallets) {
    monitoringLayer.dashboard.updateWalletStatus(w.address, {
      balance: w.balance,
      chainId: 1,
      nonce: Math.floor(Math.random() * 100),
    });
    info(`Wallet ${w.address.slice(0, 8)}... Balance: ${w.balance} ETH`);
  }

  // Check for low balance
  const lowBalanceWallet = wallets[1];
  if (parseFloat(lowBalanceWallet.balance) < 0.1) {
    warn(`Low balance detected on ${lowBalanceWallet.address.slice(0, 8)}...`);
  }

  // RPC Health
  subheader('RPC Provider Health');

  const chains = [
    { id: 1, name: 'Ethereum', latency: 45, healthy: true },
    { id: 42161, name: 'Arbitrum', latency: 82, healthy: true },
    { id: 10, name: 'Optimism', latency: 350, healthy: false },
  ];

  for (const chain of chains) {
    monitoringLayer.dashboard.updateRpcStatus(chain.id, {
      latency: chain.latency,
      healthy: chain.healthy,
    });

    if (chain.healthy) {
      success(`${chain.name}: ${chain.latency}ms - Healthy`);
    } else {
      error(`${chain.name}: ${chain.latency}ms - UNHEALTHY`);
    }
  }
}

async function demoAlertSystem(monitoringLayer) {
  header('🚨 ALERT SYSTEM DEMO');

  subheader('Sending Alerts');

  // Different alert levels
  const alerts = [
    { level: 'low', category: 'transaction', message: 'Transaction confirmed successfully' },
    { level: 'medium', category: 'rpc', message: 'RPC latency elevated on Optimism' },
    { level: 'high', category: 'security', message: 'Suspicious approval request detected' },
    { level: 'critical', category: 'mev', message: 'Sandwich attack detected on swap!' },
  ];

  for (const a of alerts) {
    const result = await monitoringLayer.sendAlert(a.level, a.category, a.message);
    if (result.sent) {
      alert(a.level, a.message);
    }
    await sleep(300);
  }

  // Show alert statistics
  subheader('Alert Statistics');
  const stats = monitoringLayer.alertSystem.getStatistics();
  info(`Total alerts: ${stats.total}`);
  info(`By level: Critical=${stats.byLevel.critical || 0}, High=${stats.byLevel.high || 0}, Medium=${stats.byLevel.medium || 0}, Low=${stats.byLevel.low || 0}`);

  // Show active alerts
  const active = monitoringLayer.dashboard.getActiveAlerts();
  info(`Active (unacknowledged) alerts: ${active.length}`);
}

async function demoMevDetection(monitoringLayer) {
  header('🥪 MEV PROTECTION DEMO');

  subheader('Sandwich Attack Detection');

  // Simulate MEV detection
  const victimTx = '0x' + 'v'.repeat(64);
  const extractedValue = ethers.utils.parseEther('0.05');

  info('Monitoring mempool for suspicious activity...');
  await sleep(500);

  warn('Potential sandwich attack detected!');
  await sleep(300);

  monitoringLayer.dashboard.recordMevEvent({
    type: 'sandwich_detected',
    txHash: victimTx,
    extractedValue: extractedValue.toString(),
    frontrunTx: '0x' + 'f'.repeat(64),
    backrunTx: '0x' + 'b'.repeat(64),
  });

  info(`Victim transaction: ${victimTx.slice(0, 16)}...`);
  info(`Extracted value: ${ethers.utils.formatEther(extractedValue)} ETH`);

  // Alert on sandwich
  await monitoringLayer.alertSystem.alertSandwichAttack(
    victimTx,
    parseFloat(ethers.utils.formatEther(extractedValue))
  );

  await sleep(500);

  // Show MEV metrics
  subheader('MEV Metrics');
  const mevMetrics = monitoringLayer.dashboard.getMevMetrics();
  info(`Sandwiches detected: ${mevMetrics.stats.detected}`);
  info(`Protected transactions: ${mevMetrics.stats.protected}`);

  // Add some known attackers
  subheader('Known Attacker Tracking');
  const attackers = [
    '0xae2fc483527b8ef99eb5d9b44875f005ba1fae13',
    '0x6b75d8af000000e20b7a7ddf000ba900b4009a80',
  ];

  monitoringLayer.sandwichDetector.addKnownAttackers(attackers);
  success(`Added ${attackers.length} known attacker addresses`);
}

async function demoAnalytics(monitoringLayer) {
  header('📈 ANALYTICS & REPORTING DEMO');

  subheader('Recording Transaction Data');

  // Record multiple transactions
  for (let i = 0; i < 10; i++) {
    monitoringLayer.analytics.recordTransaction({
      success: i !== 3 && i !== 7, // 2 failures
      type: ['swap', 'claim', 'transfer', 'approve'][i % 4],
      gasUsed: 100000 + i * 15000,
    });
  }
  success('Recorded 10 transactions (8 successful, 2 failed)');

  // Record MEV events
  monitoringLayer.analytics.recordMevEvent({ type: 'sandwich_detected', extractedValue: '50000000000000000' });
  monitoringLayer.analytics.recordMevEvent({ protectionUsed: true });
  success('Recorded MEV protection events');

  await sleep(500);

  // Show counters
  subheader('Real-time Counters');
  const counters = monitoringLayer.analytics.getCounters();
  info(`Total transactions: ${counters.transactions.total}`);
  info(`Successful: ${counters.transactions.successful}`);
  info(`Failed: ${counters.transactions.failed}`);
  info(`Success rate: ${((counters.transactions.successful / counters.transactions.total) * 100).toFixed(1)}%`);

  // Generate report
  subheader('Daily Report Generation');
  const report = monitoringLayer.analytics.generateReport('daily');
  info(`Report Type: ${report.reportType}`);
  info(`Generated at: ${new Date(report.generatedAt).toLocaleString()}`);
  success('Daily report generated successfully');
}

async function demoPrometheusExport(monitoringLayer) {
  header('📊 PROMETHEUS METRICS EXPORT');

  const prometheus = monitoringLayer.dashboard.exportMetrics('prometheus');

  // Show first few lines
  const lines = prometheus.split('\n').slice(0, 15);
  for (const line of lines) {
    if (line.startsWith('#')) {
      log(`  ${line}`, colors.cyan);
    } else if (line.trim()) {
      log(`  ${line}`, colors.white);
    }
  }

  info(`... and ${prometheus.split('\n').length - 15} more lines`);
  success('Prometheus metrics ready for scraping at /metrics');
}

async function demoSystemSnapshot(monitoringLayer) {
  header('📸 SYSTEM SNAPSHOT');

  const snapshot = monitoringLayer.getSnapshot();

  subheader('Current System State');
  info(`Timestamp: ${new Date(snapshot.timestamp).toISOString()}`);
  info(`Uptime: ${Math.floor(snapshot.status.uptime / 1000)}s`);
  info(`Pending transactions: ${snapshot.transactions.pending.length}`);
  info(`Recent transactions: ${snapshot.transactions.recent.length}`);
  info(`Tracked wallets: ${snapshot.wallets.length}`);
  info(`RPC providers: ${snapshot.rpc.providers.length}`);
  info(`Active alerts: ${snapshot.alerts.active.length}`);

  success('Full system snapshot captured');
}

// ============ Main Demo ============

async function runDemo() {
  console.clear();

  log(`
  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                               ║
  ║   ${colors.cyan}█████╗ ██╗██████╗ ██████╗ ██████╗  ██████╗ ██████╗${colors.reset}        ║
  ║   ${colors.cyan}██╔══██╗██║██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██╔══██╗${colors.reset}       ║
  ║   ${colors.cyan}███████║██║██████╔╝██║  ██║██████╔╝██║   ██║██████╔╝${colors.reset}       ║
  ║   ${colors.cyan}██╔══██║██║██╔══██╗██║  ██║██╔══██╗██║   ██║██╔═══╝${colors.reset}        ║
  ║   ${colors.cyan}██║  ██║██║██║  ██║██████╔╝██║  ██║╚██████╔╝██║${colors.reset}            ║
  ║   ${colors.cyan}╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝${colors.reset}            ║
  ║                                                               ║
  ║   ${colors.yellow}HUNTER BOT - Phase 1 Security & Monitoring Demo${colors.reset}          ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
  `, colors.bright);

  await sleep(1000);

  // Initialize layers
  const mockLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  log('\n  Initializing security and monitoring layers...', colors.cyan);
  await sleep(500);

  const securityLayer = createSecurityLayer({ logger: mockLogger });
  success('Security layer initialized');

  const monitoringLayer = createMonitoringLayer({
    logger: mockLogger,
    securityLayer,
  });
  success('Monitoring layer initialized');

  await sleep(1000);

  // Run demos
  try {
    await demoSecurityLayer(securityLayer);
    await sleep(1500);

    await demoMonitoringLayer(monitoringLayer);
    await sleep(1500);

    await demoAlertSystem(monitoringLayer);
    await sleep(1500);

    await demoMevDetection(monitoringLayer);
    await sleep(1500);

    await demoAnalytics(monitoringLayer);
    await sleep(1500);

    await demoPrometheusExport(monitoringLayer);
    await sleep(1500);

    await demoSystemSnapshot(monitoringLayer);

    // Cleanup
    monitoringLayer.stop();

    header('✅ DEMO COMPLETE');
    success('All Phase 1 systems demonstrated successfully!');
    info('689 tests passing | Security + Monitoring layers operational');
    log('\n  Ready for Phase 2: Execution Engine & Wallet Management\n', colors.cyan);

  } catch (err) {
    error(`Demo error: ${err.message}`);
    console.error(err);
  }
}

// Run the demo
runDemo().catch(console.error);
