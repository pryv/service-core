/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * SQLite storage engine plugin.
 *
 * Note: StorageLayer (Sessions, Versions, etc.) is NOT yet implemented for SQLite.
 * Note: dataStore streams fallback to MongoDB (incomplete).
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

function initStorageLayer (_storageLayer, _connection, _options) {
  throw new Error('SQLite StorageLayer not yet implemented. Use storageEngine: "mongodb" for now.');
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
  const DB = require('./DBsqlite');
  return new DB();
}

module.exports = {
  init,
  initStorageLayer,
  getUserAccountStorage,
  getUsersLocalIndex,
  getDataStoreModule,
  createPlatformDB
};
