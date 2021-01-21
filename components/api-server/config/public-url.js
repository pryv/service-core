/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const REG_PATH = '/reg';
const WWW_PATH = '/www';

async function publicUrlToService(config) {
  const publicUrl = config.get('dnsLess:publicUrl');
  if (publicUrl) {
    config.set('service', {
      api: publicUrl + '/{username}/',
      register: publicUrl + REG_PATH + '/',
      access: publicUrl + REG_PATH + '/access/',
      assets: {
        definitions: publicUrl + WWW_PATH + '/assets/index.json',
      }
    });
  }
}

module.exports = {
  load: publicUrlToService
}