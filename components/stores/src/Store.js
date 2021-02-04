/**
 * Data Source aggregator. 
 * Pack configured datasources into one
 */

const {DataSource} = require('../interfaces/DataSource');

// -- Core properties
const StoreUserStreams = require('./StoreUserStreams');
const StoreUserEvents = require('./StoreUserEvents');

// -- DataStores
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

module.exports = Store;