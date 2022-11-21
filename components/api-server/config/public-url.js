/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const path = require('path');

const REG_PATH = '/reg';
const WWW_PATH = '/www';

async function publicUrlToService (config) {
  const isDnsLess = config.get('dnsLess:isActive');
  const publicUrl = config.get('dnsLess:publicUrl');
  if (isDnsLess && publicUrl != null) {
    config.set('service', {
      api: buildUrl(publicUrl, '/{username}/'),
      register: buildUrl(publicUrl, path.join(REG_PATH, '/')),
      access: buildUrl(publicUrl, path.join(REG_PATH, '/access/')),
      assets: {
        definitions: buildUrl(publicUrl, path.join(WWW_PATH, '/assets/index.json'))
      }
    });
  }
}

function buildUrl (url, path) {
  return decodeURI(new URL(path, url).href);
}

module.exports = {
  load: publicUrlToService
};
