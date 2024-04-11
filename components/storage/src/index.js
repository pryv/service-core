/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Access = require('./user/Accesses');
const Stream = require('./user/Streams');
const Database = require('./Database');
const StorageLayer = require('./StorageLayer');
const { getConfigUnsafe, getConfig } = require('@pryv/boiler');
const { dataBaseTracer } = require('tracing');
const usersLocalIndex = require('./usersLocalIndex');
const userAccountStorage = require('./userAccountStorage');

module.exports = {
  Database: require('./Database'),
  PasswordResetRequests: require('./PasswordResetRequests'),
  Sessions: require('./Sessions'),
  Size: require('./Size'),
  Versions: require('./Versions'),
  user: {
    Accesses: Access,
    FollowedSlices: require('./user/FollowedSlices'),
    Profile: require('./user/Profile'),
    Streams: Stream,
    Webhooks: require('./user/Webhooks')
  },
  StorageLayer,
  getDatabase,
  getStorageLayer,
  getDatabaseSync,
  userLocalDirectory: require('./userLocalDirectory'),
  getUsersLocalIndex,
  getUserAccountStorage
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
    userAccount = userAccountStorage;
    await userAccountStorage.init();
  }
  return userAccountStorage;
}

let storageLayer;
/**
 * @returns {StorageLayer}
 */
async function getStorageLayer () {
  if (storageLayer) { return storageLayer; }
  const config = await getConfig();
  storageLayer = new StorageLayer();
  await storageLayer.init(_getDatabase(config));
  return storageLayer;
}

/**
 * @returns {any}
 */
function getDatabaseSync (warnOnly) {
  return _getDatabase(getConfigUnsafe(warnOnly));
}

/**
 * @returns {Promise<any>}
 */
async function getDatabase () {
  const db = _getDatabase(await getConfig());
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
