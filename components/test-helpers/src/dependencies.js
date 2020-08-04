/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var utils = require('components/utils'),
    settings = utils.config.load(),
    logging = utils.logging(settings.logs),
    storage = require('components/storage'),
    _ = require('lodash');
    
const database = new storage.Database(
  settings.database, logging.getLogger('database'));

/**
 * Test process dependencies.
 */
var deps = module.exports = {
  settings: settings,
  logging: logging,
  storage: {
    database: database,
    versions: new storage.Versions(database, settings.eventFiles.attachmentsDirPath,
      logging.getLogger('versions')),
    passwordResetRequests: new storage.PasswordResetRequests(database),
    sessions: new storage.Sessions(database),
    users: new storage.Users(database),
    user: {
      accesses: new storage.user.Accesses(database),
      eventFiles: new storage.user.EventFiles(
        settings.eventFiles, logging.getLogger('eventFiles')),
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
