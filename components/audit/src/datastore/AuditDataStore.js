/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Audit Data Store. 
 * Send predicatable static data
 */


const { DataStore }  = require('pryv-datastore');

const AuditUserEvents = require('./AuditUserEvents');
const AuditUserStreams = require('./AuditUserStreams');

const STORE_ID = '_audit';
const STORE_NAME = 'Audit Store';

class AuditDataStore extends DataStore {
  _streams;
  _events;

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




module.exports = AuditDataStore;
