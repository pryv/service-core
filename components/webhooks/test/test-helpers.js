/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
process.env.NODE_ENV = 'test';
const path = require('path');
require('@pryv/boiler').init({
  appName: 'webhooks-test',
  baseFilesDir: path.resolve(__dirname, '../../../'),
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
