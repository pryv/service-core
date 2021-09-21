/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { DataSource, UserStreams }  = require('../interfaces/DataSource');
const StreamsUtils = require('./lib/StreamsUtils');
const { treeUtils } = require('utils');

import type { StoreQuery } from 'api-server/src/methods/helpers/eventsGetUtils';

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
    const streams = await store.streams.get(uid, { id: streamId, includeTrashed: true, storeId });
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
  async get(uid: string, params: StoreQuery) {

    // -------- cleanup params --------- //
    const streamId: string = params.id || '*'; // why?? -- IT SHOULD NOT HAVE DEFAULT VALUES
    const storeId: string = params.storeId; // might me null -- how? IT DOES NOT HAPPEN
    const excludedIds: Array<string> = params.excludedIds;

    // ------- create result ------//
    let res = [];

    // *** root query we just expose stores handles & local streams
    // might be moved in LocalDataSource ? 
    if (streamId === '*' && storeId === 'local') {
      res = getChildlessRootStreamsForOtherStores(this.mainStore.stores);
    }
    //------ Query Store -------------//

    const store = this.mainStore._storeForId(storeId);

    const myParams: StoreQuery = {
      id: streamId,
      includeDeletionsSince: params.includeDeletionsSince,
      includeTrashed: params.includeTrashed,
      expandChildren: params.expandChildren,
      excludedIds: store.streams.hasFeatureGetParamsExcludedIds ? excludedIds : null,
      storeId: null, // we'll address this request to a store
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
      StreamsUtils.addStoreIdPrefixToStreams(storeId, res);
      if (streamId === '*') { // add root stream
        res = [StreamsUtils.sourceToStream(store, {
          children: res,
        })];
      }
    }

    return res;

    function getChildlessRootStreamsForOtherStores(stores: Array<{}>): Array<{}> {
      const res = [];
      for (const source of stores) {
        if (source.id !== 'local') {
          res.push(StreamsUtils.sourceToStream(source, {
            children: [],
            childrenHidden: true // To be discussed
          }));
        }
      }
      return res;
    }

    function performExclusion(res: Array<{}>, excludedIds: Array<string>): Array<{}> {
      return treeUtils.filterTree(res, false, (stream) => ! excludedIds.includes(stream.id));
    }
  }

}

module.exports = StoresUserStreams;