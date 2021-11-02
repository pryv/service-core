/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const {UserEvents}  = require('../interfaces/DataStore');
const _ = require('lodash');
const AddStorePrefixOnEventsStream = require('./lib/AddStorePrefixOnEventsStream');

/**
 * Handle Store.events.* methods
 */
class StoreUserEvents extends UserEvents {
  
  /**
   * @param {Store} store 
   */
  constructor(store) {
    super();
    this.store = store;
  }

  async get(uid, paramsBySource) {
    const res = [];
    for (let storeId of Object.keys(paramsBySource)) {
      const store = this.store._storeForId(storeId);
      const storePrefix = ':' + storeId + ':';
      const params = paramsBySource[storeId];
      const events = await store.events.get(uid, params);
      for (const event of events) {
        if (storeId != 'local') {
          event.streamIds = event.streamIds.map(streamId => this.storePrefix + streamId);
        } 
        res.push(event);
      }
    }
    return res;
  }

  async generateStreams(uid, paramsBySource, addEventStreamCB) {
    for (let storeId of Object.keys(paramsBySource)) {
      const store = this.store._storeForId(storeId);
      const params = paramsBySource[storeId];
      await store.events.getStreamed(uid, params).then((eventsStream) => {
        if (storeId == 'local') {
          addEventStreamCB(store, eventsStream);
        } else {
          addEventStreamCB(store, eventsStream.pipe(new AddStorePrefixOnEventsStream(storeId)));
        }
      });
    }
  }

}

module.exports = StoreUserEvents;