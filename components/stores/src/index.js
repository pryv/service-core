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

const Store = require('./Store');

// -- DataStores
const DummyStore = require('../implementations/dummy');
const FaultyStore = require('../implementations/faulty');
const LocalStore = require('../implementations/local');
const AuditDataSource = require('audit/src/AuditDataSource');


let store;
async function getStore() {
  if (store) return store;
  store = new Store();
  store.addSource(new DummyStore());
  store.addSource(new FaultyStore());
  store.addSource(new LocalStore());
  store.addSource(new AuditDataSource());
  return await store.init();
};


module.exports = {
  getStore : getStore,
  StreamsUtils: require('./lib/StreamsUtils')
};


// ---- dev mode 

(async () => { 
  try {
    const s = await getStore();
    const streams = await s.streams.get('toto', {parentIds: ['.*']});
    //const streams = await s.events.get('toto', {streamIds: ['.*']});
    console.log(require('util').inspect(streams, null, 10));
  } catch (e) {
    console.log(e);
  }
});
