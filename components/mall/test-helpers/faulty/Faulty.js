/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Faulty Data Store. 
 * Always fail
 */


const {DataStore}  = require('pryv-datastore');

class Faulty extends DataStore {
  _streams;
  _events;
  
  constructor() {  super(); }

  async init(config) {
    // get config and load approriated data store components;
    this._streams = new FaultyUserStreams();
    this._events = new FaultyUserEvents();
    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

  async deleteUser(userId) {}
}


class FaultyUserStreams extends DataStore.UserStreams {
  async get(uid, params) {
    throw new Error('Faulty');
  }
}

class FaultyUserEvents extends DataStore.UserEvents {
  async get(uid, params) {
    throw new Error('Faulty');
  }
}

module.exports = Faulty;
