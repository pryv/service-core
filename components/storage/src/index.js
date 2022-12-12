/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Access = require('./user/Accesses');
const Stream = require('./user/Streams');
const Database = require('./Database');
const StorageLayer = require('./storage_layer');
const { getConfigUnsafe, getConfig, getLogger } = require('@pryv/boiler');
const { dataBaseTracer } = require('tracing');
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
let storageLayer;
/**
 * @returns {any}
 */
function _getStorageLayer (config) {
  if (storageLayer) { return storageLayer; }
  // 'StorageLayer' is a component that contains all the vertical registries
  // for various database models.
  storageLayer = new StorageLayer(_getDatabase(config), getLogger('storage'), config.get('eventFiles:attachmentsDirPath'), config.get('eventFiles:previewsDirPath'), config.get('auth:passwordResetRequestMaxAge'), config.get('auth:sessionMaxAge'));
  return storageLayer;
}
/**
 * @returns {any}
 */
function getDatabaseSync (warnOnly) {
  return _getDatabase(getConfigUnsafe(warnOnly));
}
/**
 * @returns {any}
 */
function getStorageLayerSync (warnOnly) {
  return _getStorageLayer(getConfigUnsafe(warnOnly));
}
/**
 * @returns {Promise<any>}
 */
async function getDatabase () {
  const db = _getDatabase(await getConfig());
  await db.ensureConnect();
  return db;
}
/**
 * @returns {Promise<any>}
 */
async function getStorageLayer () {
  return _getStorageLayer(await getConfig());
}
module.exports = {
  Database: require('./Database'),
  PasswordResetRequests: require('./PasswordResetRequests'),
  Sessions: require('./Sessions'),
  Size: require('./Size'),
  Versions: require('./Versions'),
  user: {
    Accesses: Access,
    EventFiles: require('./user/EventFiles'),
    FollowedSlices: require('./user/FollowedSlices'),
    Profile: require('./user/Profile'),
    Streams: Stream,
    Webhooks: require('./user/Webhooks')
  },
  StorageLayer,
  getDatabase,
  getStorageLayer,
  getDatabaseSync,
  getStorageLayerSync,
  userLocalDirectory: require('./userLocalDirectory')
};
