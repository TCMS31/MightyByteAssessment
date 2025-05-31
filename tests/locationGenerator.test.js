'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config/config');
const {
  generateRandomNYCLocation,
  generateNearbyLocation,
  isWithinServiceArea,
} = require('../src/utils/locationGenerator');

const { north, south, east, west } = config.nycBounds;

test('generateRandomNYCLocation always lands inside the service area', () => {
  for (let i = 0; i < 500; i += 1) {
    const { lat, lng } = generateRandomNYCLocation();
    assert.ok(lat >= south && lat <= north, `lat ${lat} outside [${south}, ${north}]`);
    assert.ok(lng >= west && lng <= east, `lng ${lng} outside [${west}, ${east}]`);
    assert.equal(isWithinServiceArea(lat, lng), true);
  }
});

test('generated coordinates are rounded to six decimal places', () => {
  for (let i = 0; i < 50; i += 1) {
    const { lat, lng } = generateRandomNYCLocation();
    assert.equal(lat, Number.parseFloat(lat.toFixed(6)));
    assert.equal(lng, Number.parseFloat(lng.toFixed(6)));
  }
});

test('generateNearbyLocation stays within roughly the requested radius', () => {
  const baseLat = 40.7128;
  const baseLng = -74.006;
  const radiusKm = 2;

  for (let i = 0; i < 200; i += 1) {
    const { lat, lng } = generateNearbyLocation(baseLat, baseLng, radiusKm);
    const km = haversineKm(baseLat, baseLng, lat, lng);
    // Clamping to the service area can only shorten the offset, never lengthen it.
    assert.ok(km <= radiusKm + 0.01, `offset was ${km.toFixed(3)}km`);
  }
});

test('generateNearbyLocation clamps a base point outside the service area back inside it', () => {
  const { lat, lng } = generateNearbyLocation(0, 0, 50);
  assert.equal(isWithinServiceArea(lat, lng), true);
});

test('isWithinServiceArea is inclusive on the boundary and false outside', () => {
  assert.equal(isWithinServiceArea(north, west), true);
  assert.equal(isWithinServiceArea(south, east), true);
  assert.equal(isWithinServiceArea(40.7128, -74.006), true, 'Lower Manhattan');

  assert.equal(isWithinServiceArea(north + 0.001, -74.0), false);
  assert.equal(isWithinServiceArea(south - 0.001, -74.0), false);
  assert.equal(isWithinServiceArea(40.7, west - 0.001), false);
  assert.equal(isWithinServiceArea(40.7, east + 0.001), false);
  assert.equal(isWithinServiceArea(34.0522, -118.2437), false, 'Los Angeles');
});

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
