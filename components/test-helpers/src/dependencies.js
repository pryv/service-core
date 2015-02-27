var utils = require('components/utils'),
    settings = utils.commonConfig.load(),
    logging = utils.logging(settings.logs),
    storage = require('components/storage'),
    database = new storage.Database(settings.database, logging),
    _ = require('lodash');


/**
 * Test process dependencies.
 */
var deps = module.exports = {
  settings: settings,
  logging: logging,
  storage: {
    database: database,
    versions: new storage.Versions(database, settings.eventFiles.attachmentsDirPath,
        logging),
    passwordResetRequests: new storage.PasswordResetRequests(database),
    sessions: new storage.Sessions(database),
    users: new storage.Users(database),
    user: {
      accesses: new storage.user.Accesses(database),
      eventFiles: new storage.user.EventFiles(settings.eventFiles, logging),
      events: new storage.user.Events(database),
      followedSlices: new storage.user.FollowedSlices(database),
      streams: new storage.user.Streams(database),
      profile: new storage.user.Profile(database)
    }
  }
};

var dbDocsItems = _.values(_.pick(deps.storage.user, 'accesses', 'events', 'followedSlices',
        'streams', 'profile')),
    attFilesItems = _.values(_.pick(deps.storage.user, 'eventFiles'));
deps.storage.size = new storage.Size(deps.storage.users, dbDocsItems, attFilesItems);
