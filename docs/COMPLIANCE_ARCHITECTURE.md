# Compliance Layer Architecture

> **Sprint 2.1**: Regulatory Compliance Infrastructure
> **Status**: IMPLEMENTATION IN PROGRESS

---

## Overview

The Compliance Layer is a **cross-cutting concern** that integrates with ALL existing security and monitoring modules. It provides:

1. **Audit Logging** - Immutable record of all operations (7-year retention)
2. **Address Screening** - OFAC/sanctions list checking
3. **Geo-Restrictions** - Jurisdiction-based blocking
4. **Compliance Reporting** - Export for regulatory audits

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPLIANCE LAYER                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  AUDIT LOGGER   │  │ ADDRESS SCREEN  │  │ GEO RESTRICT    │              │
│  │                 │  │                 │  │                 │              │
│  │ • All events    │  │ • OFAC SDN      │  │ • IP detection  │              │
│  │ • 7-yr retention│  │ • Chainalysis   │  │ • Country block │              │
│  │ • Tamper-proof  │  │ • Custom lists  │  │ • VPN detection │              │
│  │ • Export/query  │  │ • Real-time     │  │ • Graceful fail │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
└───────────┼────────────────────┼────────────────────┼────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATION POINTS                                     │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  SECURITY LAYER (Sprint 1.1)                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  input-validator.js ──────► addressScreener.checkAddress()              │ │
│  │    • Before validating any address, check against sanctions             │ │
│  │    • Block transactions to/from sanctioned addresses                    │ │
│  │    • Log all address validation attempts                                │ │
│  │                                                                         │ │
│  │  execution-guard.js ──────► auditLogger.logExecution()                  │ │
│  │    • Log every transaction execution (success/failure)                  │ │
│  │    • Capture full execution context (wallet, tx, gas, result)          │ │
│  │    • Track execution state transitions                                  │ │
│  │                                                                         │ │
│  │  access-control.js ───────► auditLogger.logAccess()                     │ │
│  │    • Log all permission checks                                          │ │
│  │    • Log role assignments/revocations                                   │ │
│  │    • Log multi-sig approval flows                                       │ │
│  │                                                                         │ │
│  │  key-manager.js ──────────► auditLogger.logKeyUsage()                   │ │
│  │    • Log every key access (without exposing key)                        │ │
│  │    • Track key rotation events                                          │ │
│  │    • Alert on suspicious usage patterns                                 │ │
│  │                                                                         │ │
│  │  approval-manager.js ─────► auditLogger.logApproval()                   │ │
│  │    • Log token approval grants                                          │ │
│  │    • Log approval revocations                                           │ │
│  │    • Track approval risk assessments                                    │ │
│  │                                                                         │ │
│  │  nonce-manager.js ────────► auditLogger.logNonce()                      │ │
│  │    • Log nonce reservations and confirmations                           │ │
│  │    • Track stuck transaction handling                                   │ │
│  │    • Log speed-up and cancellation attempts                             │ │
│  │                                                                         │ │
│  │  mev-protection.js ───────► auditLogger.logMevProtection()              │ │
│  │    • Log MEV protection decisions (Flashbots vs public)                 │ │
│  │    • Track private mempool usage                                        │ │
│  │    • Log bundle submissions                                             │ │
│  │                                                                         │ │
│  │  rpc-manager.js ──────────► auditLogger.logRpc()                        │ │
│  │    • Log RPC provider switches                                          │ │
│  │    • Track failover events                                              │ │
│  │    • Log health check results                                           │ │
│  │                                                                         │ │
│  │  oracle-guard.js ─────────► auditLogger.logOracle()                     │ │
│  │    • Log price queries and validations                                  │ │
│  │    • Track deviation alerts                                             │ │
│  │    • Log sequencer health checks                                        │ │
│  │                                                                         │ │
│  │  slippage-guard.js ───────► auditLogger.logSlippage()                   │ │
│  │    • Log slippage calculations and caps                                 │ │
│  │    • Track price impact warnings                                        │ │
│  │    • Log trade rejections                                               │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  MONITORING LAYER (Sprint 1.2)                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  alerts.js ───────────────► complianceAlerts                            │ │
│  │    • CRITICAL: Sanctions violation attempt                              │ │
│  │    • HIGH: Geo-restriction bypass attempt                               │ │
│  │    • MEDIUM: Suspicious activity pattern                                │ │
│  │    • LOW: Compliance audit completed                                    │ │
│  │                                                                         │ │
│  │  analytics.js ────────────► complianceMetrics                           │ │
│  │    • Track compliance check counts                                      │ │
│  │    • Monitor screening hit rates                                        │ │
│  │    • Calculate compliance score                                         │ │
│  │                                                                         │ │
│  │  dashboard.js ────────────► complianceStatus                            │ │
│  │    • Display compliance status                                          │ │
│  │    • Show recent screening results                                      │ │
│  │    • Export compliance reports                                          │ │
│  │                                                                         │ │
│  │  sandwich-detector.js ────► auditLogger.logMevIncident()                │ │
│  │    • Log detected sandwich attacks                                      │ │
│  │    • Track extraction amounts                                           │ │
│  │    • Record attacker addresses                                          │ │
│  │                                                                         │ │
│  │  tx-simulator.js ─────────► auditLogger.logSimulation()                 │ │
│  │    • Log simulation attempts and results                                │ │
│  │    • Track revert predictions                                           │ │
│  │    • Record gas estimations                                             │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Module Specifications

### 1. Audit Logger (`audit-logger.js`)

**Purpose**: Central, immutable audit trail for all operations.

**Key Features**:
- Structured event logging with timestamps
- 7-year retention policy support
- Tamper-evident logging (hash chains)
- Multiple storage backends (file, database, cloud)
- Query and export capabilities
- Log rotation and archival

**Event Categories**:
```javascript
const AUDIT_CATEGORIES = {
  // Security Events
  EXECUTION: 'execution',           // Transaction executions
  ACCESS: 'access',                 // Permission checks
  KEY_USAGE: 'key_usage',           // Private key operations
  APPROVAL: 'approval',             // Token approvals
  NONCE: 'nonce',                   // Nonce management

  // MEV Events
  MEV_PROTECTION: 'mev_protection', // MEV routing decisions
  MEV_INCIDENT: 'mev_incident',     // Detected attacks
  SIMULATION: 'simulation',         // Tx simulations

  // Infrastructure Events
  RPC: 'rpc',                       // Provider operations
  ORACLE: 'oracle',                 // Price feed queries
  SLIPPAGE: 'slippage',            // Slippage calculations

  // Compliance Events
  SCREENING: 'screening',           // Address screening
  GEO_CHECK: 'geo_check',          // Geo restriction checks
  VIOLATION: 'violation',           // Compliance violations

  // Administrative Events
  CONFIG: 'config',                 // Configuration changes
  ALERT: 'alert',                   // Alert dispatches
  REPORT: 'report',                 // Report generation
};
```

**Interface**:
```javascript
class AuditLogger {
  constructor(config)

  // Core logging
  log(category, action, data, metadata) → AuditEntry
  logAsync(category, action, data, metadata) → Promise<AuditEntry>

  // Category-specific logging (convenience methods)
  logExecution(wallet, tx, result) → AuditEntry
  logAccess(userId, permission, granted) → AuditEntry
  logKeyUsage(keyId, operation, wallet) → AuditEntry
  logApproval(wallet, token, spender, amount) → AuditEntry
  logNonce(wallet, nonce, action) → AuditEntry
  logMevProtection(tx, route, reason) → AuditEntry
  logMevIncident(tx, attacker, extraction) → AuditEntry
  logSimulation(tx, result) → AuditEntry
  logRpc(chainId, provider, action) → AuditEntry
  logOracle(pair, price, source, confidence) → AuditEntry
  logSlippage(pair, calculated, applied) → AuditEntry
  logScreening(address, result, source) → AuditEntry
  logGeoCheck(ip, country, allowed) → AuditEntry
  logViolation(type, details, severity) → AuditEntry

  // Query and export
  query(filter, options) → AuditEntry[]
  export(format, filter, options) → string | Buffer
  getStatistics(timeRange) → AuditStats

  // Integrity
  verifyIntegrity(startTime, endTime) → boolean
  getHashChain(startTime, endTime) → Hash[]

  // Lifecycle
  rotate() → void
  archive(olderThan) → ArchiveResult
  purge(olderThan, confirm) → PurgeResult
}
```

---

### 2. Address Screening (`address-screening.js`)

**Purpose**: Check addresses against sanctions lists and block prohibited interactions.

**Key Features**:
- OFAC SDN list integration
- Chainalysis API support (optional)
- Custom blocklist/allowlist
- Real-time and batch screening
- Caching with configurable TTL
- Graceful degradation on API failure

**Integration Points**:
- `input-validator.js`: Pre-validate all addresses
- `execution-guard.js`: Block executions to sanctioned addresses
- `approval-manager.js`: Block approvals to sanctioned spenders

**Interface**:
```javascript
class AddressScreener {
  constructor(config)

  // Screening
  checkAddress(address) → Promise<ScreeningResult>
  checkAddresses(addresses) → Promise<ScreeningResult[]>
  checkTransaction(tx) → Promise<TxScreeningResult>

  // List management
  addToBlocklist(address, reason) → void
  removeFromBlocklist(address) → void
  addToAllowlist(address, reason) → void
  removeFromAllowlist(address) → void

  // OFAC integration
  updateOfacList() → Promise<UpdateResult>
  getOfacListAge() → number

  // Cache management
  clearCache() → void
  getCacheStats() → CacheStats

  // Reporting
  getScreeningStats(timeRange) → ScreeningStats
  getBlockedAddresses() → BlockedAddress[]
}

// Result types
interface ScreeningResult {
  address: string;
  allowed: boolean;
  risk: 'none' | 'low' | 'medium' | 'high' | 'blocked';
  matches: SanctionMatch[];
  sources: string[];
  timestamp: number;
  cached: boolean;
}
```

---

### 3. Geo Restrictions (`geo-restrictions.js`)

**Purpose**: Enforce jurisdiction-based access controls.

**Key Features**:
- IP-to-country resolution (MaxMind GeoIP)
- Configurable country blocklist
- VPN/proxy detection (optional)
- Graceful fallback modes
- Request-level and session-level checking

**Integration Points**:
- `access-control.js`: Verify user location before granting access
- `execution-guard.js`: Block executions from restricted jurisdictions
- API endpoints: Middleware for request filtering

**Interface**:
```javascript
class GeoRestrictor {
  constructor(config)

  // Checking
  checkIp(ip) → Promise<GeoCheckResult>
  checkRequest(request) → Promise<GeoCheckResult>
  isCountryBlocked(countryCode) → boolean

  // Configuration
  blockCountry(countryCode, reason) → void
  unblockCountry(countryCode) → void
  setBlockedCountries(countries) → void
  getBlockedCountries() → BlockedCountry[]

  // VPN detection
  checkVpn(ip) → Promise<VpnCheckResult>
  setVpnPolicy(policy) → void

  // Fallback
  setFallbackMode(mode) → void

  // Reporting
  getGeoStats(timeRange) → GeoStats
}

// Result types
interface GeoCheckResult {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  allowed: boolean;
  reason: string;
  isVpn: boolean;
  confidence: number;
}
```

---

## Factory Pattern

```javascript
// compliance/index.js

function createComplianceLayer(options) {
  const {
    securityLayer,
    monitoringLayer,
    config,
    logger,
  } = options;

  // Create core compliance modules
  const auditLogger = new AuditLogger({
    logger,
    storage: config.auditStorage,
    retention: config.retentionDays || 2555, // 7 years
    hashChain: config.enableHashChain ?? true,
  });

  const addressScreener = new AddressScreener({
    logger,
    auditLogger,
    ofacEnabled: config.ofacEnabled ?? true,
    chainalysisApiKey: config.chainalysisApiKey,
    cacheTtl: config.screeningCacheTtl || 3600000, // 1 hour
  });

  const geoRestrictor = new GeoRestrictor({
    logger,
    auditLogger,
    blockedCountries: config.blockedCountries || [],
    vpnDetection: config.vpnDetection ?? false,
    maxmindLicenseKey: config.maxmindLicenseKey,
  });

  // Wire up integrations with security layer
  if (securityLayer) {
    // Wrap input validator
    wrapInputValidator(securityLayer.inputValidator, addressScreener, auditLogger);

    // Wrap execution guard
    wrapExecutionGuard(securityLayer.executionGuard, auditLogger, addressScreener);

    // Wrap access control
    wrapAccessControl(securityLayer.accessControl, auditLogger, geoRestrictor);

    // Wrap key manager
    wrapKeyManager(securityLayer.keyManager, auditLogger);

    // Wrap approval manager
    wrapApprovalManager(securityLayer.approvalManager, auditLogger);

    // Wrap nonce manager
    wrapNonceManager(securityLayer.nonceManager, auditLogger);

    // Wrap MEV protection
    wrapMevProtection(securityLayer.mevProtection, auditLogger);

    // Wrap RPC manager
    wrapRpcManager(securityLayer.rpcManager, auditLogger);

    // Wrap oracle guard
    wrapOracleGuard(securityLayer.oracleGuard, auditLogger);

    // Wrap slippage guard
    wrapSlippageGuard(securityLayer.slippageGuard, auditLogger);
  }

  // Wire up integrations with monitoring layer
  if (monitoringLayer) {
    // Add compliance alerts
    setupComplianceAlerts(monitoringLayer.alertSystem, addressScreener, geoRestrictor);

    // Add compliance metrics
    setupComplianceMetrics(monitoringLayer.analytics, auditLogger);

    // Add compliance dashboard
    setupComplianceDashboard(monitoringLayer.dashboard, auditLogger, addressScreener);

    // Wrap sandwich detector
    wrapSandwichDetector(monitoringLayer.sandwichDetector, auditLogger);

    // Wrap tx simulator
    wrapTxSimulator(monitoringLayer.txSimulator, auditLogger);
  }

  return {
    // Core modules
    auditLogger,
    addressScreener,
    geoRestrictor,

    // Convenience methods
    screenAddress: (address) => addressScreener.checkAddress(address),
    checkGeo: (ip) => geoRestrictor.checkIp(ip),
    getAuditLog: (filter) => auditLogger.query(filter),
    exportAudit: (format, filter) => auditLogger.export(format, filter),

    // Lifecycle
    start: () => { /* Start background tasks */ },
    stop: () => { /* Clean shutdown */ },
    getStatus: () => ({
      auditLogger: auditLogger.getStatistics(),
      addressScreener: addressScreener.getScreeningStats(),
      geoRestrictor: geoRestrictor.getGeoStats(),
    }),
  };
}
```

---

## Data Flow Examples

### Example 1: Transaction Execution with Full Compliance

```
User initiates swap
        │
        ▼
┌─────────────────┐
│ GeoRestrictor   │ ──► Check user IP, block if restricted country
└────────┬────────┘
         │ ✓ allowed
         ▼
┌─────────────────┐
│ AddressScreener │ ──► Check all addresses (from, to, router, tokens)
└────────┬────────┘
         │ ✓ no sanctions matches
         ▼
┌─────────────────┐
│ InputValidator  │ ──► Validate calldata + log to AuditLogger
└────────┬────────┘
         │ ✓ valid
         ▼
┌─────────────────┐
│ ExecutionGuard  │ ──► Execute + log full context to AuditLogger
└────────┬────────┘
         │ result
         ▼
┌─────────────────┐
│ AuditLogger     │ ──► Permanent, tamper-evident record
└─────────────────┘
```

### Example 2: Compliance Violation Alert Flow

```
AddressScreener detects OFAC match
        │
        ▼
┌─────────────────┐
│ AuditLogger     │ ──► Log VIOLATION event with full details
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AlertSystem     │ ──► Send CRITICAL alert to all channels
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ExecutionGuard  │ ──► Transaction BLOCKED (emergency stop if needed)
└─────────────────┘
```

---

## Implementation Order

| Order | File | Est. Lines | Key Dependencies |
|-------|------|------------|------------------|
| 1 | `audit-logger.js` | ~600 | Logger, crypto (hash chain) |
| 2 | `address-screening.js` | ~500 | AuditLogger, node-fetch (OFAC) |
| 3 | `geo-restrictions.js` | ~400 | AuditLogger, maxmind/geoip-lite |
| 4 | `index.js` | ~300 | All modules, wrapper functions |

---

## Testing Requirements

### Unit Tests
- [ ] audit-logger.test.js (~40 tests)
- [ ] address-screening.test.js (~35 tests)
- [ ] geo-restrictions.test.js (~30 tests)

### Integration Tests
- [ ] Full compliance flow with security layer
- [ ] Compliance alerts integration
- [ ] Audit export and integrity verification

### Compliance Tests
- [ ] OFAC list parsing and matching
- [ ] Hash chain integrity verification
- [ ] 7-year retention simulation

---

*Document Version: 1.0*
*Created: 2026-01-01*
*Author: Claude Opus 4.5*
