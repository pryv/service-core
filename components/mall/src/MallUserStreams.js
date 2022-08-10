/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const storeDataUtils = require('./helpers/storeDataUtils');
const streamsUtils = require('./helpers/streamsUtils');
const { treeUtils } = require('utils');
const cuid = require('cuid');
const _ = require('lodash');

const errorFactory = require('errors').factory;

import type { StoreQuery } from 'api-server/src/methods/helpers/eventsGetUtils';
import type { Stream } from 'business/src/streams';

/**
 * Storage for streams.
 * Dispatches requests to each data store's streams.
 */
class MallUserStreams {
  /**
   * @type {Map<string, UserStream>}
   */
  streamsStores = new Map();
  /**
   * Store names are used for the stores' root pseudo-streams.
   * @type {Map<string, string>}
   */
  storeNames = new Map();

  /**
   * @param {DataStore[]} stores
   */
  constructor(stores) {
    for (const store of stores) {
      this.streamsStores.set(store.id, store.streams);
      this.storeNames.set(store.id, store.name);
    }
  }

  /**
   * Helper to get a single stream
   */
  async getOne(userId: string, streamId: string, storeId: string): Promise<?Stream> {
    if (storeId == null) {
      // TODO: clarify smelly code (replace full stream id with in-store id?)
      [storeId, streamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
    }
    const streamsStore = this.streamsStores.get(storeId);
    if (!streamsStore) return null;
    const streams: Array<Stream> = await streamsStore.get(userId, { id: streamId, includeTrashed: true });
    if (streams?.length === 1) return streams[0];
    return null;
  }

  async getDeletions(userId: String, deletionsSince: timestamp, storeIds: Array<string>) {
    if (deletionsSince == null) deletionsSince = Number.MIN_SAFE_INTEGER;
    storeIds = storeIds || [storeDataUtils.LocalStoreId];
    const result = [];
    for (const storeId of storeIds) {
      const streamsStore = this.streamsStores.get(storeId);
      const deletedStreams: Array<Stream> = await streamsStore.getDeletions(userId, deletionsSince);
      result.push(...deletedStreams);
    }
    return result;
  }

  /**
   * Get the stream that will be set as root for all Stream Structure of this Data Store.
   * @see https://api.pryv.com/reference/#get-streams
   * @param {identifier} userId
   * @param {Object} params
   * @param {identifier} [params.id] null, means root streamId. Notice parentId is not implemented by Mall
   * @param {identifier} [params.storeId] null, means streamId is a "FullStreamId that includes store informations"
   * @param {integer} [params.expandChildren] default 0, if > 0 also return childrens for n levels, -1 means all levels
   * @param {Array<identifier>} [params.excludeIds] list of streamIds to exclude from query. if expandChildren is 0, children of excludedIds should be excludded too
   * @param {boolean} [params.includeTrashed] (equivalent to state = 'all')
   * @param {boolean} [params.hideStoreRoots] When false, returns the root streams of each store
   * @returns {UserStream|null} - the stream or null if not found:
   */
  async get(userId: string, params: StoreQuery) {
    // -------- cleanup params --------- //
    let streamId: string = params.id || '*';
    let storeId: string = params.storeId;
    if (storeId == null) {
      // TODO: clarify smelly code (replace full stream id with in-store id?)
      [storeId, streamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
    }

    params.expandChildren = params.expandChildren || 0;

    const excludedIds: Array<string> = params.excludedIds || [];
    const hideStoreRoots: boolean = params.hideStoreRoots || false;

    // ------- create result ------//
    let res: Array<Stream> = [];

    // *** root query we just expose store handles & local streams
    // might be moved in localDataStore ?
    if (streamId === '*' && storeId === storeDataUtils.LocalStoreId && (! hideStoreRoots)) {
      res = getChildlessRootStreamsForOtherStores(this.storeNames);
    }
    //------ Query Store -------------//

    const streamsStore = this.streamsStores.get(storeId);

    const myParams: StoreQuery = {
      id: streamId,
      includeTrashed: params.includeTrashed,
      expandChildren: params.expandChildren,
      excludedIds: streamsStore.hasFeatureGetParamsExcludedIds ? excludedIds : [],
      storeId: null, // we'll address this request to the store directly
    };

    // add it to parameters if feature is supported by store
    if (streamsStore.hasFeatureGetParamsExcludedIds) myParams.excludedIds = excludedIds;

    const storeStreams = await streamsStore.get(userId, myParams);

    // add storeStreams to result
    res.push(...storeStreams);

    // if store does not support excludeIds, perform it here
    if (!streamsStore.hasFeatureGetParamsExcludedIds && excludedIds.length > 0) {
      res = performExclusion(res, excludedIds);
    }

    if (storeId !== storeDataUtils.LocalStoreId) { // add Prefix
      streamsUtils.addStoreIdPrefixToStreams(storeId, res);
      if (streamId === '*') { // add root stream
        res = [streamsUtils.createStoreRootStream({
          id: storeId,
          name: this.storeNames.get(storeId)
        }, {
          children: res,
        })];
      }
    }

    return res;

    // TODO: move utility func out of object
    function getChildlessRootStreamsForOtherStores(storeNames): Array<Stream> {
      const res: Array<Stream> = [];
      for (const [storeId, storeName] of storeNames.entries()) {
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
    function performExclusion(res: Array<Stream>, excludedIds: Array<string>): Array<Stream> {
      return treeUtils.filterTree(res, false, (stream) => ! excludedIds.includes(stream.id));
    }
  }

  /**
   * As some stores might not keep "deletion" records
   * A "local" cache of deleted streams could be implemented
   * This is mostly used by tests fixtures for now
   */
  async createDeleted(userId: string, streamData: Stream) {
    const [storeId, ] = storeDataUtils.parseStoreIdAndStoreItemId(streamData.id);
    if (streamData.deleted == null) throw errorFactory.invalidRequestStructure('Missing deleted timestamp for deleted stream', streamData);
    const streamsStore = this.streamsStores.get(storeId);
    const res = await streamsStore.createDeleted(userId, streamData);
    return res;
  }

  async create(userId: string, streamData: Stream) {
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
      [parentStoreId, parentStoreStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamData.parentId);
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

    // 3- Check if this Id has already been taken
    const existingStreams = await streamsStore.get(userId, {id: storeStreamId, includeDeletions: true});
    if (existingStreams.length > 0) {
      if (existingStreams[0].deleted != null) { // deleted stream - we can fully remove it
        await streamsStore.delete(userId, storeStreamId);
      } else {
        throw errorFactory.itemAlreadyExists('stream', {id: streamData.id});
      }
    }

    // 4- Check if a sibbling stream with the same name exists
    const siblingNames = await this.getNamesOfChildren(userId, streamData.parentId, []);
    if (siblingNames.includes(streamForStore.name)) {
      throw errorFactory.itemAlreadyExists('stream', {name: streamData.name});
    }

    // 3 - Insert stream
    const res = await streamsStore.create(userId, streamForStore);
    return res;
  }

  /**
   * Temporary implementation
   * TODO: cleanup
   */
  async updateTemp(userId: string, streamId, update: {}) {
    const streamsStore = this.streamsStores.get(storeDataUtils.LocalStoreId);
    const res = await streamsStore.updateTemp(userId, streamId, update);
    return res;
  }

  async update(userId: string, streamData: Stream) {
    const streamForStore = _.cloneDeep(streamData);

    // 1- Check if there is a parent stream
    let parentStoreId = storeDataUtils.LocalStoreId;
    let parentStoreStreamId;
    if (streamForStore.parentId != null) {
      [parentStoreId, parentStoreStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamData.parentId);
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
      throw errorFactory.itemAlreadyExists('stream', {name: streamData.name});
    }

    // 3 - Insert stream
    const streamsStore = this.streamsStores.get(storeId);
    const res = await streamsStore.update(userId, streamForStore);
    return res;
  }

  // ---------------------- delete ----------------- //

  async updateDelete(userId, streamId) {
    const [storeId, storeStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
    const streamsStore = this.streamsStores.get(storeId);
    return await streamsStore.updateDelete(userId, storeStreamId);
  }

  /**
   * Used by tests
   * Might be replaced by standard delete.
   * @param {*} userId
   */
  async deleteAll(userId: string, storeId: string) {
    const streamsStore = this.streamsStores.get(storeId);
    await streamsStore.deleteAll(userId);
  }

  // -------------------- utils ------------------- //

  /**
   * @private
   * get name of children stream
   */
  async getNamesOfChildren(userId: string, streamId: string, exludedIds: Array<string>) {
    const streams = await this.get(userId, {id: streamId, expandChildren : 1, includeTrashed: true});
    let streamsToCheck = [];
    if (streamId == null) { // root
      streamsToCheck = streams;
    } else if (streams.length > 0) {
      streamsToCheck = streams[0].children || [];
    }
    const names = streamsToCheck.filter((s) => ! exludedIds.includes(s.id)).map((s) => s.name);
    return names;
  }
}

module.exports = MallUserStreams;
