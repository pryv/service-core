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

    'Unhandled promise rejection:', promise, 'reason:', reason.stack || reason);
}
// Set up a context for spawning api-servers.
const { SpawnContext } = require('test-helpers').spawner;
const context = new SpawnContext();

after(async () => {
  await context.shutdown();
});
const storage = require('storage');
const InfluxConnection = require('storages/engines/influxdb/src/influx_connection');
/**
 * Returns the StorageLayer instance (engine-agnostic).
 * @returns {Promise<any>}
 */
async function produceConnection () {
  return await storage.getStorageLayer();
}
/**
 * Produces an engine-agnostic series connection (InfluxDB or PG).
 * @param {any} settings
 * @returns {Promise<any>}
 */
async function produceSeriesConnection (settings) {
  const engine = storage.getStorageEngine(settings, 'database');
  switch (engine) {
    case 'postgresql': {
      const PGSeriesConnection = require('storages/engines/postgresql/src/pg_connection');
      const pgDb = await storage.getDatabasePG();
      return new PGSeriesConnection(pgDb);
    }
    default: {
      const host = settings.get('influxdb:host');
      const port = settings.get('influxdb:port');
      return new InfluxConnection({ host, port });
    }
  }
}
module.exports = {
  context,
  produceStorageConnection: produceConnection,
  produceConnection,
  produceSeriesConnection
};
