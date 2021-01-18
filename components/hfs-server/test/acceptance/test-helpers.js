/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const path = require('path');
const { getConfig, getLogger } = require('boiler').init({
  appName: 'hfs-server-tests',
  baseConfigDir: path.resolve(__dirname, '../../config'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  }, {
    scope: 'defaults-data',
    file: path.resolve(__dirname, '../../../api-server/config/defaults.js')
  }, {
    plugin: require('../../../api-server/config/components/systemStreams')
  }]
});

// Test helpers for all acceptance tests. 

const logger = require('boiler').getLogger('test-helpers');
const testHelpers = require('components/test-helpers');
const storage = require('components/storage');
const business = require('components/business');

const toplevelHelpers = require('../test-helpers');

// Produces and returns a connection to InfluxDB. 
// 
function produceInfluxConnection(): business.series.InfluxConnection {
  
  return new business.series.InfluxConnection({host: 'localhost'}); 
}
exports.produceInfluxConnection = produceInfluxConnection;

// Produces and returns a connection to MongoDB. 
// 
async function produceMongoConnection(): storage.Database {
  const config = await getConfig();
  const database = new storage.Database(config.get('database')); 
  
  return database; 
}
exports.produceMongoConnection = produceMongoConnection;

// Produces a StorageLayer instance
// 
function produceStorageLayer(connection: storage.Database): storage.StorageLayer {
  const passwordResetRequestMaxAge = 60*1000;
  const sessionMaxAge = 60*1000;
  
  return new storage.StorageLayer(
    connection, 
    getLogger('null'), 
    'attachmetsDirPath', 'previewsDirPath', 
    passwordResetRequestMaxAge,
    sessionMaxAge);
}
exports.produceStorageLayer = produceStorageLayer;


// --------------------------------------------------------- prespawning servers

logger.debug('creating new spawn context');
const spawner = testHelpers.spawner;
const spawnContext = new spawner.SpawnContext('test/support/child_process');

/* global after */
after(() => {
  logger.debug('shutting down spawn context');
  spawnContext.shutdown(); 
});

exports.spawnContext = spawnContext;