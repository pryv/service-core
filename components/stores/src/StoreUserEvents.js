/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const {UserEvents}  = require('../interfaces/DataSource');
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

  async generateStreams(uid, paramsBySource, addEventStreamCB) {
    for (let storeId of Object.keys(paramsBySource)) {
      const source = this.store._storeForId(storeId);
      const params = paramsBySource[storeId];
      await source.events.getStreamed(uid, params).then((eventsStream) => {
        if (storeId == 'local') {
          addEventStreamCB(source, eventsStream);
        } else {
          addEventStreamCB(source, eventsStream.pipe(new AddStorePrefixOnEventsStream(storeId)));
        }
      });
    }
  }

}

module.exports = StoreUserEvents;