'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./config/config');
const logger = require('./utils/logger');
const authRoutes = require('./routes/authRoutes');
const driverRoutes = require('./routes/driverRoutes');

/**
 * Builds the Express application.
 *
 * Exported as a factory with no `listen()` and no Socket.IO dependency, so the
 * test suite can mount it under supertest without opening a port, and so the
 * HTTP layer stays independent of the realtime layer.
 *
 * @returns {import('express').Express}
 */
function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; CSP and COEP would restrict the separately
      // hosted React client without protecting anything here.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.jsonBodyLimit }));

  app.use((req, res, next) => {
    logger.debug(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      version: require('../package.json').version,
    });
  });

  app.get('/', (req, res) => {
    res.json({
      message: 'Ride-Sharing Dashboard API',
      status: 'running',
      endpoints: {
        auth: {
          login: 'POST /api/login',
          logout: 'POST /api/logout',
          profile: 'GET /api/profile',
        },
        driver: {
          updateLocation: 'POST /api/driver/update',
          ownLocation: 'GET /api/driver/location',
          onlineDrivers: 'GET /api/driver/online',
          driverLocation: 'GET /api/driver/:driverId/location',
          stats: 'GET /api/driver/stats',
        },
      },
      websockets: {
        driverUpdates: '/driver/update',
        dashboard: '/dashboard',
      },
    });
  });

  app.use('/api', authRoutes);
  app.use('/api/driver', driverRoutes);

  // 404 before the error handler: Express only enters a 4-arity handler when
  // `next(err)` was called, so the original ordering left the fallback
  // unreachable for anything that threw after routing.
  app.use((req, res) => {
    res.status(404).json({
      error: 'Endpoint not found',
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  });

  // Express identifies an error handler by its arity, so `next` must stay.
  app.use((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    res.status(error.status || 500).json({
      error: 'Internal server error',
      message: config.isProduction ? 'Something went wrong' : error.message,
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

module.exports = { createApp };
