/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const storeDataUtils = require('./helpers/storeDataUtils');
const MallUserStreams = require('./MallUserStreams');
const MallUserEvents = require('./MallUserEvents');
const MallTransaction = require('./MallTransaction');

/**
 * Storage for streams and events.
 * Under the hood, manages the different data stores (built-in and custom),
 * dispatching data requests for each one.
 */
class Mall {
  /**
   * @type {Map<string, DataStore>}
   */
  stores;
  /**
   * @type {Map<string, DataStore>}
   */
  stores;

  initialized;

  _streams;

  _events;
  constructor () {
    this.stores = new Map();
    this.initialized = false;
  }

  get streams () {
    return this._streams;
  }

  get events () {
    return this._events;
  }

  /**
   * Register a new DataStore
   * @param {DataStore} store
   * @returns {void}
   */
  addStore (store, params) {
    if (this.initialized) { throw new Error('Sources cannot be added after init()'); }
    this.stores.set(store.id, store);
  }

  /**
   * @returns {Promise<this>}
   */
  async init () {
    if (this.initialized) { throw new Error('init() can only be called once.'); }
    this.initialized = true;
    // placed here otherwise create a circular dependency .. pfff
    const { getUserAccountStorage } = require('storage');
    const userAccountStorage = await getUserAccountStorage();
    for (const store of this.stores.values()) {
      const params = {
        keyValueStorage: userAccountStorage.keyValuesForDataStore(store.id)
      };
      await store.init(params);
    }
    this._streams = new MallUserStreams(this.stores.values());
    this._events = new MallUserEvents(this.stores.values());
    return this;
  }

  /**
   * @returns {Promise<void>}
   */
  async deleteUser (userId) {
    for (const store of this.stores.values()) {
      try {
        await store.deleteUser(userId);
      } catch (error) {
        storeDataUtils.throwAPIError(error, store.id);
      }
    }
  }

  /**
   * Return the quantity of storage used by the user in bytes.
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async getUserStorageSize (userId) {
    let storageUsed = 0;
    for (const store of this.stores.values()) {
      try {
        storageUsed += await store.getUserStorageSize(userId);
      } catch (error) {
        storeDataUtils.throwAPIError(error, store.id);
      }
    }
    return storageUsed;
  }

  /**
   * @param {string} storeId
   * @returns {Promise<any>}
   */
  async newTransaction () {
    return new MallTransaction(this);
  }
}
module.exports = Mall;
