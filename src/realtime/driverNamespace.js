'use strict';

const driverStore = require('../models/driverStore');
const logger = require('../utils/logger');
const { authenticateSocketToken } = require('../utils/auth');
const { recordLocation, markOffline } = require('../services/locationService');

const NAMESPACE = '/driver/update';

/**
 * Driver-facing namespace.
 *
 * Authentication: required (JWT in `handshake.auth.token`).
 * Inbound : `location_update`, `start_sharing`, `stop_sharing`, `ping`
 * Outbound: `connected`, `location_updated`, `sharing_started`, `sharing_stopped`, `pong`, `error`
 *
 * The handler does no validation and no broadcasting of its own: it hands the
 * payload to the location service and lets the service publish domain events.
 *
 * @param {import('socket.io').Server} io
 * @param {{store?: object}} [deps]
 * @returns {import('socket.io').Namespace}
 */
function registerDriverNamespace(io, deps = {}) {
  const store = deps.store || driverStore;
  const namespace = io.of(NAMESPACE);

  namespace.use(authenticateSocketToken);

  namespace.on('connection', (socket) => {
    const { driverId, name: driverName } = socket.user;

    // Last connection wins. The id is recorded so a *stale* socket's disconnect
    // cannot take a freshly reconnected driver offline.
    store.setDriverSocket(driverId, socket.id);
    logger.info(`Driver ${driverName} (${driverId}) connected on ${NAMESPACE}`);

    socket.on('location_update', (data) => {
      const { lat, lng } = data ?? {};
      const result = recordLocation({ driverId, lat, lng });

      if (!result.ok) {
        socket.emit('error', { code: result.code, message: result.message });
        return;
      }

      socket.emit('location_updated', {
        success: true,
        location: result.update.location,
        withinServiceArea: result.update.withinServiceArea,
        timestamp: result.update.timestamp,
      });
    });

    socket.on('start_sharing', () => {
      socket.emit('sharing_started', {
        message: 'Location sharing started',
        driverId,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('stop_sharing', () => {
      markOffline(driverId, { reason: 'stop_sharing' });
      socket.emit('sharing_stopped', {
        message: 'Location sharing stopped',
        driverId,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Driver ${driverName} (${driverId}) disconnected: ${reason}`);

      if (store.getDriverSocket(driverId) !== socket.id) {
        // A newer connection already replaced this one; leave it alone.
        return;
      }
      markOffline(driverId, { reason });
    });

    socket.emit('connected', {
      message: 'Successfully connected to driver location service',
      driverId,
      name: driverName,
      timestamp: new Date().toISOString(),
    });
  });

  return namespace;
}

module.exports = { registerDriverNamespace, DRIVER_NAMESPACE: NAMESPACE };
