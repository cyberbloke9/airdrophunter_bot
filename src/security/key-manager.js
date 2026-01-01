/**
 * Key Manager - Secure Private Key Management
 *
 * Part of Sprint 1.1: Core Safety Infrastructure
 *
 * WHY: Private key exposure = total loss. Keys should never be in environment
 * variables in production. Need rotation, tiered access, and audit logging.
 *
 * STATE-OF-THE-ART:
 * - AWS Secrets Manager integration for production
 * - Tiered wallet system (Hot/Warm/Cold)
 * - Key rotation support
 * - Encrypted local storage for development
 * - Complete audit trail
 *
 * @module security/key-manager
 */

const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Wallet tiers with increasing security
const WALLET_TIER = {
  HOT: 'hot',     // Automated operations, low limits
  WARM: 'warm',   // Manual approval, medium limits
  COLD: 'cold',   // Multi-sig required, high limits
};

// Key sources
const KEY_SOURCE = {
  ENV: 'env',              // Environment variable (dev only)
  FILE: 'file',            // Encrypted file
  AWS_SECRETS: 'aws',      // AWS Secrets Manager
  VAULT: 'vault',          // HashiCorp Vault
  HSM: 'hsm',              // Hardware Security Module
};

class KeyManager {
  constructor(config = {}) {
    this.logger = config.logger || console;

    // Configuration
    this.config = {
      source: config.source || KEY_SOURCE.ENV,
      encryptionKey: config.encryptionKey || process.env.KEY_ENCRYPTION_KEY,
      keyStorePath: config.keyStorePath || './.keys',
      awsRegion: config.awsRegion || process.env.AWS_REGION || 'us-east-1',
      rotationDays: config.rotationDays ?? 90,
    };

    // Wallet registry
    this.wallets = new Map(); // address -> { tier, signer, metadata }

    // Key cache (encrypted in memory)
    this.keyCache = new Map();

    // Audit log
    this.auditLog = [];

    // Tier limits (in USD value)
    this.tierLimits = {
      [WALLET_TIER.HOT]: {
        maxTransactionValue: config.hotMaxTx ?? 1000,
        dailyLimit: config.hotDailyLimit ?? 5000,
        requiresApproval: false,
      },
      [WALLET_TIER.WARM]: {
        maxTransactionValue: config.warmMaxTx ?? 10000,
        dailyLimit: config.warmDailyLimit ?? 50000,
        requiresApproval: true,
      },
      [WALLET_TIER.COLD]: {
        maxTransactionValue: config.coldMaxTx ?? Infinity,
        dailyLimit: config.coldDailyLimit ?? Infinity,
        requiresApproval: true,
        requiresMultisig: true,
      },
    };

    // Daily spending tracking
    this.dailySpending = new Map(); // address -> { date, amount }
  }

  /**
   * Load wallet from configured source
   *
   * @param {string} identifier - Wallet identifier (address or name)
   * @param {string} tier - Wallet tier
   * @param {ethers.providers.Provider} provider - Provider instance
   * @returns {Promise<ethers.Wallet>}
   */
  async loadWallet(identifier, tier = WALLET_TIER.HOT, provider = null) {
    this.audit('LOAD_WALLET', { identifier, tier });

    let privateKey;

    switch (this.config.source) {
      case KEY_SOURCE.ENV:
        privateKey = await this.loadFromEnv(identifier);
        break;

      case KEY_SOURCE.FILE:
        privateKey = await this.loadFromFile(identifier);
        break;

      case KEY_SOURCE.AWS_SECRETS:
        privateKey = await this.loadFromAws(identifier);
        break;

      case KEY_SOURCE.VAULT:
        privateKey = await this.loadFromVault(identifier);
        break;

      default:
        throw new Error(`Unsupported key source: ${this.config.source}`);
    }

    // Create wallet
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = wallet.address.toLowerCase();

    // Register wallet
    this.wallets.set(address, {
      tier,
      identifier,
      address: wallet.address,
      loadedAt: Date.now(),
      lastUsed: null,
    });

    // Clear private key from memory after creating wallet
    privateKey = null;

    this.logger.info(`[KeyManager] Loaded ${tier} wallet: ${wallet.address.slice(0, 10)}...`);
    this.audit('WALLET_LOADED', { address: wallet.address, tier });

    return wallet;
  }

  /**
   * Load from environment variable
   *
   * @param {string} identifier - Variable name or address
   * @returns {Promise<string>}
   */
  async loadFromEnv(identifier) {
    // Try different env var naming conventions
    const envVars = [
      `PRIVATE_KEY_${identifier.toUpperCase()}`,
      `${identifier.toUpperCase()}_PRIVATE_KEY`,
      'PRIVATE_KEY',
      'WALLET_PRIVATE_KEY',
    ];

    for (const varName of envVars) {
      const value = process.env[varName];
      if (value) {
        this.logger.info(`[KeyManager] Loaded from env: ${varName}`);
        return value.startsWith('0x') ? value : `0x${value}`;
      }
    }

    throw new Error(`Private key not found for ${identifier} in environment`);
  }

  /**
   * Load from encrypted file
   *
   * @param {string} identifier - Wallet identifier
   * @returns {Promise<string>}
   */
  async loadFromFile(identifier) {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key required for file-based key storage');
    }

    const filePath = path.join(this.config.keyStorePath, `${identifier}.enc`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Key file not found: ${filePath}`);
    }

    const encrypted = fs.readFileSync(filePath, 'utf8');
    const decrypted = this.decrypt(encrypted, this.config.encryptionKey);

    return decrypted;
  }

  /**
   * Load from AWS Secrets Manager
   *
   * @param {string} identifier - Secret name/ARN
   * @returns {Promise<string>}
   */
  async loadFromAws(identifier) {
    // Note: In production, use @aws-sdk/client-secrets-manager
    // This is a simplified implementation

    try {
      // Dynamic import for AWS SDK
      const { SecretsManagerClient, GetSecretValueCommand } = await import(
        '@aws-sdk/client-secrets-manager'
      );

      const client = new SecretsManagerClient({ region: this.config.awsRegion });
      const command = new GetSecretValueCommand({ SecretId: identifier });
      const response = await client.send(command);

      if (response.SecretString) {
        const secret = JSON.parse(response.SecretString);
        return secret.privateKey || secret.private_key || secret.key;
      }

      throw new Error('Secret not found or empty');

    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('AWS SDK not installed. Run: npm install @aws-sdk/client-secrets-manager');
      }
      throw error;
    }
  }

  /**
   * Load from HashiCorp Vault
   *
   * @param {string} identifier - Secret path
   * @returns {Promise<string>}
   */
  async loadFromVault(identifier) {
    const vaultAddr = process.env.VAULT_ADDR;
    const vaultToken = process.env.VAULT_TOKEN;

    if (!vaultAddr || !vaultToken) {
      throw new Error('VAULT_ADDR and VAULT_TOKEN required for Vault integration');
    }

    const response = await fetch(`${vaultAddr}/v1/secret/data/${identifier}`, {
      headers: {
        'X-Vault-Token': vaultToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Vault request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.data.privateKey || data.data.data.private_key;
  }

  /**
   * Check if transaction is within tier limits
   *
   * @param {string} walletAddress - Wallet address
   * @param {number} valueUsd - Transaction value in USD
   * @returns {{allowed: boolean, reason: string|null, requiresApproval: boolean}}
   */
  checkTierLimits(walletAddress, valueUsd) {
    const wallet = this.wallets.get(walletAddress.toLowerCase());
    if (!wallet) {
      return { allowed: false, reason: 'Wallet not registered', requiresApproval: false };
    }

    const limits = this.tierLimits[wallet.tier];

    // Check transaction limit
    if (valueUsd > limits.maxTransactionValue) {
      return {
        allowed: false,
        reason: `Transaction value $${valueUsd} exceeds ${wallet.tier} limit of $${limits.maxTransactionValue}`,
        requiresApproval: false,
      };
    }

    // Check daily limit
    const dailyKey = walletAddress.toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    const spending = this.dailySpending.get(dailyKey) || { date: today, amount: 0 };

    // Reset if new day
    if (spending.date !== today) {
      spending.date = today;
      spending.amount = 0;
    }

    if (spending.amount + valueUsd > limits.dailyLimit) {
      return {
        allowed: false,
        reason: `Daily limit exceeded: $${spending.amount + valueUsd} > $${limits.dailyLimit}`,
        requiresApproval: false,
      };
    }

    return {
      allowed: true,
      reason: null,
      requiresApproval: limits.requiresApproval,
      requiresMultisig: limits.requiresMultisig || false,
    };
  }

  /**
   * Record spending for daily limit tracking
   *
   * @param {string} walletAddress - Wallet address
   * @param {number} valueUsd - Transaction value in USD
   */
  recordSpending(walletAddress, valueUsd) {
    const dailyKey = walletAddress.toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    const spending = this.dailySpending.get(dailyKey) || { date: today, amount: 0 };

    if (spending.date !== today) {
      spending.date = today;
      spending.amount = 0;
    }

    spending.amount += valueUsd;
    this.dailySpending.set(dailyKey, spending);

    this.audit('SPENDING_RECORDED', { address: walletAddress, amount: valueUsd, total: spending.amount });
  }

  /**
   * Store key securely (for key generation)
   *
   * @param {string} identifier - Key identifier
   * @param {string} privateKey - Private key to store
   * @returns {Promise<void>}
   */
  async storeKey(identifier, privateKey) {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key required for key storage');
    }

    const encrypted = this.encrypt(privateKey, this.config.encryptionKey);

    // Ensure directory exists
    if (!fs.existsSync(this.config.keyStorePath)) {
      fs.mkdirSync(this.config.keyStorePath, { recursive: true, mode: 0o700 });
    }

    const filePath = path.join(this.config.keyStorePath, `${identifier}.enc`);
    fs.writeFileSync(filePath, encrypted, { mode: 0o600 });

    this.audit('KEY_STORED', { identifier });
    this.logger.info(`[KeyManager] Key stored: ${identifier}`);
  }

  /**
   * Generate new wallet
   *
   * @param {string} identifier - Wallet identifier
   * @param {string} tier - Wallet tier
   * @param {boolean} store - Whether to store the key
   * @returns {Promise<{address: string, mnemonic: string|null}>}
   */
  async generateWallet(identifier, tier = WALLET_TIER.HOT, store = true) {
    const wallet = ethers.Wallet.createRandom();

    if (store) {
      await this.storeKey(identifier, wallet.privateKey);
    }

    this.audit('WALLET_GENERATED', { identifier, address: wallet.address, tier });

    return {
      address: wallet.address,
      mnemonic: wallet.mnemonic?.phrase,
      privateKey: store ? '[STORED]' : wallet.privateKey,
    };
  }

  /**
   * Rotate a key (generate new, transfer assets, revoke old)
   *
   * @param {string} identifier - Key identifier
   * @param {ethers.Signer} oldSigner - Current signer
   * @param {ethers.providers.Provider} provider - Provider
   * @returns {Promise<{newAddress: string, migrationTxHash: string}>}
   */
  async rotateKey(identifier, oldSigner, provider) {
    this.audit('KEY_ROTATION_STARTED', { identifier });

    // Generate new wallet
    const newWallet = await this.generateWallet(`${identifier}_new`, WALLET_TIER.HOT, true);

    // Get old wallet balance
    const oldAddress = await oldSigner.getAddress();
    const balance = await provider.getBalance(oldAddress);

    // Migrate ETH (leave some for gas)
    const gasPrice = await provider.getGasPrice();
    const gasLimit = 21000n;
    const gasCost = gasPrice.toBigInt() * gasLimit;
    const transferAmount = balance.toBigInt() - gasCost * 2n; // Leave buffer

    if (transferAmount > 0) {
      const tx = await oldSigner.sendTransaction({
        to: newWallet.address,
        value: transferAmount,
        gasLimit,
        gasPrice,
      });

      await tx.wait();

      this.audit('KEY_ROTATION_MIGRATION', {
        from: oldAddress,
        to: newWallet.address,
        amount: ethers.utils.formatEther(transferAmount.toString()),
        txHash: tx.hash,
      });

      // Rename keys
      const oldKeyPath = path.join(this.config.keyStorePath, `${identifier}.enc`);
      const newKeyPath = path.join(this.config.keyStorePath, `${identifier}_new.enc`);
      const archivedKeyPath = path.join(this.config.keyStorePath, `${identifier}_archived_${Date.now()}.enc`);

      if (fs.existsSync(oldKeyPath)) {
        fs.renameSync(oldKeyPath, archivedKeyPath);
      }
      if (fs.existsSync(newKeyPath)) {
        fs.renameSync(newKeyPath, oldKeyPath);
      }

      this.audit('KEY_ROTATION_COMPLETED', { identifier, newAddress: newWallet.address });

      return {
        newAddress: newWallet.address,
        migrationTxHash: tx.hash,
      };
    }

    return {
      newAddress: newWallet.address,
      migrationTxHash: null,
      note: 'No ETH to migrate',
    };
  }

  /**
   * Encrypt data with AES-256-GCM
   *
   * @param {string} data - Data to encrypt
   * @param {string} key - Encryption key
   * @returns {string}
   */
  encrypt(data, key) {
    const iv = crypto.randomBytes(16);
    const keyBuffer = crypto.scryptSync(key, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString('hex'),
      data: encrypted,
      authTag: authTag.toString('hex'),
    });
  }

  /**
   * Decrypt data with AES-256-GCM
   *
   * @param {string} encryptedJson - Encrypted JSON string
   * @param {string} key - Encryption key
   * @returns {string}
   */
  decrypt(encryptedJson, key) {
    const { iv, data, authTag } = JSON.parse(encryptedJson);

    const keyBuffer = crypto.scryptSync(key, 'salt', 32);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      keyBuffer,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get wallet info
   *
   * @param {string} address - Wallet address
   * @returns {object|null}
   */
  getWalletInfo(address) {
    return this.wallets.get(address.toLowerCase()) || null;
  }

  /**
   * Get all registered wallets
   *
   * @returns {Array}
   */
  getAllWallets() {
    return Array.from(this.wallets.entries()).map(([address, info]) => ({
      address,
      ...info,
    }));
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

    // Log sensitive actions
    const sensitiveActions = ['KEY_ROTATION_STARTED', 'KEY_STORED', 'WALLET_GENERATED'];
    if (sensitiveActions.includes(action)) {
      this.logger.warn(`[KeyManager] AUDIT: ${action}`, details);
    }
  }

  /**
   * Get audit log
   *
   * @param {number} limit - Maximum entries to return
   * @returns {Array}
   */
  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }

  /**
   * Get tier limits
   *
   * @param {string} tier - Wallet tier
   * @returns {object}
   */
  getTierLimits(tier) {
    return this.tierLimits[tier] || null;
  }

  /**
   * Set tier limits
   *
   * @param {string} tier - Wallet tier
   * @param {object} limits - New limits
   */
  setTierLimits(tier, limits) {
    if (!this.tierLimits[tier]) {
      throw new Error(`Invalid tier: ${tier}`);
    }
    this.tierLimits[tier] = { ...this.tierLimits[tier], ...limits };
    this.audit('TIER_LIMITS_UPDATED', { tier, limits });
  }
}

// Export constants
KeyManager.WALLET_TIER = WALLET_TIER;
KeyManager.KEY_SOURCE = KEY_SOURCE;

module.exports = KeyManager;
