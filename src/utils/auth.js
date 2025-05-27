'use strict';

const jwt = require('jsonwebtoken');

const config = require('../config/config');
const driverStore = require('../models/driverStore');

/**
 * Signs a short-lived access token for a driver.
 * @param {object} driverProfile
 * @returns {{token: string, expiresAt: Date, expiresInSeconds: number}}
 */
function generateToken(driverProfile) {
  const token = jwt.sign(
    {
      driverId: driverProfile.id,
      name: driverProfile.name,
      vehicle: driverProfile.vehicle,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpirySeconds }
  );

  return {
    token,
    expiresAt: new Date(Date.now() + config.jwtExpirySeconds * 1000),
    expiresInSeconds: config.jwtExpirySeconds,
  };
}

/**
 * Verifies a token's signature and expiry.
 * @param {string} token
 * @returns {object|null} Decoded claims, or null when the token is unusable.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

/**
 * Extracts a bearer token from an Authorization header.
 *
 * The original implementation used `header.split(' ')[1]`, which accepted any
 * scheme (`Basic <jwt>`) and produced `undefined` for a bare `Bearer`.
 *
 * @param {string|undefined} header
 * @returns {string|null}
 */
function extractBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer[ ]+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Verifies a token and confirms it has not been revoked by a logout.
 *
 * Checking the store is what makes `POST /api/logout` meaningful: a JWT stays
 * cryptographically valid until it expires, so revocation has to be recorded
 * server-side and consulted on every request.
 *
 * @param {string|null} token
 * @param {{store?: object}} [deps]
 * @returns {{ok: true, claims: object} | {ok: false, reason: 'missing'|'invalid'|'revoked'}}
 */
function authoriseToken(token, deps = {}) {
  const store = deps.store || driverStore;

  if (!token) return { ok: false, reason: 'missing' };

  const claims = verifyToken(token);
  if (!claims) return { ok: false, reason: 'invalid' };

  if (!store.isTokenActive(token)) return { ok: false, reason: 'revoked' };

  return { ok: true, claims };
}

/**
 * Express middleware enforcing a live bearer token.
 */
function authenticateToken(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  const result = authoriseToken(token);

  if (!result.ok) {
    if (result.reason === 'missing') {
      return res.status(401).json({ error: 'Access token required' });
    }
    return res.status(401).json({ error: 'Invalid, expired or revoked token' });
  }

  req.token = token;
  req.user = result.claims;
  return next();
}

/**
 * Socket.IO middleware enforcing a live bearer token on the handshake.
 */
function authenticateSocketToken(socket, next) {
  const handshakeToken = socket.handshake?.auth?.token;
  const headerToken = extractBearerToken(socket.handshake?.headers?.authorization);
  const result = authoriseToken(handshakeToken || headerToken);

  if (!result.ok) {
    const error = new Error(
      result.reason === 'missing'
        ? 'Authentication token required'
        : 'Invalid, expired or revoked token'
    );
    error.data = { reason: result.reason };
    return next(error);
  }

  socket.token = handshakeToken || headerToken;
  socket.user = result.claims;
  return next();
}

module.exports = {
  generateToken,
  verifyToken,
  extractBearerToken,
  authoriseToken,
  authenticateToken,
  authenticateSocketToken,
};
