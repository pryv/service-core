var async = require('async'),
    output = require('../utils/output'),
    prompt = require('co-prompt'),
    fs = require('fs');

module.exports = function registerDelete(program, logging, usersStorage, accessesStorage,
                                         eventsStorage, eventFilesStorage, followedSlicesStorage,
                                         profileStorage, streamsStorage) {
  program.command('delete <username>')
    .description('Delete user account <username>')
    .action(deleteAccount);

  var logger = logging.getLogger('delete');

  function deleteAccount(username) {
    var user;
    async.series([
      function (stepDone) {
        usersStorage.findOne({username: username}, {}, function (err, u) {
          if (err) {
            logger.debug('Error finding user: ' + err);
            return stepDone(err);
          } else if (!u) {
            return stepDone('User "' + username + '" not found');
          }
          logger.debug('Found user');
          user = u;
          stepDone();
        });
      },
      function confirm(stepDone) {
        prompt('Confirm username: ')(function (err, confirmation) {
          if (confirmation !== username) {
            return stepDone('Username confirmation did not match');
          }
          stepDone();
        });
      },
      function checkAttachmentsPath(stepDone) {
        // If user's account contains attachments then the provided attachments path for this user
        // should exist and should not be empty
        if (user.storageUsed.attachedFiles > 0) {
          fs.readdir(eventFilesStorage.settings.attachmentsDirPath, function (err, files) {
            if (err || !files || files.length <= 0) {
              return stepDone('Provided attachments path is not as expected');
            }
            return stepDone();
          });
        } else {
          stepDone();
        }
      },
      function (stepDone) {
        usersStorage.remove({id: user.id}, function (err) {
          if (err) {
            logger.debug('Error removing user from "users" collection: ' + err);
            return stepDone(err);
          }
          logger.debug('Removed from "users" collection');
          stepDone();
        });
      },
      function (stepDone) {
        var dbCollections = [
          accessesStorage,
          eventsStorage,
          followedSlicesStorage,
          profileStorage,
          streamsStorage
        ];
        async.forEach(dbCollections, dropCollection, stepDone);

        function dropCollection(col, callback) {
          var colName = col.getCollectionInfo(user).name;
          col.dropCollection(user, function (err) {
            if (err) {
              if (/ns not found/.test(err.message)) {
                logger.debug('Collection "' + colName + '" does not exist');
              } else {
                logger.debug('Error dropping collection "' + colName + '"');
                return callback(err);
              }
            } else {
              logger.debug('Dropped collection "' + colName + '"');
            }
            callback();
          });
        }
      },
      function (stepDone) {
        eventFilesStorage.removeAllForUser(user, function (err) {
          if (err) {
            logger.debug('Error removing event files');
            return stepDone(err);
          }
          logger.debug('Removed event files');
          stepDone();
        });
      }
    ], function (err) {
      if (err) {
        output.print('Error deleting user: ' + err);
        process.exit(1);
      } else {
        output.print('Successfully deleted user "' + username + '" (' + user.id + ')');
        process.exit();
      }
    });
  }
};
