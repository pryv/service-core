/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * @typedef {string} identifier - A string uniquely identifying an object (user, event, stream, etc.)
 */

/**
 * @typedef {number} timestamp - A positive floating-point number representing the number of seconds since a reference time (Unix epoch time).
 */

/**
 * Data store prototype object.
 * All data store implementations inherit from this via {@link datastore#createDataStore}.
 * @exports DataStore
 */
const DataStore = module.exports = {
  /**
   * The data store's unique identifier (loaded from Pryv.io platform settings at creation).
   * @type {string}
   */
  id: '',

  /**
   * The data store's name (loaded from Pryv.io platform settings at creation).
   * @type {string}
   */
  name: '',

  /**
   * The data store's configuration settings (loaded from platform settings at creation).
   * @type {object}
   */
  settings: {},

  /**
   * Initialize the store.
   * @returns {DataStore} The data store object itself (for method chaining).
   */
  async init () { throw new Error('Not implemented'); },

  /**
   * The {@link UserStreams} implementation.
   * @type {UserStreams}
   */
  streams: null,

  /**
   * The {@link UserEvents} implementation.
   * @type {UserEvents}
   */
  events: null,

  /**
   * TODO: implement
   * Set store-specific key-value data (e.g. credentials or settings) for the given user.
   * This is called for both creating and updating the data.
   * @param {identifier} userId
   * @param {object} data
   */
  async setUserData (userId, data) { throw new Error('Not implemented'); }, // eslint-disable-line no-unused-vars

  /**
   * TODO: implement
   * Get store-specific key-value data for the given user.
   * This should never return secrets such as passwords, tokens etc. which should be write-only via {@link #setUserData}.
   * @param {identifier} userId
   * @returns {object}
   */
  async getUserData (userId) { throw new Error('Not implemented'); }, // eslint-disable-line no-unused-vars

  /**
   * Called when the given user is deleted from Pryv.io, to let the store delete the related data if appropriate.
   * @param {identifier} userId
   */
  async deleteUser (userId) { throw new Error('Not implemented'); }, // eslint-disable-line no-unused-vars

  /**
   * Return the total amount of storage used by the given user, in bytes.
   * @param {identifier} userId
   * @returns {number}
   */
  async getUserStorageSize (userId) { throw new Error('Not implemented'); } // eslint-disable-line no-unused-vars
};

// limit tampering on existing properties
for (const propName of Object.getOwnPropertyNames(DataStore)) {
  Object.defineProperty(DataStore, propName, { configurable: false });
}
