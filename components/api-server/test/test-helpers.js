/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
process.env.NODE_ENV = 'test';

process.on('unhandledRejection', unhandledRejection);

// Handles promise rejections that aren't caught somewhere. This is very useful
// for debugging. 
function unhandledRejection(reason, promise) {
  console.warn(                                // eslint-disable-line no-console
    'Unhandled promise rejection:', promise, 
    'reason:', reason.stack || reason); 
}

// Set up a context for spawning api-servers.
const { SpawnContext } = require('components/test-helpers').spawner;
const context: SpawnContext = new SpawnContext(); 
/* global after */
after(async () => {
  await context.shutdown(); 
});

const { Database } = require('components/storage');
const Settings = require('components/api-server/src/settings');
const NullLogger = require('components/utils/src/logging').NullLogger;
const InfluxConnection = require('components/business/src/series/influx_connection');

// Produces and returns a connection to MongoDB. 
async function produceMongoConnection(): Promise<Database> {
  const settings = await Settings.load();
  const database = new Database(
    settings.get('database').obj(), 
    new NullLogger()); 
  
  return database; 
}

function produceInfluxConnection(settings: any) {
  const host = settings.get('influxdb.host').str(); 
  const port = settings.get('influxdb.port').num();
  return new InfluxConnection(
    {host: host, port: port},
    new NullLogger()
  );
}

module.exports = {
  context,                // the spawn context for manipulating child instances
  produceMongoConnection, // for using fixtures
  produceInfluxConnection
};