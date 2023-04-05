/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ds = require('@pryv/datastore');
const { Readable } = require('stream');
const { localStorePrepareQuery } = require('storage/src/localStoreEventQueries');

let keyValueData;

/**
 * Dummy data store serving predictable static data.
 */
module.exports = ds.createDataStore({
  async init (params) {
    keyValueData = params.storeKeyValueData;
    this.streams = createUserStreams();
    this.events = createUserEvents();
    return this;
  },

  async deleteUser (userId) {}, // eslint-disable-line no-unused-vars

  async getUserStorageSize (userId) { return 0; } // eslint-disable-line no-unused-vars
});

function createUserStreams () {
  return ds.createUserStreams({
    async get (userId, query) {
      if (query.parentId === '*' || query.parentId == null) {
        return genStreams(userId);
      }
      const parent = await this.getOne(userId, query.parentId, query);
      if (parent == null) return [];
      return parent.children;
    },

    async getOne (userId, streamId, query) {
      // store last call in keyValueStore for tests
      await keyValueData.set(userId, 'lastStreamCall', Object.assign({ id: streamId }, query));
      const stream = findStream(streamId, genStreams(userId));
      return stream;
    }
  });

  function findStream (streamId, streams) {
    for (const stream of streams) {
      if (stream.id === streamId) {
        return stream;
      }
      if (stream.children) {
        const found = findStream(streamId, stream.children);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }
}

function createUserEvents () {
  return ds.createUserEvents({
    async getStreamed (userId, query, options) {
      const events = await this.get(userId, query, options);
      const readable = Readable.from(events);
      return readable;
    },

    /**
     * @returns Array
     */
    async get (userId, storeQuery, options) { // eslint-disable-line no-unused-vars
      const query = localStorePrepareQuery(storeQuery);
      const lastStreamCall = await keyValueData.get(userId, 'lastStreamCall');
      let events = [{
        id: 'dummyevent0',
        type: 'note/txt',
        streamIds: ['mariana'],
        content: 'hello',
        time: Date.now() / 1000
      }, {
        id: 'laststreamcall',
        type: 'data/json',
        streamIds: ['antonia'],
        content: lastStreamCall,
        time: Date.now() / 1000
      }];

      // support stream filtering (only for one "any")
      const streamQuery = query.filter((i) => { return i.type === 'streamsQuery'; });
      if (streamQuery.length > 0 && streamQuery[0].content[0]?.any) {
        const filterByStreamId = streamQuery[0].content[0]?.any[0];
        events = events.filter((e) => e.streamIds.includes(filterByStreamId));
      }
      ds.defaults.applyOnEvents(events);
      return events;
    }
  });
}

/**
 * create a set of streams with a rootstream named with the userId;
 * */
function genStreams (userId) {
  const streams = [
    {
      id: 'myself',
      name: userId,
      children: [
        {
          id: 'mariana',
          name: 'Mariana'
        },
        {
          id: 'antonia',
          name: 'Antonia'
        }
      ]
    }];
  ds.defaults.applyOnStreams(streams);
  return streams;
}
