/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const StorageLayer = require('./StorageLayer');

module.exports = {
  Size: require('./Size'),
  StorageLayer,
  getDatabase,
  getDatabasePG,
  getStorageLayer,
  getDatabaseSync,
  getStorageEngine: require('./getStorageEngine'),
  userLocalDirectory: require('./userLocalDirectory'),
  getUsersLocalIndex,
  getUserAccountStorage,
  interfaces: {
    UserAccountStorage: require('storages/interfaces/baseStorage/UserAccountStorage'),
    UsersLocalIndexDB: require('storages/interfaces/baseStorage/UsersLocalIndexDB'),
    EventFiles: require('storages/interfaces/fileStorage/EventFiles'),
    UserStorage: require('storages/interfaces/baseStorage/UserStorage'),
    Sessions: require('storages/interfaces/baseStorage/Sessions'),
    PasswordResetRequests: require('storages/interfaces/baseStorage/PasswordResetRequests'),
    Versions: require('storages/interfaces/baseStorage/Versions'),
    AuditStorage: require('storages/interfaces/auditStorage/AuditStorage'),
    UserAuditDatabase: require('storages/interfaces/auditStorage/UserAuditDatabase')
  }
};

/**
 * Ensure the storages barrel is initialized (lazy fallback).
 */
async function ensureBarrel () {
  const storages = require('storages');
  if (!storages.storageLayer) await storages.init();
  return storages;
}

/**
 * @returns {Promise<Object>} usersLocalIndex singleton
 */
async function getUsersLocalIndex () {
  return (await ensureBarrel()).usersLocalIndex;
}

/**
 * @returns {Promise<Object>} userAccountStorage singleton
 */
async function getUserAccountStorage () {
  return (await ensureBarrel()).userAccountStorage;
}

/**
 * @returns {Promise<StorageLayer>}
 */
async function getStorageLayer () {
  return (await ensureBarrel()).storageLayer;
}

// Lazy-created MongoDB database — used by getDatabase/getDatabaseSync when
// the barrel was initialized for a different engine (e.g. postgresql) or
// before barrel init completes.
let _lazyDatabase;
function _ensureMongoDatabase () {
  if (!_lazyDatabase) {
    const { getConfigUnsafe, getLogger } = require('@pryv/boiler');
    const { dataBaseTracer } = require('tracing');
    const config = getConfigUnsafe(true);
    // Ensure engine _internals has getLogger before constructing Database
    const mongoInternals = require('storages/engines/mongodb/src/_internals');
    if (!mongoInternals.getLogger) mongoInternals.set('getLogger', getLogger);
    const Database = require('storages/engines/mongodb/src/Database');
    _lazyDatabase = new Database(config.get('database'));
    dataBaseTracer(_lazyDatabase);
  }
  return _lazyDatabase;
}

/**
 * Get the MongoDB database connection (sync).
 * @returns {Object}
 */
function getDatabaseSync () {
  return require('storages').database || _ensureMongoDatabase();
}

/**
 * Get the MongoDB database connection.
 * Always returns a MongoDB connection (even when primary engine is PG/SQLite).
 * @returns {Promise<Object>}
 */
async function getDatabase () {
  await ensureBarrel();
  const db = require('storages').database || _ensureMongoDatabase();
  await db.ensureConnect();
  return db;
}

// Lazy-created PG database — used when barrel was initialized for a
// different engine (e.g. mongodb) and caller still needs a PG connection.
let _lazyDatabasePG;

/**
 * Get the PostgreSQL database connection.
 * @returns {Promise<Object>}
 */
async function getDatabasePG () {
  await ensureBarrel();
  let db = require('storages').databasePG;
  if (!db) {
    if (!_lazyDatabasePG) {
      const { getConfig, getLogger } = require('@pryv/boiler');
      const config = await getConfig();
      // Ensure engine _internals has getLogger before constructing DatabasePG
      const pgInternals = require('storages/engines/postgresql/src/_internals');
      if (!pgInternals.getLogger) pgInternals.set('getLogger', getLogger);
      const DatabasePG = require('storages/engines/postgresql/src/DatabasePG');
      _lazyDatabasePG = new DatabasePG(config.get('postgresql'));
    }
    db = _lazyDatabasePG;
  }
  await db.ensureConnect();
  return db;
}
