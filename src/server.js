'use strict';

const http = require('node:http');

const config = require('./config/config');
const driverStore = require('./models/driverStore');
const logger = require('./utils/logger');
const { createApp } = require('./app');
const { attachRealtime } = require('./realtime');

/**
 * Composition root: wire the HTTP app, the realtime layer and the store, and
 * return handles for a clean shutdown. Nothing else in the codebase calls
 * `listen()` or constructs a Socket.IO server.
 *
 * @param {{port?: number}} [options]
 * @returns {Promise<{app: object, server: import('http').Server, io: object, close: () => Promise<void>}>}
 */
async function start(options = {}) {
  const port = options.port ?? config.port;

  const app = createApp();
  const server = http.createServer(app);
  const { io, dispose } = attachRealtime(server);

  driverStore.startCleanupInterval();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const close = async () => {
    driverStore.stopCleanupInterval();
    dispose();
    await new Promise((resolve) => server.close(resolve));
  };

  return { app, server, io, close };
}

/* c8 ignore start -- process bootstrap, exercised by running the server */
if (require.main === module) {
  start()
    .then(({ server, close }) => {
      const { port } = server.address();
      logger.info('Ride-Sharing Dashboard backend started');
      logger.info(`  HTTP        http://localhost:${port}`);
      logger.info(`  Driver WS   ws://localhost:${port}/driver/update`);
      logger.info(`  Dashboard   ws://localhost:${port}/dashboard`);
      logger.info(`  Environment ${config.nodeEnv}`);

      const shutdown = (signal) => {
        logger.info(`${signal} received, shutting down`);
        close()
          .then(() => process.exit(0))
          .catch(() => process.exit(1));
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((error) => {
      logger.error('Failed to start server:', error);
      process.exit(1);
    });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
  });
}
/* c8 ignore stop */

module.exports = { start };
