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

  async generateStreams(uid, params, addEventStreamCB) {
    const store = this.store;
    const streamsQueryMapByStore = params.streamsQueryMapByStore;
    delete params.streamsQueryMapByStore;
    for (let sourceId of Object.keys(streamsQueryMapByStore)) {
      const source = store.sourceForId(sourceId);
      params.streams = streamsQueryMapByStore[sourceId];

      // replace '*' by null <-- this should be done upfront
      if (params.streams && params.streams[0] && params.streams[0].any && params.streams[0].any[0] === '*') {
        params.streams = null; 
      }

      await source.events.getStreamed(uid, _.cloneDeep(params)).then((eventsStream) => {
        if (sourceId == 'local') {
          addEventStreamCB(source, eventsStream);
        } else {
          addEventStreamCB(source, eventsStream.pipe(new AddStorePrefixOnEventsStream(sourceId)));
        }
      });
    }
  }

}

module.exports = StoreUserEvents;