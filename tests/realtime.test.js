'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { io: connect } = require('socket.io-client');

const { createApp } = require('../src/app');
const { attachRealtime } = require('../src/realtime');
const driverStore = require('../src/models/driverStore');
const { generateToken } = require('../src/utils/auth');
const { findProfileById } = require('../src/utils/credentials');

const PORT = 8511;
const BASE = `http://127.0.0.1:${PORT}`;

let server;
let realtime;
const openClients = new Set();

test.before(async () => {
  server = http.createServer(createApp());
  realtime = attachRealtime(server);
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
});

test.after(async () => {
  for (const client of openClients) client.close();
  realtime.dispose();
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(() => driverStore.reset());

test.afterEach(() => {
  for (const client of openClients) client.close();
  openClients.clear();
});

/** Issues a live token for a seeded driver. */
function issueToken(driverId) {
  const { token, expiresAt } = generateToken(findProfileById(driverId));
  driverStore.storeActiveToken(token, driverId, expiresAt);
  return token;
}

/** Opens a tracked socket.io client. */
function open(namespace, options = {}) {
  const client = connect(`${BASE}${namespace}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    ...options,
  });
  openClients.add(client);
  return client;
}

/** Resolves with the first payload for `event`, or rejects on timeout. */
function once(client, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, handler);
      reject(new Error(`timed out waiting for "${event}"`));
    }, timeoutMs);

    const handler = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };
    client.once(event, handler);
  });
}

test('the driver namespace rejects a connection with no token', async () => {
  const client = open('/driver/update');
  const error = await once(client, 'connect_error');

  assert.match(error.message, /Authentication token required/);
});

test('the driver namespace rejects a forged token', async () => {
  const client = open('/driver/update', { auth: { token: 'nonsense' } });
  const error = await once(client, 'connect_error');

  assert.match(error.message, /Invalid, expired or revoked token/);
});

test('the driver namespace rejects a token that was revoked by logout', async () => {
  const token = issueToken('driver1');
  driverStore.removeActiveToken(token);

  const client = open('/driver/update', { auth: { token } });
  const error = await once(client, 'connect_error');

  assert.match(error.message, /Invalid, expired or revoked token/);
});

test('an authenticated driver is greeted and registered', async () => {
  const client = open('/driver/update', { auth: { token: issueToken('driver1') } });
  const greeting = await once(client, 'connected');

  assert.equal(greeting.driverId, 'driver1');
  assert.equal(greeting.name, 'John Smith');
  assert.ok(driverStore.getDriverSocket('driver1'));
});

test('a location_update is acknowledged with a timestamped location', async () => {
  const client = open('/driver/update', { auth: { token: issueToken('driver1') } });
  await once(client, 'connected');

  client.emit('location_update', { lat: 40.7128, lng: -74.006 });
  const ack = await once(client, 'location_updated');

  assert.equal(ack.success, true);
  assert.equal(ack.location.lat, 40.7128);
  // The driver client renders this field; the original payload omitted it and
  // the UI showed "Invalid Date".
  assert.ok(!Number.isNaN(Date.parse(ack.location.timestamp)));
  assert.equal(driverStore.isDriverOnline('driver1'), true);
});

test('an invalid location_update is answered with an error and stores nothing', async () => {
  const client = open('/driver/update', { auth: { token: issueToken('driver1') } });
  await once(client, 'connected');

  client.emit('location_update', { lat: 'north', lng: -74 });
  const error = await once(client, 'error');

  assert.equal(error.code, 'INVALID_TYPE');
  assert.equal(driverStore.isDriverOnline('driver1'), false);
});

test('a dashboard client receives the roster on connect', async () => {
  const dashboard = open('/dashboard');
  const roster = await once(dashboard, 'online_drivers');

  assert.deepEqual(roster.drivers, []);
  assert.equal(roster.count, 0);
});

test('subscribing to an offline driver yields driver_offline, not driver_data', async () => {
  const dashboard = open('/dashboard');
  await once(dashboard, 'connected');

  // Both listeners are attached before the emit: the server answers with
  // `driver_offline` and `subscribed` in the same turn, so awaiting them one
  // after the other would miss the second packet.
  const offline = once(dashboard, 'driver_offline');
  const subscribed = once(dashboard, 'subscribed');
  dashboard.emit('subscribe', { driverId: 'driver2' });

  assert.equal((await offline).driverId, 'driver2');
  assert.equal((await subscribed).driverId, 'driver2');
});

test('subscribing without a driver id is an error', async () => {
  const dashboard = open('/dashboard');
  await once(dashboard, 'connected');

  dashboard.emit('subscribe', {});
  assert.match((await once(dashboard, 'error')).message, /Driver ID is required/);
});

test("a subscribed dashboard receives the driver's live positions", async () => {
  const dashboard = open('/dashboard');
  await once(dashboard, 'connected');
  dashboard.emit('subscribe', { driverId: 'driver1' });
  await once(dashboard, 'subscribed');

  const driver = open('/driver/update', { auth: { token: issueToken('driver1') } });
  await once(driver, 'connected');

  const updated = once(dashboard, 'driver_data');
  driver.emit('location_update', { lat: 40.72, lng: -74.01 });

  const payload = await updated;
  assert.equal(payload.driverId, 'driver1');
  assert.equal(payload.location.lat, 40.72);
  assert.equal(payload.isOnline, true);
  assert.equal(payload.profile.vehicle, 'Toyota Camry 2020');
});

test('a dashboard subscribed to another driver is not sent that traffic', async () => {
  const dashboard = open('/dashboard');
  await once(dashboard, 'connected');
  dashboard.emit('subscribe', { driverId: 'driver2' });
  await once(dashboard, 'subscribed');

  const received = [];
  dashboard.on('driver_data', (payload) => received.push(payload));

  const driver = open('/driver/update', { auth: { token: issueToken('driver1') } });
  await once(driver, 'connected');

  // driver_connected is a roster-level event and *is* broadcast to everyone;
  // use it as the barrier so we know the update has been fully processed.
  const connected = once(dashboard, 'driver_connected');
  driver.emit('location_update', { lat: 40.72, lng: -74.01 });
  await connected;

  assert.deepEqual(received, [], 'per-driver traffic is scoped to its room');
});

test('a driver coming online updates every dashboard roster', async () => {
  const dashboard = open('/dashboard');
  await once(dashboard, 'online_drivers');

  const driver = open('/driver/update', { auth: { token: issueToken('driver2') } });
  await once(driver, 'connected');

  const roster = once(dashboard, 'online_drivers');
  driver.emit('location_update', { lat: 40.75, lng: -73.98 });

  const payload = await roster;
  assert.equal(payload.count, 1);
  assert.equal(payload.drivers[0].driverId, 'driver2');
});

test('a driver disconnecting takes them offline and notifies dashboards', async () => {
  const dashboard = open('/dashboard');
  await once(dashboard, 'connected');

  const driver = open('/driver/update', { auth: { token: issueToken('driver1') } });
  await once(driver, 'connected');
  driver.emit('location_update', { lat: 40.7, lng: -74 });
  await once(driver, 'location_updated');

  const gone = once(dashboard, 'driver_disconnected');
  driver.close();

  const payload = await gone;
  assert.equal(payload.driverId, 'driver1');
  assert.ok(payload.lastSeen);
  assert.equal(driverStore.isDriverOnline('driver1'), false);
});

test('unsubscribing stops the per-driver stream', async () => {
  const dashboard = open('/dashboard');
  await once(dashboard, 'connected');
  dashboard.emit('subscribe', { driverId: 'driver1' });
  await once(dashboard, 'subscribed');

  dashboard.emit('unsubscribe');
  assert.equal((await once(dashboard, 'unsubscribed')).driverId, 'driver1');

  const received = [];
  dashboard.on('driver_data', (payload) => received.push(payload));

  const driver = open('/driver/update', { auth: { token: issueToken('driver1') } });
  await once(driver, 'connected');
  const connected = once(dashboard, 'driver_connected');
  driver.emit('location_update', { lat: 40.72, lng: -74.01 });
  await connected;

  assert.deepEqual(received, []);
});

test('get_online_drivers and get_driver_info answer on demand', async () => {
  const driver = open('/driver/update', { auth: { token: issueToken('driver3') } });
  await once(driver, 'connected');
  driver.emit('location_update', { lat: 40.68, lng: -73.94 });
  await once(driver, 'location_updated');

  const dashboard = open('/dashboard');
  await once(dashboard, 'connected');

  dashboard.emit('get_online_drivers');
  const roster = await once(dashboard, 'online_drivers');
  assert.equal(roster.count, 1);

  dashboard.emit('get_driver_info', { driverId: 'driver3' });
  const info = await once(dashboard, 'driver_info');
  assert.equal(info.profile.name, 'Mike Davis');

  dashboard.emit('get_driver_info', { driverId: 'driver1' });
  assert.equal((await once(dashboard, 'driver_not_found')).driverId, 'driver1');
});

test('ping is answered with pong on both namespaces', async () => {
  const dashboard = open('/dashboard');
  await once(dashboard, 'connected');
  dashboard.emit('ping');
  assert.ok(await once(dashboard, 'pong'));

  const driver = open('/driver/update', { auth: { token: issueToken('driver1') } });
  await once(driver, 'connected');
  driver.emit('ping');
  assert.ok(await once(driver, 'pong'));
});

test('a reconnecting driver is not taken offline by their stale socket', async () => {
  const token = issueToken('driver1');

  const first = open('/driver/update', { auth: { token } });
  await once(first, 'connected');
  const firstSocketId = driverStore.getDriverSocket('driver1');

  const second = open('/driver/update', { auth: { token } });
  await once(second, 'connected');
  assert.notEqual(driverStore.getDriverSocket('driver1'), firstSocketId);

  second.emit('location_update', { lat: 40.7, lng: -74 });
  await once(second, 'location_updated');

  // Closing the *older* connection must not evict the live one. The original
  // handler called removeDriver() unconditionally on every disconnect.
  const dashboard = open('/dashboard');
  await once(dashboard, 'connected');
  first.close();
  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(driverStore.isDriverOnline('driver1'), true);
});
