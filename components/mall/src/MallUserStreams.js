/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const storeDataUtils = require('./helpers/storeDataUtils');
const streamsUtils = require('./helpers/streamsUtils');
const { treeUtils } = require('utils');
const cuid = require('cuid');
const _ = require('lodash');
const errorFactory = require('errors').factory;

/**
 * Storage for streams.
 * Dispatches requests to each data store's streams.
 */
class MallUserStreams {
  /**
   * @type {Map<string, UserStream>}
   * @default new Map()
   */
  streamsStores = new Map();
  /**
   * Store names are used for the stores' root pseudo-streams.
   * @type {Map<string, string>}
   * @default new Map()
   */
  storeNames = new Map();

  /**
   * @param {{ storesById: Map, storeDescriptionsByStore: Map }} storesHolder
   */
  constructor (storesHolder) {
    for (const [storeId, store] of storesHolder.storesById) {
      this.streamsStores.set(storeId, store.streams);
      this.storeNames.set(storeId, storesHolder.storeDescriptionsByStore.get(store).name);
    }
  }

  /**
   * Helper to get a single stream from id and optional streamId
   * Will not expand children
   * @param {string} userId
   * @param {string} streamId
   * @param {string} storeId
   * @returns {Promise<any>}
   */
  async getOnlyOneWithNoChildren (userId, streamId, storeId) {
    if (storeId == null) {
      // TODO: clarify smelly code (replace full stream id with in-store id?)
      [storeId, streamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
    }
    const streamsStore = this.streamsStores.get(storeId);
    if (!streamsStore) { return null; }
    const stream = await streamsStore.getOne(userId, streamId, {
      includeTrashed: true,
      expandChildren: 0
    });
    return stream;
  }

  /**
   * Get the stream that will be set as root for all Stream Structure of this Data Store.
   * @see https://api.pryv.com/reference/#get-streams
   * @param {string} userId  undefined
   * @param {StoreQuery} params  undefined
   * @returns {Promise<any[]>} - the stream or null if not found:
   */
  async get (userId, params) {
    // -------- cleanup params --------- //
    let streamId = params.id || '*';
    let storeId = params.storeId;
    if (storeId == null) {
      // TODO: clarify smelly code (replace full stream id with in-store id?)
      [storeId, streamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
    }
    params.expandChildren = params.expandChildren || 0;
    const excludedIds = params.excludedIds || [];
    const hideStoreRoots = params.hideStoreRoots || false;
    // ------- create result ------//
    let res = [];
    // *** root query we just expose store handles & local streams
    // might be moved in localDataStore ?
    if (streamId === '*' &&
            storeId === storeDataUtils.LocalStoreId &&
            !hideStoreRoots) {
      res = getChildlessRootStreamsForOtherStores(this.storeNames);
    }
    // ------ Query Store -------------//
    const streamsStore = this.streamsStores.get(storeId);
    const storeQuery = {
      includeTrashed: params.includeTrashed,
      expandChildren: params.expandChildren,
      excludedIds: streamsStore.hasFeatureGetParamsExcludedIds
        ? excludedIds
        : []
    };

    if (streamId !== '*') {
      const stream = await streamsStore.getOne(userId, streamId, storeQuery);
      if (stream != null) res.push(stream);
    } else { // root query
      const streams = await streamsStore.get(userId, storeQuery);
      res.push(...streams);
    }

    // if store does not support excludeIds, perform it here
    if (!streamsStore.hasFeatureGetParamsExcludedIds &&
            excludedIds.length > 0) {
      res = performExclusion(res, excludedIds);
    }
    if (storeId !== storeDataUtils.LocalStoreId) {
      // add Prefix
      streamsUtils.addStoreIdPrefixToStreams(storeId, res);
      if (streamId === '*') {
        // add root stream
        res = [
          streamsUtils.createStoreRootStream({
            id: storeId,
            name: this.storeNames.get(storeId)
          }, {
            children: res
          })
        ];
      }
    }
    return res;
    // TODO: move utility func out of object
    function getChildlessRootStreamsForOtherStores (storeNames) {
      const res = [];
      for (const [storeId, storeName] of storeNames) {
        if (storeId !== storeDataUtils.LocalStoreId) {
          res.push(streamsUtils.createStoreRootStream({
            id: storeId,
            name: storeName
          }, {
            children: [],
            childrenHidden: true // To be discussed
          }));
        }
      }
      return res;
    }
    // TODO: move utility func out of object
    function performExclusion (res, excludedIds) {
      return treeUtils.filterTree(res, false, (stream) => !excludedIds.includes(stream.id));
    }
  }

  /**
   * @param {String} userId
   * @param {timestamp} deletionsSince
   * @param {Array<string>} storeIds
   * @returns {Promise<any[]>}
   */
  async getDeletions (userId, deletionsSince, storeIds) {
    if (deletionsSince == null) { deletionsSince = Number.MIN_SAFE_INTEGER; }
    storeIds = storeIds || [storeDataUtils.LocalStoreId];
    const result = [];
    for (const storeId of storeIds) {
      const streamsStore = this.streamsStores.get(storeId);
      const deletedStreams = await streamsStore.getDeletions(userId, deletionsSince);
      result.push(...deletedStreams);
    }
    return result;
  }

  /**
   * As some stores might not keep "deletion" records
   * A "local" cache of deleted streams could be implemented
   * This is mostly used by tests fixtures for now
   * @param {string} userId
   * @param {Stream} streamData
   * @returns {Promise<any>}
   */
  async createDeleted (userId, streamData) {
    const [storeId] = storeDataUtils.parseStoreIdAndStoreItemId(streamData.id);
    if (streamData.deleted == null) { throw errorFactory.invalidRequestStructure('Missing deleted timestamp for deleted stream', streamData); }
    const streamsStore = this.streamsStores.get(storeId);
    const res = await streamsStore.createDeleted(userId, streamData);
    return res;
  }

  /**
   * @param {string} userId
   * @param {Stream} streamData
   * @returns {Promise<any>}
   */
  async create (userId, streamData) {
    if (streamData.deleted != null) {
      return await this.createDeleted(userId, streamData);
    }
    const streamForStore = _.cloneDeep(streamData);
    // 0- Prepare default values
    if (streamForStore.trashed !== true) {
      delete streamForStore.trashed;
    }
    if (streamForStore.deleted === undefined) {
      streamForStore.deleted = null;
    }
    // 1- Check if there is a parent stream
    let parentStoreId = storeDataUtils.LocalStoreId;
    let parentStoreStreamId;
    if (streamForStore.parentId != null) {
      [parentStoreId, parentStoreStreamId] =
                storeDataUtils.parseStoreIdAndStoreItemId(streamData.parentId);
      streamForStore.parentId = parentStoreStreamId;
    }
    // 2- Check streamId and store
    let storeId, storeStreamId;
    if (streamForStore.id == null) {
      storeId = parentStoreId;
      streamForStore.id = cuid();
    } else {
      [storeId, storeStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamData.id);
      if (parentStoreId !== storeId) {
        throw errorFactory.invalidRequestStructure('streams cannot have an id different from their parentId', streamData);
      }
      streamForStore.id = storeStreamId;
    }
    const streamsStore = this.streamsStores.get(storeId);
    // 3 - Check if this Id has already been taken
    const existingStream = await streamsStore.getOne(userId, streamForStore.id, { includeTrashed: true });
    if (existingStream != null) {
      throw errorFactory.itemAlreadyExists('stream', { id: streamData.id });
    }

    // 4- Check if a sibbling stream with the same name exists
    const siblingNames = await this.getNamesOfChildren(userId, streamData.parentId, []);
    if (siblingNames.includes(streamForStore.name)) {
      throw errorFactory.itemAlreadyExists('stream', { name: streamData.name });
    }
    // 3 - Insert stream
    const res = await streamsStore.create(userId, streamForStore);
    return res;
  }

  /**
   * @param {string} userId
   * @param {Stream} streamData
   * @returns {Promise<any>}
   */
  async update (userId, streamData) {
    const streamForStore = _.cloneDeep(streamData);
    // 1- Check if there is a parent stream
    let parentStoreId = storeDataUtils.LocalStoreId;
    let parentStoreStreamId;
    if (streamForStore.parentId != null) {
      [parentStoreId, parentStoreStreamId] =
                storeDataUtils.parseStoreIdAndStoreItemId(streamData.parentId);
      streamForStore.parentId = parentStoreStreamId;
    }
    // 2- Check streamId and store
    let storeId, storeStreamId;
    if (streamForStore.id == null) {
      storeId = parentStoreId;
      streamForStore.id = cuid();
    } else {
      [storeId, storeStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamData.id);
      if (parentStoreId !== storeId) {
        throw errorFactory.invalidRequestStructure('streams cannot have an id different from their parentId', streamData);
      }
      streamForStore.id = storeStreamId;
    }
    // 4- Check if a sibbling stream with the same name exists
    const siblingNames = await this.getNamesOfChildren(userId, streamData.parentId, [streamData.id]);
    if (siblingNames.includes(streamForStore.name)) {
      throw errorFactory.itemAlreadyExists('stream', { name: streamData.name });
    }
    // 3 - Insert stream
    const streamsStore = this.streamsStores.get(storeId);
    const res = await streamsStore.update(userId, streamForStore);
    return res;
  }

  // ---------------------- delete ----------------- //
  /**
   * @returns {Promise<any>}
   */
  async delete (userId, streamId) {
    const [storeId, storeStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
    const streamsStore = this.streamsStores.get(storeId);
    return await streamsStore.delete(userId, storeStreamId);
  }

  /**
   * Used by tests
   * Might be replaced by standard delete.
   * @param {string} userId  undefined
   * @param {string} storeId
   * @returns {Promise<void>}
   */
  async deleteAll (userId, storeId) {
    const streamsStore = this.streamsStores.get(storeId);
    await streamsStore.deleteAll(userId);
  }

  // -------------------- utils ------------------- //
  /**
   * @private
   * get name of children stream
   * @param {string} userId
   * @param {string} streamId
   * @param {Array<string>} exludedIds
   * @returns {Promise<any[]>}
   */
  async getNamesOfChildren (userId, streamId, exludedIds) {
    const streams = await this.get(userId, {
      id: streamId,
      expandChildren: 1,
      includeTrashed: true
    });
    let streamsToCheck = [];
    if (streamId == null) {
      // root
      streamsToCheck = streams;
    } else if (streams.length > 0) {
      streamsToCheck = streams[0].children || [];
    }
    const names = streamsToCheck
      .filter((s) => !exludedIds.includes(s.id))
      .map((s) => s.name);
    return names;
  }
}
module.exports = MallUserStreams;
