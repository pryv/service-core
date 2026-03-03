/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Local Data Store.
 */
const ds = require('@pryv/datastore');
const SystemStreamsSerializer = require('business/src/system-streams/serializer'); // loaded just to init upfront
const userStreams = ds.createUserStreams({});
const userEvents = require('./localUserEventsSQLite');
const { getStorage } = require('../userSQLite');
const { getEventFiles } = require('storage/src/eventFiles/getEventFiles');

module.exports = ds.createDataStore({

  async init (params) {
    this.settings = params.settings;

    await SystemStreamsSerializer.init();

    // init events
    const eventFilesStorage = await getEventFiles();

    const userStorage = await getStorage('local');
    userEvents.init(userStorage, eventFilesStorage, this.settings, params.integrity.setOnEvent);
    eventFilesStorage.attachToEventStore(userEvents, params.integrity.setOnEvent);

    // streams not implemented for SQLite — stub via ds.createUserStreams({})

    return this;
  },

  streams: userStreams,

  events: userEvents,

  async deleteUser (uid) {
    // streams not implemented for SQLite — nothing to delete
    await userEvents._deleteUser(uid);
  },

  async getUserStorageInfos (uid) {
    const events = await userEvents._getStorageInfos(uid);
    const files = await userEvents._getFilesStorageInfos(uid);
    return { streams: { count: 0 }, events, files };
  }
});
