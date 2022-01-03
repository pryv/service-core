/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

//@flow

module.exports = {
  AccessLogic: require('./AccessLogic'),
}

export type Access = {
  id: string,
  token: string,
  type: string,
  name: string,
  deviceName: ?string,
  permissions: Array<Permission>,
  lastUsed: ?number,
  expireAfter: ?number,
  expires: ?number,
  deleted: ?number,
  clientData: ?{},
  created: number,
  createdBy: string,
  modified: number,
  modifiedBy: string,
}

export type Permission = {
  streamId: string,
  level: string,
  feature: ?string,
  setting: ?string,
};