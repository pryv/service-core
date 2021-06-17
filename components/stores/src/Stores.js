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

const errors = require('errors').factory;

const {DataSource} = require('../interfaces/DataSource');

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

  get id() { return 'store' }
  get name() { return 'Store' }

  constructor() {
    super();
    this.storesMap = {};
    this.stores = [];
    this.initialized = false;
  }

  /**
   * register a new DataSource
   * @param 
   */
  addStore(store) {
    if (this.initialized) throw(new Error('Sources cannot be added after init()'));
    this.stores.push(store);
    this.storesMap[store.id] = store;
  }

  async init() {
    if (this.initialized) throw(new Error('init() can only be called once.'));
    this.initialized = true;

    // initialize all stores
    for (let store of this.stores) {
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
  _storeForId(storeId) {
    return this.storesMap[storeId];
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

}

module.exports = Stores;