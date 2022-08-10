/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Local Data Store.
 */

const ds  = require('pryv-datastore');
const storage = require('../index');

const SystemStreamsSerializer = require('business/src/system-streams/serializer'); // loaded just to init upfront

const userStreams = require('./localUserStreams');
const userEvents = require('./localUserEvents');
const LocalTransaction = require('./LocalTransaction');

module.exports = (ds.createDataStore({
  id: 'local',
  name: 'Local store',

  settings: {
    attachments: {
      setFileReadToken: true // methods/events will add a readFileToken
    }
  },

  async init (): Promise<DataStore> {
    await SystemStreamsSerializer.init();

    const database = await storage.getDatabase();

    // init events

    const eventsCollection = await database.getCollection({ name: 'events' });

    const eventFilesStorage = (await storage.getStorageLayer()).eventFiles;

    for (const item of eventsIndexes) {
      item.options.background = true;
      await eventsCollection.createIndex(item.index, item.options);
    }

    userEvents.init(eventsCollection, eventFilesStorage);

    // init streams

    const streamsCollection = await database.getCollection({ name: 'streams' });
    for (const item of streamIndexes) {
      item.options.background = true;
      await streamsCollection.createIndex(item.index, item.options);
    }

    const userStreamsStorage = (await storage.getStorageLayer()).streams;

    userStreams.init(streamsCollection, userStreamsStorage);

    return this;
  },

  streams: userStreams,
  events: userEvents,

  async newTransaction (): Promise<DataStore.Transaction> {
    const transaction = new LocalTransaction();
    await transaction.init();
    return transaction;
  },

  async deleteUser (userId: string): Promise<void> {
    await userStreams._deleteUser(userId);
    await userEvents._deleteUser(userId);
  },

  async getUserStorageSize (userId: string) {
    const streamsSize = await userStreams._getUserStorageSize(userId);
    const eventsSize = await userEvents._getUserStorageSize(userId);
    return streamsSize + eventsSize;
  }
}): any);

const eventsIndexes = [
  {
    index: { userId: 1 },
    options: {},
  },
  {
    index: { userId: 1, _id: 1, },
    options: {},
  },
  {
    index: { userId: 1, time: 1 },
    options: {},
  },
  {
    index: { userId: 1, streamIds: 1 },
    options: {},
  },
  {
    index: { userId: 1, type: 1 },
    options: {},
  },
  // no index by content until we have more actual usage feedback
  {
    index: { userId: 1, trashed: 1 },
    options: {},
  },
  {
    index: { userId: 1, modified: 1 },
    options: {},
  },
  {
    index: { userId: 1, endTime: 1 },
    options: { partialFilterExpression: { endTime: { $exists: true } } },
  }
];

const streamIndexes = [
  {
    index: { userId: 1 },
    options: {},
  },
  {
    index: {userId: 1, streamId: 1},
    options: {unique: true}
  },
  {
    index: {userId: 1, name: 1},
    options: {}
  },
  {
    index: { userId: 1, name: 1, parentId: 1 },
    options: { unique: true, partialFilterExpression: {
      deleted: { $type: 'null'}
    } }
  },
  {
    index: {userId: 1, trashed: 1},
    options: {}
  }
];
