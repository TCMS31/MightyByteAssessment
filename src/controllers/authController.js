'use strict';

const config = require('../config/config');
const driverStore = require('../models/driverStore');
const driverService = require('../services/driverService');
const locationService = require('../services/locationService');
const { validateDriverCredentials } = require('../utils/credentials');
const { generateToken } = require('../utils/auth');

/**
 * POST /api/login — exchange driver credentials for a short-lived access token.
 */
function login(req, res) {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const profile = validateDriverCredentials(username, password);
  if (!profile) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { token, expiresAt, expiresInSeconds } = generateToken(profile);
  driverStore.storeActiveToken(token, profile.id, expiresAt);

  return res.json({
    success: true,
    token,
    profile,
    expiresIn: config.jwtExpiry,
    expiresInSeconds,
    expiresAt: expiresAt.toISOString(),
  });
}

/**
 * POST /api/logout — revoke the presented token and take the driver offline.
 */
function logout(req, res) {
  driverStore.removeActiveToken(req.token);
  locationService.markOffline(req.user.driverId, { reason: 'logout' });

  return res.json({ success: true, message: 'Logged out successfully' });
}

/**
 * GET /api/profile — the authenticated driver's claims plus their last known fix.
 */
function getProfile(req, res) {
  const snapshot = driverService.getDriverSnapshot(req.user.driverId);

  return res.json({
    success: true,
    profile: req.user,
    location: snapshot ? snapshot.location : null,
    isOnline: Boolean(snapshot?.isOnline),
  });
}

module.exports = { login, logout, getProfile };
