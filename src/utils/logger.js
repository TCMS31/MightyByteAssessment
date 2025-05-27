'use strict';

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

function resolveLevel() {
  const explicit = process.env.LOG_LEVEL;
  if (explicit && explicit in LEVELS) return LEVELS[explicit];
  if (process.env.NODE_ENV === 'test') return LEVELS.silent;
  return LEVELS.info;
}

let threshold = resolveLevel();

/**
 * Minimal level-aware logger.
 *
 * The original code called `console.log` from the store, the controllers and
 * both socket handlers, which made the test output unreadable and could not be
 * turned down in production. One seam, one switch.
 */
const logger = {
  /** @param {keyof typeof LEVELS} level */
  setLevel(level) {
    if (level in LEVELS) threshold = LEVELS[level];
  },
  error: (...args) => threshold >= LEVELS.error && console.error(...args),
  warn: (...args) => threshold >= LEVELS.warn && console.warn(...args),
  info: (...args) => threshold >= LEVELS.info && console.log(...args),
  debug: (...args) => threshold >= LEVELS.debug && console.log(...args),
};

module.exports = logger;
