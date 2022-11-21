/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const _ = require('lodash');
const cache = require('cache');
const ds = require('pryv-datastore');
const { treeUtils } = require('utils');
const { StreamProperties } = require('business/src/streams');
const StreamPropsWithoutChildren = StreamProperties.filter((p) => p !== 'children');
const SystemStreamsSerializer = require('business/src/system-streams/serializer'); // loaded just to init upfront
const handleDuplicateError = require('../Database').handleDuplicateError;
let visibleStreamsTree = [];
/**
 * Local data store: streams implementation.
 */
module.exports = ds.createUserStreams({
  userStreamsStorage: null,
  streamsCollection: null,
  init (streamsCollection, userStreamsStorage) {
    this.userStreamsStorage = userStreamsStorage;
    this.streamsCollection = streamsCollection;
    loadVisibleStreamsTree();
  },
  async get (userId, params) {
    let allStreamsForAccount = cache.getStreams(userId, 'local');
    if (allStreamsForAccount == null) {
      // get from DB
      allStreamsForAccount = await bluebird.fromCallback((cb) => this.userStreamsStorage.findIncludingDeletionsAndVersions({ id: userId }, {}, null, cb));
      // add system streams
      allStreamsForAccount = allStreamsForAccount.concat(visibleStreamsTree);
      cache.setStreams(userId, 'local', allStreamsForAccount);
    }
    let streams = [];
    if (params?.id === '*') {
      // assert: params.expandChildren == -1, see "#*" case
      streams = clone(allStreamsForAccount); // clone to be sure they can be mutated without touching the cache
    } else {
      const stream = treeUtils.findById(allStreamsForAccount, params.id); // find the stream
      const includeChildren = params.expandChildren != 0;
      if (stream != null) { streams = [cloneStream(stream, includeChildren)]; } // clone to be sure they can be mutated without touching the cache
    }
    if (!params.includeTrashed) {
      // i.e. === 'default' (return non-trashed items)
      streams = treeUtils.filterTree(streams, false /* no orphans */, (stream) => !stream.trashed);
    }
    if (!params.includeDeletions) {
      // i.e. === 'default' (return non-deleted items)
      streams = treeUtils.filterTree(streams, false /* no orphans */, (stream) => stream.deleted == null);
    }
    return streams;
  },
  async getDeletions (userId, deletionsSince) {
    const options = { sort: { deleted: -1 } };
    const deletedStreams = await bluebird.fromCallback((cb) => this.userStreamsStorage.findDeletions({ id: userId }, deletionsSince, options, cb));
    return deletedStreams;
  },
  async createDeleted (userId, streamData) {
    streamData.userId = userId;
    streamData.streamId = streamData.id;
    delete streamData.id;
    return await this.streamsCollection.replaceOne({ userId, streamId: streamData.streamId }, streamData, { upsert: true }); // replace of create deleted streams
  },
  async create (userId, streamData) {
    // try {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.insertOne({ id: userId }, streamData, cb));
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
        } */
  },
  async updateTemp (userId, streamId, update) {
    // try {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.updateOne({ id: userId }, { id: streamId }, update, cb));
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
          } */
  },
  async update (userId, streamData) {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.updateOne({ id: userId }, { id: streamData.id }, streamData, cb));
  },
  async updateDelete (userId, streamId) {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.delete({ id: userId }, { id: streamId }, cb));
  },
  async delete (userId, streamId) {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.removeOne({ id: userId }, { id: streamId }, cb));
  },
  async deleteAll (userId) {
    await bluebird.fromCallback((cb) => this.userStreamsStorage.removeAll({ id: userId }, cb));
    cache.unsetUserData(userId);
  },
  async _deleteUser (userId) {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.removeMany(userId, {}, cb));
  },
  async _getUserStorageSize (userId) {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.getTotalSize(userId, cb));
  }
});
/**
 * @param {any} obj
 * @returns {any}
 */
function clone (obj) {
  // Clone streams -- BAd BaD -- To be optimized
  return _.cloneDeep(obj);
}
/**
 * @param {Stream} storeStream
 * @param {boolean} includeChildren
 * @returns {any}
 */
function cloneStream (storeStream, includeChildren) {
  if (includeChildren) {
    return clone(storeStream);
  } else {
    // _.pick() creates a copy
    const stream = _.pick(storeStream, StreamPropsWithoutChildren);
    stream.childrenHidden = true;
    stream.children = [];
    return stream;
  }
}
/**
 * @returns {void}
 */
function loadVisibleStreamsTree () {
  try {
    visibleStreamsTree = SystemStreamsSerializer.getReadable();
    ds.defaults.applyOnStreams(visibleStreamsTree);
  } catch (err) {
    console.log('This should be fixed!! It happens when the system streams are not yet loaded during some test suites.. ', err);
  }
}
