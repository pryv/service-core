/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
process.env.NODE_ENV = 'test';
const path = require('path');
const boiler = require('@pryv/boiler').init({
  appName: 'boiler-tests',
  baseConfigDir: path.resolve(__dirname, '../../api-server/config/'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  },{
    scope: 'defaults-data',
    file: path.resolve(__dirname, '../../api-server/config/defaults.js')
  }, {
    plugin: require('../../api-server/config/components/systemStreams')
  }]
});
