/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const Users = require('./Users');
const { getLogger } = require('@pryv/boiler');

const logger = getLogger('platform');

/**
 * @class Platform
 * @property {Users} users
 */
class Platform {
  initialized = false;
  users;

  constructor () {
    
  }

  async init() {
    if (this.initialized) {
      logger.warn('Platform already initialized, skipping');
      return;
    }
    this.initialized = true;

    this.users = new Users();
    await this.users.init();
  }
}

module.exports = Platform;