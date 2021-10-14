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

const errors = require('errors').factory;

const { DataSource } = require('../interfaces/DataSource');

// --- Override Error handling 

DataSource.throwInvalidRequestStructure = function(message, data) {
  throw(errors.invalidRequestStructure(message, data, innerError));
}

DataSource.throwUnkownRessource = function(resourceType, id, innerError) {
  throw(errors.unknownResource(resourceType, id, innerError));
}


// -- Core properties
const StoresUserStreams = require('./StoresUserStreams');
const StoreUserEvents = require('./StoresUserEvents');

class Stores extends DataSource {

  _id: string = 'store';
  _name: string = 'Store';
  stores: Array<DataSource>;
  storesMap: Map<string, DataSource>;
  initialized: boolean;
  _streams: StoresUserStreams;
  _events: StoreUserEvents;

  constructor() {
    super();
    this.storesMap = {};
    this.stores = [];
    this.initialized = false;
  }

  get streams(): StoresUserStreams { return this._streams; }
  get events(): StoreUserEvents { return this._events; }

  /**
   * register a new DataSource
   * @param 
   */
  addStore(store: DataSource): void {
    if (this.initialized) throw(new Error('Sources cannot be added after init()'));
    this.stores.push(store);
    this.storesMap[store.id] = store;
  }

  async init(): Promise<Stores> {
    if (this.initialized) throw(new Error('init() can only be called once.'));
    this.initialized = true;

    // initialize all stores
    for (const store: DataSource of this.stores) {
      await store.init();
    }

    // expose streams and events;
    this._streams = new StoresUserStreams(this);
    this._events = new StoreUserEvents(this);
    
    return this;
  }

  /**
   * @private
   * @param {identifier} storeId 
   * @returns 
   */
  _storeForId(storeId: string): DataSource {
    return this.storesMap[storeId];
  }

}

module.exports = Stores;