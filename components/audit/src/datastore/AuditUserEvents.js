/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


const audit = require('audit');
const { DataStore }  = require('pryv-datastore');

class AuditUserEvents extends DataStore.UserEvents {
  async getStreamed(uid, params) {
    const userStorage = await audit.storage.forUser(uid);
    return userStorage.getLogsStream(params);
  }
}

module.exports = AuditUserEvents;