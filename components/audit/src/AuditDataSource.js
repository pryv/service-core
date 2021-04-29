/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Audit Data Source. 
 * Send predicatable static data
 */


const { ForbiddenNoneditableAccountStreamsEdit } = require('errors/src/ErrorIds');
const {DataSource, UserStreams, UserEvents}  = require('stores/interfaces/DataSource');

const audit = require('audit');

const STORE_ID = 'audit';
const STORE_NAME = 'Audit Store';

class AuditDataSource extends DataSource {
  
  get id() { return STORE_ID; }
  get name() { return STORE_NAME; }

  constructor() {  super(); }

  async init() {
    // get config and load approriated data sources componenst;
    this._streams = new AuditUserStreams();
    this._events = new AuditUserEvents();
    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }

}


class AuditUserStreams extends UserStreams {




  async get(uid, params) {
    
    let streams = [{
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
    
    function findStream(streamId, arrayOfStreams) {
      for (let stream of arrayOfStreams) {
        if (stream.id === streamId) return stream;
        if (stream.children) {
         const found = findStream(streamId, stream.children);
         if (found) return found;
        }
      }
      return null;
    }

    if (params.parentId) { // filter tree
      const found = findStream('.' + STORE_ID + '-' + params.parentId, streams);
      if (found) {
        streams = found.children;
      } else {
        streams = [];
      }
    }

    
    return streams;
  }
}

class AuditUserEvents extends UserEvents {
  async getStreamed(uid, params) {
    const userStorage = audit.storage.forUser(uid);
    return userStorage.getLogsStream(params);
  }
}

module.exports = AuditDataSource;
