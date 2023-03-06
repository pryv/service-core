/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
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

module.exports = ds.createDataStore({

  async init (params) {
    this.settings = params.settings;
    await SystemStreamsSerializer.init();
    const database = await storage.getDatabase();

    // init events
    const eventFilesStorage = (await storage.getStorageLayer()).eventFiles;
    const userStorage = await getStorage('local');
    userEvents.init(userStorage, eventFilesStorage, this.settings);

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

  async getUserStorageSize (uid) {
    // TODO: ultimately here we should simply look at the DB file size
    const streamsSize = await userStreams._getUserStorageSize(uid);
    const eventsSize = await userEvents._getUserStorageSize(uid);
    return streamsSize + eventsSize;
  }
});
