var async = require('async'),
  toString = require('components/utils').toString;

/**
 * v0.7.1:
 *
 * - Fixes streams with parentId='' to parentId=null
 */
module.exports = function (context, callback) {
  context.database.getCollection({name: 'users'}, function (err, usersCol) {
    if (err) { return callback(err); }

    usersCol.find({}).toArray(function (err, users) {
      if (err) { return callback(err); }

      async.forEachSeries(users, migrateUser, function (err) {
        if (err) { return callback(err); }

        context.logInfo('Data version is now 0.7.1');
        callback();
      });
    });
  });

  function migrateUser(user, callback) {
    context.logInfo('Migrating user ' + toString.user(user) + '...');
    async.series([
      function updateStreamsStructure(stepDone) {
        context.database.getCollection({name: user._id + '.streams'}, function (err, streamsCol) {
          if (err) {
            context.logError(err, 'retrieving streams collection');
            return stepDone(err);
          }

          var streamsCursor = streamsCol.find(),
            completed = false;
          async.until(function () { return completed; }, migrateStreams,
            context.stepCallbackFn('migrating events structure', stepDone));

          function migrateStreams(streamDone) {
            streamsCursor.nextObject(function (err, stream) {
              if (err) { return setImmediate(streamDone.bind(null, err)); }
              if (! stream) {
                completed = true;
                return setImmediate(streamDone);
              }

              if (stream.parentId !== '') {
                return setImmediate(streamDone);
              }

              var update = {
                $set: {
                  parentId: null
                }
              };

              streamsCol.update({_id: stream._id}, update, streamDone);
            });
          }
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
};
