/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const Permission = require('./Permission');

class Access {
  id: string;
  token: string;
  type: string;
  name: string;
  deviceName: ?string;
  permissions: Array<Permission>;
  lastUsed: ?number;
  expireAfter: ?number;
  expires: ?number;
  deleted: ?number;
  clientData: ?{};
  created: number;
  createdBy: string;
  modified: number;
  modifiedBy: string;

  constructor(params: {}) {
    for (const [key, value] of Object.entries(params)) {
      this[key] = value;
    }
  }
}
module.exports = Access;