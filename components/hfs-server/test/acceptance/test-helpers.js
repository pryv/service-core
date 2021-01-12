/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const path = require('path');
const { getGifnoc } = require('boiler').init({
  appName: 'hfs-server-tests',
  baseConfigDir: path.resolve(__dirname, '../../newconfig'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  }, {
    scope: 'defaults-data',
    file: path.resolve(__dirname, '../../../api-server/newconfig/defaults.js')
  }, {
    plugin: require('../../../api-server/config/components/systemStreams')
  }]
});

// Test helpers for all acceptance tests. 

const debug = require('debug')('test-helpers');
const testHelpers = require('components/test-helpers');
const NullLogger = require('components/utils/src/logging').NullLogger;
const storage = require('components/storage');
const business = require('components/business');

const toplevelHelpers = require('../test-helpers');

// Produces and returns a connection to InfluxDB. 
// 
function produceInfluxConnection(): business.series.InfluxConnection {
  const logger = new NullLogger(); 
  
  return new business.series.InfluxConnection(
    {host: 'localhost'}, logger); 
}
exports.produceInfluxConnection = produceInfluxConnection;

// Produces and returns a connection to MongoDB. 
// 
async function produceMongoConnection(): storage.Database {
  const gifnoc = await getGifnoc();
  const database = new storage.Database(
    gifnoc.get('database'), 
    new NullLogger()); 
  
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
    new NullLogger(), 
    'attachmetsDirPath', 'previewsDirPath', 
    passwordResetRequestMaxAge,
    sessionMaxAge);
}
exports.produceStorageLayer = produceStorageLayer;


// --------------------------------------------------------- prespawning servers

debug('creating new spawn context');
const spawner = testHelpers.spawner;
const spawnContext = new spawner.SpawnContext('test/support/child_process');

/* global after */
after(() => {
  debug('shutting down spawn context');
  spawnContext.shutdown(); 
});

exports.spawnContext = spawnContext;