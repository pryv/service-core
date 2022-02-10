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
    // get config and load approriated data store components;
    const userStreamsStorage = (await storage.getStorageLayer()).streams;
    this._streams = new LocalUserStreams(userStreamsStorage);
    
    const database = await storage.getDatabase();
    const eventsCollections = await database.getCollection({ name: 'events' });
    const userEventsStorage = (await storage.getStorageLayer()).events;
    this._events = new LocalUserEvents(eventsCollections, userEventsStorage);

    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

  async newTransaction(): Promise<DataStore.Transaction> {
    const transaction = new LocalTransaction();
    await transaction.init();
    return transaction;
  }

  async deleteUser(uid: string): Promise<void> {
    await this._streams._deleteUser(uid);
    await this._events._deleteUser(uid);
  }

  async storageUsedForUser(uid: string) { 
    const streamsSize = await this._streams._storageUsedForUser(uid);
    const eventsSize = await this._events._storageUsedForUser(uid); 
    return streamsSize + eventsSize;
  } 
}

module.exports = LocalDataStore;


