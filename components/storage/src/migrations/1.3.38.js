var async = require('async'),
  toString = require('components/utils').toString;

/**
 * v1.3.38:
 *
 * - Changes { token } and { name, type, deviceName } indexes from sparse
 *    to having a partialFilter on the "deleted" field which is more performant.
 */
module.exports = function (context, callback) {
  context.database.getCollection({name: 'users'}, function (err, usersCol) {
    if (err) { return callback(err); }

    usersCol.find({}).toArray(function (err, users) {
      if (err) { return callback(err); }

      async.forEachSeries(users, migrateUser, function (err) {
        if (err) { return callback(err); }

        context.logInfo('Data version is now 1.3.38');
        callback();
      });
    });
  });

  function migrateUser(user, callback) {
    context.logInfo('Migrating user ' + toString.user(user) + '...');
    async.series([
      function _updateAccessesStructure(stepDone) {
        context.database.getCollection({name: user._id + '.accesses'}, function (err, accessesCol) {
          if (err) {
            context.logError(err, 'retrieving accesses collection');
            return stepDone(err);
          }

          accessesCol.dropIndexes(ignoreNSError.bind(null,
            context.stepCallbackFn('resetting indexes on accesses collection', stepDone)));
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
