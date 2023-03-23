/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const _ = require('lodash');
const cache = require('cache');
const ds = require('@pryv/datastore');
const { treeUtils } = require('utils');
const { StreamProperties } = require('business/src/streams');
const StreamPropsWithoutChildren = StreamProperties.filter((p) => p !== 'children');
const SystemStreamsSerializer = require('business/src/system-streams/serializer'); // loaded just to init upfront
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

  async get (userId, query) {
    const parentId = query.parentId || '*';
    const parent = await this.getOne(userId, parentId, query);
    if (parent == null) return [];
    return parent.children;
  },

  // TODO refactor: this method shouldn't deal with "*" – seems clearer to move the children stuff over to `get()`
  async getOne (userId, streamId, query) {
    const allStreamsForAccount = await this._getAllStreamsFromAccountAndCache(userId);
    let stream = null;

    if (streamId === '*' || streamId == null) {
      // assert: params.childrenDepth === -1, see "#*" case
      stream = {
        children: clone(allStreamsForAccount) // clone to be sure they can be mutated without touching the cache
      };
    } else {
      const foundStream = treeUtils.findById(allStreamsForAccount, streamId); // find the stream
      const includeChildren = query.childrenDepth !== 0;
      if (foundStream != null) { stream = cloneStream(foundStream, includeChildren); } // clone to be sure they can be mutated without touching the cache
    }

    if (stream == null) return null;

    // filtering ---
    if (!query.includeTrashed) {
      if (stream.trashed) return null;
      // i.e. === 'default' (return non-trashed items)
      stream.children = treeUtils.filterTree(stream.children, false /* no orphans */, (stream) => !stream.trashed);
    }
    return stream;
  },

  /**
   * @param {string} userId
   * @param {{deletedSince: timestamp}} query
   * @param {{skip: number, limit: number, sortAscending: boolean}} [options]
   * @returns {Promise<any[]>}
   */
  async getDeletions (userId, query, options) {
    const dbOptions = { sort: { deleted: options?.sortAscending ? 1 : -1 } };
    if (options?.limit != null) dbOptions.limit = options.limit;
    if (options?.skip != null) dbOptions.skip = options.skip;
    const deletedStreams = await bluebird.fromCallback((cb) => this.userStreamsStorage.findDeletions({ id: userId }, query.deletedSince, options, cb));
    return deletedStreams;
  },

  async createDeleted (userId, streamData) {
    streamData.userId = userId;
    streamData.streamId = streamData.id;
    delete streamData.id;
    return await this.streamsCollection.replaceOne({ userId, streamId: streamData.streamId }, streamData, { upsert: true }); // replace of create deleted streams
  },

  async create (userId, streamData) {
    // as we have mixed deletions and non deleted in the same table
    // remove eventual deleted items matching this id.
    const deletedStreams = await this.getDeletions(userId, { deletedSince: Number.MIN_SAFE_INTEGER });
    const deletedStream = deletedStreams.filter(s => s.id === streamData.id);
    if (deletedStream.length > 0) {
      await bluebird.fromCallback((cb) => this.userStreamsStorage.removeOne({ id: userId }, { id: deletedStream[0].id }, cb));
    }
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.insertOne({ id: userId }, streamData, cb));
  },

  async update (userId, streamData) {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.updateOne({ id: userId }, { id: streamData.id }, streamData, cb));
  },

  async delete (userId, streamId) {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.delete({ id: userId }, { id: streamId }, cb));
  },

  async deleteAll (userId) {
    await bluebird.fromCallback((cb) => this.userStreamsStorage.removeAll({ id: userId }, cb));
    cache.unsetUserData(userId);
  },

  async _deleteUser (userId) {
    return await bluebird.fromCallback((cb) => this.userStreamsStorage.removeMany(userId, {}, cb));
  },

  async _getUserStorageSize (userId) {
    return await this.userStreamsStorage.getTotalSize(userId);
  },

  async _getAllStreamsFromAccountAndCache (userId) {
    let allStreamsForAccount = cache.getStreams(userId, 'local');
    if (allStreamsForAccount != null) return allStreamsForAccount;

    // get from DB
    allStreamsForAccount = await bluebird.fromCallback((cb) => this.userStreamsStorage.find({ id: userId }, {}, null, cb));
    // add system streams
    allStreamsForAccount = allStreamsForAccount.concat(visibleStreamsTree);
    cache.setStreams(userId, 'local', allStreamsForAccount);
    return allStreamsForAccount;
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
