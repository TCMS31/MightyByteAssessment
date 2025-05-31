'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CONFIG_PATH = path.join(__dirname, '..', 'src', 'config', 'config.js');

/** Loads the config module in a clean child process with the given environment. */
function loadConfigWith(env) {
  return spawnSync(
    process.execPath,
    ['-e', `process.stdout.write(JSON.stringify(require(${JSON.stringify(CONFIG_PATH)})))`],
    {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, DOTENV_CONFIG_PATH: '/dev/null', ...env },
    }
  );
}

test('the server refuses to start in production without an explicit JWT_SECRET', () => {
  const result = loadConfigWith({ NODE_ENV: 'production', JWT_SECRET: '' });

  assert.notEqual(result.status, 0, 'loading config should have failed');
  assert.match(result.stderr, /JWT_SECRET must be set when NODE_ENV=production/);
});

test('production starts once JWT_SECRET is supplied', () => {
  const result = loadConfigWith({ NODE_ENV: 'production', JWT_SECRET: 'a-real-secret' });

  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.jwtSecret, 'a-real-secret');
  assert.equal(config.isProduction, true);
});

test('development falls back to the throwaway secret so the repo runs out of the box', () => {
  const result = loadConfigWith({ NODE_ENV: 'development', JWT_SECRET: '' });

  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.jwtSecret, config.DEV_JWT_SECRET);
  assert.equal(config.isProduction, false);
});

test('numeric settings come from the environment and reject junk', () => {
  const fromEnv = JSON.parse(loadConfigWith({ PORT: '8519', JWT_EXPIRY_SECONDS: '900' }).stdout);
  assert.equal(fromEnv.port, 8519);
  assert.equal(fromEnv.jwtExpirySeconds, 900);
  assert.equal(fromEnv.jwtExpiry, '900s', 'the string form is derived, never set separately');

  const junk = JSON.parse(loadConfigWith({ PORT: 'abc', JWT_EXPIRY_SECONDS: '-5' }).stdout);
  assert.equal(junk.port, 3001, 'an unparsable port falls back to the default');
  assert.equal(junk.jwtExpirySeconds, 300);
});

test('CORS_ORIGINS accepts a comma-separated list', () => {
  const config = JSON.parse(
    loadConfigWith({ CORS_ORIGINS: 'http://a.example , http://b.example ,,' }).stdout
  );

  assert.deepEqual(config.corsOrigins, ['http://a.example', 'http://b.example']);
});
