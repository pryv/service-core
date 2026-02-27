/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const Access = require('./user/Accesses');
const Stream = require('./user/Streams');
const Database = require('./Database');
const DatabasePG = require('./DatabasePG');
const StorageLayer = require('./StorageLayer');
const { getConfigUnsafe, getConfig } = require('@pryv/boiler');
const { dataBaseTracer } = require('tracing');
const usersLocalIndex = require('./usersLocalIndex');
const getStorageEngine = require('./getStorageEngine');

module.exports = {
  Database: require('./Database'),
  DatabasePG: require('./DatabasePG'),
  PasswordResetRequests: require('./PasswordResetRequests'),
  Sessions: require('./Sessions'),
  Size: require('./Size'),
  Versions: require('./Versions'),
  user: {
    Accesses: Access,
    Profile: require('./user/Profile'),
    Streams: Stream,
    Webhooks: require('./user/Webhooks')
  },
  StorageLayer,
  getDatabase,
  getDatabasePG,
  getStorageLayer,
  getDatabaseSync,
  getStorageEngine,
  userLocalDirectory: require('./userLocalDirectory'),
  getUsersLocalIndex,
  getUserAccountStorage,
  interfaces: {
    UserAccountStorage: require('./interfaces/UserAccountStorage'),
    UsersLocalIndexDB: require('./interfaces/UsersLocalIndexDB'),
    EventFiles: require('./interfaces/EventFiles'),
    UserStorage: require('./interfaces/UserStorage'),
    Sessions: require('./interfaces/Sessions'),
    PasswordResetRequests: require('./interfaces/PasswordResetRequests'),
    Versions: require('./interfaces/Versions'),
    UserSQLiteStorage: require('./interfaces/UserSQLiteStorage'),
    UserSQLiteDatabase: require('./interfaces/UserSQLiteDatabase')
  }
};

let usersIndex;
async function getUsersLocalIndex () {
  if (!usersIndex) {
    usersIndex = usersLocalIndex;
    await usersIndex.init();
  }
  return usersIndex;
}

let userAccount;
async function getUserAccountStorage () {
  if (!userAccount) {
    const config = await getConfig();
    const engine = getStorageEngine(config, 'storageUserAccount');
    switch (engine) {
      case 'mongodb':
        userAccount = require('./userAccountStorageMongo');
        break;
      case 'postgresql':
        userAccount = require('./userAccountStoragePG');
        break;
      default:
        // sqlite (default)
        userAccount = require('./userAccountStorageSqlite');
        break;
    }
    await userAccount.init();
  }
  return userAccount;
}

let storageLayer;
/**
 * @returns {StorageLayer}
 */
async function getStorageLayer () {
  if (storageLayer) { return storageLayer; }
  const config = await getConfig();
  const engine = getStorageEngine(config, 'database');
  storageLayer = new StorageLayer();

  let connection;
  switch (engine) {
    case 'mongodb':
      connection = _getDatabase(config);
      break;
    case 'postgresql':
      connection = _getDatabasePG(config);
      break;
    case 'sqlite':
      connection = null; // SQLite StorageLayer manages its own connections
      break;
  }
  await storageLayer.init(connection);
  return storageLayer;
}

/**
 * @returns {any}
 */
function getDatabaseSync (warnOnly) {
  return _getDatabase(getConfigUnsafe(warnOnly));
}

/**
 * Get the MongoDB database connection.
 * @returns {Promise<any>}
 */
async function getDatabase () {
  const db = _getDatabase(await getConfig());
  await db.ensureConnect();
  return db;
}

/**
 * Get the PostgreSQL database connection.
 * @returns {Promise<DatabasePG>}
 */
async function getDatabasePG () {
  const db = _getDatabasePG(await getConfig());
  await db.ensureConnect();
  return db;
}

let database;
/**
 * @returns {any}
 */
function _getDatabase (config) {
  if (!database) {
    database = new Database(config.get('database'));
    dataBaseTracer(database);
  }
  return database;
}

let databasePG;
/**
 * @returns {DatabasePG}
 */
function _getDatabasePG (config) {
  if (!databasePG) {
    databasePG = new DatabasePG(config.get('postgresql'));
  }
  return databasePG;
}
