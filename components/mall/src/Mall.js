/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const storeDataUtils = require('./helpers/storeDataUtils');
const MallUserStreams = require('./MallUserStreams');
const MallUserEvents = require('./MallUserEvents');
const MallTransaction = require('./MallTransaction');
const { getLogger } = require('@pryv/boiler');
const eventsUtils = require('./helpers/eventsUtils');

/**
 * Storage for streams and events.
 * Under the hood, manages the different data stores (built-in and custom),
 * dispatching data requests for each one.
 */
class Mall {
  /**
   * @type {Map<string, DataStore>}
   */
  storesById = new Map();
  /**
   * @type {Map<DataStore, {id: string, name: string, settings: object}>}
   */
  storeDescriptionsByStore = new Map();
  /**
   * Contains the list of stores included in star permissions.
   * @type {string[]}
   */
  includedInStarPermissions = [];

  _events;
  _streams;

  initialized = false;

  get streams () {
    return this._streams;
  }

  get events () {
    return this._events;
  }

  /**
   * Register a DataStore
   * @param {DataStore} store
   * @param {{ id: string, name: string, settings: object}} storeDescription
   * @returns {void}
   */
  addStore (store, storeDescription) {
    if (this.initialized) { throw new Error('Sources cannot be added after init()'); }
    this.storesById.set(storeDescription.id, store);
    this.storeDescriptionsByStore.set(store, storeDescription);
    if (storeDescription.includeInStarPermission) {
      this.includedInStarPermissions.push(storeDescription.id);
    }
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
    const { integrity } = require('business');
    for (const [storeId, store] of this.storesById) {
      const storeKeyValueData = userAccountStorage.getKeyValueDataForStore(storeId);
      const params = {
        ...this.storeDescriptionsByStore.get(store),
        storeKeyValueData,
        logger: getLogger(`mall:${storeId}`),
        integrity: { setOnEvent: getEventIntegrityFn(storeId, integrity) }
      };
      await store.init(params);
    }
    this._streams = new MallUserStreams(this);
    this._events = new MallUserEvents(this);
    return this;
  }

  /**
   * @returns {Promise<void>}
  */
  async deleteUser (userId) {
    for (const [storeId, store] of this.storesById) {
      try {
        await store.deleteUser(userId);
      } catch (error) {
        storeDataUtils.throwAPIError(error, storeId);
      }
    }
  }

  /**
   * Return storage informations per store Id.
   * @param {string} userId
   * @returns {Promise<Object<storeId,UserStorageInfos>>}
  */
  async getUserStorageInfos (userId) {
    const storageInfos = { };
    for (const [storeId, store] of this.storesById) {
      try {
        if (store.getUserStorageInfos != null) {
          // undocumented feature of DataStore, skip if not implemented
          storageInfos[storeId] = await store.getUserStorageInfos(userId);
        }
      } catch (error) {
        storeDataUtils.throwAPIError(error, storeId);
      }
    }
    return storageInfos;
  }

  /**
 * @returns {Promise<any>}
 */
  async newTransaction () {
    return new MallTransaction(this);
  }
}
module.exports = Mall;

/**
 * Get store-specific integrity calculation function
 * @param {string} storeId
 * @param {*} integrity
 * @returns {Function}
*/
function getEventIntegrityFn (storeId, integrity) {
  return function setIntegrityForEvent (storeEventData) {
    const event = eventsUtils.convertEventFromStore(storeId, storeEventData);
    storeEventData.integrity = integrity.events.compute(event).integrity;
  };
}
