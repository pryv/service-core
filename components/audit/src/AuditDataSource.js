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

const STORE_ID = '_audit';
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
    const streams = [];
    if (params.id) {
      streams.push({
        id: params.id,
        name: params.id,
        parentId: null,
        children: [],
        trashed: false,
      });
    } else {
      throw(new Error('Audit stream query not supported :' + params));
    }
    return streams;
  }
}

class AuditUserEvents extends UserEvents {
  async getStreamed(uid, params) {
    const userStorage = await audit.storage.forUser(uid);
    return userStorage.getLogsStream(params);
  }
}

module.exports = AuditDataSource;
