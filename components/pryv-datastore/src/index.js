/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const DataStore = require('./DataStore');
const UserStreams = require('./UserStreams');
const UserEvents = require('./UserEvents');
const defaults = require('./defaults');
const errors = require('./errors');

/**
 * @exports datastore
 */
module.exports = {
  /**
   * Create a new data store object with the given implementation.
   * @param {Object} implementation An object implementing {@link DataStore} methods
   * @returns {DataStore}
   */
  createDataStore (implementation) {
    return Object.assign(Object.create(DataStore), implementation);
  },

  /**
   * Create a new user streams object with the given implementation.
   * @param {Object} implementation An object implementing {@link UserStreams} methods
   * @returns {UserStreams}
   */
  createUserStreams (implementation) {
    return Object.assign(Object.create(UserStreams), implementation);
  },

  /**
   * Create a new user events object with the given implementation.
   * @param {Object} implementation An object implementing {@link UserEvents} methods
   * @returns {UserEvents}
   */
  createUserEvents (implementation) {
    return Object.assign(Object.create(UserEvents), implementation);
  },

  defaults,

  errors
};
