/**
 * Standalone script to perform nightly tasks (such as updating storage sizes for all users).
 * Expects settings to be passed the same way as for the main server.
 */

var async = require('async'),
    errorHandling = require('components/errors').errorHandling,
    storage = require('components/storage');
    utils = require('components/utils');

var settings = require('./utils/config').load(),
    logging = utils.logging(settings.logs),
    logger = logging.getLogger('nightly-worker'),
    database = new storage.Database(settings.database, logging),
    usersStorage = new storage.Users(database),
    userAccessesStorage = new storage.user.Accesses(database),
    userEventFilesStorage = new storage.user.EventFiles(settings.eventFiles, logging),
    userEventsStorage = new storage.user.Events(database),
    userFollowedSlicesStorage = new storage.user.FollowedSlices(database),
    userProfileStorage = new storage.user.Profile(database),
    userStreamsStorage = new storage.user.Streams(database);
var storageSize = new storage.Size(usersStorage,
  [ userAccessesStorage, userEventsStorage, userFollowedSlicesStorage, userStreamsStorage,
    userProfileStorage ],
  [ userEventFilesStorage ]
);

logger.info('Starting update of storage size');

usersStorage.findAll(null, function (err, users) {
  if (err) {
    errorHandling.logError(err, null, logger);
  }
  async.each(users, function (user, userDone) {
    storageSize.computeForUser(user, function (err) {
      if (err) {
        logger.warn('Error computing storage size for user "' + user.username + '" ' +
            '(' + user.id + '): ' + err);
      }
      userDone();
    });
  }, function (err) {
    if (err) {
      errorHandling.logError(err, null, logger);
      process.exit(1);
      return;
    }
    logger.info(users.length + ' users updated.');
    process.exit(0);
  });
});
