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
const pluginLoader = require('storages/pluginLoader');

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
    UserAccountStorage: require('storages/interfaces/baseStorage/UserAccountStorage'),
    UsersLocalIndexDB: require('storages/interfaces/baseStorage/UsersLocalIndexDB'),
    EventFiles: require('storages/interfaces/fileStorage/EventFiles'),
    UserStorage: require('storages/interfaces/baseStorage/UserStorage'),
    Sessions: require('storages/interfaces/baseStorage/Sessions'),
    PasswordResetRequests: require('storages/interfaces/baseStorage/PasswordResetRequests'),
    Versions: require('storages/interfaces/baseStorage/Versions'),
    UserSQLiteStorage: require('storages/interfaces/baseStorage/UserSQLiteStorage'),
    UserSQLiteDatabase: require('storages/interfaces/baseStorage/UserSQLiteDatabase')
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
    await pluginLoader.init(config);
    const engine = getStorageEngine(config, 'storageUserAccount');
    const engineModule = pluginLoader.getEngineModule(engine);
    userAccount = engineModule.getUserAccountStorage();
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
  await pluginLoader.init(config);
  const engine = pluginLoader.getEngineFor('baseStorage');
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
