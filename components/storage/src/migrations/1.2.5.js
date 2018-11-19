var async = require('async'),
  toString = require('components/utils').toString;

/**
 * v1.2.5:
 *
 * - Adds 'endTime' partial index on Events.
 *   This index improves the speed of some events.get queries with time ranges.
 */
module.exports = function (context, callback) {
  context.database.getCollection({name: 'users'}, function (err, usersCol) {
    if (err) { return callback(err); }

    usersCol.find({}).toArray(function (err, users) {
      if (err) { return callback(err); }

      async.forEachSeries(users, migrateUser, function (err) {
        if (err) { return callback(err); }

        context.logInfo('Data version is now 1.2.5');
        callback();
      });
    });
  });

  function migrateUser(user, callback) {
    context.logInfo('Migrating user ' + toString.user(user) + '...');
    async.series([
      function updateEventsStructure(stepDone) {
        context.database.getCollection({name: user._id + '.events'}, function (err, eventsCol) {
          if (err) {
            context.logError(err, 'retrieving events collection');
            return stepDone(err);
          }

          eventsCol.dropIndexes(ignoreNSError.bind(null,
            context.stepCallbackFn('resetting indexes on events collection', stepDone)));
        });
      }
    ], function (err) {
      if (err) {
        context.logError(err, 'migrating user');
        return callback(err);
      }
      context.logInfo('Successfully migrated user ' + toString.user(user) + '.');
      callback();
    });
  }

  function ignoreNSError(callback, err) {
    if (! err || err.message.indexOf('ns not found') !== -1) {
      return callback();
    } else {
      return callback(err);
    }
  }
};
