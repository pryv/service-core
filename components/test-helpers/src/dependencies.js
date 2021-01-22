/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var storage = require('storage'),
    _ = require('lodash');

const { getConfigUnsafe, getLogger } = require('boiler');
const config = getConfigUnsafe(true);

const database = new storage.Database(config.get('database'));

/**
 * Test process dependencies.
 */
var deps = module.exports = {
  settings: config.get(),
  storage: {
    database: database,
    versions: new storage.Versions(database, config.get('eventFiles:attachmentsDirPath'),
    getLogger('versions')),
    passwordResetRequests: new storage.PasswordResetRequests(database),
    sessions: new storage.Sessions(database),
    user: {
      accesses: new storage.user.Accesses(database),
      eventFiles: new storage.user.EventFiles(
        config.get('eventFiles'), getLogger('eventFiles')),
      events: new storage.user.Events(database), 
      followedSlices: new storage.user.FollowedSlices(database),
      streams: new storage.user.Streams(database),
      profile: new storage.user.Profile(database),
      webhooks: new storage.user.Webhooks(database),
    }
  }
};

const dbDocumentsItems = _.values(_.pick(deps.storage.user, 
  'accesses', 'events', 'followedSlices', 'streams', 'profile'));
const attFilesItems = _.values(_.pick(deps.storage.user, 'eventFiles'));
deps.storage.size = new storage.Size(deps.storage.user.events, dbDocumentsItems, attFilesItems);
