/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Audit Data Store. 
 * Send predicatable static data
 */


const {DataStore, UserStreams, UserEvents}  = require('mall/interfaces/DataStore');

const audit = require('audit');

const STORE_ID = '_audit';
const STORE_NAME = 'Audit Store';

class AuditDataStore extends DataStore {
  
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

/**
 * 
 * Stream structure
 * accesses:
 *    access-{accessid}
 * 
 * actions:
 *    action-{actionId}
 * 
 */



class AuditUserStreams extends UserStreams {

  async get(uid, params) {

    // -- List root streams (accesses & actions)
    if (params.id === '*') {
      return [{
        id: 'accesses',
        name: 'Accesses',
        parentId: null,
        children: [],
        childrenHidden: true,
      }, {
        id: 'actions',
        name: 'Actions',
        parentId: null,
        children: [],
        childrenHidden: true,
      }];
    }

    // list accesses
    if (params.id === 'accesses') {
      const userStorage = await audit.storage.forUser(uid);
      const accesses = userStorage.getAllAccesses();
      if (accesses == null) return [];
      const res = accesses.map((access) => { return {
        id: access.term,
        name: access.term,
        children: [],
        parentId: 'accesses'
      }});
      return [{
        id: 'accesses',
        name: 'Accesses',
        parentId: null,
        children: res,
      }];
    }

     // list actions
     if (params.id === 'actions') {
      const userStorage = await audit.storage.forUser(uid);
      const actions = userStorage.getAllActions();
      if (actions == null) return [];
      const res = actions.map((action) => { return {
        id: action.term,
        name: action.term,
        children: [],
        parentId: 'actions'
      }});
      return [{
        id: 'actions',
        name: 'Actions',
        parentId: null,
        children: res,
      }];
    }

    if (params.id) {
      let parentId = null;
      if (params.id.startsWith('access-')) {
        parentId = 'accesses';
      } else if (params.id.startsWith('action-')) {
        parentId = 'actions';
      }
      // here check that this action or streams exists
      return [{
        id: params.id,
        name: params.id,
        parentId: parentId,
        children: [],
        trashed: false,
      }];
    } 

    return [];
  }
}

class AuditUserEvents extends UserEvents {
  async get(uid, params) {
    const userStorage = await audit.storage.forUser(uid);
    return userStorage.getLogs(params);
  }


  async getStreamed(uid, params) {
    const userStorage = await audit.storage.forUser(uid);
    return userStorage.getLogsStream(params);
  }
}

module.exports = AuditDataStore;
