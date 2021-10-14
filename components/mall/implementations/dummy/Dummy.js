/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Dummy Data Store. 
 * Send predicatable static data
 */

const { DataStore, UserStreams, UserEvents }  = require('../../interfaces/DataStore');

class Dummy extends DataStore {

  constructor() {  super(); }

  async init(config) {
    // get config and load approriated data store components;
    this._streams = new DummyUserStreams();
    this._events = new DummyUserEvents();
    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

}


class DummyUserStreams extends UserStreams {
  async get(uid, params) {
    let streams = [{
      id: 'myself',
      name: uid,
      children: [
        {
          id: 'mariana',
          name: 'Mariana'
        },{
          id: 'antonia',
          name: 'Antonia'
        }
      ]
    }];


    UserStreams.applyDefaults(streams);
    
    function findStream(streamId, arrayOfStreams) {
      for (let stream of arrayOfStreams) {
        if (stream.id === streamId) return stream;
        if (stream.children) {
          const found = findStream(streamId, stream.children);
          if (found) return found;
        }
      }
      return [];
    }

    if (params.id && params.id !== '*') { // filter tree
      streams = findStream(params.id, streams);
    }

    
    return streams;
  }
}

class DummyUserEvents extends UserEvents {
  async get(uid, params) {
    const events = [{
      id: 'dummyevent0',
      type: 'note/txt',
      content: 'hello',
      time: Date.now() / 1000,
    }];
    UserEvents.applyDefaults(events);
    return events;
  }
}

module.exports = Dummy;
