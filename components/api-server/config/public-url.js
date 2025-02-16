/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
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
