/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Local Data Store. 
 */
const bluebird = require('bluebird');

const storage = require('storage');
const {DataStore, UserStreams, UserEvents}  = require('../../interfaces/DataStore');

const LocalUserStreams = require('./LocalUserStreams');
const LocalUserEvents = require('./LocalUserEvents');

const STORE_ID = 'local';
const STORE_NAME = 'Local Store';
class LocalDataStore extends DataStore {
  
  _id: string = 'local';
  _name: string = 'Local Store';
  _streams: UserStreams;
  _events: UserEvents;
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
    
    const userEventsStorage = (await storage.getStorageLayer()).events;
    this._events = new LocalUserEvents(userEventsStorage);

    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }
}

module.exports = LocalDataStore;


