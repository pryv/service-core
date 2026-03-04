/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * PostgreSQL storage engine plugin.
 *
 * Provides factories for all PostgreSQL-backed storage types.
 * Currently delegates to existing component implementations;
 * code will be physically moved here in a later cleanup phase.
 */

const _internals = require('./_internals');

/**
 * Receive host internals from the barrel.
 * @param {Object} receivedInternals - Map of name → value
 */
function init (receivedInternals) {
  for (const [key, value] of Object.entries(receivedInternals)) {
    _internals.set(key, value);
  }
}

// -- BaseStorage --------------------------------------------------------

function initStorageLayer (storageLayer, connection, options) {
  const VersionsPG = require('./VersionsPG');
  const PasswordResetRequestsPG = require('./PasswordResetRequestsPG');
  const SessionsPG = require('./SessionsPG');
  const AccessesPG = require('./user/AccessesPG');
  const ProfilePG = require('./user/ProfilePG');
  const StreamsPG = require('./user/StreamsPG');
  const WebhooksPG = require('./user/WebhooksPG');

  storageLayer.connection = connection;
  storageLayer.versions = new VersionsPG(connection, storageLayer.logger);
  storageLayer.passwordResetRequests = new PasswordResetRequestsPG(connection, {
    maxAge: options.passwordResetRequestMaxAge
  });
  storageLayer.sessions = new SessionsPG(connection, { maxAge: options.sessionMaxAge });
  storageLayer.accesses = new AccessesPG(connection);
  storageLayer.profile = new ProfilePG(connection);
  storageLayer.streams = new StreamsPG(connection);
  storageLayer.webhooks = new WebhooksPG(connection);
}

function getUserAccountStorage () {
  return require('./userAccountStorage');
}

function getUsersLocalIndex () {
  return require('./usersLocalIndex');
}

// -- DataStore ----------------------------------------------------------

function getDataStoreModule () {
  return require('./dataStore');
}

// -- PlatformStorage ----------------------------------------------------

function createPlatformDB () {
  const DB = require('./DBpostgresql');
  return new DB();
}

// -- SeriesStorage (PostgreSQL) -----------------------------------------

async function createSeriesConnection (config) {
  const PGSeriesConnection = require('./pg_connection');
  // Use provided databasePG (from barrel init) or fall back to storage
  const pgDb = config.databasePG || _internals.databasePG;
  return new PGSeriesConnection(pgDb);
}

module.exports = {
  init,
  initStorageLayer,
  getUserAccountStorage,
  getUsersLocalIndex,
  getDataStoreModule,
  createPlatformDB,
  createSeriesConnection
};
