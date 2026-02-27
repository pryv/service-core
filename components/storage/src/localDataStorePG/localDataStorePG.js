/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * PostgreSQL Data Store.
 * Implements the @pryv/datastore DataStore interface.
 */
const ds = require('@pryv/datastore');
const storage = require('../index');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const userStreams = require('./localUserStreamsPG');
const userEvents = require('./localUserEventsPG');
const LocalTransactionPG = require('./LocalTransactionPG');
const { getEventFiles } = require('../eventFiles/getEventFiles');

module.exports = ds.createDataStore({

  async init (params) {
    this.settings = params.settings;
    await SystemStreamsSerializer.init();

    // Get the shared DatabasePG instance
    const { getDatabasePG } = require('../index');
    const db = await getDatabasePG();

    // Init events
    const eventFilesStorage = await getEventFiles();
    userEvents.init(db, eventFilesStorage, this.settings, params.integrity.setOnEvent);
    eventFilesStorage.attachToEventStore(userEvents, params.integrity.setOnEvent);

    // Init streams — reuses StorageLayer's StreamsPG via the same pattern as MongoDB
    const userStreamsStorage = (await storage.getStorageLayer()).streams;
    userStreams.init(userStreamsStorage);

    return this;
  },

  streams: userStreams,

  events: userEvents,

  async newTransaction () {
    const { getDatabasePG } = require('../index');
    const db = await getDatabasePG();
    const transaction = new LocalTransactionPG(db);
    await transaction.init();
    return transaction;
  },

  async deleteUser (userId) {
    await userStreams._deleteUser(userId);
    await userEvents._deleteUser(userId);
  },

  async getUserStorageInfos (userId) {
    const streams = await userStreams._getStorageInfos(userId);
    const events = await userEvents._getStorageInfos(userId);
    const files = await userEvents._getFilesStorageInfos(userId);
    return { streams, events, files };
  }
});
