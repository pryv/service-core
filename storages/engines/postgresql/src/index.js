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

// -- BaseStorage --------------------------------------------------------

function initStorageLayer (storageLayer, connection, options) {
  const VersionsPG = require('storage/src/VersionsPG');
  const PasswordResetRequestsPG = require('storage/src/PasswordResetRequestsPG');
  const SessionsPG = require('storage/src/SessionsPG');
  const AccessesPG = require('storage/src/user/AccessesPG');
  const ProfilePG = require('storage/src/user/ProfilePG');
  const StreamsPG = require('storage/src/user/StreamsPG');
  const WebhooksPG = require('storage/src/user/WebhooksPG');

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
  return require('storage/src/userAccountStoragePG');
}

function getUsersLocalIndex () {
  return require('storage/src/usersLocalIndexPG');
}

// -- DataStore ----------------------------------------------------------

function getDataStoreModule () {
  return require('storage/src/localDataStorePG');
}

// -- PlatformStorage ----------------------------------------------------

function createPlatformDB () {
  const DB = require('platform/src/DBpostgresql');
  return new DB();
}

// -- SeriesStorage (PostgreSQL) -----------------------------------------

async function createSeriesConnection (_config) {
  const PGSeriesConnection = require('business/src/series/pg_connection');
  const { getDatabasePG } = require('storage');
  const pgDb = await getDatabasePG();
  return new PGSeriesConnection(pgDb);
}

module.exports = {
  initStorageLayer,
  getUserAccountStorage,
  getUsersLocalIndex,
  getDataStoreModule,
  createPlatformDB,
  createSeriesConnection
};
