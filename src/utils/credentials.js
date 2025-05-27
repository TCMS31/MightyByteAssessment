'use strict';

const crypto = require('node:crypto');

/**
 * Seeded driver directory.
 *
 * This is the take-home's stand-in for a user table. Passwords are stored in
 * plain text *on purpose* so the reviewer can log in without a seed step; a
 * production implementation would hold an argon2/bcrypt hash here and the rest
 * of this module would not change shape.
 *
 * `Object.create(null)` is used so that a username such as `constructor` or
 * `__proto__` cannot resolve to an inherited Object.prototype member.
 */
const DRIVERS = Object.assign(Object.create(null), {
  driver1: {
    username: 'driver1',
    password: 'password1',
    profile: {
      id: 'driver1',
      name: 'John Smith',
      vehicle: 'Toyota Camry 2020',
      license: 'ABC123',
      rating: 4.8,
    },
  },
  driver2: {
    username: 'driver2',
    password: 'password2',
    profile: {
      id: 'driver2',
      name: 'Sarah Johnson',
      vehicle: 'Honda Civic 2021',
      license: 'XYZ789',
      rating: 4.9,
    },
  },
  driver3: {
    username: 'driver3',
    password: 'password3',
    profile: {
      id: 'driver3',
      name: 'Mike Davis',
      vehicle: 'Ford Focus 2019',
      license: 'DEF456',
      rating: 4.7,
    },
  },
});

/**
 * Length-safe, constant-time string comparison.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // timingSafeEqual throws on length mismatch; still burn a comparison so the
    // wrong-length path is not measurably faster than the wrong-value path.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates driver credentials.
 * @param {unknown} username
 * @param {unknown} password
 * @returns {object|null} The driver profile, or null when the credentials are wrong.
 */
function validateDriverCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return null;

  const driver = DRIVERS[username];
  if (!driver) return null;

  return safeEqual(driver.password, password) ? driver.profile : null;
}

/**
 * Looks up a driver profile by its stable id.
 * @param {unknown} driverId
 * @returns {object|null}
 */
function findProfileById(driverId) {
  if (typeof driverId !== 'string') return null;
  const driver = DRIVERS[driverId];
  return driver ? driver.profile : null;
}

/**
 * @returns {object[]} Every known driver profile.
 */
function listProfiles() {
  return Object.values(DRIVERS).map((driver) => driver.profile);
}

module.exports = {
  DRIVERS,
  validateDriverCredentials,
  findProfileById,
  listProfiles,
};
