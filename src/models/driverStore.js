'use strict';

const config = require('../config/config');

/**
 * In-memory state for the tracking system.
 *
 * Three maps, all keyed for O(1) access:
 *  - activeTokens   token      -> { driverId, expiresAt }   (revocation list)
 *  - driverLocations driverId  -> { lat, lng, timestamp, profile }
 *  - driverSockets   driverId  -> socketId                  (live WS connection)
 *
 * This is deliberately the only module that knows *how* state is stored. Swapping
 * it for Redis means implementing the same methods; nothing else changes.
 */
class DriverStore {
  /**
   * @param {object} [options]
   * @param {number} [options.staleAfterMs] How long a fix stays "online".
   * @param {number} [options.cleanupIntervalMs] Sweep cadence.
   * @param {() => number} [options.now] Clock injection point, for tests.
   */
  constructor(options = {}) {
    this.staleAfterMs = options.staleAfterMs ?? config.driverStaleAfterMs;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? config.storeCleanupIntervalMs;
    this.now = options.now ?? (() => Date.now());

    this.activeTokens = new Map();
    this.driverLocations = new Map();
    this.driverSockets = new Map();

    this.cleanupTimer = null;
  }

  /* ----------------------------- tokens ----------------------------- */

  /**
   * Records a token as live so it can later be revoked.
   * @param {string} token
   * @param {string} driverId
   * @param {Date} expiresAt
   */
  storeActiveToken(token, driverId, expiresAt) {
    this.activeTokens.set(token, { driverId, expiresAt });
  }

  /**
   * @param {string} token
   * @returns {boolean} True when the token is known and not yet expired.
   */
  isTokenActive(token) {
    const record = this.activeTokens.get(token);
    if (!record) return false;

    if (this.now() > record.expiresAt.getTime()) {
      this.activeTokens.delete(token);
      return false;
    }
    return true;
  }

  /**
   * @param {string} token
   * @returns {boolean} True when a live record was removed.
   */
  removeActiveToken(token) {
    return this.activeTokens.delete(token);
  }

  /* ---------------------------- locations ---------------------------- */

  /**
   * Writes the latest fix for a driver.
   * @param {string} driverId
   * @param {number} lat
   * @param {number} lng
   * @param {object|null} [profile]
   * @returns {{lat: number, lng: number, timestamp: Date, profile: object|null}}
   */
  updateDriverLocation(driverId, lat, lng, profile = null) {
    const record = {
      lat,
      lng,
      timestamp: new Date(this.now()),
      profile: profile || this.getDriverProfile(driverId),
    };

    this.driverLocations.set(driverId, record);
    return record;
  }

  /**
   * @param {string} driverId
   * @returns {object|null}
   */
  getDriverLocation(driverId) {
    return this.driverLocations.get(driverId) || null;
  }

  /**
   * @param {string} driverId
   * @returns {object|null}
   */
  getDriverProfile(driverId) {
    const record = this.driverLocations.get(driverId);
    return record ? record.profile : null;
  }

  /**
   * @param {string} driverId
   * @returns {boolean} True when the driver has a fix newer than the stale window.
   */
  isDriverOnline(driverId) {
    const record = this.driverLocations.get(driverId);
    if (!record) return false;
    return this.now() - record.timestamp.getTime() <= this.staleAfterMs;
  }

  /**
   * @returns {Array<{driverId: string, profile: object|null, lastSeen: Date, isOnline: true}>}
   */
  getOnlineDrivers() {
    const now = this.now();
    const online = [];

    for (const [driverId, record] of this.driverLocations) {
      if (now - record.timestamp.getTime() <= this.staleAfterMs) {
        online.push({
          driverId,
          profile: record.profile,
          lastSeen: record.timestamp,
          isOnline: true,
        });
      }
    }

    return online;
  }

  /* ----------------------------- sockets ----------------------------- */

  /**
   * @param {string} driverId
   * @param {string} socketId
   */
  setDriverSocket(driverId, socketId) {
    this.driverSockets.set(driverId, socketId);
  }

  /**
   * @param {string} driverId
   * @returns {string|null}
   */
  getDriverSocket(driverId) {
    return this.driverSockets.get(driverId) || null;
  }

  /**
   * @param {string} driverId
   */
  removeDriverSocket(driverId) {
    this.driverSockets.delete(driverId);
  }

  /**
   * Drops a driver's location and socket registration.
   * @param {string} driverId
   */
  removeDriver(driverId) {
    this.driverLocations.delete(driverId);
    this.driverSockets.delete(driverId);
  }

  /* ----------------------------- lifecycle ---------------------------- */

  /**
   * Evicts expired tokens and driver fixes that are far past the stale window.
   * @returns {{tokensEvicted: number, driversEvicted: number}}
   */
  cleanup() {
    const now = this.now();
    let tokensEvicted = 0;
    let driversEvicted = 0;

    for (const [token, record] of this.activeTokens) {
      if (now > record.expiresAt.getTime()) {
        this.activeTokens.delete(token);
        tokensEvicted += 1;
      }
    }

    // Keep offline drivers around for one extra window so the dashboard can
    // still report "last seen" before the record disappears entirely.
    for (const [driverId, record] of this.driverLocations) {
      if (now - record.timestamp.getTime() > this.staleAfterMs * 2) {
        this.driverLocations.delete(driverId);
        this.driverSockets.delete(driverId);
        driversEvicted += 1;
      }
    }

    return { tokensEvicted, driversEvicted };
  }

  /**
   * Starts the periodic sweep. Unref'd so it never holds the process open.
   */
  startCleanupInterval() {
    if (this.cleanupTimer) return this.cleanupTimer;

    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    if (typeof this.cleanupTimer.unref === 'function') this.cleanupTimer.unref();
    return this.cleanupTimer;
  }

  /**
   * Stops the periodic sweep.
   */
  stopCleanupInterval() {
    if (!this.cleanupTimer) return;
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  /**
   * Clears every map. Used between tests.
   */
  reset() {
    this.activeTokens.clear();
    this.driverLocations.clear();
    this.driverSockets.clear();
  }

  /**
   * @returns {{activeTokens: number, driverLocations: number, connectedSockets: number, onlineDrivers: number}}
   */
  getStats() {
    return {
      activeTokens: this.activeTokens.size,
      driverLocations: this.driverLocations.size,
      connectedSockets: this.driverSockets.size,
      onlineDrivers: this.getOnlineDrivers().length,
    };
  }
}

// The application shares one store; tests instantiate their own.
const driverStore = new DriverStore();

module.exports = driverStore;
module.exports.DriverStore = DriverStore;
