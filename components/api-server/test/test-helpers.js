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
const { getConfig } = require('boiler');
const InfluxConnection = require('components/business/src/series/influx_connection');

// Produces and returns a connection to MongoDB. 
async function produceMongoConnection(): Promise<Database> {
  const config = await getConfig();
  const database = new Database(config.get('database')); 
  
  return database; 
}

function produceInfluxConnection(settings: any) {
  const host = settings.get('influxdb:host'); 
  const port = settings.get('influxdb:port');
  return new InfluxConnection({host: host, port: port});
}

module.exports = {
  context,                // the spawn context for manipulating child instances
  produceMongoConnection, // for using fixtures
  produceInfluxConnection
};