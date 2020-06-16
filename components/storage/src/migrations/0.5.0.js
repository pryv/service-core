const async = require('async');
const { toString } = require('components/utils');
const _ = require('lodash');

/**
 * v0.5.0:
 *
 * - Changed event `attachments` structure
 */
module.exports = function (context, callback) {
  context.database.getCollection({ name: 'users' }, (err, usersCol) => {
    if (err) { return callback(err); }

    usersCol.find({}).toArray((err, users) => {
      if (err) { return callback(err); }

      async.forEachSeries(users, migrateUser, (err) => {
        if (err) { return callback(err); }

        context.logInfo('Data version is now 0.5.0');
        callback();
      });
    });
  });

  function migrateUser(user, callback) {
    context.logInfo(`Migrating user ${toString.user(user)}...`);
    let collectionNames;
    async.series([
      function migrateEventsStructure(stepDone) {
        context.database.getCollection({ name: `${user._id}.events` }, (err, eventsCol) => {
          if (err) {
            context.logError(err, 'retrieving events collection');
            return stepDone(err);
          }

          const eventsCursor = eventsCol.find();
          let completed = false;
          async.until(() => completed, migrateEvent,
            context.stepCallbackFn('migrating events structure', stepDone));

          function migrateEvent(eventDone) {
            eventsCursor.nextObject((err, event) => {
              if (err) { return setImmediate(eventDone.bind(null, err)); }
              if (!event) {
                completed = true;
                return setImmediate(eventDone);
              }

              if (!event.attachments) { return setImmediate(eventDone); }

              const newAttachments = [];
              Object.keys(event.attachments).forEach((key) => {
                const att = event.attachments[key];
                att.id = att.fileName;
                newAttachments.push(att);
              });

              const update = {
                $set: {
                  attachments: newAttachments,
                },
              };
	      eventsCol.updateOne({ _id: event._id }, update, eventDone);
            });
          }
        });
      },
      function retrieveCollectionNames(stepDone) {
        context.database.db.collectionNames({ namesOnly: true }, (err, names) => {
          if (err) {
            context.logError(err, 'retrieving collection names');
            return stepDone(err);
          }

          names = names.map((name) => name.substr(name.indexOf('.') + 1));
          collectionNames = _.object(names, names);
          stepDone();
        });
      },
      function renameBookmarksCollection(stepDone) {
        const colName = `${user._id}.bookmarks`;
        if (!collectionNames[colName]) {
          context.logInfo('Skipping bookmarks collection rename (cannot find collection)');
          return stepDone();
        }

        context.database.getCollection({ name: colName }, (err, bookmarksCol) => {
          if (err) {
            context.logError(err, 'retrieving bookmarks collection');
            return stepDone(err);
          }

          bookmarksCol.rename(`${user._id}.followedSlices`,
            context.stepCallbackFn('renaming bookmarks collection', stepDone));
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
