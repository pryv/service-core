/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const {DataSource, UserStreams}  = require('../interfaces/DataSource');

const StreamsUtils = require('./lib/StreamsUtils');

/**
 * Handle Store.streams.* methods
 */
class StoreUserStreams extends UserStreams {
 
  /**
   * @param {Store} store 
   */
  constructor(store) {
    super();
    this.store = store;
  }

  /**
   * Helper to get a single stream
   */
  async getOne(uid, streamId, storeId) {
    if (! storeId) { [storeId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(streamId); }
    const store = this.store._storeForId(storeId);
    if (! store) return null;
    const streams = await store.streams.get(uid, {id: streamId, state: 'all'});
    if (streams && streams.length === 1) return streams[0];
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
   * @param {identifiers} [params.excludeIds] list of streamIds to exclude from query. if expandChildren is true, children of excludedIds should be excludded too
   * @param {boolean} [params.includeTrashed] (equivalent to state = 'all')
   * @param {timestamp} [params.includeDeletionsSince] 
   * @returns {UserStream|null} - the stream or null if not found:
   */
  async get(uid, params) {
    
    if (params.parentId && params.id) {
      DataSource.throwInvalidRequestStructure('Do not mix "parentId" and "id" parameter in request');
    }
    
    let streamId = params.id || params.parentId;
    let storeId = params.storeId; // might me null
    

    // *** root query we just expose stores handles
    if (! streamId) { 
      const res = [];
      for (let source of this.store.sources) {
        res.push([StreamsUtils.sourceToStream(source, {
          children: [],
          childrenHidden: true // To be discussed
        })]);
      }
      // add local streams here
      return res;
    }

    if (! storeId) {
      [storeId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(streamId);
    } 

    const myParams = {
      id: streamId,
      includeDeletionsSince: params.includeDeletionsSince,
      state: params.state,
      expandChildren: params.expandChildren
    }
    const source = this.store._storeForId(storeId);
    const res = await source.streams.get(uid, myParams);
    // if request was made on parentId .. return only the children
    if (params.parentId && res.length === 1) {
      return res[0].children;
    } 
    return res;
  }


  /**
   * Kept for reference.. might be removed 
   */
  async getMultiple(uid, params) {


    // *** forward query to included stores (parallel)

    const sourceParentIds = {}; // keep specific parentId for each store

    function addSourceParentId(storeId, parentId) {
      if (typeof sourceParentIds[storeId] !== 'undefined') {
        DataSource.throwInvalidRequestStructure('parentIds should point to maximum one stream per source. [' + storeId + '] appears more than once.', params);
      }
      sourceParentIds[storeId] = parentId; // null means all
    }

    // get storages involved from streamIds 
    for (let streamId of params.parentIds) {

      if (streamId.indexOf('.') === 0) { // fatest method against startsWith or charAt() -- 10x
        
        if (streamId === '.*') {   // if '.*' add all sources
          for (let source of this.store.sources) {
            addSourceParentId(source.id, null);
          }

        } else {  // add streamId's corresponding source 
          const dashPos = streamId.indexOf('-');
          const storeId = streamId.substr(1, (dashPos > 0) ? (dashPos - 1) : undefined); // fastest against regexp and split 40x
          const source = this.store._storeForId(storeId);
          if (! source) {
            DataSource.throwUnkownRessource('parentIds query parameters', storeId);
          } 

          if (dashPos < 0) { // root stream of source
            addSourceParentId(source.id, null);
          } else { // add streamId stripped out from '.${source}-'
            addSourceParentId(source.id, streamId.substr(dashPos + 1));
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
      tasks.push(this.store._storeForId(storeId).streams.get(uid, myParams));
    }

    // call all sources
    const sourcesRes =  await Promise.allSettled(tasks);

    // check results and eventually replace with error (non blocking unavailable ressource)
    for (let i = 0; i < storeIds.length; i++) {
      if (sourcesRes[i].status === 'fulfilled') {
        if (sourceParentIds[storeIds[i]] !== null) { // if null => requested root stream of source
          res.push(...sourcesRes[i].value); // add all items to res
        } else {
          const source = this.store.sourcesMap[storeIds[i]];
          res.push([StreamsUtils.sourceToStream(source, {
            children: sourcesRes[i].value
          })]);
        }
      } else {
        const source = this.store.sourcesMap[storeIds[i]];
        res.push([StreamsUtils.sourceToStream(source, {
          unreachable: sourcesRes[i].reason // change to sourcesRes[i].reason.message || sourcesRes[i].reason
        })]);
      }
    }
    return res;
  }
}

module.exports = StoreUserStreams;