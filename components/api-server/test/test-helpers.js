/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
process.env.NODE_ENV = 'test';

process.on('unhandledRejection', unhandledRejection);

const { getLogger } = require('@pryv/boiler');
const logger = getLogger('test-helpers');

// Handles promise rejections that aren't caught somewhere. This is very useful
// for debugging. 
function unhandledRejection(reason, promise) {
  logger.warn(                                // eslint-disable-line no-console
    'Unhandled promise rejection:', promise, 
    'reason:', reason.stack || reason); 
}

// Set up a context for spawning api-servers.
const { SpawnContext } = require('test-helpers').spawner;
const context: SpawnContext = new SpawnContext(); 
/* global after */
after(async () => {
  await context.shutdown(); 
});

const storage = require('storage');
const { getConfig } = require('@pryv/boiler');
const InfluxConnection = require('business/src/series/influx_connection');

// Produces and returns a connection to MongoDB. 
async function produceMongoConnection(): Promise<Database> {
  return await storage.getDatabase(); 
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