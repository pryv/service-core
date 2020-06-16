const async = require('async');
const { toString } = require('components/utils');
const _ = require('lodash');
const { isDuplicateError } = require('../Database');

/**
 * v0.7.1:
 *
 * - Fixes streams with parentId='' to parentId=null
 */
module.exports = function (context, callback) {
  context.database.getCollection({ name: 'users' }, (err, usersCol) => {
    if (err) { return callback(err); }

    usersCol.find({}).toArray((err, users) => {
      if (err) { return callback(err); }

      async.forEachSeries(users, migrateUser, (err) => {
        if (err) { return callback(err); }

        context.logInfo('Data version is now 0.7.1');
        callback();
      });
    });
  });

  function migrateUser(user, callback) {
    context.logInfo(`Migrating user ${toString.user(user)}...`);
    async.series([
      function updateStreamsStructure(stepDone) {
        context.database.getCollection({ name: `${user._id}.streams` }, (err, streamsCol) => {
          if (err) {
            context.logError(err, 'retrieving streams collection');
            return stepDone(err);
          }

          const streamsCursor = streamsCol.find();
          let completed = false;
          async.until(() => completed, migrateStreams,
            context.stepCallbackFn('migrating streams structure', stepDone));

          function migrateStreams(streamDone) {
            streamsCursor.nextObject((err, stream) => {
              if (err) { return setImmediate(streamDone.bind(null, err)); }
              if (!stream) {
                completed = true;
                return setImmediate(streamDone);
              }

              if (stream.parentId !== '') {
                return setImmediate(streamDone);
              }

              const update = {
                $set: {
                  parentId: null,
                },
              };
              streamsCol.update({ _id: stream._id }, update, (err) => {
                if (err) {
                  if (isDuplicateError(err)) {
                    return updateConflictingNameRecursively(streamsCol, stream, update, streamDone);
                  }
                  return streamDone(err);
                }
                streamDone();
              });
            });
          }
        });
      },
    ], (err) => {
      if (err) {
        context.logError(err, 'migrating user');
        return callback(err);
      }
      context.logInfo(`Successfully migrated user ${toString.user(user)}.`);
      callback();
    });
  }

  // Applies predefined update with a "-2" added to the name (recursively)
  // as long as there exist duplicate siblings
  function updateConflictingNameRecursively(streamsCol, stream, update, callback) {
    stream.name += '-2';
    _.extend(update.$set, { name: stream.name });
    streamsCol.update({ _id: stream._id }, update, (err) => {
      if (err) {
        if (isDuplicateError(err)) {
          return updateConflictingNameRecursively(streamsCol, stream, update, callback);
        }
        return callback(err);
      }
      callback();
    });
  }
};
