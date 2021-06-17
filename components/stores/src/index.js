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



let stores;
async function getStores() {
  if (stores) return stores;
  const config = await getConfig();

  const Stores = require('./Stores');
  stores = new Stores();

  // -- DataStores (Imported After to avoid cycles);
  const DummyStore = require('../implementations/dummy');
  stores.addStore(new DummyStore());

  const FaultyStore = require('../implementations/faulty');
  stores.addStore(new FaultyStore());

  const LocalStore = require('../implementations/local/LocalDataSource');
  stores.addStore(new LocalStore());

  if ( (! config.get('openSource:isActive')) && config.get('audit:active')) {
    const AuditDataSource = require('audit/src/AuditDataSource');
    stores.addStore(new AuditDataSource());
  }

  return await stores.init();
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
