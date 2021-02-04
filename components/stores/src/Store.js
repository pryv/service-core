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

const {DataSource} = require('../interfaces/DataSource');

// -- Core properties
const StoreUserStreams = require('./StoreUserStreams');
const StoreUserEvents = require('./StoreUserEvents');

class Store extends DataSource {

  get id() { return 'store' }
  get name() { return 'Store' }

  constructor() {
    super();
    this.sourcesMap = {};
    this.sources = [];
    this.initialized = false;
  }

  /**
   * register a new DataSource
   */
  addSource(source) {
    if (this.initialized) throw(new Error('Sources cannot be added after init()'));
    this.sources.push(source);
    this.sourcesMap[source.id] = source;
  }

  async init() {
    if (this.initialized) throw(new Error('init() can only be called once.'));
    this.initialized = true;

    // initialize all sources
    for (let source of this.sources) {
      await source.init();
    }

    // expose streams and events;
    this._streams = new StoreUserStreams(this);
    this._events = new StoreUserEvents(this);
    
    return this;
  }

  sourceForId(sourceId) {
    return this.sourcesMap[sourceId];
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

}

module.exports = Store;