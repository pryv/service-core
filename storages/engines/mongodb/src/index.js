/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * MongoDB storage engine plugin.
 *
 * Provides factories for all MongoDB-backed storage types.
 * Currently delegates to existing component implementations;
 * code will be physically moved here in a later cleanup phase.
 */

// -- BaseStorage --------------------------------------------------------

/**
 * Initialize a StorageLayer with MongoDB backends.
 * @param {Object} storageLayer - StorageLayer instance to populate
 * @param {Object} connection - MongoDB Database instance
 * @param {Object} options - { passwordResetRequestMaxAge, sessionMaxAge }
 */
function initStorageLayer (storageLayer, connection, options) {
  const Versions = require('./Versions');
  const PasswordResetRequests = require('./PasswordResetRequests');
  const Sessions = require('./Sessions');
  const Accesses = require('./user/Accesses');
  const Profile = require('./user/Profile');
  const Streams = require('./user/Streams');
  const Webhooks = require('./user/Webhooks');

  storageLayer.connection = connection;
  storageLayer.versions = new Versions(connection, storageLayer.logger);
  storageLayer.passwordResetRequests = new PasswordResetRequests(connection, {
    maxAge: options.passwordResetRequestMaxAge
  });
  storageLayer.sessions = new Sessions(connection, { maxAge: options.sessionMaxAge });
  storageLayer.accesses = new Accesses(connection);
  storageLayer.profile = new Profile(connection);
  storageLayer.streams = new Streams(connection);
  storageLayer.webhooks = new Webhooks(connection);
}

/**
 * @returns {Object} userAccountStorage module
 */
function getUserAccountStorage () {
  return require('./userAccountStorage');
}

/**
 * @returns {Function} UsersLocalIndex constructor
 */
function getUsersLocalIndex () {
  return require('./usersLocalIndex');
}

// -- DataStore ----------------------------------------------------------

/**
 * @returns {Object} datastore module for mall
 */
function getDataStoreModule () {
  return require('./dataStore');
}

// -- PlatformStorage ----------------------------------------------------

/**
 * @returns {Object} PlatformDB instance (not yet init'd)
 */
function createPlatformDB () {
  const DB = require('./DBmongodb');
  return new DB();
}

// -- SeriesStorage (InfluxDB via MongoDB engine) -------------------------

/**
 * @param {Object} config - { host, port } from influxdb config section
 * @returns {Object} InfluxConnection instance
 */
function createSeriesConnection (config) {
  const InfluxConnection = require('./influx_connection');
  return new InfluxConnection({ host: config.host, port: config.port });
}

module.exports = {
  initStorageLayer,
  getUserAccountStorage,
  getUsersLocalIndex,
  getDataStoreModule,
  createPlatformDB,
  createSeriesConnection
};
