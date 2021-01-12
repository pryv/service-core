/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

process.env.NODE_ENV = 'test';

const path = require('path');
const { gifnoc } = require('boiler').init({
  appName: 'webhooks-test',
  baseConfigDir: path.resolve(__dirname, '../newconfig/'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  },
  {
    scope: 'api-server-test-config',
    file: path.resolve(__dirname, '../../api-server/newconfig/test-config.yaml')
  },
  {
    scope: 'defaults-data',
    file: path.resolve(__dirname, '../../api-server/newconfig/defaults.js')
  },
  {
    plugin: require('../../api-server/config/components/systemStreams')
  }]
});



process.on('unhandledRejection', unhandledRejection);

// Handles promise rejections that aren't caught somewhere. This is very useful
// for debugging. 
function unhandledRejection(reason, promise) {
  console.warn(                                // eslint-disable-line no-console
    'Unhandled promise rejection:', promise,
    'reason:', reason.stack || reason);
}

const { Database } = require('components/storage');
const storage = require('components/storage');
// FLOW __dirname can be undefined when node is run outside of file.

// Produces and returns a connection to MongoDB. 
// 
function produceMongoConnection(): Database {
  const database = new Database(gifnoc.get('database'));
  return database;
}

module.exports = {
  usersStorage: new storage.user.Events(produceMongoConnection()),
  webhooksStorage: new storage.user.Webhooks(produceMongoConnection()),
};