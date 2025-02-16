/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const ds = require('@pryv/datastore');

/**
 * Faulty data store that always fails.
 * (Implements no data methods, so all calls will throw "not supported" errors.)
 */
module.exports = ds.createDataStore({
  async init (keyValueData) { // eslint-disable-line no-unused-vars
    this.streams = createUserStreams();
    this.events = createUserEvents();
    return this;
  },

  async deleteUser (userId) {}, // eslint-disable-line no-unused-vars

  async getUserStorageInfos (userId) { return { }; } // eslint-disable-line no-unused-vars
});

function createUserStreams () {
  return ds.createUserStreams({});
}

function createUserEvents () {
  return ds.createUserEvents({});
}
