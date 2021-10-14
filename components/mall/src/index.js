/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Data Store aggregator. 
 * Pack configured datastores into one
 */

const { getConfig, getLogger } = require('@pryv/boiler');
const Mall = require('./Mall');

import typeof DataStore from '../interfaces/DataStore';

let mall: Mall;
let initializing: boolean = false;
async function getMall(): Array<DataStore> {
  while (initializing) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (mall != null) return mall;
  initializing = true;

  const config: {} = await getConfig();
  const logger: {} = getLogger('mall');
  mall = new Mall();
  
  // -- DataStores (Imported After to avoid cycles);
  const externalStores: Array<{}> = config.get('mall:loadExternal');
  if (externalStores) { // keep it like this .. to be sure we test null, undefined, [], false
    for (const externalStore of externalStores) {
      const NewStore: Function = require(externalStore.path);
      const newStore: DataStore = new NewStore(externalStore.config);
      newStore.id = externalStore.id;
      newStore.name = externalStore.name;
      mall.addStore(newStore); 
      logger.info('Loading store [' + newStore.name + '] with id [' + newStore.id + '] from ' + externalStore.path);
    }
  }

  // -- Builds in

  const LocalStore: DataStore = require('../implementations/local/LocalDataStore');
  mall.addStore(new LocalStore());

  if ( (! config.get('openSource:isActive')) && config.get('audit:active')) {
    const AuditDataStore = require('audit/src/AuditDataStore');
    mall.addStore(new AuditDataStore());
  }
  await mall.init()
  initializing = false;
  return mall;
};


module.exports = {
  getMall : getMall,
  StreamsUtils: require('./lib/StreamsUtils')
};
