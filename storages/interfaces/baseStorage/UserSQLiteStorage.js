/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * UserSQLiteStorage interface — contract for the LRU-cached SQLite storage manager.
 * Manages per-user SQLite databases (audit, etc.).
 *
 * Use {@link validateUserSQLiteStorage} to verify class-based instances.
 */

const REQUIRED_METHODS = [
  'init',
  'getVersion',
  'checkInitialized',
  'forUser',
  'deleteUser',
  'close'
];

/**
 * Validate that a class instance implements all required UserSQLiteStorage methods.
 * @param {Object} instance
 * @returns {Object} The instance itself
 */
module.exports.validateUserSQLiteStorage = function validateUserSQLiteStorage (instance) {
  for (const method of REQUIRED_METHODS) {
    if (typeof instance[method] !== 'function') {
      throw new Error(`UserSQLiteStorage implementation missing method: ${method}`);
    }
  }
  return instance;
};

module.exports.REQUIRED_METHODS = REQUIRED_METHODS;
