/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Data Source aggregator. 
 * Pack configured datasources into one
 */

const { getConfig, getLogger } = require('@pryv/boiler');
const Stores = require('./Stores');


let stores;
let initializing = false;
async function getStores() {
  while (initializing) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (stores != null) return stores;
  initializing = true;

  const config = await getConfig();
  const logger = getLogger('stores');
  stores = new Stores();
  
  // -- DataStores (Imported After to avoid cycles);
  const externalStores = config.get('stores:loadExternal');
  for (const storeId in externalStores) {
    const storeConfig = externalStores[storeId];
    const NewStore = require(storeConfig.path);
    const newStore = new NewStore(storeConfig.config);
    newStore.id = storeId;
    newStore.name = storeConfig.name;
    stores.addStore(newStore); 
    logger.info('Loading stores [' + newStore.name + '] with id [' + newStore.id + '] from ' + storeConfig.path);
  }

  // -- Builds in
 
  const LocalStore = require('../implementations/local/LocalDataSource');
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



// ---- dev mode 

(async () => { 
  try {
    const s = await getStores();
    const streams = await s.streams.get('toto', {parentIds: ['.*']});
    //const streams = await s.events.get('toto', {streamIds: ['.*']});
    console.log(require('util').inspect(streams, null, 10));
  } catch (e) {
    console.log(e);
  }
});
