/**
 * Data Source aggregator. 
 * Pack configured datasources into one
 */


const {DataSource, UserStreams, UserEvents}  = require('../../interfaces/DataSource');

const STORE_ID = 'dummy';
const STORE_NAME = 'Dummy Store';

class Dummy extends DataSource {
  
  get id() { return STORE_ID; }
  get name() { return STORE_NAME; }

  constructor() {  super(); }

  async init() {
    // get config and load approriated data sources componenst;
    this._streams = new DummyUserStreams();
    this._events = new DummyUserEvents();
    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

}


class DummyUserStreams extends UserStreams {
  async get(uid, params) {
    const streams = [{
      id: 'uid',
      name: uid,
    }, {
      id: 'tom',
      name: 'Tom',
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
    UserStreams.applyDefaults(STORE_ID, streams);
    return streams;
  }
}

class DummyUserEvents extends UserEvents {
  
}

module.exports = Dummy;
