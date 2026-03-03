/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Storages barrel — eager init, single entry point for all storage instances.
 *
 * Call `init(config)` once at startup (api-server, test setup).
 * After that, access instances via getters: `require('storages').storageLayer`.
 */

const pluginLoader = require('./pluginLoader');
const { getConfig } = require('@pryv/boiler');

let instances = null;
let initializing = false;

// Early-published references: set as soon as created during init() so that
// sub-components calling back into the barrel (e.g. PG userAccountStorage
// calling getDatabasePG()) can find them before `instances` is assembled.
let _earlyDatabase = null;
let _earlyDatabasePG = null;

/**
 * Initialize all storage subsystems eagerly.
 * Fail-fast if any backing store is down.
 *
 * @param {Object} [config] - @pryv/boiler config (fetched if omitted)
 */
async function init (config) {
  if (instances || initializing) return;
  initializing = true;
  if (!config) config = await getConfig();
  await pluginLoader.init(config);

  const getStorageEngine = require('storage/src/getStorageEngine');
  const StorageLayer = require('storage/src/StorageLayer');
  const { dataBaseTracer } = require('tracing');

  // 1. Database connection (based on baseStorage engine)
  const baseEngine = pluginLoader.getEngineFor('baseStorage');
  let database = null;
  let databasePG = null;
  if (baseEngine === 'mongodb') {
    const Database = require('./engines/mongodb/src/Database');
    database = new Database(config.get('database'));
    dataBaseTracer(database);
  } else if (baseEngine === 'postgresql') {
    const DatabasePG = require('./engines/postgresql/src/DatabasePG');
    databasePG = new DatabasePG(config.get('postgresql'));
  }
  const connection = database || databasePG || null;

  // Publish early so sub-component inits can find the connections
  _earlyDatabase = database;
  _earlyDatabasePG = databasePG;

  // 2. StorageLayer
  const storageLayer = new StorageLayer();
  await storageLayer.init(connection);

  // 3. UserAccountStorage
  const uaEngine = getStorageEngine(config, 'storageUserAccount');
  const uaModule = pluginLoader.getEngineModule(uaEngine);
  const userAccountStorage = uaModule.getUserAccountStorage();
  await userAccountStorage.init();

  // 4. UsersLocalIndex (wrapper singleton — caching, logging around raw DB)
  const usersLocalIndex = require('storage/src/usersLocalIndex');
  await usersLocalIndex.init();

  // 5. PlatformDB
  const { validatePlatformDB } = require('storages/interfaces/platformStorage/PlatformDB');
  const platEngine = pluginLoader.getEngineFor('platformStorage');
  const platModule = pluginLoader.getEngineModule(platEngine);
  const platformDB = platModule.createPlatformDB();
  await platformDB.init();
  validatePlatformDB(platformDB);

  // 6. Series connection (skip if engine missing or lacks support)
  let seriesConnection = null;
  const seriesEngine = pluginLoader.getEngineFor('seriesStorage');
  if (seriesEngine) {
    let seriesModule;
    try { seriesModule = pluginLoader.getEngineModule(seriesEngine); } catch (e) { /* engine not installed */ }
    if (seriesModule?.createSeriesConnection) {
      const { validateSeriesConnection } = require('storages/interfaces/seriesStorage/SeriesConnection');
      seriesConnection = await seriesModule.createSeriesConnection({
        host: config.has('influxdb:host') ? config.get('influxdb:host') : undefined,
        port: config.has('influxdb:port') ? config.get('influxdb:port') : undefined,
        databasePG // pass PG connection so engine doesn't re-enter the barrel
      });
      validateSeriesConnection(seriesConnection);
    }
  }

  // 7. DataStore module (for mall)
  const dsEngine = getStorageEngine(config, 'database');
  const dsModule = pluginLoader.getEngineModule(dsEngine);
  const dataStoreModule = dsModule.getDataStoreModule();

  instances = {
    database,
    databasePG,
    connection,
    storageLayer,
    userAccountStorage,
    usersLocalIndex,
    platformDB,
    seriesConnection,
    dataStoreModule
  };
  initializing = false;
}

/**
 * Reset all state (for testing).
 */
function reset () {
  instances = null;
  initializing = false;
  _earlyDatabase = null;
  _earlyDatabasePG = null;
  pluginLoader.reset();
}

module.exports = {
  init,
  reset,
  pluginLoader,
  get database () { return instances?.database ?? _earlyDatabase; },
  get databasePG () { return instances?.databasePG ?? _earlyDatabasePG; },
  get connection () { return instances?.connection; },
  get storageLayer () { return instances?.storageLayer; },
  get userAccountStorage () { return instances?.userAccountStorage; },
  get usersLocalIndex () { return instances?.usersLocalIndex; },
  get platformDB () { return instances?.platformDB; },
  get seriesConnection () { return instances?.seriesConnection; },
  get dataStoreModule () { return instances?.dataStoreModule; }
};
