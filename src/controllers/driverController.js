'use strict';

const driverService = require('../services/driverService');
const { recordLocation, LocationError } = require('../services/locationService');

/** Maps a service failure code onto an HTTP status. */
const STATUS_BY_CODE = Object.freeze({
  [LocationError.INVALID_TYPE]: 400,
  [LocationError.OUT_OF_RANGE]: 400,
  [LocationError.UNKNOWN_DRIVER]: 404,
});

/**
 * POST /api/driver/update — record the authenticated driver's current position.
 */
function updateLocation(req, res) {
  const { lat, lng } = req.body ?? {};
  const result = recordLocation({ driverId: req.user.driverId, lat, lng });

  if (!result.ok) {
    return res.status(STATUS_BY_CODE[result.code] ?? 400).json({ error: result.message });
  }

  return res.json({
    success: true,
    message: 'Location updated successfully',
    location: result.update.location,
    withinServiceArea: result.update.withinServiceArea,
    timestamp: result.update.timestamp,
  });
}

/**
 * GET /api/driver/location — the authenticated driver's own last known fix.
 */
function getOwnLocation(req, res) {
  const snapshot = driverService.getDriverSnapshot(req.user.driverId);

  if (!snapshot) {
    return res.status(404).json({ error: 'No location data found for this driver' });
  }

  return res.json({
    success: true,
    location: snapshot.location,
    isOnline: snapshot.isOnline,
  });
}

/**
 * GET /api/driver/online — every driver with a fix inside the stale window.
 */
function getOnlineDrivers(req, res) {
  return res.json({ success: true, ...driverService.listOnlineDrivers() });
}

/**
 * GET /api/driver/:driverId/location — a specific driver's last known fix.
 */
function getDriverLocation(req, res) {
  const { driverId } = req.params;
  const snapshot = driverService.getDriverSnapshot(driverId);

  if (!snapshot) {
    return res.status(404).json({ error: 'Driver location not found', driverId });
  }

  return res.json({ success: true, ...snapshot, timestamp: new Date().toISOString() });
}

/**
 * GET /api/driver/stats — store occupancy counters.
 */
function getStats(req, res) {
  return res.json({
    success: true,
    stats: driverService.getStats(),
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  updateLocation,
  getOwnLocation,
  getOnlineDrivers,
  getDriverLocation,
  getStats,
};
