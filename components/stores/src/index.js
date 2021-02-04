/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Data Source aggregator. 
 * Pack configured datasources into one
 */

const Store = require('./Store');

let store;
async function getStore() {
  if (store) return store;
  store = new Store();
  return await store.init();
};



module.exports = {
  getStore : getStore
};
// ---- dev mode 

(async () => { 
  try {
    const s = await getStore();
    const streams = await s.streams.get('toto', {streamIds: ['.*']});
    console.log(streams);
  } catch (e) {
    console.log(e);
  }
})();


const a = '.string-asdasj';
const r = /^\.([a-z]+)/;

const d = Date.now();
for (let i = 0; i < 1; i++) {
  const b = a.match(r)[1];
  //assert('string' == b);
}
console.log(Date.now() - d);


const d2 = Date.now();
for (let i = 0; i < 1; i++) {
  const b = (a.split('-')[0]);
  //assert('.string' == b);
}
console.log(Date.now() - d2);


