/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const path = require('path');
require('@pryv/boiler').init({
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
// Produces an engine-agnostic series connection (InfluxDB or PG).
/**
 * @returns {Promise<any>}
 */
async function produceSeriesConnection () {
  const { getConfig } = require('@pryv/boiler');
  const config = await getConfig();
  const engine = storage.getStorageEngine(config, 'database');
  switch (engine) {
    case 'postgresql': {
      const PGSeriesConnection = require('storages/engines/postgresql/src/pg_connection');
      const pgDb = await storage.getDatabasePG();
      return new PGSeriesConnection(pgDb);
    }
    default:
      return new business.series.InfluxConnection({ host: '127.0.0.1' });
  }
}
exports.produceSeriesConnection = produceSeriesConnection;
/**
 * Extract deltaTime in seconds from a connection.query() time field.
 * InfluxDB returns INanoDate; PG returns delta_time * 1000.
 * @param {any} time
 * @returns {number}
 */
function getTimeDelta (time) {
  if (typeof time === 'number') return time / 1000;
  return Number(time.getNanoTime()) / 1e9;
}
exports.getTimeDelta = getTimeDelta;
// Returns the StorageLayer instance (engine-agnostic).
/**
 * @returns {Promise<any>}
 */
async function produceConnection () {
  return await storage.getStorageLayer();
}
exports.produceStorageConnection = produceConnection;
exports.produceConnection = produceConnection;
// --------------------------------------------------------- prespawning servers
logger.debug('creating new spawn context');
const spawner = testHelpers.spawner;
const spawnContext = new spawner.SpawnContext('test/support/child_process');

after(() => {
  logger.debug('shutting down spawn context');
  spawnContext.shutdown();
});

exports.spawnContext = spawnContext;
