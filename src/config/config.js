'use strict';

require('dotenv').config();

const DEV_JWT_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

/**
 * Parses a comma-separated CORS origin list.
 * @param {string|undefined} raw
 * @param {string[]} fallback
 * @returns {string[]}
 */
function parseOrigins(raw, fallback) {
  if (!raw) return fallback;
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : fallback;
}

/**
 * Parses a positive integer from the environment, falling back when absent or invalid.
 * @param {string|undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
function parsePositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET must be set when NODE_ENV=production. Refusing to start with the development fallback secret.'
  );
}

const jwtExpirySeconds = parsePositiveInt(process.env.JWT_EXPIRY_SECONDS, 300);

const config = {
  nodeEnv,
  isProduction,
  port: parsePositiveInt(process.env.PORT, 3001),
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,

  // Single source of truth for token lifetime. The JWT `exp` claim and the
  // server-side revocation record are both derived from this value.
  jwtExpirySeconds,
  jwtExpiry: `${jwtExpirySeconds}s`,

  corsOrigins: parseOrigins(process.env.CORS_ORIGINS, ['http://localhost:3000']),

  // A driver is considered online while their last fix is newer than this.
  driverStaleAfterMs: parsePositiveInt(process.env.DRIVER_STALE_AFTER_MS, 10 * 60 * 1000),

  // How often the dashboard namespace re-checks subscribed-but-silent drivers.
  offlineSweepIntervalMs: parsePositiveInt(process.env.OFFLINE_SWEEP_INTERVAL_MS, 60 * 1000),

  // How often the store evicts expired tokens and long-dead driver records.
  storeCleanupIntervalMs: parsePositiveInt(process.env.STORE_CLEANUP_INTERVAL_MS, 60 * 1000),

  // Request body cap. Location payloads are a few dozen bytes; anything larger is abuse.
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '16kb',

  // Service area used by the location simulator and the out-of-area check.
  nycBounds: {
    north: 40.9176,
    south: 40.4774,
    east: -73.7004,
    west: -74.2591,
  },
};

module.exports = config;
module.exports.DEV_JWT_SECRET = DEV_JWT_SECRET;
