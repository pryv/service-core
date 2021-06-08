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

  async get(uid, params) {
    
    if (params.parentId && params.id) {
      DataSource.throwInvalidRequestStructure('Do not mix "parentId" and "id" parameter in request')
    }
    
    let fullStreamId = params.id || params.parentId;

    // *** root query we just expose stores handles
    if (! fullStreamId) { 
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

    const [sourceId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(fullStreamId);
    const myParams = {
      id: streamId,
      includeDeletionsSince: params.includeDeletionsSince,
      state: params.state,
      hideChildren: params.hideChildren
    }
    const source = this.store.sourceForId(sourceId);
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

    function addSourceParentId(sourceId, parentId) {
      if (typeof sourceParentIds[sourceId] !== 'undefined') {
        DataSource.throwInvalidRequestStructure('parentIds should point to maximum one stream per source. [' + sourceId + '] appears more than once.', params);
      }
      sourceParentIds[sourceId] = parentId; // null means all
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
          const sourceId = streamId.substr(1, (dashPos > 0) ? (dashPos - 1) : undefined); // fastest against regexp and split 40x
          const source = this.store.sourceForId(sourceId);
          if (! source) {
            DataSource.throwUnkownRessource('parentIds query parameters', sourceId);
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
    const sourceIds = Object.keys(sourceParentIds);
    for (let sourceId of sourceIds) {
      // make a copy of params and change parentId
      const myParams = {
        parentId: sourceParentIds[sourceId] || undefined,
        includeDeletionsSince: params.includeDeletionsSince,
        state: params.state
      }
      tasks.push(this.store.sourceForId(sourceId).streams.get(uid, myParams));
    }

    // call all sources
    const sourcesRes =  await Promise.allSettled(tasks);

    // check results and eventually replace with error (non blocking unavailable ressource)
    for (let i = 0; i < sourceIds.length; i++) {
      if (sourcesRes[i].status === 'fulfilled') {
        if (sourceParentIds[sourceIds[i]] !== null) { // if null => requested root stream of source
          res.push(...sourcesRes[i].value); // add all items to res
        } else {
          const source = this.store.sourcesMap[sourceIds[i]];
          res.push([StreamsUtils.sourceToStream(source, {
            children: sourcesRes[i].value
          })]);
        }
      } else {
        const source = this.store.sourcesMap[sourceIds[i]];
        res.push([StreamsUtils.sourceToStream(source, {
          unreachable: sourcesRes[i].reason // change to sourcesRes[i].reason.message || sourcesRes[i].reason
        })]);
      }
    }
    return res;
  }
}

module.exports = StoreUserStreams;