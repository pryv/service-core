/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ds = require('@pryv/datastore');

const faultyStreams = createUserStreams();
const faultyEvents = createUserEvents();

/**
 * Faulty data store that always fails.
 * (Implements no data methods, so all calls will throw "not supported" errors.)
 */
module.exports = ds.createDataStore({
  id: 'faulty',
  name: 'Faulty store',

  async init () {
    return this;
  },

  streams: faultyStreams,
  events: faultyEvents,

  async deleteUser (userId) {}, // eslint-disable-line no-unused-vars

  async getUserStorageSize (userId) { return 0; } // eslint-disable-line no-unused-vars
});

function createUserStreams () {
  return ds.createUserStreams({});
}

function createUserEvents () {
  return ds.createUserEvents({});
}
