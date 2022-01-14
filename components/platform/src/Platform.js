/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const Users = require('./Users');

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
      throw new Error('Platform already initialized');
    }
    this.initialized = true;

    users = new Users();
    await users.init();
  }
}

module.exports = Platform;