const utils = require('components/utils');

const settings = utils.config.load();
const logging = utils.logging(settings.logs);
const storage = require('components/storage');
const _ = require('lodash');

const database = new storage.Database(
  settings.database, logging.getLogger('database'),
);

/**
 * Test process dependencies.
 */
const deps = module.exports = {
  settings,
  logging,
  storage: {
    database,
    versions: new storage.Versions(database, settings.eventFiles.attachmentsDirPath,
      logging.getLogger('versions')),
    passwordResetRequests: new storage.PasswordResetRequests(database),
    sessions: new storage.Sessions(database),
    users: new storage.Users(database),
    user: {
      accesses: new storage.user.Accesses(database),
      eventFiles: new storage.user.EventFiles(
        settings.eventFiles, logging.getLogger('eventFiles'),
      ),
      events: new storage.user.Events(database),
      followedSlices: new storage.user.FollowedSlices(database),
      streams: new storage.user.Streams(database),
      profile: new storage.user.Profile(database),
      webhooks: new storage.user.Webhooks(database),
    },
  },
};

const dbDocsItems = _.values(_.pick(deps.storage.user,
  'accesses', 'events', 'followedSlices', 'streams', 'profile'));
const attFilesItems = _.values(_.pick(deps.storage.user, 'eventFiles'));
deps.storage.size = new storage.Size(deps.storage.users, dbDocsItems, attFilesItems);
