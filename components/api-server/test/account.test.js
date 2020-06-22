/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, it */

require('./test-helpers'); 
const fs = require('fs');

const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const async = require('async');
const ErrorIds = require('components/errors').ErrorIds;
const validation = helpers.validation;
const methodsSchema = require('../src/schema/accountMethods');
const pwdResetReqsStorage = helpers.dependencies.storage.passwordResetRequests;
const should = require('should');
const storage = helpers.dependencies.storage.users;
const storageSize = helpers.dependencies.storage.size;
const testData = helpers.data;
const _ = require('lodash');
const bluebird = require('bluebird');

describe('account', function () {

  var user = testData.users[0],
      basePath = '/' + user.username + '/account',
      request = null; // must be set after server instance started

  // to verify data change notifications
  var accountNotifCount;
  server.on('account-changed', function () { accountNotifCount++; });

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      testData.resetProfile,
      testData.resetFollowedSlices,
      testData.resetEvents,
      testData.resetStreams,
      testData.resetAttachments,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      }
    ], done);
  });

  describe('GET /', function () {

    before(resetUsers);

    it('[PHSB] must return the user\'s account details', function (done) {
      request.get(basePath).end(function (res) {
        var expected = _.clone(user);
        delete expected.id;
        delete expected.password;
        delete expected.storageUsed;
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {account: expected},
          sanitizeFn: cleanUpDetails,
          sanitizeTarget: 'account'
        }, done);
      });
    });

    it('[K5EI] must be forbidden to non-personal accesses', function (done) {
      request.get(basePath, testData.accesses[4].token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  describe('PUT /', function () {

    beforeEach(resetUsers);

    it('[0PPV] must modify account details with the sent data, notifying register if e-mail changed',
      function (done) {
        const settings = _.cloneDeep(helpers.dependencies.settings);
        const updatedData = {
          email: 'userzero.new@test.com',
          language: 'zh'
        };

        // setup registration server mock
        let regServerCalled = false;
        helpers.instanceTestSetup.set(settings, {
          context: _.defaults({username: user.username}, settings.services.register),
          execute: function () {
            const path = '/users/' + this.context.username + '/change-email';
            require('nock')(this.context.url).post(path)
              .matchHeader('Authorization', this.context.key)
              .reply(200, function (uri, requestBody) {
                this.context.messagingSocket.emit('reg-server-called', JSON.parse(requestBody));
              }.bind(this));
          }
        });
        
        // fetch service call data from server process
        server.on('reg-server-called', function (sentData) {
          sentData.should.eql({email: updatedData.email});
          regServerCalled = true;
        });

        async.series([
          server.ensureStarted.bind(server, settings),
          function update(stepDone) {
            request.put(basePath).send(updatedData).end(function (res) {
              /*jshint -W030*/
              regServerCalled.should.be.ok;

              let expected = _.defaults(updatedData, user);
              delete expected.id;
              delete expected.password;
              delete expected.storageUsed;
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result,
                body: {account: expected},
                sanitizeFn: cleanUpDetails,
                sanitizeTarget: 'account'
              });
              accountNotifCount.should.eql(1, 'account notifications');
              stepDone();
            });
          },
          function verifyData(stepDone) {
            storage.findOne({id: user.id}, null, function (err, updatedUser) {
              if(err) {
                return stepDone(err);
              }
              validation.checkStoredItem(updatedUser, 'user');
              stepDone();
            });
          }
        ], done);
      });

    it('[AT0V] must return a correct error if the sent data is badly formatted', function (done) {
      request.put(basePath).send({badProperty: 'bad value'}).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[NZE2] must be forbidden to non-personal accesses', function (done) {
      request
        .put(basePath, testData.accesses[4].token)
        .send({language: 'zh'}).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  let filesystemBlockSize = 1024;

  function getFilesystemBlockSize(done) {
    const testFilePath = './file_test.txt';
    const testValue = 0;
    fs.writeFile(testFilePath, testValue, (err) => {
      if (err) throw err;

      fs.stat(testFilePath, (err, status) => {
        if (err) throw err;
        filesystemBlockSize = status.blksize;

        fs.unlink(testFilePath, (err) => {
          if (err) throw err;

          done();
        });
      });
    });
  }

  describe('storage space monitoring', function () {
    before(getFilesystemBlockSize);

    // when checking files storage size we allow a small 1k error margin to account for folder sizes

    // tests the computation of user storage size which is used from different API methods
    // (so we're not directly testing an API method here)
    it('[NFJQ] must properly compute used storage size for a given user when called', function (done) {
      var initialStorageUsed,
          updatedStorageUsed,
          newAtt = testData.attachments.image;
      async.series([
        function computeInitial(stepDone) {
          storageSize.computeForUser(user, function (err, storageUsed) {
            should.not.exist(err);

            storageUsed.dbDocuments.should.be.above(0);

            var expectedAttsSize = _.reduce(testData.events, function (total, evt) {
              return total + getTotalAttachmentsSize(evt);
            }, 0);

            // On Ubuntu with ext4 FileSystem the size difference is 4k, not 1k. I still dunno why.
            storageUsed.attachedFiles.should.be.approximately(expectedAttsSize, filesystemBlockSize);

            initialStorageUsed = storageUsed;

            stepDone();
          });
        },
        addEventWithAttachment.bind(null, newAtt),
        function computeUpdated(stepDone) {
          storageSize.computeForUser(user, function (err, storageUsed) {
            should.not.exist(err);
            // hard to know what the exact difference should be, so we just expect it's bigger
            storageUsed.dbDocuments.should.be.above(initialStorageUsed.dbDocuments);
            storageUsed.attachedFiles.should.be.approximately(initialStorageUsed.attachedFiles +
                newAtt.size, filesystemBlockSize);
            updatedStorageUsed = storageUsed;
            stepDone();
          });
        },
        function verifyAccount(stepDone) {
          storage.findOne({id: user.id}, null, function (err, account) {
            account.storageUsed.should.eql(updatedStorageUsed);
            stepDone();
          });
        }
      ], done);
    });

    // test nightly job script
    it('[Y445] must properly compute storage size for all users in nightly script', async function () {
      let initialStorageUsed;
      const newAtt = testData.attachments.image;
      const execSync = require('child_process').execSync;

      // Initial nightly task
      execSync('node ./bin/nightly');
      
      // Verify initial storage usage
      const accounts = await bluebird.fromCallback(
        (cb) => storage.findAll(null, cb));
        
      initialStorageUsed = _.find(accounts, {id: user.id}).storageUsed;
      initialStorageUsed.attachedFiles.should.be.above(0);
      
      // Add an attachment
      await bluebird.fromCallback(
        (cb) => addEventWithAttachment(newAtt, cb));
      
      // Another nightly task
      execSync('node ./bin/nightly');
      
      // Verify updated storage usage
      const account = await bluebird.fromCallback(
        (cb) => storage.findOne({id: user.id}, null, cb));
        
      account.storageUsed.dbDocuments.should.be.above(initialStorageUsed.dbDocuments);
      account.storageUsed.attachedFiles.should.be.approximately(
        initialStorageUsed.attachedFiles + newAtt.size, filesystemBlockSize);
    });

    function addEventWithAttachment(attachment, callback) {
      request.post('/' + user.username + '/events')
        .field('event', JSON.stringify({ type: 'test/i', streamId: testData.streams[0].id }))
        .attach('image', attachment.path, attachment.filename)
        .end(function (res) {
          validation.check(res, {status: 201});
          callback();
        });
    }

    it('[0QVH] must be approximately updated (diff) when adding an attached file', function (done) {
      var initialStorageUsed,
          newAtt = testData.attachments.image;
      async.series([
        function checkInitial(stepDone) {
          storage.findOne({id: user.id}, null, function (err, account) {
            initialStorageUsed = account.storageUsed;
            stepDone();
          });
        },
        function addAttachment(stepDone) {
          request.post('/' + user.username + '/events/' + testData.events[0].id)
              .attach('image', newAtt.path, newAtt.filename)
              .end(function (res) {
                validation.check(res, {status: 200});
                stepDone();
              });
        },
        function checkUpdated(stepDone) {
          storage.findOne({id: user.id}, null, function (err, account) {
            account.storageUsed.dbDocuments.should.eql(initialStorageUsed.dbDocuments);
            account.storageUsed.attachedFiles.should.be.approximately(
                    initialStorageUsed.attachedFiles + newAtt.size, filesystemBlockSize);
            stepDone();
          });
        }
      ], done);
    });

    it('[93AP] must be approximately updated (diff) when deleting an attached file', function (done) {
      var initialStorageUsed,
          deletedAtt = testData.events[0].attachments[0];
      async.series([
        function checkInitial(stepDone) {
          storage.findOne({id: user.id}, null, function (err, account) {
            initialStorageUsed = account.storageUsed;
            stepDone();
          });
        },
        function deleteAttachment(stepDone) {
          var urlPath = '/' + user.username + '/events/' + testData.events[0].id + '/' +
              deletedAtt.id;
          request.del(urlPath).end(function (res) {
            validation.check(res, {status: 200});
            stepDone();
          });
        },
        function checkUpdated(stepDone) {
          storage.findOne({id: user.id}, null, function (err, account) {
            account.storageUsed.dbDocuments.should.eql(initialStorageUsed.dbDocuments);
            account.storageUsed.attachedFiles.should.be.approximately(
                initialStorageUsed.attachedFiles - deletedAtt.size, filesystemBlockSize);
            stepDone();
          });
        }
      ], done);
    });

    it('[5WO0] must be approximately updated (diff) when deleting an event', function (done) {
      var initialStorageUsed,
          deletedEvt = testData.events[2],
          deletedEvtPath = '/' + user.username + '/events/' + deletedEvt.id;
      async.series([
        function checkInitial(stepDone) {
          storage.findOne({id: user.id}, null, function (err, account) {
            initialStorageUsed = account.storageUsed;
            stepDone();
          });
        },
        function trashEvent(stepDone) {
          request.del(deletedEvtPath).end(function (res) {
            validation.check(res, {status: 200});
            stepDone();
          });
        },
        function deleteEvent(stepDone) {
          request.del(deletedEvtPath).end(function (res) {
            validation.check(res, {status: 200});
            stepDone();
          });
        },
        function checkUpdated(stepDone) {
          storage.findOne({id: user.id}, null, function (err, account) {
            account.storageUsed.dbDocuments.should.eql(initialStorageUsed.dbDocuments);
            account.storageUsed.attachedFiles.should.be.approximately(
              initialStorageUsed.attachedFiles - getTotalAttachmentsSize(deletedEvt), filesystemBlockSize);
            stepDone();
          });
        }
      ], done);
    });

    function getTotalAttachmentsSize(event) {
      if (! event.attachments) {
        return 0;
      }
      return _.reduce(event.attachments, function (evtTotal, att) {
        return evtTotal + att.size;
      }, 0);
    }

  });

  describe('/change-password', function () {

    beforeEach(resetUsers);

    var path = basePath + '/change-password';

    it('[6041] must change the password to the given value', function (done) {
      var data = {
        oldPassword: user.password,
        newPassword: 'Dr0ws$4p'
      };
      async.series([
        function changePassword(stepDone) {
          request.post(path).send(data).end(function (res) {
            validation.check(res, {
              status: 200,
              schema: methodsSchema.changePassword.result
            });
            accountNotifCount.should.eql(1, 'account notifications');
            stepDone();
          });
        },
        function verifyNewPassword(stepDone) {
          request.login(_.defaults({password: data.newPassword}, user), stepDone);
        }
      ], done);
    });

    it('[STWH] must return an error if the given old password does not match', function (done) {
      var data = {
        oldPassword: 'bad-password',
        newPassword: 'Dr0ws$4p'
      };
      request.post(path).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation
        }, done);
      });
    });

    it('[8I1N] must return a correct error if the sent data is badly formatted', function (done) {
      request.post(path).send({badProperty: 'bad value'}).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[J5VH] must be forbidden to non-personal accesses', function (done) {
      request.post(path, testData.accesses[4].token).send({some: 'data'}).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  describe('/request-password-reset and /reset-password', function () {

    beforeEach(resetUsers);

    const requestPath = basePath + '/request-password-reset';
    const resetPath = basePath + '/reset-password';
    const authData = {appId: 'pryv-test'};

    it('[G1VN] "request" must trigger an email with a reset token, store that token, ' +
       'then "reset" must reset the password to the given value', function (done) {
      let settings = _.cloneDeep(helpers.dependencies.settings);
      let resetToken;
      const newPassword = 'Dr0ws$4p';
      
      settings.services.email.enabled = true;
      
      // setup mail server mock

      helpers.instanceTestSetup.set(settings, {
        context: settings.services.email,
        execute: function () {
          require('nock')(this.context.url).post('')
            .reply(200, function (uri, requestBody) {
              var body = JSON.parse(requestBody);
              var token = body.message.global_merge_vars[0].content; /* HACK, assume structure */
              this.context.messagingSocket.emit('password-reset-token', token);
            }.bind(this));
        }
      });
      // fetch reset token from server process
      server.on('password-reset-token', function (token) {
        resetToken = token;
      });

      async.series([
        server.ensureStarted.bind(server, settings),
        function requestReset(stepDone) { 
          request.post(requestPath)
            .unset('authorization')
            .set('Origin', 'http://test.pryv.local')
            .send(authData)
            .end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.requestPasswordReset.result
              }, stepDone);
            });
        },
        function verifyStoredRequest(stepDone) {
          should.exist(resetToken);
          pwdResetReqsStorage.get(
            resetToken,
            user.username,
            function (err, resetReq) {
              should.exist(resetReq);
              should(resetReq._id).be.equal(resetToken);
              should(resetReq.username).be.equal(user.username);
              stepDone();
            }
          );
        },
        function doReset(stepDone) {
          const data = _.defaults({
            resetToken: resetToken,
            newPassword: newPassword
          }, authData);
          request.post(resetPath).send(data)
            .unset('authorization')
            .set('Origin', 'http://test.pryv.local')
            .end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.resetPassword.result
              }, stepDone);
            });
        },
        function verifyNewPassword(stepDone) {
          request.login(_.defaults({password: newPassword}, user), stepDone);
        }
      ], done);
    });
    
    it('[HV0V] must not trigger a reset email if mailing is deactivated', function (done) {
      let settings = _.cloneDeep(helpers.dependencies.settings);
      settings.services.email.enabled = false;
      testResetMailNotSent(settings, done);
    });
    
    it('[VZ1W] must not trigger a reset email if reset mail is deactivated', function (done) {
      let settings = _.cloneDeep(helpers.dependencies.settings);
      settings.services.email.enabled = {
        resetPassword: false
      };
      testResetMailNotSent(settings, done);
    });
    
    function testResetMailNotSent (settings, callback) {
      let mailSent = false;
          
      // setup mail server mock
      helpers.instanceTestSetup.set(settings, {
        context: settings.services.email.mandrill,
        execute: function () {
          require('nock')(this.context.url).post(this.context.sendMessagePath)
            .reply(200, function () {
              this.context.messagingSocket.emit('password-reset-token');
            }.bind(this));
        }
      });
      // fetch reset token from server process
      server.on('password-reset-token', function () {
        mailSent = true;
        return callback('Reset email should not be sent!');
      });

      async.series([
        server.ensureStarted.bind(server, settings),
        function requestReset(stepDone) {
          request.post(requestPath)
            .unset('authorization')
            .set('Origin', 'http://test.pryv.local')
            .send(authData)
            .end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.requestPasswordReset.result
              });
              mailSent.should.eql(false);
              stepDone();
            });
        },
      ], callback);
    }

    it('[3P2N] must not be possible to use a reset token to illegally change password of another user', function (done) {
      let resetToken = null;
      const newPassword = 'hackingYourPassword';
      const user1 = testData.users[1];

      async.series([
        function generateResetToken(stepDone) {
          // generate a reset token for user1
          pwdResetReqsStorage.generate(
            user1.username,
            function (err, token) {
              should.exist(token);
              resetToken = token;
              stepDone();
            }
          );
        },
        function doReset(stepDone) {
          var data = _.defaults({
            resetToken: resetToken,
            newPassword: newPassword
          }, authData);
          // use user1's resetToken to reset user0's password
          request.post(resetPath).send(data)
            .unset('authorization')
            .set('Origin', 'http://test.pryv.local')
            .end(function (res) {
              validation.checkError(res, {
                status: 401,
                id: ErrorIds.InvalidAccessToken
              }, stepDone);
            });
        }
      ], done);
    });

    it('[J6GB] "request" must return an error if the requesting app is not trusted', function (done) {
      request.post(requestPath).send({appId: 'bad-app-id'})
          .unset('authorization')
          .set('Origin', 'http://test.pryv.local')
          .end(function (res) {
        validation.checkError(res, {
          status: 401,
          id: ErrorIds.InvalidCredentials
        }, done);
      });
    });

    it('[5K14] "request" must return an error if sent data is badly formatted', function (done) {
      request.post(requestPath).send({badParam: '?'})
          .unset('authorization')
          .end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[PKBP] "reset" must return an error if the reset token is invalid/expired', function (done) {
      var data = _.defaults({
        resetToken: 'bad-token',
        newPassword: '>-=(♥️)=-<'
      }, authData);
      request.post(resetPath).send(data)
          .unset('authorization')
          .set('Origin', 'http://test.pryv.local')
          .end(function (res) {
        validation.checkError(res, {
          status: 401,
          id: ErrorIds.InvalidAccessToken
        }, done);
      });
    });

    it('[ON9V] "reset" must return an error if the requesting app is not trusted', function (done) {
      request.post(resetPath).send({ resetToken: '?', newPassword: '123456', appId: 'bad-app-id' })
          .unset('authorization')
          .set('Origin', 'http://test.pryv.local')
          .end(function (res) {
        validation.checkError(res, {
          status: 401,
          id: ErrorIds.InvalidCredentials
        }, done);
      });
    });

    it('[T5L9] "reset" must return an error if sent data is badly formatted', function (done) {
      request.post(resetPath).send({badParam: '?'})
          .unset('authorization')
          .end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

  });

  function resetUsers(done) {
    accountNotifCount = 0;
    testData.resetUsers(done);
  }

  function cleanUpDetails(accountDetails) {
    delete accountDetails.storageUsed;
  }

});
