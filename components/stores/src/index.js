/**
 * Data Source aggregator. 
 * Pack configured datasources into one
 */

const {DataSource, UserStreams, UserEvents}  = require('../interfaces/DataSource');

const DummyStore = require('../implementations/dummy');

class Store extends DataSource {

  get id() {
    return 'store'
  }

  get name() {
    return 'Store'
  }

  constructor() {
    super();
  }

  async init() {
    // load sources
    this.sourcesMap = {};
    this.sources = [];
    const dummy = await (new DummyStore()).init();
    this.sources.push(dummy);
    this.sourcesMap[dummy.id] = dummy;

    // expose streams and events;
    this._streams = new StoreUserStreams(this);
    this._events = new StoreUserEvents(this);

    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

}


class StoreUserStreams extends UserStreams {
 
  constructor(main) {
    super();
    this.main = main;
  }

  async get(uid, params) {
    let res = [];

    if (! params.streamIds) { // root query we just expose stores handles
      for (let source of this.main.sources) {
        res.push([{
          id: source.id,
          name: source.name,
          created: DataSource.UNKOWN_DATE,
          modified: DataSource.UNKOWN_DATE,
          createdBy: DataSource.BY_SYSTEM,
          modifiedBy: DataSource.BY_SYSTEM,
          children: [],
          childrenHidden: true // To be discussed
        }]);
      }
      return res;
    }

    // -- forward query to included stores (parallel)
    const flags = {};
    let addSourceRoot = false;
    for (let streamId of params.streamIds) {
      if (streamId.indexOf('.') === 0) { // fatest method against startsWith or charAt() -- 10x
        if (streamId === '.*') {   // if '.*' add all sources
          for (let source of this.main.sources) {
            flags[source.id] = true;
          }
          addSourceRoot = true;

        } else {  // add streamId's corresponding source 
          const sourceId = streamId.substr(1, streamId.indexOf('-') - 1); // fastest against regexp and split 40x
          if (! flags[sourceId]) {
            flags[sourceId] = true;
            if (! this.main.sourcesMap[sourceId]) {
              DataSource.errorUnkownRessource('DataSource [' + sourceId + '] unkown in streamIds query parameters', params);
            } 
          }
        }
      }
    }

    const tasks = [];
    const sourceIds = Object.keys(flags);
    for (let sourceId of sourceIds) {
      tasks.push(this.main.sourcesMap[sourceId].streams.get(uid, params));
    }

    // call all sources
    const sourcesRes =  await Promise.allSettled(tasks);

    // check results and eventually replace with error (non blocking unavailable ressource)
    for (let i = 0; i < sourceIds.length; i++) {
      if (sourcesRes[i].status === 'fulfilled') {
        if (! addSourceRoot) {
          res.push(...sourcesRes[i].value); // add all items to res
        } else {
          const source = this.main.sourcesMap[sourceIds[i]];
          res.push([{
            id: source.id,
            name: source.name,
            created: DataSource.UNKOWN_DATE,
            modified: DataSource.UNKOWN_DATE,
            createdBy: DataSource.BY_SYSTEM,
            modifiedBy: DataSource.BY_SYSTEM,
            children: sourcesRes[i].value
          }]);
        }
      } else {
        const source = this.main.sourcesMap[sourceIds[i]];
        res.push([{
          id: source.id,
          name: source.name,
          created: DataSource.UNKOWN_DATE,
          modified: DataSource.UNKOWN_DATE,
          createdBy: DataSource.BY_SYSTEM,
          modifiedBy: DataSource.BY_SYSTEM,
          unreachable: sourcesRes[i].reason
        }]);
      }
    }
    return res;
  }
}

class StoreUserEvents extends UserEvents {
  
  constructor(store) {
    super();
    this.store = store;
  }

}


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


