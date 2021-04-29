/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const {UserEvents}  = require('../interfaces/DataSource');
const _ = require('lodash');
const MultiStream = require('multistream');

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

  async getStreamed(uid, params) {
    const store = this.store;
    const streamsQueryMapByStore = params.streamsQueryMapByStore;
    delete params.streamsQueryMapByStore;
    const storeList = Object.keys(streamsQueryMapByStore);
    let count = 0;
    // @see MultiStream factory 
    function factory(callback) {
      if (count >= storeList.length) return callback(null, null);
      const sourceId = storeList[count];
      count++;
      const source = store.sourceForId(sourceId);
      params.streams = streamsQueryMapByStore[sourceId];
      source.events.getStreamed(uid, _.cloneDeep(params)).then((eventsStream) => {
        callback(null, eventsStream);
      });
    }

    return new MultiStream(factory);
  }

}

module.exports = StoreUserEvents;