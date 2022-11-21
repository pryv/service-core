/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

module.exports = {
  AccessLogic: require('./AccessLogic'),
};

export type Access = {
  id: string;
  token: string;
  type: string;
  name: string;
  deviceName: string | undefined | null;
  permissions: Array<Permission>;
  lastUsed: number | undefined | null;
  expireAfter: number | undefined | null;
  expires: number | undefined | null;
  deleted: number | undefined | null;
  clientData: {} | undefined | null;
  created: number;
  createdBy: string;
  modified: number;
  modifiedBy: string;
};

export type Permission = {
  streamId: string;
  level: string;
  feature: string | undefined | null;
  setting: string | undefined | null;
};
