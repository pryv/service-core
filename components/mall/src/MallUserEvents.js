/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const {UserEvents}  = require('../interfaces/DataStore');
const _ = require('lodash');
const AddStorePrefixOnEventsStream = require('./lib/AddStorePrefixOnEventsStream');
const StreamsUtils = require('./lib/StreamsUtils');

/**
 * Handle Store.events.* methods
 */
class StoreUserEvents extends UserEvents {
  
  /**
   * @param {Mall} mall 
   */
  constructor(mall) {
    super();
    this.mall = mall;
  }

  async getOne(uid, fullEventId) {
    const [storeId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(fullEventId);
    const store: DataStore = this.mall._storeForId(storeId);
    if (store == null) return null;
    const events: Array<Events> = await store.events.get(uid, { id: eventId, state: 'all' });
    if (events?.length === 1) return events[0];
    return null;
  }

  async generateStreams(uid, paramsBySource, addEventStreamCB) {
    for (let storeId of Object.keys(paramsBySource)) {
      const store = this.mall._storeForId(storeId);
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