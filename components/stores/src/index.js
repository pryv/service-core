/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Data Source aggregator. 
 * Pack configured datasources into one
 */

const { getConfig, getLogger } = require('@pryv/boiler');
const Stores = require('./Stores');

import typeof DataSource from '../interfaces/DataSource';

let stores: ?Array<DataSource>;
let initializing: boolean = false;
async function getStores(): Array<DataSource> {
  while (initializing) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (stores != null) return stores;
  initializing = true;

  const config: {} = await getConfig();
  const logger: {} = getLogger('stores');
  stores = new Stores();
  
  // -- DataStores (Imported After to avoid cycles);
  const externalStores: Array<{}> = config.get('stores:loadExternal');
  if (externalStores) { // keep it like this .. to be sure we test null, undefined, [], false
    for (const externalStore of externalStores) {
      const NewStore: Function = require(externalStore.path);
      const newStore: DataSource = new NewStore(externalStore.config);
      newStore.id = externalStore.id;
      newStore.name = externalStore.name;
      stores.addStore(newStore); 
      logger.info('Loading stores [' + newStore.name + '] with id [' + newStore.id + '] from ' + externalStore.path);
    }
  }

  // -- Builds in

  const LocalStore: DataSource = require('../implementations/local/LocalDataSource');
  stores.addStore(new LocalStore());

  if ( (! config.get('openSource:isActive')) && config.get('audit:active')) {
    const AuditDataSource = require('audit/src/AuditDataSource');
    stores.addStore(new AuditDataSource());
  }
  await stores.init()
  initializing = false;
  return stores;
};


module.exports = {
  getStores : getStores,
  StreamsUtils: require('./lib/StreamsUtils')
};
