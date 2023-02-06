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
const LocalUserEventsSQLite = require('./LocalUserEventsSQLite');
const LocalTransaction = require('../localDataStore/LocalTransaction');
const { getStorage } = require('../userSQLite');

module.exports = ds.createDataStore({
  id: 'local',

  name: 'Local Store',

  settings: { attachments: { setFileReadToken: true } },

  async init () {
    await SystemStreamsSerializer.init();
    const database = await storage.getDatabase();

    // streams
    const streamsCollection = await database.getCollection({ name: 'streams' });
    const userStreamsStorage = (await storage.getStorageLayer()).streams;
    userStreams.init(streamsCollection, userStreamsStorage);
    this.streams = userStreams;

    // events
    const eventFilesStorage = (await storage.getStorageLayer()).eventFiles;
    const userStorage = await getStorage('local');
    this.events = new LocalUserEventsSQLite(userStorage, eventFilesStorage, this.settings);
    // forward settings to userEvents

    return this;
  },

  async newTransaction () {
    const transaction = new LocalTransaction();
    await transaction.init();
    return transaction;
  },

  async deleteUser (uid) {
    await this.streams._deleteUser(uid);
    await this.events._deleteUser(uid);
  },

  async getUserStorageSize (uid) {
    // Here we should simply look at the db file size
    // const streamsSize = await this.streams._storageUsedForUser(uid);
    const eventsSize = await this.events._storageUsedForUser(uid);
    return eventsSize;
  }
});
