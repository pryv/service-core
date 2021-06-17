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

const { getConfig } = require('@pryv/boiler');



let store;
async function getStores() {
  if (store) return store;
  const config = await getConfig();

  const Store = require('./Store');
  store = new Store();

  // -- DataStores (Imported After to avoid cycles);
  const DummyStore = require('../implementations/dummy');
  store.addSource(new DummyStore());

  const FaultyStore = require('../implementations/faulty');
  store.addSource(new FaultyStore());

  const LocalStore = require('../implementations/local/LocalDataSource');
  store.addSource(new LocalStore());

  if ( (! config.get('openSource:isActive')) && config.get('audit:active')) {
    const AuditDataSource = require('audit/src/AuditDataSource');
    store.addSource(new AuditDataSource());
  }

  return await store.init();
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
