/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const path = require('path');
const { getLogger } = require('@pryv/boiler').init({
  appName: 'hfs-server-tests',
  baseFilesDir: path.resolve(__dirname, '../../../../'),
  baseConfigDir: path.resolve(__dirname, '../../config'),
  extraConfigs: [
    {
      scope: 'serviceInfo',
      key: 'service',
      urlFromKey: 'serviceInfoUrl'
    },
    {
      scope: 'defaults-paths',
      file: path.resolve(__dirname, '../../../api-server/config/paths-config.js')
    },
    {
      plugin: require('api-server/config/components/systemStreams')
    }
  ]
});
// Test helpers for all acceptance tests.
const logger = require('@pryv/boiler').getLogger('test-helpers');
const testHelpers = require('test-helpers');
const storage = require('storage');
const business = require('business');
// Produces and returns a connection to InfluxDB.
//
/**
 * @returns {any}
 */
function produceInfluxConnection () {
  return new business.series.InfluxConnection({ host: 'localhost' });
}
exports.produceInfluxConnection = produceInfluxConnection;
// Produces and returns a connection to MongoDB.
//
/**
 * @returns {any}
 */
async function produceMongoConnection () {
  return await storage.getDatabase();
}
exports.produceMongoConnection = produceMongoConnection;
// Produces a StorageLayer instance
//
/**
 * @param {storage.Database} connection
 * @returns {any}
 */
function produceStorageLayer (connection) {
  const passwordResetRequestMaxAge = 60 * 1000;
  const sessionMaxAge = 60 * 1000;
  return new storage.StorageLayer(connection, getLogger('null'), 'attachmetsDirPath', 'previewsDirPath', passwordResetRequestMaxAge, sessionMaxAge);
}
exports.produceStorageLayer = produceStorageLayer;
// --------------------------------------------------------- prespawning servers
logger.debug('creating new spawn context');
const spawner = testHelpers.spawner;
const spawnContext = new spawner.SpawnContext('test/support/child_process');

after(() => {
  logger.debug('shutting down spawn context');
  spawnContext.shutdown();
});

exports.spawnContext = spawnContext;
