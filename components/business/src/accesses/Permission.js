/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

class Permission {

  streamId: string;
  level: string;
  feature: ?string;
  setting: ?string;
}
module.exports = Permission;