'use strict';

const express = require('express');

const {
  updateLocation,
  getOwnLocation,
  getOnlineDrivers,
  getDriverLocation,
  getStats,
} = require('../controllers/driverController');
const { authenticateToken } = require('../utils/auth');

const router = express.Router();

// Literal paths are declared before the `:driverId` pattern so that
// `/online` and `/stats` can never be captured as a driver id.
router.get('/online', getOnlineDrivers);
router.get('/stats', getStats);

router.post('/update', authenticateToken, updateLocation);
router.get('/location', authenticateToken, getOwnLocation);

router.get('/:driverId/location', getDriverLocation);

module.exports = router;
