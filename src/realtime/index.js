'use strict';

const { Server } = require('socket.io');

const config = require('../config/config');
const { registerDriverNamespace, DRIVER_NAMESPACE } = require('./driverNamespace');
const { registerDashboardNamespace, DASHBOARD_NAMESPACE } = require('./dashboardNamespace');

/**
 * Attaches Socket.IO and both namespaces to an HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @param {{store?: object, events?: import('node:events').EventEmitter}} [deps]
 * @returns {{io: import('socket.io').Server, dispose: () => void}}
 */
function attachRealtime(httpServer, deps = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  registerDriverNamespace(io, deps);
  const dashboard = registerDashboardNamespace(io, deps);

  return {
    io,
    dispose: () => {
      dashboard.dispose();
      io.close();
    },
  };
}

module.exports = { attachRealtime, DRIVER_NAMESPACE, DASHBOARD_NAMESPACE };
