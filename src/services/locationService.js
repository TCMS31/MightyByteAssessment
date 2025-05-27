'use strict';

const driverStore = require('../models/driverStore');
const { findProfileById } = require('../utils/credentials');
const { isWithinServiceArea } = require('../utils/locationGenerator');
const { driverEvents, DriverEvents } = require('../realtime/events');

/**
 * Failure codes returned by {@link recordLocation}. Transports map these to an
 * HTTP status or a socket error payload; the service itself stays protocol-free.
 */
const LocationError = Object.freeze({
  INVALID_TYPE: 'INVALID_TYPE',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  UNKNOWN_DRIVER: 'UNKNOWN_DRIVER',
});

const ERROR_MESSAGES = Object.freeze({
  [LocationError.INVALID_TYPE]: 'Invalid location data: lat and lng must be finite numbers',
  [LocationError.OUT_OF_RANGE]:
    'Invalid coordinates: lat must be -90 to 90, lng must be -180 to 180',
  [LocationError.UNKNOWN_DRIVER]: 'Driver profile not found',
});

/**
 * Validates a coordinate pair.
 * @param {unknown} lat
 * @param {unknown} lng
 * @returns {{ok: true} | {ok: false, code: string, message: string}}
 */
function validateCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail(LocationError.INVALID_TYPE);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return fail(LocationError.OUT_OF_RANGE);
  }
  return { ok: true };
}

/**
 * Applies a location update and publishes the resulting domain events.
 *
 * This is the single implementation shared by `POST /api/driver/update` and the
 * `location_update` socket event. Previously each transport carried its own
 * copy, and they had already started to diverge.
 *
 * @param {{driverId: string, lat: unknown, lng: unknown}} input
 * @param {{store?: object, events?: import('node:events').EventEmitter}} [deps]
 * @returns {{ok: true, update: object, cameOnline: boolean} | {ok: false, code: string, message: string}}
 */
function recordLocation({ driverId, lat, lng }, deps = {}) {
  const store = deps.store || driverStore;
  const events = deps.events || driverEvents;

  const validation = validateCoordinates(lat, lng);
  if (!validation.ok) return validation;

  const profile = findProfileById(driverId);
  if (!profile) return fail(LocationError.UNKNOWN_DRIVER);

  const wasOnline = store.isDriverOnline(driverId);
  const record = store.updateDriverLocation(driverId, lat, lng, profile);

  const update = {
    driverId,
    profile,
    location: {
      lat: record.lat,
      lng: record.lng,
      timestamp: record.timestamp.toISOString(),
    },
    withinServiceArea: isWithinServiceArea(record.lat, record.lng),
    timestamp: record.timestamp.toISOString(),
  };

  const cameOnline = !wasOnline;
  if (cameOnline) events.emit(DriverEvents.CAME_ONLINE, update);
  events.emit(DriverEvents.LOCATION_UPDATED, update);

  return { ok: true, update, cameOnline };
}

/**
 * Takes a driver offline and publishes the transition.
 * @param {string} driverId
 * @param {{reason?: string, store?: object, events?: import('node:events').EventEmitter}} [options]
 * @returns {{driverId: string, profile: object|null, lastSeen: string|null, reason: string, timestamp: string}}
 */
function markOffline(driverId, options = {}) {
  const store = options.store || driverStore;
  const events = options.events || driverEvents;

  const previous = store.getDriverLocation(driverId);
  store.removeDriver(driverId);

  const payload = {
    driverId,
    profile: previous?.profile ?? findProfileById(driverId),
    lastSeen: previous ? previous.timestamp.toISOString() : null,
    reason: options.reason || 'unknown',
    timestamp: new Date().toISOString(),
  };

  events.emit(DriverEvents.WENT_OFFLINE, payload);
  return payload;
}

/**
 * @param {string} code
 * @returns {{ok: false, code: string, message: string}}
 */
function fail(code) {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}

module.exports = {
  LocationError,
  validateCoordinates,
  recordLocation,
  markOffline,
};
