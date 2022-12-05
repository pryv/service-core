/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ds = require('@pryv/datastore');

const dummyStreams = createUserStreams();
const dummyEvents = createUserEvents();

/**
 * Dummy data store serving predictable static data.
 */
module.exports = ds.createDataStore({
  id: 'dummy',
  name: 'Dummy store',

  async init () {
    return this;
  },

  streams: dummyStreams,
  events: dummyEvents,

  async deleteUser (userId) {}, // eslint-disable-line no-unused-vars

  async getUserStorageSize (userId) { return 0; } // eslint-disable-line no-unused-vars
});

function createUserStreams () {
  return ds.createUserStreams({
    async get (userId, params) {
      let streams = [{
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

      if (params.id && params.id !== '*') {
        // filter tree
        streams = findStream(params.id, streams);
      }

      return streams;
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
    return [];
  }
}

function createUserEvents () {
  return ds.createUserEvents({
    async get (userId, params) { // eslint-disable-line no-unused-vars
      const events = [{
        id: 'dummyevent0',
        type: 'note/txt',
        content: 'hello',
        time: Date.now() / 1000
      }];
      ds.defaults.applyOnEvents(events);
      return events;
    }
  });
}
