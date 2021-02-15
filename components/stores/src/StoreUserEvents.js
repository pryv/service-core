/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const {UserEvents}  = require('../interfaces/DataSource');

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

  async get(uid, params) {
    let res = [];

    return res;
  }

}

module.exports = StoreUserEvents;