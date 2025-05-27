'use strict';

const driverStore = require('../models/driverStore');

/**
 * Read-side queries over the driver store. Kept separate from
 * {@link module:services/locationService} so that reads have no event side effects.
 */

/**
 * @param {{store?: object}} [deps]
 * @returns {{drivers: object[], count: number, timestamp: string}}
 */
function listOnlineDrivers(deps = {}) {
  const store = deps.store || driverStore;
  const drivers = store.getOnlineDrivers().map((driver) => ({
    driverId: driver.driverId,
    profile: driver.profile,
    lastSeen: driver.lastSeen.toISOString(),
    isOnline: true,
  }));

  return { drivers, count: drivers.length, timestamp: new Date().toISOString() };
}

/**
 * @param {string} driverId
 * @param {{store?: object}} [deps]
 * @returns {{driverId: string, profile: object|null, location: object, isOnline: boolean}|null}
 */
function getDriverSnapshot(driverId, deps = {}) {
  const store = deps.store || driverStore;
  const record = store.getDriverLocation(driverId);
  if (!record) return null;

  return {
    driverId,
    profile: record.profile,
    location: {
      lat: record.lat,
      lng: record.lng,
      timestamp: record.timestamp.toISOString(),
    },
    isOnline: store.isDriverOnline(driverId),
  };
}

/**
 * @param {{store?: object}} [deps]
 * @returns {object}
 */
function getStats(deps = {}) {
  const store = deps.store || driverStore;
  return store.getStats();
}

module.exports = { listOnlineDrivers, getDriverSnapshot, getStats };
