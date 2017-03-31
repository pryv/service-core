/*global describe, it */

var async = require('async'),
    helpers = require('components/test-helpers'),
    fs = require('fs'),
    nixt = require('nixt'),
    should = require('should'),
    storage = helpers.dependencies.storage,
    _ = require('lodash');

describe('"delete user" script', function () {

  it('should remove the given user account entirely, asking for confirmation', function (done) {
    var user = helpers.data.users[0],
        originalCount;

    async.series([
      // setup test user
      helpers.data.resetUsers,
      helpers.data.resetAccesses,
      helpers.data.resetEvents,
      helpers.data.resetAttachments,
      helpers.data.resetFollowedSlices,
      helpers.data.resetProfile,
      helpers.data.resetStreams,

      function checkInitialUsers(stepDone) {
        storage.users.countAll(function (err, count) {
          originalCount = count;
          stepDone();
        });
      },
      function checkInitialAttachments(stepDone) {
        var p = storage.user.eventFiles.getAttachedFilePath(user);
        fs.exists(p, function (exists) {
          exists.should.eql(true);
          stepDone();
        });
      },
      function deleteUser(stepDone) {
        nixt().run('node ./src/cli.js delete ' + user.username)
            .on(/Confirm username/).respond(user.username)
            .stdout(/Successfully deleted/)
            .end(stepDone);
      },
      function checkUsers(stepDone) {
        storage.users.findAll(null, function (err, users) {
          should.not.exist(_.find(users, {username: user.username}));
          users.length.should.eql(originalCount - 1, 'users');
          stepDone();
        });
      },
      function checkUserCollections(stepDone) {
        // TODO
        stepDone();
      },
      function checkAttachments(stepDone) {
        var p = storage.user.eventFiles.getAttachedFilePath(user);
        fs.exists(p, function (exists) {
          exists.should.eql(false);
          stepDone();
        });
      }
    ], done);
  });

  it('should return an error if username confirmation does not match', function (done) {
    var user = helpers.data.users[0];

    async.series([
      helpers.data.resetUsers,
      function deleteUser(stepDone) {
        nixt().run('node ./src/cli.js delete ' + user.username)
            .on(/Confirm username/).respond('bad-confirmation')
            .code(1)
            .stdout(/confirmation did not match/)
            .end(stepDone);
      }
    ], done);
  });

  it('should return an error if the user does not exist', function (done) {
    async.series([
      helpers.data.resetUsers,
      function deleteUser(stepDone) {
        nixt().run('node ./src/cli.js delete unknown-user')
            .code(1)
            .stdout(/not found/)
            .end(stepDone);
      }
    ], done);
  });

  it('should stop if the attachments path is not as expected', function (done) {
    async.series([
      function deleteUser(stepDone) {
        nixt().run('pryvuser delete')
            .code(1)
            .stdout(/path is not as expected/)
            .end(stepDone);
      }
    ], done);
  });

});
