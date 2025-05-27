'use strict';

const config = require('../config/config');
const driverStore = require('../models/driverStore');
const driverService = require('../services/driverService');
const logger = require('../utils/logger');
const { driverEvents, DriverEvents } = require('./events');

const NAMESPACE = '/dashboard';

/** Socket.IO room name carrying updates for one driver. */
const roomFor = (driverId) => `driver:${driverId}`;

/** Extracts the driver id from a room name, or null for non-driver rooms. */
const driverIdFromRoom = (room) =>
  room.startsWith('driver:') ? room.slice('driver:'.length) : null;

/**
 * Dashboard-facing namespace.
 *
 * Authentication: none (read-only view; see README limitations).
 * Inbound : `subscribe`, `unsubscribe`, `get_online_drivers`, `get_driver_info`, `ping`
 * Outbound: `connected`, `online_drivers`, `driver_data`, `driver_offline`,
 *           `OFFLINE_DRIVER`, `driver_connected`, `driver_disconnected`,
 *           `subscribed`, `unsubscribed`, `driver_info`, `driver_not_found`, `pong`, `error`
 *
 * Fan-out uses one Socket.IO room per driver, so a location update touches only
 * the clients watching that driver. The original implementation gave every
 * connected client its own pair of `setInterval` timers and broadcast every
 * update to every client.
 *
 * @param {import('socket.io').Server} io
 * @param {{store?: object, events?: import('node:events').EventEmitter}} [deps]
 * @returns {import('socket.io').Namespace}
 */
function registerDashboardNamespace(io, deps = {}) {
  const store = deps.store || driverStore;
  const events = deps.events || driverEvents;
  const namespace = io.of(NAMESPACE);

  /* ------------------------ domain events -> sockets ------------------------ */

  const onLocationUpdated = (update) => {
    namespace.to(roomFor(update.driverId)).emit('driver_data', {
      driverId: update.driverId,
      profile: update.profile,
      location: update.location,
      isOnline: true,
      lastUpdate: update.timestamp,
    });
  };

  const onCameOnline = (update) => {
    namespace.emit('driver_connected', {
      driverId: update.driverId,
      profile: update.profile,
      location: update.location,
      timestamp: update.timestamp,
    });
    broadcastRoster();
  };

  const onWentOffline = (payload) => {
    namespace.to(roomFor(payload.driverId)).emit('driver_offline', {
      driverId: payload.driverId,
      message: 'Driver is currently offline or no location data available',
      lastSeen: payload.lastSeen,
      timestamp: payload.timestamp,
    });
    namespace.emit('driver_disconnected', payload);
    broadcastRoster();
  };

  events.on(DriverEvents.LOCATION_UPDATED, onLocationUpdated);
  events.on(DriverEvents.CAME_ONLINE, onCameOnline);
  events.on(DriverEvents.WENT_OFFLINE, onWentOffline);

  function broadcastRoster() {
    namespace.emit('online_drivers', driverService.listOnlineDrivers({ store }));
  }

  /* --------------------------- shared offline sweep -------------------------- */

  // One timer for the whole namespace rather than two per connected client.
  const sweepTimer = setInterval(() => {
    for (const room of namespace.adapter.rooms.keys()) {
      const driverId = driverIdFromRoom(room);
      if (!driverId || store.isDriverOnline(driverId)) continue;

      const record = store.getDriverLocation(driverId);
      namespace.to(room).emit('OFFLINE_DRIVER', {
        driverId,
        message: 'Driver is currently offline - no recent location data',
        lastSeen: record ? record.timestamp.toISOString() : null,
        timestamp: new Date().toISOString(),
      });
    }
  }, config.offlineSweepIntervalMs);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

  /* -------------------------------- sockets --------------------------------- */

  namespace.on('connection', (socket) => {
    logger.info(`Dashboard client connected: ${socket.id}`);
    let subscribedTo = null;

    const leaveCurrentRoom = () => {
      if (!subscribedTo) return null;
      socket.leave(roomFor(subscribedTo));
      const previous = subscribedTo;
      subscribedTo = null;
      return previous;
    };

    socket.on('subscribe', (data) => {
      const driverId = data?.driverId;
      if (!driverId || typeof driverId !== 'string') {
        socket.emit('error', { message: 'Driver ID is required for subscription' });
        return;
      }

      leaveCurrentRoom();
      socket.join(roomFor(driverId));
      subscribedTo = driverId;

      const snapshot = driverService.getDriverSnapshot(driverId, { store });
      if (snapshot?.isOnline) {
        socket.emit('driver_data', {
          driverId,
          profile: snapshot.profile,
          location: snapshot.location,
          isOnline: true,
          lastUpdate: new Date().toISOString(),
        });
      } else {
        socket.emit('driver_offline', {
          driverId,
          message: 'Driver is currently offline or no location data available',
          lastSeen: snapshot ? snapshot.location.timestamp : null,
          timestamp: new Date().toISOString(),
        });
      }

      socket.emit('subscribed', {
        driverId,
        message: `Successfully subscribed to driver ${driverId}`,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('unsubscribe', () => {
      const previous = leaveCurrentRoom();
      if (!previous) return;

      socket.emit('unsubscribed', {
        driverId: previous,
        message: `Unsubscribed from driver ${previous}`,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('get_online_drivers', () => {
      socket.emit('online_drivers', driverService.listOnlineDrivers({ store }));
    });

    socket.on('get_driver_info', (data) => {
      const driverId = data?.driverId;
      if (!driverId || typeof driverId !== 'string') {
        socket.emit('error', { message: 'Driver ID is required' });
        return;
      }

      const snapshot = driverService.getDriverSnapshot(driverId, { store });
      if (!snapshot) {
        socket.emit('driver_not_found', {
          driverId,
          message: 'Driver not found or no location data available',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      socket.emit('driver_info', { ...snapshot, timestamp: new Date().toISOString() });
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', (reason) => {
      leaveCurrentRoom();
      logger.info(`Dashboard client ${socket.id} disconnected: ${reason}`);
    });

    socket.emit('connected', {
      message: 'Successfully connected to dashboard service',
      clientId: socket.id,
      timestamp: new Date().toISOString(),
      features: {
        realTimeUpdates: true,
        driverSubscription: true,
        offlineNotifications: true,
        offlineSweepIntervalMs: config.offlineSweepIntervalMs,
      },
    });

    socket.emit('online_drivers', driverService.listOnlineDrivers({ store }));
  });

  /** Detaches bus listeners and the sweep timer. Used on shutdown and in tests. */
  namespace.dispose = () => {
    clearInterval(sweepTimer);
    events.off(DriverEvents.LOCATION_UPDATED, onLocationUpdated);
    events.off(DriverEvents.CAME_ONLINE, onCameOnline);
    events.off(DriverEvents.WENT_OFFLINE, onWentOffline);
  };

  return namespace;
}

module.exports = { registerDashboardNamespace, DASHBOARD_NAMESPACE: NAMESPACE, roomFor };
