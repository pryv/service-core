/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ds = require('@pryv/datastore');
const audit = require('audit');

module.exports = ds.createUserEvents({
  async getStreamed (userId, params) {
    const userStorage = await audit.storage.forUser(userId);
    return userStorage.getEventsStream(params);
  }
});
