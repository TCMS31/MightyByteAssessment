'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateDriverCredentials,
  findProfileById,
  listProfiles,
} = require('../src/utils/credentials');

test('validateDriverCredentials returns the profile for a correct pair', () => {
  const profile = validateDriverCredentials('driver1', 'password1');

  assert.ok(profile);
  assert.equal(profile.id, 'driver1');
  assert.equal(profile.name, 'John Smith');
});

test('validateDriverCredentials rejects a wrong password', () => {
  assert.equal(validateDriverCredentials('driver1', 'password2'), null);
});

test('validateDriverCredentials rejects a password of a different length', () => {
  assert.equal(validateDriverCredentials('driver1', 'x'), null);
  assert.equal(validateDriverCredentials('driver1', ''), null);
});

test('validateDriverCredentials rejects an unknown username', () => {
  assert.equal(validateDriverCredentials('nobody', 'password1'), null);
});

test('validateDriverCredentials rejects non-string input instead of throwing', () => {
  assert.equal(validateDriverCredentials(undefined, undefined), null);
  assert.equal(validateDriverCredentials({}, []), null);
  assert.equal(validateDriverCredentials(1, 2), null);
});

test('the driver directory does not expose Object.prototype members', () => {
  // A prototype-backed lookup would return a function here rather than null.
  for (const username of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.equal(validateDriverCredentials(username, 'password1'), null, username);
    assert.equal(findProfileById(username), null, username);
  }
});

test('findProfileById resolves seeded drivers only', () => {
  assert.equal(findProfileById('driver3').name, 'Mike Davis');
  assert.equal(findProfileById('driver9'), null);
  assert.equal(findProfileById(undefined), null);
});

test('listProfiles returns every seeded driver with a stable shape', () => {
  const profiles = listProfiles();

  assert.equal(profiles.length, 3);
  for (const profile of profiles) {
    assert.deepEqual(Object.keys(profile).sort(), ['id', 'license', 'name', 'rating', 'vehicle']);
  }
});
