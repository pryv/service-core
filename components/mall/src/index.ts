/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Data Store aggregator.
 * Pack configured datastores into one
 */

const { getConfig, getLogger } = require('@pryv/boiler');
const Mall = require('./Mall');

type DataStore = typeof import('pryv-datastore').default;

let mall: Mall;
let initializing: boolean = false;

async function getMall(): Promise<Mall> {
  while (initializing) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (mall != null) return mall;
  initializing = true;

  const config: {} = await getConfig();
  const logger: {} = getLogger('mall');
  mall = new Mall();

  // load external stores from config (Imported After to avoid cycles);
  const customStoresDef: Array<{}> = config.get('custom:dataStores');
  if (customStoresDef) {
    for (const storeDef of customStoresDef) {
      logger.info(
        `Loading store "${storeDef.name}" with id "${storeDef.id}" from ${storeDef.path}`
      );
      const newStore: DataStore = require(storeDef.path);
      newStore.id = storeDef.id;
      newStore.name = storeDef.name;
      newStore.settings = storeDef.config;
      mall.addStore(newStore);
    }
  }

  // Load built-in stores

  if (config.get('database:engine') === 'sqlite') {
    const LocalStore: DataStore = require('storage/src/LocalDataStoreSQLite'); // change to LocalDataStoreSQLite for SQLite PoC
    mall.addStore(LocalStore);
    logger.info('Using SQLite PoC Datastore');
  } else {
    const localStore: DataStore = require('storage/src/localDataStore');
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

module.exports = {
  getMall: getMall,
  // TODO: eventually remove this once all the store id logic is safely contained within the mall
  storeDataUtils: require('./helpers/storeDataUtils'),
};
