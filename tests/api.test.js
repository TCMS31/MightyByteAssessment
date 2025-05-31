'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const driverStore = require('../src/models/driverStore');

const app = createApp();

/** Logs in a seeded driver and returns the bearer token. */
async function loginAs(username = 'driver1', password = 'password1') {
  const response = await request(app).post('/api/login').send({ username, password }).expect(200);
  return response.body.token;
}

test.beforeEach(() => driverStore.reset());

test('GET /health reports the service as healthy', async () => {
  const { body } = await request(app).get('/health').expect(200);

  assert.equal(body.status, 'healthy');
  assert.ok(Number.isFinite(body.uptime));
});

test('GET / lists the API surface', async () => {
  const { body } = await request(app).get('/').expect(200);

  assert.equal(body.endpoints.auth.login, 'POST /api/login');
  assert.equal(body.endpoints.driver.updateLocation, 'POST /api/driver/update');
});

test('an unknown path returns a JSON 404, not an HTML stack page', async () => {
  const { body } = await request(app).get('/api/does-not-exist').expect(404);

  assert.equal(body.error, 'Endpoint not found');
  assert.equal(body.path, '/api/does-not-exist');
});

test('POST /api/login issues a token for valid credentials', async () => {
  const { body } = await request(app)
    .post('/api/login')
    .send({ username: 'driver2', password: 'password2' })
    .expect(200);

  assert.equal(body.success, true);
  assert.equal(body.profile.id, 'driver2');
  assert.ok(body.token);
  assert.equal(body.expiresInSeconds, 300);
  assert.equal(driverStore.isTokenActive(body.token), true);
});

test('POST /api/login rejects a missing field with 400 and a wrong password with 401', async () => {
  await request(app).post('/api/login').send({ username: 'driver1' }).expect(400);
  await request(app).post('/api/login').send({}).expect(400);
  await request(app)
    .post('/api/login')
    .send({ username: 'driver1', password: 'wrong' })
    .expect(401);
  await request(app).post('/api/login').send({ username: 'ghost', password: 'x' }).expect(401);
});

test('POST /api/login does not leak which half of the pair was wrong', async () => {
  const wrongUser = await request(app)
    .post('/api/login')
    .send({ username: 'ghost', password: 'password1' })
    .expect(401);
  const wrongPass = await request(app)
    .post('/api/login')
    .send({ username: 'driver1', password: 'nope' })
    .expect(401);

  assert.equal(wrongUser.body.error, wrongPass.body.error);
});

test('POST /api/driver/update requires a bearer token', async () => {
  await request(app).post('/api/driver/update').send({ lat: 40.7, lng: -74 }).expect(401);

  await request(app)
    .post('/api/driver/update')
    .set('Authorization', 'Bearer not-a-real-token')
    .send({ lat: 40.7, lng: -74 })
    .expect(401);

  // A scheme other than Bearer must not be accepted.
  const token = await loginAs();
  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Basic ${token}`)
    .send({ lat: 40.7, lng: -74 })
    .expect(401);
});

test('POST /api/driver/update stores a valid fix', async () => {
  const token = await loginAs();

  const { body } = await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.7128, lng: -74.006 })
    .expect(200);

  assert.equal(body.success, true);
  assert.equal(body.location.lat, 40.7128);
  assert.ok(body.location.timestamp, 'the response carries the server timestamp');
  assert.equal(body.withinServiceArea, true);
  assert.equal(driverStore.isDriverOnline('driver1'), true);
});

test('POST /api/driver/update rejects bad coordinates with 400', async () => {
  const token = await loginAs();
  const post = (payload) =>
    request(app).post('/api/driver/update').set('Authorization', `Bearer ${token}`).send(payload);

  await post({ lat: '40.7', lng: -74 }).expect(400);
  await post({ lat: 40.7 }).expect(400);
  await post({}).expect(400);
  await post({ lat: 91, lng: -74 }).expect(400);
  await post({ lat: 40.7, lng: 200 }).expect(400);

  assert.equal(driverStore.isDriverOnline('driver1'), false);
});

test("GET /api/driver/location returns the caller's own fix, 404 before one exists", async () => {
  const token = await loginAs();

  await request(app)
    .get('/api/driver/location')
    .set('Authorization', `Bearer ${token}`)
    .expect(404);

  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.7, lng: -74 })
    .expect(200);

  const { body } = await request(app)
    .get('/api/driver/location')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(body.location.lat, 40.7);
  assert.equal(body.isOnline, true);
});

test('GET /api/driver/online lists only drivers that have reported in', async () => {
  const empty = await request(app).get('/api/driver/online').expect(200);
  assert.deepEqual(empty.body.drivers, []);
  assert.equal(empty.body.count, 0);

  const token = await loginAs('driver3', 'password3');
  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.75, lng: -73.99 })
    .expect(200);

  const { body } = await request(app).get('/api/driver/online').expect(200);
  assert.equal(body.count, 1);
  assert.equal(body.drivers[0].driverId, 'driver3');
  assert.equal(body.drivers[0].profile.name, 'Mike Davis');
});

test('GET /api/driver/:driverId/location resolves a driver, or 404s', async () => {
  const token = await loginAs();
  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.7, lng: -74 })
    .expect(200);

  const { body } = await request(app).get('/api/driver/driver1/location').expect(200);
  assert.equal(body.driverId, 'driver1');
  assert.equal(body.isOnline, true);

  await request(app).get('/api/driver/driver2/location').expect(404);
});

test('the literal /online and /stats paths are not captured as driver ids', async () => {
  const online = await request(app).get('/api/driver/online').expect(200);
  assert.ok(Array.isArray(online.body.drivers));

  const stats = await request(app).get('/api/driver/stats').expect(200);
  assert.ok(stats.body.stats);
});

test('GET /api/driver/stats reports store occupancy', async () => {
  const token = await loginAs();
  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.7, lng: -74 })
    .expect(200);

  const { body } = await request(app).get('/api/driver/stats').expect(200);

  assert.equal(body.stats.activeTokens, 1);
  assert.equal(body.stats.driverLocations, 1);
  assert.equal(body.stats.onlineDrivers, 1);
});

test('GET /api/profile returns claims plus the current fix', async () => {
  const token = await loginAs();

  const before = await request(app)
    .get('/api/profile')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(before.body.isOnline, false);
  assert.equal(before.body.location, null);

  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.7, lng: -74 })
    .expect(200);

  const after = await request(app)
    .get('/api/profile')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(after.body.isOnline, true);
  assert.equal(after.body.profile.driverId, 'driver1');
});

test('POST /api/logout revokes the token so it can no longer be replayed', async () => {
  const token = await loginAs();
  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.7, lng: -74 })
    .expect(200);

  await request(app).post('/api/logout').set('Authorization', `Bearer ${token}`).expect(200);

  // This is the regression the original code had: the JWT was still inside its
  // 5-minute window, so every authenticated route kept accepting it after logout.
  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.8, lng: -73.9 })
    .expect(401);

  await request(app).get('/api/profile').set('Authorization', `Bearer ${token}`).expect(401);
});

test('POST /api/logout also takes the driver offline', async () => {
  const token = await loginAs();
  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.7, lng: -74 })
    .expect(200);
  assert.equal(driverStore.isDriverOnline('driver1'), true);

  await request(app).post('/api/logout').set('Authorization', `Bearer ${token}`).expect(200);

  assert.equal(driverStore.isDriverOnline('driver1'), false);
  const { body } = await request(app).get('/api/driver/online').expect(200);
  assert.equal(body.count, 0);
});

test('logging out one driver leaves another session untouched', async () => {
  const tokenOne = await loginAs('driver1', 'password1');
  const tokenTwo = await loginAs('driver2', 'password2');

  await request(app).post('/api/logout').set('Authorization', `Bearer ${tokenOne}`).expect(200);

  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${tokenTwo}`)
    .send({ lat: 40.7, lng: -74 })
    .expect(200);
});

test('an oversized body is rejected rather than buffered', async () => {
  const token = await loginAs();

  await request(app)
    .post('/api/driver/update')
    .set('Authorization', `Bearer ${token}`)
    .send({ lat: 40.7, lng: -74, padding: 'x'.repeat(64 * 1024) })
    .expect(413); // express.json raises a PayloadTooLargeError carrying status 413
});
