/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
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
    scope: 'defaults-paths',
    file: path.resolve(__dirname, '../../api-server/config/paths-config.js')
  }, {
    scope: 'audit-tests',
    file: path.resolve(__dirname, '../../audit/config/test-config.yml')
  }, {
    scope: 'default-audit',
    file: path.resolve(__dirname, '../../audit/config/default-config.yml')
  }, {
    scope: 'default-audit-path',
    file: path.resolve(__dirname, '../../audit/config/default-path.js')
  },{
    plugin: require('../../api-server/config/components/systemStreams')
  }]
});
