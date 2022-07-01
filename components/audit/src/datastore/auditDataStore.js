/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ds = require('pryv-datastore');
const auditUserEvents = require('./auditUserEvents');
const auditUserStreams = require('./auditUserStreams');

/**
 * Audit data store.
 */
module.exports = ds.createDataStore({
  id: '_audit',
  name: 'Audit store',

  async init () {
    return this;
  },

  get streams () { return auditUserStreams; },
  get events () { return auditUserEvents; },

  async deleteUser (userId) {}, // eslint-disable-line no-unused-vars

  async storageUsedForUser (userId) { // eslint-disable-line no-unused-vars
    // TODO: return size of DB
    return 0;
  }
});
