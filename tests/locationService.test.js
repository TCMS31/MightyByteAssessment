'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { DriverStore } = require('../src/models/driverStore');
const { DriverEvents } = require('../src/realtime/events');
const {
  recordLocation,
  markOffline,
  validateCoordinates,
  LocationError,
} = require('../src/services/locationService');

/** Fresh store + bus + a recorder of everything published. */
function makeContext() {
  const store = new DriverStore({ staleAfterMs: 10_000 });
  const events = new EventEmitter();
  const published = [];

  for (const name of Object.values(DriverEvents)) {
    events.on(name, (payload) => published.push({ name, payload }));
  }

  return { store, events, published, deps: { store, events } };
}

test('validateCoordinates rejects non-numeric input', () => {
  for (const [lat, lng] of [
    ['40.7', -74],
    [40.7, null],
    [undefined, undefined],
    [NaN, -74],
    [40.7, Infinity],
  ]) {
    const result = validateCoordinates(lat, lng);
    assert.equal(result.ok, false);
    assert.equal(result.code, LocationError.INVALID_TYPE);
  }
});

test('validateCoordinates rejects out-of-range degrees', () => {
  for (const [lat, lng] of [
    [91, 0],
    [-91, 0],
    [0, 181],
    [0, -181],
  ]) {
    assert.equal(validateCoordinates(lat, lng).code, LocationError.OUT_OF_RANGE);
  }
});

test('validateCoordinates accepts the extremes of the valid range', () => {
  for (const [lat, lng] of [
    [90, 180],
    [-90, -180],
    [0, 0],
  ]) {
    assert.deepEqual(validateCoordinates(lat, lng), { ok: true });
  }
});

test('recordLocation stores the fix and returns a serialisable update', () => {
  const { store, deps } = makeContext();

  const result = recordLocation({ driverId: 'driver1', lat: 40.7128, lng: -74.006 }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.update.driverId, 'driver1');
  assert.equal(result.update.profile.name, 'John Smith');
  assert.equal(result.update.location.lat, 40.7128);
  assert.equal(typeof result.update.location.timestamp, 'string');
  assert.equal(result.update.withinServiceArea, true);
  assert.equal(store.isDriverOnline('driver1'), true);
});

test('recordLocation flags a fix outside the service area without rejecting it', () => {
  const { deps } = makeContext();

  const result = recordLocation({ driverId: 'driver1', lat: 34.0522, lng: -118.2437 }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.update.withinServiceArea, false);
});

test('recordLocation refuses an unknown driver', () => {
  const { store, published, deps } = makeContext();

  const result = recordLocation({ driverId: 'ghost', lat: 40.7, lng: -74 }, deps);

  assert.equal(result.ok, false);
  assert.equal(result.code, LocationError.UNKNOWN_DRIVER);
  assert.equal(store.getDriverLocation('ghost'), null);
  assert.equal(published.length, 0, 'a rejected update publishes nothing');
});

test('recordLocation publishes nothing when the coordinates are invalid', () => {
  const { published, deps } = makeContext();

  assert.equal(recordLocation({ driverId: 'driver1', lat: 'x', lng: 0 }, deps).ok, false);
  assert.equal(recordLocation({ driverId: 'driver1', lat: 100, lng: 0 }, deps).ok, false);
  assert.equal(published.length, 0);
});

test('the first fix publishes came_online then location_updated, in that order', () => {
  const { published, deps } = makeContext();

  const result = recordLocation({ driverId: 'driver1', lat: 40.7, lng: -74 }, deps);

  assert.equal(result.cameOnline, true);
  assert.deepEqual(
    published.map((entry) => entry.name),
    [DriverEvents.CAME_ONLINE, DriverEvents.LOCATION_UPDATED]
  );
});

test('a subsequent fix publishes only location_updated', () => {
  const { published, deps } = makeContext();

  recordLocation({ driverId: 'driver1', lat: 40.7, lng: -74 }, deps);
  published.length = 0;

  const result = recordLocation({ driverId: 'driver1', lat: 40.71, lng: -74.01 }, deps);

  assert.equal(result.cameOnline, false);
  assert.deepEqual(
    published.map((entry) => entry.name),
    [DriverEvents.LOCATION_UPDATED]
  );
});

test('a driver who went stale is announced as online again on their next fix', () => {
  let now = Date.UTC(2026, 0, 1);
  const store = new DriverStore({ staleAfterMs: 10_000, now: () => now });
  const events = new EventEmitter();
  const seen = [];
  events.on(DriverEvents.CAME_ONLINE, (p) => seen.push(p.driverId));
  const deps = { store, events };

  recordLocation({ driverId: 'driver1', lat: 40.7, lng: -74 }, deps);
  now += 20_000;
  recordLocation({ driverId: 'driver1', lat: 40.7, lng: -74 }, deps);

  assert.deepEqual(seen, ['driver1', 'driver1']);
});

test('markOffline removes the driver and reports their last known position', () => {
  const { store, published, deps } = makeContext();
  recordLocation({ driverId: 'driver2', lat: 40.75, lng: -73.98 }, deps);
  published.length = 0;

  const payload = markOffline('driver2', { reason: 'transport close', ...deps });

  assert.equal(payload.driverId, 'driver2');
  assert.equal(payload.profile.name, 'Sarah Johnson');
  assert.equal(typeof payload.lastSeen, 'string');
  assert.equal(payload.reason, 'transport close');
  assert.equal(store.getDriverLocation('driver2'), null);
  assert.deepEqual(
    published.map((entry) => entry.name),
    [DriverEvents.WENT_OFFLINE]
  );
});

test('markOffline still publishes for a driver who never sent a fix', () => {
  const { published, deps } = makeContext();

  const payload = markOffline('driver3', { reason: 'logout', ...deps });

  assert.equal(payload.lastSeen, null);
  assert.equal(payload.profile.name, 'Mike Davis', 'the profile is recovered from the directory');
  assert.equal(published.length, 1);
});

test('one driver going offline does not disturb another', () => {
  const { store, deps } = makeContext();
  recordLocation({ driverId: 'driver1', lat: 40.7, lng: -74 }, deps);
  recordLocation({ driverId: 'driver2', lat: 40.8, lng: -73.9 }, deps);

  markOffline('driver1', deps);

  assert.equal(store.isDriverOnline('driver1'), false);
  assert.equal(store.isDriverOnline('driver2'), true);
});
