/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
process.env.NODE_ENV = 'test';
process.on('unhandledRejection', unhandledRejection);
const { getLogger } = require('@pryv/boiler');
const logger = getLogger('test-helpers');
// Handles promise rejections that aren't caught somewhere. This is very useful
// for debugging.
/**
 * @returns {void}
 */
function unhandledRejection (reason, promise) {
  logger.warn(
    // eslint-disable-line no-console
    'Unhandled promise rejection:', promise, 'reason:', reason.stack || reason);
}
// Set up a context for spawning api-servers.
const { SpawnContext } = require('test-helpers').spawner;
const context = new SpawnContext();

after(async () => {
  await context.shutdown();
});
const storage = require('storage');
const InfluxConnection = require('business/src/series/influx_connection');
// Produces and returns a connection to MongoDB.
/**
 * @returns {Promise<any>}
 */
async function produceMongoConnection () {
  return await storage.getDatabase();
}
/**
 * @param {any} settings
 * @returns {any}
 */
function produceInfluxConnection (settings) {
  const host = settings.get('influxdb:host');
  const port = settings.get('influxdb:port');
  return new InfluxConnection({ host, port });
}
module.exports = {
  context,
  produceMongoConnection,
  produceInfluxConnection
};
