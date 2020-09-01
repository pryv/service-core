/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { getConfig } = require('components/api-server/config/Config');

console.log('salu depuis le hook')

exports.mochaHooks = {
  async beforeAll () {
    console.log('hook beforeAll');
    const config = getConfig();
    await config.init();
  },
};