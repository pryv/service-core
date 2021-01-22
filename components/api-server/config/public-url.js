/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const path = require('path');

const REG_PATH = '/reg';
const WWW_PATH = '/www';

async function publicUrlToService(config) {
  const publicUrl = config.get('dnsLess:publicUrl');
  if (publicUrl) {
    config.set('service', {
      api: path.join(publicUrl, '/{username}/'),
      register: path.join(publicUrl, REG_PATH, '/'),
      access: path.join(publicUrl, REG_PATH, '/access/'),
      assets: {
        definitions: path.join(publicUrl, WWW_PATH, '/assets/index.json'),
      }
    });
  }
}

module.exports = {
  load: publicUrlToService
}