const {UserEvents}  = require('../interfaces/DataSource');

/**
 * Handle Store.events.* methods
 */
class StoreUserEvents extends UserEvents {
  
  constructor(store) {
    super();
    this.store = store;
  }

}

module.exports = StoreUserEvents;