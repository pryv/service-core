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
const { DataStore, errors } = require('pryv-datastore');
const { treeUtils } = require('utils');

const { StreamProperties } = require('business/src/streams');
const StreamPropsWithoutChildren: Array<string> = StreamProperties.filter(p => p !== 'children');

const SystemStreamsSerializer = require('business/src/system-streams/serializer'); // loaded just to init upfront
const handleDuplicateError = require('../Database').handleDuplicateError;

import type { StoreQuery } from 'api-server/src/methods/helpers/eventsGetUtils';
import type { Stream } from 'business/src/streams';

let visibleStreamsTree = [];
class LocalUserStreams extends DataStore.UserStreams {
  userStreamsStorage: any;
  streamsCollection: any;

  constructor(streamsCollection: any, userStreamsStorage: any) {
    super();
    this.userStreamsStorage = userStreamsStorage;
    this.streamsCollection = streamsCollection;
    loadVisibleStreamsTree();
  }

  async getDeletions(userId: string, deletionsSince: timestamp) {
    const options = { sort: { deleted: -1 }};
    const deletedStreams = await bluebird.fromCallback(cb => this.userStreamsStorage.findDeletions({id: userId}, deletionsSince, options, cb));
    return deletedStreams;
  }

  async get(userId: string, params: StoreQuery): Promise<Array<Stream>> {

    let allStreamsForAccount: Array<Stream> = cache.getStreams(userId, 'local');
    if (allStreamsForAccount == null) { // get from DB
      allStreamsForAccount = await bluebird.fromCallback(cb => this.userStreamsStorage.findIncludingDeletionsAndVersions({ id: userId }, {}, null, cb));
      // add system streams
      allStreamsForAccount = allStreamsForAccount.concat(visibleStreamsTree);
      cache.setStreams(userId, 'local', allStreamsForAccount);
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
    if (! params.includeDeletions) { // i.e. === 'default' (return non-deleted items)
      streams = treeUtils.filterTree(streams, false /*no orphans*/, stream => stream.deleted == null);
    }
    return streams;
  }

  async createDeleted(userId: string, streamData: Stream): Promise<Stream> {
    streamData.userId = userId;
    streamData.streamId = streamData.id;
    delete streamData.id;
    return await this.streamsCollection.replaceOne({userId: userId, streamId: streamData.streamId}, streamData, {upsert: true}); // replace of create deleted streams
  }

  async create(userId: string, streamData: Stream): Promise<Stream> {
    //try {
      return await bluebird.fromCallback(cb => this.userStreamsStorage.insertOne({ id: userId }, streamData, cb));
    /* } catch (err) {
      handleDuplicateError(err);
      if (err.isDuplicate) {
        if (err.isDuplicateIndex('streamId')) {
          throw errors.itemAlreadyExists('stream', { id: streamData.id }, err);
        }
        if (err.isDuplicateIndex('name')) {
          throw errors.itemAlreadyExists('sibling stream', { name: streamData.name }, err);
        }
      }
      // Any other error
      throw errors.unexpectedError(err);
    }*/
  }

  async delete(userId: string, streamId: string): Promise<void> {
    return await bluebird.fromCallback(cb => this.userStreamsStorage.removeOne({ id: userId }, {id: streamId}, cb));
  }

  async updateTemp(userId: string, streamId, update: {}) {
    //try {
      return await bluebird.fromCallback(cb =>  this.userStreamsStorage.updateOne({id: userId}, {id: streamId}, update, cb));
      /**
    } catch (err) {
      handleDuplicateError(err);
      if (err.isDuplicate) {
        if (err.isDuplicateIndex('name')) {
          throw errors.itemAlreadyExists(
            'sibling stream', { name: update.name }, err
          );
        }
      }
      // Any other error
      throw errors.unexpectedError(err);
    }*/
  }

  async update(userId: string, streamData: Stream): Promise<Stream> {
    return await bluebird.fromCallback(cb => this.userStreamsStorage.updateOne({ id: userId }, {id: streamData.id}, streamData, cb));
  }

  async updateDelete(userId: string, streamId: stringg): Promise<void> {
    return await bluebird.fromCallback(cb => this.userStreamsStorage.delete({ id: userId }, {id: streamId}, cb));
  }

  async delete(userId: string, streamId: stringg): Promise<void> {
    return await bluebird.fromCallback(cb => this.userStreamsStorage.removeOne({ id: userId}, {id: streamId}, cb));
  }

  async deleteAll(userId: string): Promise<void> {
    await bluebird.fromCallback(cb => this.userStreamsStorage.removeAll({ id: userId }, cb));
    cache.unsetUserData(userId);
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
