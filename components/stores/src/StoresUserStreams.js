/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const {DataSource, UserStreams}  = require('../interfaces/DataSource');

const StreamsUtils = require('./lib/StreamsUtils');

const { treeUtils } = require('utils');

/**
 * Handle Store.streams.* methods
 */
class StoresUserStreams extends UserStreams {
 
  /**
   * @param {Stores} mainStore 
   */
  constructor(mainStore) {
    super();
    this.mainStore = mainStore;
  }

  /**
   * Helper to get a single stream
   */
  async getOne(uid, streamId, storeId) {
    if (storeId == null) { [storeId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(streamId); }
    const store = this.mainStore._storeForId(storeId);
    if (store == null) return null;
    const streams = await store.streams.get(uid, {id: streamId, includeTrashed: true});
    if (streams?.length === 1) return streams[0];
    return null;
  }

  /**
   * Get the stream that will be set as root for all Stream Structure of this Data Source.
   * @see https://api.pryv.com/reference/#get-streams
   * @param {identifier} uid
   * @param {Object} params
   * @param {identifier} [params.id] null, means root streamId. Notice parentId is not implemented by Stores 
   * @param {identifier} [params.storeId] null, means streamId is a "FullStreamId that includes stores informations"
   * @param {identifier} [params.expandChildren] default false, if true also return childrens
   * @param {Array<identifier>} [params.excludeIds] list of streamIds to exclude from query. if expandChildren is true, children of excludedIds should be excludded too
   * @param {boolean} [params.includeTrashed] (equivalent to state = 'all')
   * @param {timestamp} [params.includeDeletionsSince] 
   * @returns {UserStream|null} - the stream or null if not found:
   */
  async get(uid, params) {

    // -------- cleanup params --------- //
    
    let streamId = params.id || '*';
    let storeId = params.storeId; // might me null
    let excludedIds = null;

    if (storeId == null) { // --- Also strip storeId from excluded Idds
      [storeId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(streamId);
      excludedIds = [];
      for (const excludedFullStreamId of params.excludedIds) { // keep only streamIds in this store
        const [excludedStoreId, excludedStreamId] = StreamsUtils.storeIdAndStreamIdForStreamId(excludedFullStreamId);
        if (excludedStoreId === storeId) {
          excludedIds.push(excludedStreamId);
        }
      }
    } else {
      excludedIds = params.excludedIds;
    }

    // ------- create result ------//
    let res = [];

    // *** root query we just expose stores handles & local streams
    // might be moved in LocalDataSource ? 
    if (streamId === '*' && storeId === 'local') { 
      for (const source of this.mainStore.stores) {
        if (source.id !== 'local') {
          res.push(StreamsUtils.sourceToStream(source, {
            children: [],
            childrenHidden: true // To be discussed
          }));
        }
      }
    }
    //------ Query Store -------------//

    const myParams = {
      id: streamId,
      includeDeletionsSince: params.includeDeletionsSince,
      includeTrashed: params.includeTrashed,
      expandChildren: params.expandChildren,
    }

    const store = this.mainStore._storeForId(storeId);

    // add it to parameters if feature is supported.
    if (store.streams.hasFeatureGetParamsExcludedIds)
      myParams.excludedIds = excludedIds;
   
    const storeStreams = await store.streams.get(uid, myParams);

    // add storeStreams to result
    res.push(...storeStreams);

    // if store does not handle excludeIds on his own filter 
    if (! store.streams.hasFeatureGetParamsExcludedIds &&  excludedIds.length > 0) {
      res = treeUtils.filterTree(res, false, function (stream) { 
        return ! excludedIds.includes(stream.id);;
      });
    }

    if (storeId !== 'local') { // add Prefix
      StreamsUtils.addStoreIdPrefixToStreams(storeId, res);
      if (streamId === '*') { // add root stream
        res = [StreamsUtils.sourceToStream(store, {
          children: res,
        })];
      }
    }

    return res;
  }


  /**
   * Kept for reference.. might be removed 
   */
  async getMultiple(uid, params) {


    // *** forward query to included stores (parallel)

    const sourceParentIds = {}; // keep specific parentId for each store

    function addStoreParentId(storeId, parentId) {
      if (typeof sourceParentIds[storeId] !== 'undefined') {
        DataSource.throwInvalidRequestStructure('parentIds should point to maximum one stream per source. [' + storeId + '] appears more than once.', params);
      }
      sourceParentIds[storeId] = parentId; // null means all
    }

    // get storages involved from streamIds 
    for (let streamId of params.parentIds) {

      if (streamId.indexOf('.') === 0) { // fatest method against startsWith or charAt() -- 10x
        
        if (streamId === '.*') {   // if '.*' add all sources
          for (const source of this.mainStore.stores) {
            addStoreParentId(source.id, null);
          }

        } else {  // add streamId's corresponding source 
          const dashPos = streamId.indexOf('-');
          const storeId = streamId.substr(1, (dashPos > 0) ? (dashPos - 1) : undefined); // fastest against regexp and split 40x
          const source = this.mainStore._storeForId(storeId);
          if (! source) {
            DataSource.throwUnkownRessource('parentIds query parameters', storeId);
          } 

          if (dashPos < 0) { // root stream of source
            addStoreParentId(source.id, null);
          } else { // add streamId stripped out from '.${source}-'
            addStoreParentId(source.id, streamId.substr(dashPos + 1));
          }
        }
      }
    }

    const tasks = [];
    const storeIds = Object.keys(sourceParentIds);
    for (let storeId of storeIds) {
      // make a copy of params and change parentId
      const myParams = {
        parentId: sourceParentIds[storeId] || undefined,
        includeDeletionsSince: params.includeDeletionsSince,
        state: params.state
      }
      tasks.push(this.mainStore._storeForId(storeId).streams.get(uid, myParams));
    }

    // call all sources
    const sourcesRes =  await Promise.allSettled(tasks);

    // check results and eventually replace with error (non blocking unavailable ressource)
    for (let i = 0; i < storeIds.length; i++) {
      if (sourcesRes[i].status === 'fulfilled') {
        if (sourceParentIds[storeIds[i]] !== null) { // if null => requested root stream of source
          res.push(...sourcesRes[i].value); // add all items to res
        } else {
          const source = this.mainStore.storesMap[storeIds[i]];
          res.push([StreamsUtils.sourceToStream(source, {
            children: sourcesRes[i].value
          })]);
        }
      } else {
        const source = this.mainStore.storesMap[storeIds[i]];
        res.push([StreamsUtils.sourceToStream(source, {
          unreachable: sourcesRes[i].reason // change to sourcesRes[i].reason.message || sourcesRes[i].reason
        })]);
      }
    }
    return res;
  }
}

module.exports = StoresUserStreams;