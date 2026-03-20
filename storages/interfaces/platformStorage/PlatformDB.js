/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * PlatformDB prototype object.
 * Backend implementations (MongoDB, SQLite) must provide all these methods.
 * Use {@link validatePlatformDB} to verify class-based instances.
 * @exports PlatformDB
 */
const PlatformDB = module.exports.PlatformDB = {
  async init () { throw new Error('Not implemented'); },

  /**
   * @param {string} username
   * @param {string} field
   * @param {string} value
   */
  async setUserUniqueField (username, field, value) { throw new Error('Not implemented'); },

  /**
   * Atomic set-if-not-exists for unique fields.
   * Returns true if the field was set, false if it already exists with a different username.
   * If the field already exists with the same username, updates it and returns true.
   * This is consensus-safe: no read-then-write race condition.
   * @param {string} username
   * @param {string} field
   * @param {string} value
   * @returns {Promise<boolean>} true if set, false if collision
   */
  async setUserUniqueFieldIfNotExists (username, field, value) { throw new Error('Not implemented'); },

  /**
   * @param {string} field
   * @param {string} value
   */
  async deleteUserUniqueField (field, value) { throw new Error('Not implemented'); },

  /**
   * @param {string} username
   * @param {string} field
   * @param {string} value
   */
  async setUserIndexedField (username, field, value) { throw new Error('Not implemented'); },

  /**
   * @param {string} username
   * @param {string} field
   */
  async deleteUserIndexedField (username, field) { throw new Error('Not implemented'); },

  /**
   * @param {string} username
   * @param {string} field
   * @returns {Promise<string|null>}
   */
  async getUserIndexedField (username, field) { throw new Error('Not implemented'); },

  /**
   * @param {string} field
   * @param {string} value
   * @returns {Promise<string|null>}
   */
  async getUsersUniqueField (field, value) { throw new Error('Not implemented'); },

  /**
   * @param {string} prefix
   * @returns {Promise<Array>}
   */
  async getAllWithPrefix (prefix) { throw new Error('Not implemented'); },

  /**
   * Delete all entries (tests only).
   */
  async deleteAll () { throw new Error('Not implemented'); },

  async close () { throw new Error('Not implemented'); },

  isClosed () { throw new Error('Not implemented'); },

  // --- Migration methods --- //

  /**
   * Export all platform data.
   * @returns {Promise<Array>}
   */
  async exportAll () { throw new Error('Not implemented'); },

  /**
   * Import platform data.
   * @param {Array} data - entries from exportAll()
   */
  async importAll (data) { throw new Error('Not implemented'); },

  /**
   * Clear all entries.
   */
  async clearAll () { throw new Error('Not implemented'); },

  // --- User-to-core mapping (multi-core) --- //

  /**
   * Set which core hosts a user.
   * @param {string} username
   * @param {string} coreId
   */
  async setUserCore (username, coreId) { throw new Error('Not implemented'); },

  /**
   * Get the core ID for a user.
   * @param {string} username
   * @returns {Promise<string|null>}
   */
  async getUserCore (username) { throw new Error('Not implemented'); },

  /**
   * Get all user-to-core mappings.
   * @returns {Promise<Array<{username: string, coreId: string}>>}
   */
  async getAllUserCores () { throw new Error('Not implemented'); },

  // --- Core registration (multi-core) --- //

  /**
   * Register or update a core's info in PlatformDB.
   * @param {string} coreId
   * @param {Object} info - { id, ip, ipv6, cname, hosting, available }
   */
  async setCoreInfo (coreId, info) { throw new Error('Not implemented'); },

  /**
   * Get a core's registration info.
   * @param {string} coreId
   * @returns {Promise<Object|null>}
   */
  async getCoreInfo (coreId) { throw new Error('Not implemented'); },

  /**
   * Get all registered cores.
   * @returns {Promise<Array<Object>>}
   */
  async getAllCoreInfos () { throw new Error('Not implemented'); }
};

// Limit tampering on existing properties
for (const propName of Object.getOwnPropertyNames(PlatformDB)) {
  Object.defineProperty(PlatformDB, propName, { configurable: false });
}

const REQUIRED_METHODS = Object.getOwnPropertyNames(PlatformDB);

/**
 * Validate that a class instance implements all required PlatformDB methods.
 * @param {Object} instance
 * @returns {Object} The instance itself
 */
module.exports.validatePlatformDB = function validatePlatformDB (instance) {
  for (const method of REQUIRED_METHODS) {
    if (typeof instance[method] !== 'function') {
      throw new Error(`PlatformDB implementation missing method: ${method}`);
    }
  }
  return instance;
};
