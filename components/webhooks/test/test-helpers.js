/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

process.env.NODE_ENV = 'test';

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
const Settings = require(__dirname + '/../src/settings');
const NullLogger = require('components/utils/src/logging').NullLogger;

// Produces and returns a connection to MongoDB. 
// 
function produceMongoConnection(): Database {
  const settings = new Settings();
  const database = new Database(
    settings.get('mongodb'),
    new NullLogger());
  return database;
}

module.exports = {
  usersStorage: new storage.user.Events(produceMongoConnection()),
  webhooksStorage: new storage.user.Webhooks(produceMongoConnection()),
};