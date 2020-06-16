const async = require('async');
const { toString } = require('components/utils');

/**
 * v0.4.0:
 *
 * - Added `id` to accesses (in addition to `token`)
 */
module.exports = function (context, callback) {
  context.database.getCollection({ name: 'users' }, (err, usersCol) => {
    if (err) { return callback(err); }

    usersCol.find({}).toArray((err, users) => {
      if (err) { return callback(err); }

      async.forEachSeries(users, migrateUser, (err) => {
        if (err) { return callback(err); }

        context.logInfo('Data version is now 0.4.0');
        callback();
      });
    });
  });

  function migrateUser(user, callback) {
    context.logInfo(`Migrating user ${toString.user(user)}...`);
    async.series([
      function migrateAccessesStructure(stepDone) {
        context.database.getCollection({ name: `${user._id}.accesses` }, (err, accCol) => {
          if (err) {
            context.logError(err, 'retrieving accesses collection');
            return stepDone(err);
          }

          accCol.find({}).toArray((err, accesses) => {
            if (err) {
              context.logError(err, 'retrieving accesses');
              return stepDone(err);
            }

            if (accesses.length === 0) {
              context.logInfo('Skipping accesses migration (nothing to migrate)');
              return stepDone();
            }

            // update structure
            accesses.forEach((access) => {
              if (!access.token) {
                access.token = access._id;
              }
            });

            async.series([
              accCol.remove.bind(accCol, {}),
              accCol.insert.bind(accCol, accesses),
            ], context.stepCallbackFn('migrating accesses structure', stepDone));
          });
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
};
