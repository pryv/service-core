/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Local Data Store.
 * Streams implementation
 */

const bluebird = require('bluebird');
const _ = require('lodash');

const cache = require('cache');
const { UserStreams } = require('../../interfaces/DataStore');
const { treeUtils } = require('utils');

const { StreamProperties } = require('business/src/streams');
const StreamPropsWithoutChildren: Array<string> = StreamProperties.filter(p => p !== 'children');

const SystemStreamUtils = require('./SystemStreamUtils');

import type { StoreQuery } from 'api-server/src/methods/helpers/eventsGetUtils';
import type { Stream } from 'business/src/streams';

class LocalUserStreams extends UserStreams {
  userStreamsStorage: any;

  constructor(userStreamsStorage: any) {
    super();
    this.userStreamsStorage = userStreamsStorage;
  }

  async get(uid: string, params: StoreQuery): Promise<Array<Stream>> {
    let allStreamsForAccount: Array<Stream> = cache.getStreams(uid, 'local');
    if (allStreamsForAccount == null) { // get from DB
      allStreamsForAccount = await bluebird.fromCallback(cb => this.userStreamsStorage.find({ id: uid }, {}, null, cb));
      // add system streams
      allStreamsForAccount = allStreamsForAccount.concat(SystemStreamUtils.visibleStreamsTree);
      cache.setStreams(uid, 'local', allStreamsForAccount);
    }


    let streams: Array<Stream> = [];
    if (params?.id === '*') {
      // assert: params.expandChildren == true, see "#*" case
      streams = clone(allStreamsForAccount); // clone to be sure they can be mutated without touching the cache
    } else {
      const stream: Stream = treeUtils.findById(allStreamsForAccount, params.id); // find the stream
      if (stream != null) streams = [cloneStream(stream, params.expandChildren)]; // clone to be sure they can be mutated without touching the cache
    }

    if (!params.includeTrashed) { // i.e. === 'default' (return non-trashed items)
      streams = treeUtils.filterTree(streams, false /*no orphans*/, stream => !stream.trashed);
    }
    return streams;
  }
}

module.exports = LocalUserStreams;

function clone(obj: any): any {
  // Clone streams -- BAd BaD -- To be optimized 
  return _.cloneDeep(obj);
}

function cloneStream(storeStream: Stream, includeChildren: boolean): Stream {
  if (includeChildren) {
    return clone(storeStream);
  } else {
    // _.pick() creates a copy
    const stream: Stream = _.pick(storeStream, StreamPropsWithoutChildren);
    stream.childrenHidden = true;
    stream.children = [];
    return stream;
  }
}