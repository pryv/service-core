/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
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
const { DataStore } = require('pryv-datastore');
const { treeUtils } = require('utils');

const { StreamProperties } = require('business/src/streams');
const StreamPropsWithoutChildren: Array<string> = StreamProperties.filter(p => p !== 'children');

const SystemStreamsSerializer = require('business/src/system-streams/serializer'); // loaded just to init upfront

import type { StoreQuery } from 'api-server/src/methods/helpers/eventsGetUtils';
import type { Stream } from 'business/src/streams';

let visibleStreamsTree = [];
class LocalUserStreams extends DataStore.UserStreams {
  userStreamsStorage: any;

  constructor(userStreamsStorage: any) {
    super();
    this.userStreamsStorage = userStreamsStorage;
    loadVisibleStreamsTree();
  }

  async get(uid: string, params: StoreQuery): Promise<Array<Stream>> {

    // deletions handling .. should be refactored
    if (params.includeDeletionsSince != null) {
      const options = { sort: { deleted: -1 }};
      const deletedStreams = await bluebird.fromCallback(cb => this.userStreamsStorage.findDeletions({id: uid}, params.includeDeletionsSince, options, cb));
      return deletedStreams;
    };


    let allStreamsForAccount: Array<Stream> = cache.getStreams(uid, 'local');
    if (allStreamsForAccount == null) { // get from DB
      allStreamsForAccount = await bluebird.fromCallback(cb => this.userStreamsStorage.find({ id: uid }, {}, null, cb));
      // add system streams
      allStreamsForAccount = allStreamsForAccount.concat(visibleStreamsTree);
      cache.setStreams(uid, 'local', allStreamsForAccount);
    }


    let streams: Array<Stream> = [];
    if (params?.id === '*') {
      // assert: params.expandChildren == -1, see "#*" case
      streams = clone(allStreamsForAccount); // clone to be sure they can be mutated without touching the cache
    } else {
      const stream: Stream = treeUtils.findById(allStreamsForAccount, params.id); // find the stream
      const includeChildren = params.expandChildren != 0;
      if (stream != null) streams = [cloneStream(stream, includeChildren)]; // clone to be sure they can be mutated without touching the cache
    }

    if (!params.includeTrashed) { // i.e. === 'default' (return non-trashed items)
      streams = treeUtils.filterTree(streams, false /*no orphans*/, stream => !stream.trashed);
    }

    if (! params.includeDeletionsSince) { // i.e. === 'default' (return non-deleted items)
      streams = treeUtils.filterTree(streams, false /*no orphans*/, stream => stream.deleted == null);
    }
    return streams;
  }

  async create(uid: string, streamData: Stream): Promise<Stream> {
    return await bluebird.fromCallback(cb => this.userStreamsStorage.insertOne({ id: uid }, streamData, cb));
  }

  async updateTemp(uid: string, streamId, update: {}) {
    //$$({uid, streamId, update});
    return await bluebird.fromCallback(cb =>  this.userStreamsStorage.updateOne({id: uid}, {id: streamId}, update, cb));
  }

  async update(uid: string, streamData: Stream): Promise<Stream> {
    return await bluebird.fromCallback(cb => this.userStreamsStorage.updateOne({ id: uid }, {id: streamData.id}, streamData, cb));
  }

  async deleteAll(uid: string): Promise<void> {
    return await bluebird.fromCallback(cb => this.userStreamsStorage.removeAll({ id: uid }, cb));
  }


  async _deleteUser(userId: string): Promise<void> {
    return await bluebird.fromCallback(cb => this.userStreamsStorage.removeMany(userId, {}, cb));
  }

  async _storageUsedForUser(userId: string) { 
    return await bluebird.fromCallback(cb => this.userStreamsStorage.getTotalSize(userId, cb));
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

function loadVisibleStreamsTree() {
  try {
    visibleStreamsTree = SystemStreamsSerializer.getReadable();
    DataStore.Defaults.applyOnStreams(visibleStreamsTree);
  } catch (err) {
    console.log('This should be fixed!! It happens when the system streams are not yet loaded during some test suites.. ', err);
  }
}