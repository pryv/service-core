/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Data Store aggregator.
 * Pack configured datastores into one
 */

const { DataStore, errors } = require('pryv-datastore');
const APIError = require('errors/src/APIError');

// patch DataStore errors with legacy error factory
const errorFactory = require('errors').factory
errors._setFactory(errorFactory);


// -- Core properties
const MallUserStreams = require('./MallUserStreams');
const StoreUserEvents = require('./MallUserEvents');

class Mall {

  _id: string = 'store';
  _name: string = 'Store';
  stores: Array<DataStore>;
  storesMap: Map<string, DataStore>;
  initialized: boolean;
  _streams: MallUserStreams;
  _events: StoreUserEvents;

  constructor() {
    this.storesMap = {};
    this.stores = [];
    this.initialized = false;
  }

  get streams(): MallUserStreams { return this._streams; }
  get events(): StoreUserEvents { return this._events; }

  /**
   * register a new DataStore
   * @param
   */
  addStore(store: DataStore): void {
    if (this.initialized) throw(new Error('Sources cannot be added after init()'));
    this.stores.push(store);
    this.storesMap[store.id] = store;
  }

  async init(): Promise<Mall> {
    if (this.initialized) throw(new Error('init() can only be called once.'));
    this.initialized = true;

    // initialize all stores
    for (const store: DataStore of this.stores) {
      await store.init();
    }

    // expose streams and events;
    this._streams = new MallUserStreams(this);
    this._events = new StoreUserEvents(this);

    return this;
  }

  /**
   * @private
   * @param {identifier} storeId
   * @returns
   */
  _storeForId(storeId: string): DataStore {
    return this.storesMap[storeId];
  }

  /**
   * Catches errors from DataStore and makes sure they are forwarded as API errors.
   * @param {*} error 
   * @param {*} storeId 
   */
  throwAPIError(error, storeId) {
    if (! error instanceof Error) {
      error = new Error(error);
    }
    if (! error instanceof APIError) {
      error = errorFactory.unexpectedError(error);
    }
    if (storeId != null) {
      const store = this._storeForId(storeId);
      error.message = `Data Store Error: ${store.name} [${store.id}] - ${error.message}`;
    }
    throw error;
  }

}

module.exports = Mall;
