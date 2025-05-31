'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const config = require('../src/config/config');
const { DriverStore } = require('../src/models/driverStore');
const {
  generateToken,
  verifyToken,
  extractBearerToken,
  authoriseToken,
} = require('../src/utils/auth');

const PROFILE = { id: 'driver1', name: 'John Smith', vehicle: 'Toyota Camry 2020' };

test('generateToken embeds the driver claims and a matching expiry record', () => {
  const before = Date.now();
  const { token, expiresAt, expiresInSeconds } = generateToken(PROFILE);
  const claims = verifyToken(token);

  assert.equal(claims.driverId, 'driver1');
  assert.equal(claims.name, 'John Smith');
  assert.equal(expiresInSeconds, config.jwtExpirySeconds);

  // The store record and the JWT `exp` claim come from one config value; this
  // guards the drift the original code had between `5m` and a hardcoded +5min.
  const skewMs = Math.abs(expiresAt.getTime() - claims.exp * 1000);
  assert.ok(skewMs <= 1500, `expiry skew was ${skewMs}ms`);
  assert.ok(expiresAt.getTime() >= before + config.jwtExpirySeconds * 1000 - 1500);
});

test('verifyToken rejects a token signed with another secret', () => {
  const forged = jwt.sign({ driverId: 'driver1' }, 'not-the-secret');
  assert.equal(verifyToken(forged), null);
});

test('verifyToken rejects an already expired token', () => {
  const expired = jwt.sign({ driverId: 'driver1' }, config.jwtSecret, { expiresIn: -10 });
  assert.equal(verifyToken(expired), null);
});

test('verifyToken rejects malformed input without throwing', () => {
  assert.equal(verifyToken('not-a-jwt'), null);
  assert.equal(verifyToken(''), null);
  assert.equal(verifyToken(undefined), null);
});

test('extractBearerToken accepts only a well-formed Bearer header', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('  Bearer   abc.def.ghi  '), 'abc.def.ghi');

  // The original `split(' ')[1]` accepted any scheme and yielded `undefined`
  // for a bare keyword, which then reached jwt.verify.
  assert.equal(extractBearerToken('Basic abc.def.ghi'), null);
  assert.equal(extractBearerToken('Bearer'), null);
  assert.equal(extractBearerToken('Bearer '), null);
  assert.equal(extractBearerToken(''), null);
  assert.equal(extractBearerToken(undefined), null);
});

test('authoriseToken reports a missing token distinctly', () => {
  const store = new DriverStore();
  assert.deepEqual(authoriseToken(null, { store }), { ok: false, reason: 'missing' });
});

test('authoriseToken accepts a signed token that the store still holds', () => {
  const store = new DriverStore();
  const { token, expiresAt } = generateToken(PROFILE);
  store.storeActiveToken(token, PROFILE.id, expiresAt);

  const result = authoriseToken(token, { store });
  assert.equal(result.ok, true);
  assert.equal(result.claims.driverId, 'driver1');
});

test('authoriseToken rejects a signed token the store has revoked', () => {
  const store = new DriverStore();
  const { token, expiresAt } = generateToken(PROFILE);
  store.storeActiveToken(token, PROFILE.id, expiresAt);
  store.removeActiveToken(token);

  // The JWT is still cryptographically valid; only the store knows it is dead.
  assert.ok(verifyToken(token));
  assert.deepEqual(authoriseToken(token, { store }), { ok: false, reason: 'revoked' });
});

test('authoriseToken rejects a forged token before consulting the store', () => {
  const store = new DriverStore();
  const forged = jwt.sign({ driverId: 'driver1' }, 'not-the-secret');
  assert.deepEqual(authoriseToken(forged, { store }), { ok: false, reason: 'invalid' });
});
