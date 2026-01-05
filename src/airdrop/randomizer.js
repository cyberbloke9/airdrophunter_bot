'use strict';

/**
 * Human-Like Randomization Module
 *
 * Sprint 3.1: Activity Automation
 *
 * =============================================================================
 * THE 6 W's: HUMAN-LIKE RANDOMIZATION
 * =============================================================================
 *
 * WHO:
 * ----
 * WHO we're emulating:
 * - REAL CRYPTO USERS: How actual humans interact with DeFi
 *   - Check portfolios in morning and evening
 *   - More active on weekdays
 *   - Take breaks (vacations, busy periods)
 *   - Make mistakes (wrong amounts, retry transactions)
 *   - Have preferences (favorite DEXes, chains)
 *
 * WHO is trying to detect us:
 * - SYBIL DETECTION ALGORITHMS:
 *   - LayerZero: Identified patterns in 1.1M+ wallets
 *   - zkSync: Temporal clustering analysis
 *   - Starknet: Behavioral fingerprinting
 *
 * - DETECTION METHODS:
 *   1. Temporal Analysis: Same-time transactions across wallets
 *   2. Value Clustering: Identical amounts (0.1 ETH exactly)
 *   3. Sequence Analysis: Identical action order
 *   4. Graph Analysis: Funding relationships
 *   5. Gas Price Patterns: Same gas settings
 *
 * WHAT:
 * -----
 * WHAT this module randomizes:
 *
 * | Parameter | Why Randomize | Detection Risk |
 * |-----------|---------------|----------------|
 * | Timing | Avoid temporal clustering | HIGH |
 * | Amount | Avoid value fingerprinting | HIGH |
 * | Gas Price | Avoid gas pattern detection | MEDIUM |
 * | Action Order | Avoid sequence matching | MEDIUM |
 * | Slippage | Avoid settings fingerprint | LOW |
 *
 * WHAT makes randomization "human-like":
 * - NOT uniform random (humans have patterns)
 * - Follows circadian rhythms (active hours)
 * - Has weekday/weekend differences
 * - Shows "personality" (consistent preferences)
 * - Includes realistic "mistakes"
 *
 * WHAT distributions we use:
 * - Normal (Gaussian): For amounts, timing variance
 * - Poisson: For action frequency
 * - Beta: For time-of-day preferences
 * - Exponential: For inter-action intervals
 *
 * WHEN:
 * -----
 * WHEN to apply randomization:
 *
 * TIMING:
 * - Before scheduling any action
 * - Add jitter to all scheduled times
 * - Vary the variance itself (meta-randomization)
 *
 * AMOUNTS:
 * - Before every transaction
 * - Stay within bounds but vary
 * - Avoid round numbers (0.1 → 0.0847)
 *
 * GAS:
 * - Per-transaction
 * - Vary within reasonable bounds
 * - Don't always use exact estimated gas
 *
 * WHEN NOT to randomize:
 * - Contract addresses (would fail)
 * - Token types (must be correct)
 * - Chain ID (must be correct)
 *
 * WHERE:
 * ------
 * WHERE randomization is applied:
 *
 * | Layer | What's Randomized |
 * |-------|-------------------|
 * | Scheduler | Execution timing, intervals |
 * | Strategy Engine | Action selection, weights |
 * | Transaction Builder | Amounts, gas, slippage |
 * | Route Selector | Path choice (when equivalent) |
 *
 * WHERE patterns are avoided:
 * - Cross-wallet: Different wallets ≠ same patterns
 * - Cross-time: Patterns don't repeat predictably
 * - Cross-chain: Different behavior per chain
 *
 * WHY:
 * ----
 * WHY randomization is critical:
 *
 * 1. TEMPORAL CLUSTERING DETECTION:
 *    ```
 *    Bad:  Wallet A: 10:00:00, Wallet B: 10:00:01, Wallet C: 10:00:02
 *    Good: Wallet A: 10:23:47, Wallet B: 14:51:02, Wallet C: 09:07:33
 *    ```
 *    Even millisecond-level clustering is detectable!
 *
 * 2. VALUE FINGERPRINTING:
 *    ```
 *    Bad:  All wallets bridge exactly 0.1 ETH
 *    Good: Wallets bridge 0.0847, 0.1123, 0.0956, etc.
 *    ```
 *    Identical values across wallets = Sybil signal
 *
 * 3. BEHAVIORAL SEQUENCES:
 *    ```
 *    Bad:  All wallets do: Bridge → Swap → LP → Stake (same order)
 *    Good: Each wallet has different action sequences
 *    ```
 *    Identical sequences = bot behavior
 *
 * 4. GAS PRICE PATTERNS:
 *    ```
 *    Bad:  All transactions use exactly gasPrice + 10%
 *    Good: Gas prices vary naturally (±5-20%)
 *    ```
 *    Consistent gas settings = automated
 *
 * WHY not pure random:
 * - Humans AREN'T purely random
 * - Have preferences, habits, schedules
 * - Pure random can look MORE suspicious
 * - Need "structured randomness" with personality
 *
 * HOW:
 * ----
 * HOW we generate human-like randomness:
 *
 * 1. TIMING RANDOMIZATION:
 *    ```javascript
 *    // Base time + Gaussian jitter + circadian adjustment
 *    const jitter = gaussianRandom(0, variance);
 *    const circadianFactor = getCircadianWeight(hour);
 *    const finalTime = baseTime + jitter * circadianFactor;
 *    ```
 *
 * 2. AMOUNT RANDOMIZATION:
 *    ```javascript
 *    // Target amount ± variance, avoiding round numbers
 *    const variance = target * 0.15; // 15% variance
 *    let amount = target + gaussianRandom(0, variance);
 *    amount = avoidRoundNumbers(amount);
 *    ```
 *
 * 3. ACTION SEQUENCE RANDOMIZATION:
 *    ```javascript
 *    // Weighted shuffle based on strategy
 *    const actions = weightedShuffle(availableActions, weights);
 *    ```
 *
 * 4. PERSONALITY GENERATION:
 *    ```javascript
 *    // Each wallet gets consistent "personality" traits
 *    const personality = {
 *       preferredHours: [9, 10, 11, 20, 21], // Morning + evening person
 *       amountVariance: 0.12, // This wallet's variance level
 *       actionPreferences: { swap: 1.2, bridge: 0.9 }, // Slight preferences
 *    };
 *    ```
 *
 * =============================================================================
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Circadian rhythm weights by hour
 *
 * WHY these values:
 * - Based on studies of real DeFi user activity
 * - Peaks during US/EU market hours
 * - Lower during typical sleep hours
 */
const CIRCADIAN_WEIGHTS = {
  // Hour: Weight (0-1, higher = more likely)
  0: 0.15, 1: 0.08, 2: 0.05, 3: 0.03, 4: 0.03, 5: 0.05,
  6: 0.15, 7: 0.35, 8: 0.55, 9: 0.75, 10: 0.85, 11: 0.90,
  12: 0.85, 13: 0.80, 14: 0.85, 15: 0.90, 16: 0.95, 17: 0.90,
  18: 0.85, 19: 0.80, 20: 0.75, 21: 0.65, 22: 0.45, 23: 0.30,
};

/**
 * Day of week weights
 *
 * WHY: Real users are more active on weekdays
 */
const DAY_WEIGHTS = {
  0: 0.6,  // Sunday
  1: 0.9,  // Monday
  2: 1.0,  // Tuesday
  3: 1.0,  // Wednesday
  4: 0.95, // Thursday
  5: 0.85, // Friday
  6: 0.7,  // Saturday
};

/**
 * Amount variance configurations
 */
const AMOUNT_VARIANCE = {
  LOW: 0.05,      // 5% variance
  MEDIUM: 0.15,   // 15% variance
  HIGH: 0.25,     // 25% variance
};

/**
 * Timing variance configurations (in hours)
 */
const TIMING_VARIANCE = {
  TIGHT: 0.5,     // ±30 minutes
  NORMAL: 2,      // ±2 hours
  LOOSE: 6,       // ±6 hours
  VERY_LOOSE: 12, // ±12 hours
};

// =============================================================================
// RANDOM NUMBER GENERATORS
// =============================================================================

/**
 * Generate Gaussian (normal) random number
 *
 * Uses Box-Muller transform for true Gaussian distribution
 *
 * WHY Gaussian:
 * - Most natural phenomena follow normal distribution
 * - Human behavior tends toward normal distribution
 * - Allows controlled variance around a mean
 */
function gaussianRandom(mean = 0, stdDev = 1) {
  let u1 = Math.random();
  let u2 = Math.random();

  // Avoid log(0)
  while (u1 === 0) u1 = Math.random();

  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Generate exponential random number
 *
 * WHY exponential:
 * - Good for modeling wait times between events
 * - Most intervals are short, some are long
 * - Matches human "bursts of activity" pattern
 */
function exponentialRandom(lambda = 1) {
  return -Math.log(1 - Math.random()) / lambda;
}

/**
 * Generate beta-distributed random number
 *
 * WHY beta:
 * - Bounded between 0 and 1
 * - Can be shaped for different preferences
 * - Good for time-of-day probability
 */
function betaRandom(alpha = 2, beta = 2) {
  // Use gamma distribution to generate beta
  const gammaA = gammaRandom(alpha);
  const gammaB = gammaRandom(beta);
  return gammaA / (gammaA + gammaB);
}

/**
 * Generate gamma random number (helper for beta)
 */
function gammaRandom(shape) {
  if (shape < 1) {
    return gammaRandom(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x, v;
    do {
      x = gaussianRandom();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Generate Poisson random number
 *
 * WHY Poisson:
 * - Models number of events in a time period
 * - Good for "how many actions today"
 */
function poissonRandom(lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;

  do {
    k++;
    p *= Math.random();
  } while (p > L);

  return k - 1;
}

// =============================================================================
// WALLET PERSONALITY
// =============================================================================

/**
 * Generate a consistent "personality" for a wallet
 *
 * WHY personality:
 * - Real users have consistent habits
 * - Pure randomness is suspicious
 * - Same wallet should behave consistently
 */
class WalletPersonality {
  constructor(walletAddress, seed = null) {
    // Use wallet address to seed deterministic personality
    this.seed = seed || this.hashAddress(walletAddress);

    // Generate personality traits
    this.traits = this.generateTraits();
  }

  /**
   * Simple hash function for seeding
   */
  hashAddress(address) {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      const char = address.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Seeded random (deterministic based on personality)
   */
  seededRandom() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /**
   * Generate personality traits
   */
  generateTraits() {
    // Activity time preference (morning, afternoon, evening person)
    const timePreference = this.seededRandom();
    let preferredHours;
    if (timePreference < 0.33) {
      // Morning person
      preferredHours = [6, 7, 8, 9, 10, 11, 12];
    } else if (timePreference < 0.66) {
      // Afternoon person
      preferredHours = [11, 12, 13, 14, 15, 16, 17];
    } else {
      // Evening person
      preferredHours = [17, 18, 19, 20, 21, 22, 23];
    }

    // Weekend activity level
    const weekendActivity = 0.4 + this.seededRandom() * 0.5; // 0.4 to 0.9

    // Amount variance preference
    const amountVariance = 0.08 + this.seededRandom() * 0.2; // 8% to 28%

    // Timing precision (how punctual)
    const timingPrecision = 0.5 + this.seededRandom() * 0.5; // 0.5 to 1.0

    // Action preferences (slight biases)
    const actionBiases = {
      swap: 0.8 + this.seededRandom() * 0.4,
      bridge: 0.8 + this.seededRandom() * 0.4,
      liquidity: 0.7 + this.seededRandom() * 0.6,
      stake: 0.7 + this.seededRandom() * 0.6,
    };

    // Preferred gas strategy
    const gasStrategy = this.seededRandom() < 0.7 ? 'normal' : 'aggressive';

    // Likelihood of "mistakes" (retries, cancellations)
    const mistakeRate = 0.02 + this.seededRandom() * 0.08; // 2% to 10%

    return {
      preferredHours,
      weekendActivity,
      amountVariance,
      timingPrecision,
      actionBiases,
      gasStrategy,
      mistakeRate,
      timezone: this.selectTimezone(),
    };
  }

  /**
   * Select a plausible timezone
   */
  selectTimezone() {
    const timezones = [
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Australia/Sydney',
    ];
    return timezones[Math.floor(this.seededRandom() * timezones.length)];
  }

  /**
   * Get hour weight for this personality
   */
  getHourWeight(hour) {
    const baseWeight = CIRCADIAN_WEIGHTS[hour];
    const isPreferred = this.traits.preferredHours.includes(hour);
    return isPreferred ? baseWeight * 1.5 : baseWeight * 0.7;
  }

  /**
   * Get day weight for this personality
   */
  getDayWeight(dayOfWeek) {
    const baseWeight = DAY_WEIGHTS[dayOfWeek];
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return baseWeight * this.traits.weekendActivity;
    }
    return baseWeight;
  }
}

// =============================================================================
// RANDOMIZER CLASS
// =============================================================================

/**
 * Main randomizer class for human-like behavior generation
 */
class HumanLikeRandomizer {
  constructor(config = {}) {
    this.config = {
      defaultAmountVariance: config.defaultAmountVariance || AMOUNT_VARIANCE.MEDIUM,
      defaultTimingVariance: config.defaultTimingVariance || TIMING_VARIANCE.NORMAL,
      avoidRoundNumbers: config.avoidRoundNumbers ?? true,
      respectCircadian: config.respectCircadian ?? true,
      respectDayOfWeek: config.respectDayOfWeek ?? true,
    };

    // Personality cache
    this.personalities = new Map();
  }

  // ===========================================================================
  // PERSONALITY MANAGEMENT
  // ===========================================================================

  /**
   * Get or create personality for wallet
   */
  getPersonality(walletAddress) {
    const normalized = walletAddress.toLowerCase();

    if (!this.personalities.has(normalized)) {
      this.personalities.set(normalized, new WalletPersonality(normalized));
    }

    return this.personalities.get(normalized);
  }

  // ===========================================================================
  // TIMING RANDOMIZATION
  // ===========================================================================

  /**
   * Randomize execution time
   *
   * @param {Date|number} baseTime - Target time
   * @param {Object} options - Randomization options
   * @returns {Date} Randomized time
   */
  randomizeTime(baseTime, options = {}) {
    const base = new Date(baseTime);
    const variance = options.variance || this.config.defaultTimingVariance;
    const walletAddress = options.walletAddress;

    // Get personality if available
    const personality = walletAddress ? this.getPersonality(walletAddress) : null;

    // Add Gaussian jitter (in hours)
    let jitterHours = gaussianRandom(0, variance);

    // Adjust for personality's timing precision
    if (personality) {
      jitterHours *= (2 - personality.traits.timingPrecision);
    }

    // Apply jitter
    let newTime = new Date(base.getTime() + jitterHours * 60 * 60 * 1000);

    // Respect circadian rhythm
    if (this.config.respectCircadian) {
      newTime = this.adjustForCircadian(newTime, personality);
    }

    // Respect day of week preferences
    if (this.config.respectDayOfWeek) {
      newTime = this.adjustForDayOfWeek(newTime, personality);
    }

    return newTime;
  }

  /**
   * Adjust time for circadian rhythm
   */
  adjustForCircadian(time, personality = null) {
    const hour = time.getHours();
    const weight = personality
      ? personality.getHourWeight(hour)
      : CIRCADIAN_WEIGHTS[hour];

    // If low weight hour, try to shift to better hour
    if (weight < 0.3 && Math.random() > weight) {
      // Find nearest high-weight hour
      let bestHour = hour;
      let bestWeight = weight;

      for (let h = 0; h < 24; h++) {
        const w = personality
          ? personality.getHourWeight(h)
          : CIRCADIAN_WEIGHTS[h];
        if (w > bestWeight) {
          bestWeight = w;
          bestHour = h;
        }
      }

      // Shift to better hour with some randomness
      const shiftHours = bestHour - hour;
      time = new Date(time.getTime() + shiftHours * 60 * 60 * 1000);

      // Add some variance to the new hour
      const minuteVariance = gaussianRandom(0, 20);
      time = new Date(time.getTime() + minuteVariance * 60 * 1000);
    }

    return time;
  }

  /**
   * Adjust for day of week
   */
  adjustForDayOfWeek(time, personality = null) {
    const day = time.getDay();
    const weight = personality
      ? personality.getDayWeight(day)
      : DAY_WEIGHTS[day];

    // Small chance to skip low-activity days
    if (weight < 0.7 && Math.random() > weight) {
      // Move to next weekday
      const daysToAdd = day === 0 ? 1 : day === 6 ? 2 : 0;
      if (daysToAdd > 0) {
        time = new Date(time.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      }
    }

    return time;
  }

  /**
   * Generate random interval between actions
   *
   * @param {Object} frequency - { min, max, unit } in days
   * @param {string} walletAddress - For personality consistency
   * @returns {number} Interval in milliseconds
   */
  randomizeInterval(frequency, walletAddress = null) {
    const minDays = frequency.min || 1;
    const maxDays = frequency.max || 7;

    // Use exponential distribution with mean at (min + max) / 2
    const meanDays = (minDays + maxDays) / 2;
    let days = exponentialRandom(1 / meanDays);

    // Clamp to bounds
    days = Math.max(minDays, Math.min(maxDays, days));

    // Add some noise
    days += gaussianRandom(0, 0.2);
    days = Math.max(minDays * 0.8, days); // Don't go below 80% of min

    // Adjust for personality
    if (walletAddress) {
      const personality = this.getPersonality(walletAddress);
      // More precise personalities have less interval variance
      const varianceFactor = 2 - personality.traits.timingPrecision;
      days *= (0.8 + varianceFactor * 0.4);
    }

    return days * 24 * 60 * 60 * 1000; // Convert to ms
  }

  // ===========================================================================
  // AMOUNT RANDOMIZATION
  // ===========================================================================

  /**
   * Randomize transaction amount
   *
   * @param {number} targetAmount - Target amount
   * @param {Object} options - Randomization options
   * @returns {number} Randomized amount
   */
  randomizeAmount(targetAmount, options = {}) {
    const variance = options.variance || this.config.defaultAmountVariance;
    const minAmount = options.minAmount || targetAmount * 0.5;
    const maxAmount = options.maxAmount || targetAmount * 2;
    const decimals = options.decimals ?? 6;
    const walletAddress = options.walletAddress;

    // Get personality variance if available
    let actualVariance = variance;
    if (walletAddress) {
      const personality = this.getPersonality(walletAddress);
      actualVariance = personality.traits.amountVariance;
    }

    // Apply Gaussian variance
    let amount = targetAmount * (1 + gaussianRandom(0, actualVariance));

    // Clamp to bounds
    amount = Math.max(minAmount, Math.min(maxAmount, amount));

    // Avoid round numbers if configured
    if (this.config.avoidRoundNumbers) {
      amount = this.avoidRoundNumbers(amount, decimals);
    }

    return amount;
  }

  /**
   * Make amount look less "round"
   */
  avoidRoundNumbers(amount, decimals = 6) {
    // Convert to string to analyze
    const str = amount.toString();

    // If it's a nice round number, add noise
    if (str.match(/^[0-9]+\.?0*$/) || str.match(/^[0-9]+\.[0-9]0+$/)) {
      // Add small random noise (1-5%)
      const noise = amount * (0.01 + Math.random() * 0.04);
      amount = Math.random() > 0.5 ? amount + noise : amount - noise;
    }

    // Round to specified decimals
    const factor = Math.pow(10, decimals);
    return Math.round(amount * factor) / factor;
  }

  /**
   * Generate realistic-looking amount within range
   */
  generateRealisticAmount(minAmount, maxAmount, options = {}) {
    const decimals = options.decimals ?? 6;

    // Use beta distribution to favor middle values
    const beta = betaRandom(2, 2);
    let amount = minAmount + beta * (maxAmount - minAmount);

    // Avoid round numbers
    if (this.config.avoidRoundNumbers) {
      amount = this.avoidRoundNumbers(amount, decimals);
    }

    return amount;
  }

  // ===========================================================================
  // GAS RANDOMIZATION
  // ===========================================================================

  /**
   * Randomize gas price
   *
   * @param {BigInt|number} baseGasPrice - Estimated gas price
   * @param {Object} options - Randomization options
   * @returns {BigInt} Randomized gas price
   */
  randomizeGasPrice(baseGasPrice, options = {}) {
    const variance = options.variance || 0.1; // 10% default
    const walletAddress = options.walletAddress;

    // Get personality gas strategy
    let strategy = 'normal';
    if (walletAddress) {
      const personality = this.getPersonality(walletAddress);
      strategy = personality.traits.gasStrategy;
    }

    // Calculate multiplier
    let multiplier = 1 + gaussianRandom(0, variance);

    // Adjust based on strategy
    if (strategy === 'aggressive') {
      multiplier *= 1.1; // 10% higher on average
    }

    // Ensure within reasonable bounds (80% to 150%)
    multiplier = Math.max(0.8, Math.min(1.5, multiplier));

    // Apply to gas price
    const base = typeof baseGasPrice === 'bigint'
      ? Number(baseGasPrice)
      : baseGasPrice;

    return BigInt(Math.floor(base * multiplier));
  }

  /**
   * Randomize gas limit (usually pad by 10-30%)
   */
  randomizeGasLimit(estimatedGas, options = {}) {
    const base = typeof estimatedGas === 'bigint'
      ? Number(estimatedGas)
      : estimatedGas;

    // Random padding between 10% and 30%
    const padding = 1.1 + Math.random() * 0.2;

    return BigInt(Math.floor(base * padding));
  }

  // ===========================================================================
  // SLIPPAGE RANDOMIZATION
  // ===========================================================================

  /**
   * Randomize slippage tolerance
   *
   * @param {number} baseSlippage - Base slippage (e.g., 0.5 for 0.5%)
   * @param {Object} options - Options
   * @returns {number} Randomized slippage
   */
  randomizeSlippage(baseSlippage, options = {}) {
    const minSlippage = options.minSlippage || 0.1;
    const maxSlippage = options.maxSlippage || 3.0;

    // Add variance
    let slippage = baseSlippage * (1 + gaussianRandom(0, 0.2));

    // Clamp
    slippage = Math.max(minSlippage, Math.min(maxSlippage, slippage));

    // Round to nice value (0.1 increments)
    return Math.round(slippage * 10) / 10;
  }

  // ===========================================================================
  // ACTION RANDOMIZATION
  // ===========================================================================

  /**
   * Weighted random selection from array
   *
   * @param {Array} items - Items to select from
   * @param {Function} weightFn - Function to get weight for item
   * @returns {any} Selected item
   */
  weightedSelect(items, weightFn) {
    if (items.length === 0) return null;

    const weights = items.map(weightFn);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let random = Math.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }

    return items[items.length - 1];
  }

  /**
   * Shuffle array with weighted bias
   */
  weightedShuffle(items, weights = null) {
    const weighted = items.map((item, i) => ({
      item,
      weight: weights ? weights[i] : 1,
      random: Math.random(),
    }));

    // Sort by (random / weight) for weighted shuffle
    weighted.sort((a, b) => (a.random / a.weight) - (b.random / b.weight));

    return weighted.map(w => w.item);
  }

  // ===========================================================================
  // MISTAKE SIMULATION
  // ===========================================================================

  /**
   * Determine if we should simulate a "mistake"
   *
   * WHY mistakes:
   * - Real users make mistakes
   * - Perfect execution is suspicious
   * - Shows human-like behavior
   */
  shouldSimulateMistake(walletAddress = null) {
    let mistakeRate = 0.05; // 5% default

    if (walletAddress) {
      const personality = this.getPersonality(walletAddress);
      mistakeRate = personality.traits.mistakeRate;
    }

    return Math.random() < mistakeRate;
  }

  /**
   * Generate a realistic "mistake" scenario
   */
  generateMistake() {
    const mistakes = [
      { type: 'retry', description: 'Transaction retry (as if first failed)' },
      { type: 'cancel', description: 'Cancel and resubmit with different gas' },
      { type: 'wrong_amount', description: 'Slightly wrong amount, correct it' },
      { type: 'pause', description: 'Unexpected pause before continuing' },
    ];

    return mistakes[Math.floor(Math.random() * mistakes.length)];
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Get activity probability for given time
   */
  getActivityProbability(time, walletAddress = null) {
    const date = new Date(time);
    const hour = date.getHours();
    const day = date.getDay();

    let hourWeight = CIRCADIAN_WEIGHTS[hour];
    let dayWeight = DAY_WEIGHTS[day];

    if (walletAddress) {
      const personality = this.getPersonality(walletAddress);
      hourWeight = personality.getHourWeight(hour);
      dayWeight = personality.getDayWeight(day);
    }

    return hourWeight * dayWeight;
  }

  /**
   * Check if time is suitable for activity
   */
  isSuitableTime(time, walletAddress = null, threshold = 0.3) {
    return this.getActivityProbability(time, walletAddress) >= threshold;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      personalitiesGenerated: this.personalities.size,
      config: this.config,
    };
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  HumanLikeRandomizer,
  WalletPersonality,
  CIRCADIAN_WEIGHTS,
  DAY_WEIGHTS,
  AMOUNT_VARIANCE,
  TIMING_VARIANCE,

  // Random number generators
  gaussianRandom,
  exponentialRandom,
  betaRandom,
  poissonRandom,

  // Factory
  createRandomizer: (config = {}) => new HumanLikeRandomizer(config),
};
