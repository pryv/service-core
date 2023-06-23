/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * “Data stores aggregator”.
 * Provides a uniform interface to all data stores (built-in and custom).
 */

const { setTimeout } = require('timers/promises');
const { getConfig, getLogger } = require('@pryv/boiler');
const Mall = require('./Mall');

module.exports = {
  getMall,
  // TODO: eventually remove this once all the store id logic is safely contained within the mall
  storeDataUtils: require('./helpers/storeDataUtils')
};

let mall;
let initializing = false;

/**
 * @returns {Promise<any>}
 */
async function getMall () {
  // eslint-disable-next-line no-unmodified-loop-condition
  while (initializing) {
    await setTimeout(5);
  }
  if (mall != null) { return mall; }
  initializing = true;

  const config = await getConfig();
  const logger = getLogger('mall');
  mall = new Mall();

  // load external stores from config (imported after to avoid cycles);
  const customStoresDef = config.get('custom:dataStores');
  if (customStoresDef) {
    for (const storeDef of customStoresDef) {
      logger.info(`Loading store "${storeDef.name}" with id "${storeDef.id}" from ${storeDef.path}`);
      const store = require(storeDef.path);
      const storeDescription = {
        id: storeDef.id,
        name: storeDef.name,
        settings: storeDef.settings
      };
      mall.addStore(store, storeDescription);
    }
  }

  // Load built-in stores
  const localSettings = {
    attachments: { setFileReadToken: true },
    versioning: config.get('versioning')
  };
  if (config.get('database:engine') === 'sqlite') {
    logger.info('Using PoC SQLite data store');
    const sqlite = require('storage/src/localDataStoreSQLite');
    mall.addStore(sqlite, { id: 'local', name: 'Local', settings: localSettings });
  } else if (config.get('database:engine') === 'rest') {
    logger.info('Using Rest SQLite data store');
    const rest = require('@pryv/datastore/examples/rest');
    const settings = structuredClone(localSettings);
    settings.baseURL = config.get('database:baseURL');
    mall.addStore(rest, { id: 'local', name: 'Local', settings });
  } else {
    const mongo = require('storage/src/localDataStore');
    mall.addStore(mongo, { id: 'local', name: 'Local', settings: localSettings });
  }
  // audit
  if (!config.get('openSource:isActive') && config.get('audit:active')) {
    const auditDataStore = require('audit/src/datastore/auditDataStore');
    mall.addStore(auditDataStore, { id: '_audit', name: 'Audit', settings: {} });
  }

  await mall.init();

  initializing = false;
  return mall;
}

/** @typedef {Class<import>} DataStore */
