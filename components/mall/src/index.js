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
      const newStore = require(storeDef.path);
      newStore.id = storeDef.id;
      newStore.name = storeDef.name;
      newStore.settings = storeDef.config;
      mall.addStore(newStore);
    }
  }

  // Load built-in stores
  if (config.get('database:engine') === 'sqlite') {
    const localStoreSQLite = require('storage/src/LocalDataStoreSQLite'); // change to LocalDataStoreSQLite for SQLite PoC
    mall.addStore(localStoreSQLite);
    logger.info('Using SQLite PoC Datastore');
  } else {
    const localStore = require('storage/src/localDataStore');
    mall.addStore(localStore);
  }
  if (!config.get('openSource:isActive') && config.get('audit:active')) {
    const auditDataStore = require('audit/src/datastore/auditDataStore');
    mall.addStore(auditDataStore);
  }

  await mall.init();

  initializing = false;
  return mall;
}

/** @typedef {Class<import>} DataStore */
