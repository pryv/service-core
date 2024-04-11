/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Local Data Store.
 */
const ds = require('@pryv/datastore');
const storage = require('../index');
const SystemStreamsSerializer = require('business/src/system-streams/serializer'); // loaded just to init upfront
const userStreams = require('./localUserStreams');
const userEvents = require('./localUserEvents');
const LocalTransaction = require('./LocalTransaction');
const EventFiles = require('../user/EventFiles');

module.exports = ds.createDataStore({

  async init (params) {
    this.settings = params.settings;
    await SystemStreamsSerializer.init();
    const database = await storage.getDatabase();

    // init events
    const eventsCollection = await database.getCollection({ name: 'events' });
    // file storage
    const eventFilesStorage = new EventFiles();
    await eventFilesStorage.init();

    for (const item of eventsIndexes) {
      item.options.background = true;
      database.ferretIndexAndOptionsAdaptationsIfNeeded(item);
      await eventsCollection.createIndex(item.index, item.options);
    }
    // forward settings to userEvents
    userEvents.settings = this.settings;
    userEvents.init(eventsCollection, eventFilesStorage, params.integrity.setOnEvent);
    eventFilesStorage.attachToEventStore(userEvents, params.integrity.setOnEvent);

    // init streams
    const streamsCollection = await database.getCollection({ name: 'streams' });
    for (const item of streamIndexes) {
      item.options.background = true;
      database.ferretIndexAndOptionsAdaptationsIfNeeded(item);
      await streamsCollection.createIndex(item.index, item.options);
    }
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

const eventsIndexes = [
  {
    index: { userId: 1 },
    options: {}
  },
  {
    index: { userId: 1, _id: 1 },
    options: {}
  },
  {
    index: { userId: 1, time: 1 },
    options: {}
  },
  {
    index: { userId: 1, streamIds: 1 },
    options: {}
  },
  {
    index: { userId: 1, type: 1 },
    options: {}
  },
  // no index by content until we have more actual usage feedback
  {
    index: { userId: 1, trashed: 1 },
    options: {}
  },
  {
    index: { userId: 1, modified: 1 },
    options: {}
  },
  {
    index: { userId: 1, endTime: 1 },
    options: { partialFilterExpression: { endTime: { $exists: true } } }
  }
];

const streamIndexes = [
  {
    index: { userId: 1 },
    options: {}
  },
  {
    index: { userId: 1, streamId: 1 },
    options: { unique: true }
  },
  {
    index: { userId: 1, name: 1 },
    options: {}
  },
  {
    index: { userId: 1, name: 1, parentId: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        deleted: { $type: 'null' }
      }
    }
  },
  {
    index: { userId: 1, trashed: 1 },
    options: {}
  }
];
