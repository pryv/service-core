/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ds = require('@pryv/datastore');
const audit = require('audit');
const { localStorePrepareOptions, localStorePrepareQuery } = require('storage/src/localStoreEventQueries');

module.exports = ds.createUserEvents({
  async getStreamed (userId, storeQuery, storeOptions) {
    const userDB = await audit.storage.forUser(userId);
    const query = localStorePrepareQuery(storeQuery);
    const options = localStorePrepareOptions(storeOptions);
    return userDB.getEventsStreamed({ query, options });
  }
});
