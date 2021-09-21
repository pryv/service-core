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

}

module.exports = StoresUserStreams;