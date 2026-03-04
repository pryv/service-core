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
const internals = require('./internals');
const { getConfig } = require('@pryv/boiler');

/**
 * Register all host internals that engines may need.
 * Called once during init(), after database connections are created.
 */
function registerInternals (database, databasePG, storageLayer) {
  // Live instances
  if (database) internals.register('database', database);
  if (databasePG) internals.register('databasePG', databasePG);
  internals.register('storageLayer', storageLayer);

  // Static modules from storage
  internals.register('userLocalDirectory', require('storage/src/userLocalDirectory'));
  internals.register('DeletionModesFields', require('storage/src/DeletionModesFields'));
  internals.register('localStoreEventQueries', require('storage/src/localStoreEventQueries'));
  internals.register('getEventFiles', require('storage/src/eventFiles/getEventFiles').getEventFiles);
  internals.register('migrations', require('storage/src/migrations/index'));
  internals.register('MigrationContext', require('storage/src/migrations/MigrationContext'));
  internals.register('softwareVersion', require('storage/package.json').version);

  // Static modules from business
  internals.register('SystemStreamsSerializer', require('business/src/system-streams/serializer'));
  internals.register('StreamProperties', require('business/src/streams').StreamProperties);
  internals.register('integrityAccesses', require('business/src/integrity').accesses);

  // Static module from api-server
  internals.register('streamsQueryUtils', require('api-server/src/methods/helpers/streamsQueryUtils'));

  // Cache component
  internals.register('cache', require('cache'));

  // Utils
  internals.register('encryption', require('utils').encryption);
  internals.register('treeUtils', require('utils').treeUtils);

  // Interface factory
  internals.register('createUserAccountStorage', require('storages/interfaces/baseStorage/UserAccountStorage').createUserAccountStorage);
}

/**
 * Initialize all discovered engines whose requiredInternals are all registered.
 * Engines whose internals aren't satisfied (e.g. postgresql when only MongoDB is
 * configured) are silently skipped.
 */
function initEngines () {
  for (const engineName of pluginLoader.listEngines()) {
    const manifest = pluginLoader.getManifest(engineName);
    if (!manifest || !manifest.requiredInternals || manifest.requiredInternals.length === 0) continue;
    // Skip engines whose internals are not all registered
    if (!manifest.requiredInternals.every(name => internals.isRegistered(name))) continue;
    const resolved = internals.resolve(manifest.requiredInternals, engineName);
    const mod = pluginLoader.getEngineModule(engineName);
    if (typeof mod.init === 'function') {
      mod.init(resolved);
    }
  }
}

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

  // 2. Register internals
  const storageLayer = new StorageLayer();
  registerInternals(database, databasePG, storageLayer);

  // 3. Initialize engines (must be before storageLayer.init which calls engine.initStorageLayer)
  initEngines();

  // 4. StorageLayer
  await storageLayer.init(connection);

  // 5. UserAccountStorage
  const uaEngine = getStorageEngine(config, 'storageUserAccount');
  const uaModule = pluginLoader.getEngineModule(uaEngine);
  const userAccountStorage = uaModule.getUserAccountStorage();
  await userAccountStorage.init();

  // 6. UsersLocalIndex (wrapper singleton — caching, logging around raw DB)
  const usersLocalIndex = require('storage/src/usersLocalIndex');
  await usersLocalIndex.init();

  // 7. PlatformDB
  const { validatePlatformDB } = require('storages/interfaces/platformStorage/PlatformDB');
  const platEngine = pluginLoader.getEngineFor('platformStorage');
  const platModule = pluginLoader.getEngineModule(platEngine);
  const platformDB = platModule.createPlatformDB();
  await platformDB.init();
  validatePlatformDB(platformDB);

  // 8. Series connection (skip if engine missing or lacks support)
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

  // 9. DataStore module (for mall)
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
  internals.clearAll();
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
