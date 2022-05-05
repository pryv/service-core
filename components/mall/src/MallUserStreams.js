/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { DataStore }  = require('pryv-datastore');
const streamsUtils = require('./lib/streamsUtils');
const { treeUtils } = require('utils');
const cuid = require('cuid');
const _ = require('lodash');

const errorFactory = require('errors').factory;

import type { StoreQuery } from 'api-server/src/methods/helpers/eventsGetUtils';
import type { Stream } from 'business/src/streams';
import typeof Mall from './Mall';

/**
 * Handle Store.streams.* methods
 */
class MallUserStreams {

  mall: Mall;
 
  /**
   * @param {Mall} mall 
   */
  constructor(mall: Mall) {
    this.mall = mall;
  }

  /**
   * Helper to get a single stream
   */
  async getOne(uid: string, streamId: string, storeId: string): Promise<?Stream> {
    if (storeId == null) { [storeId, streamId] = streamsUtils.storeIdAndStreamIdForStreamId(streamId); }
    const store: DataStore = this.mall._storeForId(storeId);
    if (store == null) return null;
    const streams: Array<Stream> = await store.streams.get(uid, { id: streamId, includeTrashed: true });
    if (streams?.length === 1) return streams[0];
    return null;
  }

  /**
   * Get the stream that will be set as root for all Stream Structure of this Data Store.
   * @see https://api.pryv.com/reference/#get-streams
   * @param {identifier} uid
   * @param {Object} params
   * @param {identifier} [params.id] null, means root streamId. Notice parentId is not implemented by Mall 
   * @param {identifier} [params.storeId] null, means streamId is a "FullStreamId that includes store informations"
   * @param {integer} [params.expandChildren] default 0, if > 0 also return childrens for n levels, -1 means all levels
   * @param {Array<identifier>} [params.excludeIds] list of streamIds to exclude from query. if expandChildren is 0, children of excludedIds should be excludded too
   * @param {boolean} [params.includeTrashed] (equivalent to state = 'all')
   * @param {timestamp} [params.includeDeletionsSince] 
   * @param {boolean} [params.hideStoreRoots] When false, returns the root streams of each store
   * @returns {UserStream|null} - the stream or null if not found:
   */
  async get(uid: string, params: StoreQuery) {
    
    // -------- cleanup params --------- //
    let streamId: string = params.id || '*'; 
    let storeId: string = params.storeId;
    if (storeId == null) { [storeId, streamId] = streamsUtils.storeIdAndStreamIdForStreamId(streamId); }

    params.expandChildren = params.expandChildren || 0;

    const excludedIds: Array<string> = params.excludedIds || [];
    const hideStoreRoots: boolean = params.hideStoreRoots || false;

    // ------- create result ------//
    let res: Array<Stream> = [];

    // *** root query we just expose store handles & local streams
    // might be moved in LocalDataStore ? 
    if (streamId === '*' && storeId === 'local' && (! hideStoreRoots) && (params.includeDeletionsSince == null)) {
      res = getChildlessRootStreamsForOtherStores(this.mall.stores);
    }
    //------ Query Store -------------//

    const store: DataStore = this.mall._storeForId(storeId);

    const myParams: StoreQuery = {
      id: streamId,
      includeDeletionsSince: params.includeDeletionsSince,
      includeTrashed: params.includeTrashed,
      expandChildren: params.expandChildren,
      excludedIds: store.streams.hasFeatureGetParamsExcludedIds ? excludedIds : [],
      storeId: null, // we'll address this request to the store directly
    }

    // add it to parameters if feature is supported by store.
    if (store.streams.hasFeatureGetParamsExcludedIds) myParams.excludedIds = excludedIds;

    const storeStreams = await store.streams.get(uid, myParams);

    // add storeStreams to result
    res.push(...storeStreams);

    // if store does not support excludeIds, perform it here
    if (! store.streams.hasFeatureGetParamsExcludedIds && excludedIds.length > 0) {
      res = performExclusion(res, excludedIds);
    }

    if (storeId !== 'local') { // add Prefix
      streamsUtils.addStoreIdPrefixToStreams(storeId, res);
      if (streamId === '*') { // add root stream
        res = [streamsUtils.storeToStream(store, {
          children: res,
        })];
      }
    }
    return res;

    function getChildlessRootStreamsForOtherStores(stores: Array<DataStore>): Array<Stream> {
      const res: Array<Stream> = [];
      for (const store: DataStore of stores) {
        if (store.id !== 'local') {
          res.push(streamsUtils.storeToStream(store, {
            children: [],
            childrenHidden: true // To be discussed
          }));
        }
      }
      return res;
    }

    function performExclusion(res: Array<Stream>, excludedIds: Array<string>): Array<Stream> {
      return treeUtils.filterTree(res, false, (stream) => ! excludedIds.includes(stream.id));
    }
  }

  async create(uid: string, streamData: Stream) {
    const streamForStore = _.cloneDeep(streamData);

    // 1- Check if there is a parent stream 
    let parentStoreId = 'local';
    let cleanParentStreamId;
    if (streamForStore.parentId != null) {
      [parentStoreId, cleanParentStreamId] = streamsUtils.storeIdAndStreamIdForStreamId(streamData.parentId)
      streamForStore.parentId = cleanParentStreamId;
    }

    // 2- Check streamId and store
    let storeId, cleanStreamId;
    if (streamForStore.id == null) {
      storeId = parentStoreId;
      streamData.id = cuid();
    } else {
      [storeId, cleanStreamId] = streamsUtils.storeIdAndStreamIdForStreamId(streamData.id);
      if (parentStoreId !== storeId) {
        throw errorFactory.invalidRequestStructure('streams cannot have an id different from their parentId', eventData);
      }
      streamData.id = cleanStreamId;
    }

    const store: DataStore = this.mall._storeForId(storeId);

    // 3- Check if this Id has already been taken
    const existingStreams = await store.streams.get(uid, {id: cleanStreamId, includeDeletions: true});
    if (existingStreams.length > 0) {
      if (existingStreams[0].deleted != null) { // deleted stream - we can fully remove it
        await store.streams.delete(uid, cleanStreamId);
      } else {
        throw errorFactory.itemAlreadyExists('stream', {id: streamData.id});
      }
    }

    // 3 - Insert stream 
   
    const res = await store.streams.create(uid, streamData);
    return res;
  }

  /**
   * Temporary implementation 
   */
  async updateTemp(uid: string, streamId, update: {}) {
    const store: DataStore = this.mall._storeForId('local');
    const res = await store.streams.updateTemp(uid, streamId, update);
    return res;
  }

  async update(uid: string, streamData: Stream) {
    const streamForStore = _.cloneDeep(streamData);

    // 1- Check if there is a parent stream 
    let parentStoreId = 'local';
    let cleanParentStreamId;
    if (streamForStore.parentId != null) {
      [parentStoreId, cleanParentStreamId] = streamsUtils.storeIdAndStreamIdForStreamId(streamData.parentId);
      streamData.parentId = cleanParentStreamId;
    }

    // 2- Check streamId and store
    let storeId, cleanStreamId;
    if (streamForStore.id == null) {
      storeId = parentStoreId;
      streamData.id = cuid();
    } else {
      [storeId, cleanStreamId] = streamsUtils.storeIdAndStreamIdForStreamId(streamData.id);
      if (parentStoreId !== storeId) {
        throw errorFactory.invalidRequestStructure('streams cannot have an id different from their parentId', eventData);
      }
      streamData.id = cleanStreamId;
    }

    // 3 - Insert stream 
    const store: DataStore = this.mall._storeForId(storeId);
    const res = await store.streams.update(uid, streamData);
    return res;
  }

  /**
   * Used by tests
   * Might be replaced by standard delete.
   * @param {*} uid 
   */
  async deleteAll(uid: string, storeId: string) {
    const store: DataStore = this.mall._storeForId(storeId);
    await store.streams.deleteAll(uid);
  }
}

module.exports = MallUserStreams;