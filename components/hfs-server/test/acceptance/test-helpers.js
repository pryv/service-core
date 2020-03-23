// @flow

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
  const settings = await toplevelHelpers.loadSettings();
  const database = new storage.Database(
    settings.get('mongodb').obj(), 
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

// Forward certain things that the top level helper defines, for convenience: 
exports.loadSettings = toplevelHelpers.loadSettings;

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