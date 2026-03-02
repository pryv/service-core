/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * UserAccountStorage prototype object.
 * All implementations inherit from this via {@link createUserAccountStorage}.
 * @exports UserAccountStorage
 */
const UserAccountStorage = module.exports.UserAccountStorage = {
  async init () { throw new Error('Not implemented'); },

  /**
   * @param {string} userId
   * @param {string} hash
   * @param {string} createdBy
   * @param {number} [time]
   * @returns {Promise<{time: number, hash: string, createdBy: string}>}
   */
  async addPasswordHash (userId, hash, createdBy, time) { throw new Error('Not implemented'); },

  /**
   * @param {string} userId
   * @returns {Promise<string|null>}
   */
  async getPasswordHash (userId) { throw new Error('Not implemented'); },

  /**
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async getCurrentPasswordTime (userId) { throw new Error('Not implemented'); },

  /**
   * @param {string} userId
   * @param {string} password - plain-text password to check against history
   * @param {number} historyLength
   * @returns {Promise<boolean>}
   */
  async passwordExistsInHistory (userId, password, historyLength) { throw new Error('Not implemented'); },

  /**
   * @param {string} userId
   */
  async clearHistory (userId) { throw new Error('Not implemented'); },

  /**
   * @param {string} storeId
   * @returns {StoreKeyValueData}
   */
  getKeyValueDataForStore (storeId) { throw new Error('Not implemented'); },

  // --- Migration methods --- //

  /**
   * Export all data for a user (passwords + key-value store data).
   * @param {string} userId
   * @returns {Promise<{passwords: Array, storeKeyValues: Array}>}
   */
  async _exportAll (userId) { throw new Error('Not implemented'); },

  /**
   * Import all data for a user.
   * @param {string} userId
   * @param {{passwords: Array, storeKeyValues: Array}} data
   */
  async _importAll (userId, data) { throw new Error('Not implemented'); },

  /**
   * Clear all data for a user.
   * @param {string} userId
   */
  async _clearAll (userId) { throw new Error('Not implemented'); }
};

// Limit tampering on existing properties
for (const propName of Object.getOwnPropertyNames(UserAccountStorage)) {
  Object.defineProperty(UserAccountStorage, propName, { configurable: false });
}

/**
 * Create a new UserAccountStorage object with the given implementation.
 * @param {Object} implementation
 * @returns {UserAccountStorage}
 */
module.exports.createUserAccountStorage = function createUserAccountStorage (implementation) {
  return Object.assign(Object.create(UserAccountStorage), implementation);
};
