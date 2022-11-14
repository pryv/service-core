/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
process.env.NODE_ENV = 'test';
const path = require('path');
const { getConfigUnsafe } = require('@pryv/boiler').init({
  appName: 'webhooks-test',
  baseConfigDir: path.resolve(__dirname, '../config/'),
  extraConfigs: [
    {
      scope: 'serviceInfo',
      key: 'service',
      urlFromKey: 'serviceInfoUrl'
    },
    {
      scope: 'api-server-test-config',
      file: path.resolve(__dirname, '../../api-server/config/test-config.yml')
    },
    {
      scope: 'defaults-paths',
      file: path.resolve(__dirname, '../../api-server/config/paths-config.js')
    },
    {
      plugin: require('api-server/config/components/systemStreams')
    }
  ]
});
process.on('unhandledRejection', unhandledRejection);
// Handles promise rejections that aren't caught somewhere. This is very useful
// for debugging.
/**
 * @returns {void}
 */
function unhandledRejection (reason, promise) {
  console.warn(
    // eslint-disable-line no-console
    'Unhandled promise rejection:', promise, 'reason:', reason.stack || reason);
}
const storage = require('storage');
// __dirname can be undefined when node is run outside of file.
// Produces and returns a connection to MongoDB.
//
/**
 * @returns {any}
 */
function produceMongoConnection () {
  return storage.getDatabaseSync(true);
}
module.exports = {
  webhooksStorage: new storage.user.Webhooks(produceMongoConnection())
};
