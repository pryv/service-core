/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Local Data Store.
 */
const storage = require('../index');
const ds = require('@pryv/datastore');
const SystemStreamsSerializer = require('business/src/system-streams/serializer'); // loaded just to init upfront
const userStreams = require('../localDataStore/localUserStreams');
const userEvents = require('./localUserEventsSQLite');
const LocalTransaction = require('../localDataStore/LocalTransaction');
const { getStorage } = require('../userSQLite');
const { getEventFiles } = require('../eventFiles/getEventFiles');

module.exports = ds.createDataStore({

  async init (params) {
    this.settings = params.settings;

    await SystemStreamsSerializer.init();
    const database = await storage.getDatabase();

    // init events
    const eventFilesStorage = await getEventFiles();

    const userStorage = await getStorage('local');
    userEvents.init(userStorage, eventFilesStorage, this.settings, params.integrity.setOnEvent);
    eventFilesStorage.attachToEventStore(userEvents, params.integrity.setOnEvent);

    // init streams
    const streamsCollection = await database.getCollection({ name: 'streams' });
    // TODO: clarify why we don't create indexes for streams as done in `localDataStore`
    const userStreamsStorage = (await storage.getStorageLayer()).streams;
    userStreams.init(streamsCollection, userStreamsStorage);

    return this;
  },

  streams: userStreams,

  events: userEvents,

  async newTransaction () {
    const transaction = new LocalTransaction();
    await transaction.init();
    return transaction;
  },

  async deleteUser (uid) {
    await userStreams._deleteUser(uid);
    await userEvents._deleteUser(uid);
  },

  async getUserStorageInfos (uid) {
    // TODO: ultimately here we should simply look at the DB file size
    const streams = await userStreams._getStorageInfos(uid);
    const events = await userEvents._getStorageInfos(uid);
    const files = await userEvents._getFilesStorageInfos(uid);
    return { streams, events, files };
  }
});
