'use strict';

const config = require('../config/config');

const EARTH_RADIUS_KM = 6371;

/**
 * @returns {{lat: number, lng: number}} A uniform random point inside the service area.
 */
function generateRandomNYCLocation() {
  const { north, south, east, west } = config.nycBounds;

  const lat = Math.random() * (north - south) + south;
  const lng = Math.random() * (east - west) + west;

  return round6({ lat, lng });
}

/**
 * Produces a point within `radiusKm` of a base point, clamped to the service area.
 * @param {number} baseLat
 * @param {number} baseLng
 * @param {number} [radiusKm]
 * @returns {{lat: number, lng: number}}
 */
function generateNearbyLocation(baseLat, baseLng, radiusKm = 5) {
  const radiusInDegrees = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);

  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusInDegrees;

  const deltaLat = distance * Math.cos(angle);
  const deltaLng = (distance * Math.sin(angle)) / Math.cos((baseLat * Math.PI) / 180);

  const { north, south, east, west } = config.nycBounds;

  return round6({
    lat: clamp(baseLat + deltaLat, south, north),
    lng: clamp(baseLng + deltaLng, west, east),
  });
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {boolean} True when the point falls inside the configured service area.
 */
function isWithinServiceArea(lat, lng) {
  const { north, south, east, west } = config.nycBounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {{lat: number, lng: number}} point
 * @returns {{lat: number, lng: number}} The point at ~10cm precision.
 */
function round6({ lat, lng }) {
  return {
    lat: Number.parseFloat(lat.toFixed(6)),
    lng: Number.parseFloat(lng.toFixed(6)),
  };
}

module.exports = {
  generateRandomNYCLocation,
  generateNearbyLocation,
  isWithinServiceArea,
};
