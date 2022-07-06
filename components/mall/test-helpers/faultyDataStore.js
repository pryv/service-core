/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ds = require('pryv-datastore');

const faultyStreams = createUserStreams();
const faultyEvents = createUserEvents();

/**
 * Faulty data store that always fails.
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
  return ds.createUserStreams({
    async get (userId, params) { // eslint-disable-line no-unused-vars
      throw new Error('Faulty');
    }
  });
}

function createUserEvents () {
  return ds.createUserEvents({
    async get (userId, params) { // eslint-disable-line no-unused-vars
      throw new Error('Faulty');
    }
  });
}
