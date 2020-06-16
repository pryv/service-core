const async = require('async');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { toString } = require('components/utils');
const _ = require('lodash');

/**
 * v0.3.0:
 *
 * - Rename folders into streams
 * - Remove channels, migrate as root level streams
 * - Adjust accesses and events accordingly
 *
 * Limitations (not a production-level migration):
 *
 * - Doesn't check for duplicate ids
 * - Error handling and logging is minimal
 */
module.exports = function (context, callback) {
  context.database.getCollection({ name: 'users' }, (err, usersCol) => {
    if (err) { return callback(err); }

    usersCol.find({}).toArray((err, users) => {
      if (err) { return callback(err); }

      async.forEachSeries(users, migrateUser, (err) => {
        if (err) { return callback(err); }

        context.logInfo('Data version is now 0.3.0');
        callback();
      });
    });
  });

  function migrateUser(user, callback) {
    context.logInfo(`Migrating user ${toString.user(user.username)}...`);
    let collectionNames;
    let migratedChannels;
    let channelsCol;
    let streamsCol;
    async.series([
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
      function retrieveChannels(stepDone) {
        const colName = `${user._id}.channels`;
        if (!collectionNames[colName]) {
          context.logInfo('Skipping channels migration (cannot find collection)');
          return stepDone();
        }

        context.database.getCollection({ name: colName }, (err, cCol) => {
          if (err) {
            context.logError(err, 'retrieving channels collection');
            return stepDone(err);
          }

          channelsCol = cCol;

          channelsCol.find({}).toArray((err, channels) => {
            if (err) {
              context.logError(err, 'retrieving channels');
              return stepDone(err);
            }

            // change to stream structure
            channels.forEach((item) => {
              item.parentId = null;
              if (item.enforceNoEventsOverlap) {
                item.singleActivity = true;
                delete item.enforceNoEventsOverlap;
              }
            });
            migratedChannels = channels;

            stepDone();
          });
        });
      },
      function renameFoldersCollection(stepDone) {
        const colName = `${user._id}.folders`;
        if (!collectionNames[colName]) {
          context.logInfo('Skipping folders collection rename (cannot find collection)');
          return stepDone();
        }

        context.database.getCollection({ name: colName }, (err, foldersCol) => {
          if (err) {
            context.logError(err, 'retrieving folders collection');
            return stepDone(err);
          }

          foldersCol.rename(`${user._id}.streams`,
            context.stepCallbackFn('renaming folders collection', stepDone));
        });
      },
      function migrateStreamsStructure(stepDone) {
        context.database.getCollection({ name: `${user._id}.streams` }, (err, sCol) => {
          if (err) {
            context.logError(err, 'retrieving streams collection');
            return stepDone(err);
          }
          streamsCol = sCol;

          const streamsCursor = streamsCol.find();
          let completed = false;
          async.until(() => completed, migrateStream,
            context.stepCallbackFn('migrating streams structure', stepDone));

          function migrateStream(eventDone) {
            streamsCursor.nextObject((err, stream) => {
              if (err) { return eventDone(err); }
              if (!stream) {
                completed = true;
                return eventDone();
              }

              const update = {
                $set: {
                  parentId: stream.parentId ? stream.parentId : stream.channelId,
                },
                $unset: { channelId: 1, hidden: 1 },
              };
	      streamsCol.updateOne({ _id: stream._id }, update, eventDone);
            });
          }
        });
      },
      function insertMigratedChannelsAsRootStreams(stepDone) {
        if (!migratedChannels) { return stepDone(); } // skip
        streamsCol.insert(migratedChannels,
          context.stepCallbackFn('inserting migrated channels', stepDone));
      },
      function dropChannelsCollection(stepDone) {
        if (!channelsCol) { return stepDone(); } // skip
        channelsCol.drop(context.stepCallbackFn('dropping channels collection', stepDone));
      },

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
              if (access.type === 'personal' || !access.permissions) { return; }

              const newPermissions = [];

              access.permissions.forEach((perm) => {
                if (!perm.folderPermissions || perm.folderPermissions.length === 0) {
                  delete perm.folderPermissions;
                  perm.streamId = perm.channelId;
                  delete perm.channelId;

                  newPermissions.push(perm);
                } else {
                  perm.folderPermissions.forEach((folderPerm) => {
                    folderPerm.streamId = folderPerm.folderId || perm.channelId;
                    delete folderPerm.folderId;

                    newPermissions.push(folderPerm);
                  });
                }
              });

              access.permissions = newPermissions;
            });

            async.series([
              accCol.remove.bind(accCol, {}),
              accCol.insert.bind(accCol, accesses),
            ], context.stepCallbackFn('migrating accesses structure', stepDone));
          });
        });
      },

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
              if (err) { return eventDone(err); }
              if (!event) {
                completed = true;
                return eventDone();
              }

              const update = {
                $set: {
                  streamId: event.folderId ? event.folderId : event.channelId,
                  type: `${event.type.class}/${event.type.format}`,
                },
                $unset: { channelId: 1, folderId: 1 },
                $rename: { value: 'content' },
              };
	      eventsCol.updateOne({ _id: event._id }, update, eventDone);
            });
          }
        });
      },

      function migrateEventAttachmentsStructure(stepDone) {
        const userDir = path.resolve(context.attachmentsDirPath, user._id);
        if (!fs.existsSync(userDir)) {
          context.logInfo('Skipping event attachments migration (no attachments)');
          return stepDone();
        }

        const channelDirs = fs.readdirSync(userDir);
        async.forEachSeries(channelDirs, moveEventDirs,
          context.stepCallbackFn('migrating event attachments structure', stepDone));

        function moveEventDirs(channelDir, channelCallback) {
          // filter out files (shouldn't happen except in tests)
          if (!fs.statSync(path.resolve(userDir, channelDir)).isDirectory()) {
            return channelCallback(null);
          }
          exec(`mv ${path.resolve(userDir, channelDir, '*')} ${path.resolve(userDir, '.')}`,
            (err) => {
              if (err) { return channelCallback(err); }
              fs.rmdir(path.resolve(userDir, channelDir), channelCallback);
            });
        }
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
