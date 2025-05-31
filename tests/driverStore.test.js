'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { DriverStore } = require('../src/models/driverStore');

/** Builds a store with a controllable clock. */
function makeStore(overrides = {}) {
  let now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const store = new DriverStore({
    staleAfterMs: 10_000,
    cleanupIntervalMs: 1_000,
    now: () => now,
    ...overrides,
  });
  return { store, advance: (ms) => (now += ms), at: () => now };
}

test('a fresh fix marks the driver online', () => {
  const { store } = makeStore();
  store.updateDriverLocation('driver1', 40.7, -74.0, { id: 'driver1' });

  assert.equal(store.isDriverOnline('driver1'), true);
  assert.equal(store.getOnlineDrivers().length, 1);
});

test('a driver with no fix at all is offline', () => {
  const { store } = makeStore();
  assert.equal(store.isDriverOnline('driver1'), false);
  assert.equal(store.getDriverLocation('driver1'), null);
});

test('the online window is inclusive at its boundary and closes after it', () => {
  const { store, advance } = makeStore();
  store.updateDriverLocation('driver1', 40.7, -74.0);

  advance(10_000);
  assert.equal(store.isDriverOnline('driver1'), true, 'exactly at the window edge');

  advance(1);
  assert.equal(store.isDriverOnline('driver1'), false, 'one millisecond past the edge');
  assert.equal(store.getOnlineDrivers().length, 0);
});

test('a stale driver keeps their record until cleanup evicts it', () => {
  const { store, advance } = makeStore();
  store.updateDriverLocation('driver1', 40.7, -74.0);

  advance(15_000);
  assert.equal(store.isDriverOnline('driver1'), false);
  assert.ok(store.getDriverLocation('driver1'), 'last-seen data survives one window');
  assert.deepEqual(store.cleanup(), { tokensEvicted: 0, driversEvicted: 0 });

  advance(10_000); // now past 2x the stale window
  assert.deepEqual(store.cleanup(), { tokensEvicted: 0, driversEvicted: 1 });
  assert.equal(store.getDriverLocation('driver1'), null);
});

test('isTokenActive honours the recorded expiry and evicts on read', () => {
  const { store, advance, at } = makeStore();
  const expiresAt = new Date(at() + 5_000);
  store.storeActiveToken('tok', 'driver1', expiresAt);

  assert.equal(store.isTokenActive('tok'), true);

  advance(5_001);
  assert.equal(store.isTokenActive('tok'), false);
  assert.equal(store.activeTokens.size, 0, 'the expired record is dropped on read');
});

test('isTokenActive is false for an unknown token', () => {
  const { store } = makeStore();
  assert.equal(store.isTokenActive('never-issued'), false);
});

test('removeActiveToken reports whether anything was revoked', () => {
  const { store, at } = makeStore();
  store.storeActiveToken('tok', 'driver1', new Date(at() + 5_000));

  assert.equal(store.removeActiveToken('tok'), true);
  assert.equal(store.removeActiveToken('tok'), false);
});

test('cleanup evicts expired tokens', () => {
  const { store, advance, at } = makeStore();
  store.storeActiveToken('live', 'driver1', new Date(at() + 60_000));
  store.storeActiveToken('dead', 'driver2', new Date(at() + 1_000));

  advance(2_000);
  assert.equal(store.cleanup().tokensEvicted, 1);
  assert.equal(store.isTokenActive('live'), true);
});

test('updateDriverLocation carries the profile forward when none is supplied', () => {
  const { store } = makeStore();
  store.updateDriverLocation('driver1', 40.7, -74.0, { id: 'driver1', name: 'John Smith' });
  store.updateDriverLocation('driver1', 40.8, -73.9);

  assert.equal(store.getDriverProfile('driver1').name, 'John Smith');
  assert.equal(store.getDriverLocation('driver1').lat, 40.8);
});

test('removeDriver clears both the fix and the socket registration', () => {
  const { store } = makeStore();
  store.updateDriverLocation('driver1', 40.7, -74.0);
  store.setDriverSocket('driver1', 'socket-a');

  store.removeDriver('driver1');

  assert.equal(store.getDriverLocation('driver1'), null);
  assert.equal(store.getDriverSocket('driver1'), null);
});

test('setDriverSocket is last-write-wins', () => {
  const { store } = makeStore();
  store.setDriverSocket('driver1', 'socket-a');
  store.setDriverSocket('driver1', 'socket-b');

  assert.equal(store.getDriverSocket('driver1'), 'socket-b');
});

test('getStats counts tokens, fixes, sockets and live drivers separately', () => {
  const { store, advance, at } = makeStore();
  store.storeActiveToken('tok', 'driver1', new Date(at() + 60_000));
  store.updateDriverLocation('driver1', 40.7, -74.0);
  store.setDriverSocket('driver1', 'socket-a');
  store.updateDriverLocation('driver2', 40.75, -73.95);

  assert.deepEqual(store.getStats(), {
    activeTokens: 1,
    driverLocations: 2,
    connectedSockets: 1,
    onlineDrivers: 2,
  });

  advance(11_000);
  assert.equal(store.getStats().onlineDrivers, 0, 'stale fixes stop counting as online');
  assert.equal(store.getStats().driverLocations, 2, 'but the rows are still there');
});

test("the cleanup timer is unref'd and idempotent so it cannot hold the process open", () => {
  const { store } = makeStore();

  const timer = store.startCleanupInterval();
  assert.equal(store.startCleanupInterval(), timer, 'starting twice reuses one timer');
  assert.equal(timer.hasRef(), false);

  store.stopCleanupInterval();
  assert.equal(store.cleanupTimer, null);
  store.stopCleanupInterval(); // safe to call twice
});

test('reset empties every map', () => {
  const { store, at } = makeStore();
  store.storeActiveToken('tok', 'driver1', new Date(at() + 60_000));
  store.updateDriverLocation('driver1', 40.7, -74.0);
  store.setDriverSocket('driver1', 'socket-a');

  store.reset();

  assert.deepEqual(store.getStats(), {
    activeTokens: 0,
    driverLocations: 0,
    connectedSockets: 0,
    onlineDrivers: 0,
  });
});
