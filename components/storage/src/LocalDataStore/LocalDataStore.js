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
const bluebird = require('bluebird');

const storage = require('../index');
const {DataStore}  = require('pryv-datastore');

const SystemStreamsSerializer = require('business/src/system-streams/serializer'); // loaded just to init upfront

const LocalUserStreams = require('./LocalUserStreams');
const LocalUserEvents = require('./LocalUserEvents');
const LocalTransaction = require('./LocalTransaction');

const STORE_ID = 'local';
const STORE_NAME = 'Local Store';
class LocalDataStore extends DataStore {

  _id: string = 'local';
  _name: string = 'Local Store';
  _streams: DataStore.UserStreams;
  _events: DataStore.UserEvents;
  settings: any;

  constructor() {
    super();
    this.settings = {
      attachments: {
        setFileReadToken: true // method/events js will add a readFileToken
      }
    }
  }

  async init(): Promise<DataStore> {
    await SystemStreamsSerializer.init();
    // get config and load approriated data store components;


    const database = await storage.getDatabase();
    const eventsCollection = await database.getCollection({ name: 'events' });

    // ---- events ---- //
    const eventFilesStorage = (await storage.getStorageLayer()).eventFiles;

    for (const item of eventsIndexes) {
      item.options.background = true;
      await eventsCollection.createIndex(item.index, item.options);
    }

    this._events = new LocalUserEvents(eventsCollection, eventFilesStorage);

    // ---- streams --- //

    const streamsCollection = await database.getCollection({ name: 'streams' });
    for (const item of streamIndexes) {
      item.options.background = true;
      await streamsCollection.createIndex(item.index, item.options);
    }

    const userStreamsStorage = (await storage.getStorageLayer()).streams;
    this._streams = new LocalUserStreams(streamsCollection, userStreamsStorage);

    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

  async newTransaction(): Promise<DataStore.Transaction> {
    const transaction = new LocalTransaction();
    await transaction.init();
    return transaction;
  }

  async deleteUser(userId: string): Promise<void> {
    await this._streams._deleteUser(userId);
    await this._events._deleteUser(userId);
  }

  async storageUsedForUser(userId: string) {
    const streamsSize = await this._streams._storageUsedForUser(userId);
    const eventsSize = await this._events._storageUsedForUser(userId);
    return streamsSize + eventsSize;
  }
}

module.exports = LocalDataStore;

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
