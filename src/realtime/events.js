'use strict';

const { EventEmitter } = require('node:events');

/**
 * Domain event names published by the service layer.
 *
 * The service layer never imports Socket.IO and the transport layer never
 * imports the store. They meet here. This is what removes the original
 * `require('../server')` cycle inside the controller.
 */
const DriverEvents = Object.freeze({
  LOCATION_UPDATED: 'driver.location_updated',
  CAME_ONLINE: 'driver.came_online',
  WENT_OFFLINE: 'driver.went_offline',
});

/** Process-wide domain event bus. */
const driverEvents = new EventEmitter();

// A dashboard client count is unbounded in principle; raise the ceiling rather
// than emit spurious MaxListenersExceededWarning noise.
driverEvents.setMaxListeners(50);

module.exports = { driverEvents, DriverEvents };
