/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Faulty Data Source. 
 * Always fail
 */


const {DataSource, UserStreams, UserEvents}  = require('../../interfaces/DataSource');

class Faulty extends DataSource {

  constructor() {  super(); }

  async init(config) {
    // get config and load approriated data sources componenst;
    this._streams = new FaultyUserStreams();
    this._events = new FaultyUserEvents();
    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

}


class FaultyUserStreams extends UserStreams {
  async get(uid, params) {
    throw new Error('Faulty');
  }
}

class FaultyUserEvents extends UserEvents {
  async get(uid, params) {
    throw new Error('Faulty');
  }
}

module.exports = Faulty;
