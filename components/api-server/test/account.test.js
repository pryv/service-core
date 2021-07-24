/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, it */

require('./test-helpers'); 
const fs = require('fs');
const assert = require('chai').assert;
const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const async = require('async');
const ErrorIds = require('errors').ErrorIds;
const validation = helpers.validation;
const methodsSchema = require('../src/schema/accountMethods');
const pwdResetReqsStorage = helpers.dependencies.storage.passwordResetRequests;
const should = require('should');
const storage = helpers.dependencies.storage.user.events;
const storageSize = helpers.dependencies.storage.size;
const testData = helpers.data;
const _ = require('lodash');
const bluebird = require('bluebird');
const { getUsersRepository } = require('business/src/users');

let usersRepository = null;

describe('account', function () {
  const user = Object.assign({}, testData.users[0]);
  
  before(async () => {
    usersRepository = await getUsersRepository(); 
  });
  
  let basePath = '/' + user.username + '/account';
  let request = null; // must be set after server instance started

  // to verify data change notifications
  var accountNotifCount;
  server.on('account-changed', function () { accountNotifCount++; });

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      testData.resetEvents,
      testData.resetProfile,
      testData.resetFollowedSlices,
      
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

    beforeEach(async () => { await resetUsers() });

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
    beforeEach(async () => { await resetUsers() });

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
            const scope = require('nock')(this.context.url);
            scope.put('/users')
              .matchHeader('Authorization', this.context.key)
              .reply(200, function (uri, requestBody) {
                this.context.messagingSocket.emit('reg-server-called', requestBody);
              }.bind(this));
          }
        });
        
        // fetch service call data from server process
        server.on('reg-server-called', function (sentData) {
          sentData.should.eql({
            fieldsToDelete: {},
            user: {
              email: [
                {
                  creation: false,
                  isActive: true,
                  isUnique: true,
                  value: updatedData.email
                }],
              language: [
                {
                  creation: false,
                  isActive: true,
                  isUnique: false,
                  value: updatedData.language,
                }
              ]
            },
            username: user.username
          });
          regServerCalled = true;
        });
        async.series([
          server.ensureStarted.bind(server, settings),
          function update (stepDone) {
            request.put(basePath).send(updatedData).end(function (res) {
              //jshint -W030
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
          async function verifyData () {           
            const retrievedUser = await usersRepository.getUserByUsername(user.username);
            validation.checkStoredItem(retrievedUser.getAccountWithId(), 'user');
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
        .send({ language: 'zh' }).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  let filesystemBlockSize = 1024;

  function getFilesystemBlockSize(done) {
    const testFilePath = './file_test.txt';
    const testValue = '0';
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
    it('[NFJQ] must properly compute used storage size for a given user when called', async () => {
      let newAtt = testData.attachments.image;

      let storageUsed = await storageSize.computeForUser(user);
      assert.isAbove(storageUsed.dbDocuments, 0);

      const expectedAttsSize = _.reduce(testData.events, function (total, evt) {
        return total + getTotalAttachmentsSize(evt);
      }, 0);
      
      // On Ubuntu with ext4 FileSystem the size difference is 4k, not 1k. I still dunno why.
      assert.approximately(storageUsed.attachedFiles, expectedAttsSize, filesystemBlockSize);
      const initialStorageUsed = storageUsed;

      await bluebird.fromCallback(cb => addEventWithAttachment(newAtt, cb));
      storageUsed = await storageSize.computeForUser(user);
      
      // hard to know what the exact difference should be, so we just expect it's bigger
      assert.isAbove(storageUsed.dbDocuments, initialStorageUsed.dbDocuments);
      assert.approximately(storageUsed.attachedFiles, initialStorageUsed.attachedFiles +
        newAtt.size, filesystemBlockSize);
      const updatedStorageUsed = storageUsed;
      const retrievedUser = await usersRepository.getUserById(user.id);
      assert.deepEqual(retrievedUser.storageUsed, updatedStorageUsed);
    });

    // test nightly job script
    it('[Y445] must properly compute storage size for all users in nightly script', async function () {
      const newAtt = testData.attachments.image;
      const execSync = require('child_process').execSync;

      // Initial nightly task
      execSync('node ./bin/nightly');
      
      // Verify initial storage usage
      const initialStorageUsed = await storageSize.computeForUser(user);
      initialStorageUsed.attachedFiles.should.be.above(0);
      
      // Add an attachment
      await bluebird.fromCallback(
        (cb) => addEventWithAttachment(newAtt, cb));
      
      // Another nightly task
      execSync('node ./bin/nightly');
      
      // Verify updated storage usage
      const updatedStorageUsed = await storageSize.computeForUser(user);

      updatedStorageUsed.dbDocuments.should.be.above(initialStorageUsed.dbDocuments);
      updatedStorageUsed.attachedFiles.should.be.approximately(
        initialStorageUsed.attachedFiles + newAtt.size, filesystemBlockSize);
    });

    function addEventWithAttachment (attachment, callback) {
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
        async function checkInitial () {
          const retrievedUser = await usersRepository.getUserById(user.id);
          initialStorageUsed = retrievedUser.storageUsed;
        },
        function addAttachment(stepDone) {
          request.post('/' + user.username + '/events/' + testData.events[0].id)
              .attach('image', newAtt.path, newAtt.filename)
              .end(function (res) {
                validation.check(res, {status: 200});
                stepDone();
              });
        },
        async function checkUpdated () {
          const retrievedUser = await usersRepository.getUserById(user.id);
          initialStorageUsed = retrievedUser.storageUsed;
          retrievedUser.storageUsed.dbDocuments.should.eql(initialStorageUsed.dbDocuments);
          retrievedUser.storageUsed.attachedFiles.should.be.approximately(
                  initialStorageUsed.attachedFiles + newAtt.size, filesystemBlockSize);
        }
      ], done);
    });

    it('[93AP] must be approximately updated (diff) when deleting an attached file', async function () {
      const deletedAtt = testData.events[0].attachments[0];
      const initialStorageUsed = await storageSize.computeForUser(user);

      const path = '/' + user.username + '/events/' + testData.events[0].id + '/' +
        deletedAtt.id;
      try { 
        await request.del(path);
      } catch (e) {
        // not an error, but the callback returns the response in 1st position
        // either we do the request with superagent, or we update request()
      }
      
      const updatedStoragedUsed = await storageSize.computeForUser(user);
      assert.equal(updatedStoragedUsed.dbDocuments, initialStorageUsed.dbDocuments);
      assert.approximately(updatedStoragedUsed.attachedFiles, 
        initialStorageUsed.attachedFiles - deletedAtt.size,
        filesystemBlockSize);
    });

    it('[5WO0] must be approximately updated (diff) when deleting an event', async function () {
      const deletedEvt = testData.events[2];
      const deletedEvtPath = '/' + user.username + '/events/' + deletedEvt.id;
      const initialStorageUsed = await storageSize.computeForUser(user);
      try { 
        await request.del(deletedEvtPath)
      } catch (e) {}
      try { 
        await request.del(deletedEvtPath)
      } catch (e) {}
        
      const updatedStoragedUsed = await storageSize.computeForUser(user);
      assert.equal(updatedStoragedUsed.dbDocuments, initialStorageUsed.dbDocuments);
      assert.approximately(updatedStoragedUsed.attachedFiles, 
        initialStorageUsed.attachedFiles - getTotalAttachmentsSize(deletedEvt),
        filesystemBlockSize);
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

    beforeEach(async () => { await resetUsers });

    var path = basePath + '/change-password';

    it('[6041] must change the password to the given value', function (done) {
      var data = {
        oldPassword: user.password,
        newPassword: 'Dr0ws$4p'
      };
      async.series([
        function changePassword (stepDone) {
          request.post(path).send(data).end(function (res) { 
            validation.check(res, {
              status: 200,
              schema: methodsSchema.changePassword.result
            });
            accountNotifCount.should.eql(1, 'account notifications');
            stepDone();
          });
        },
        function verifyNewPassword (stepDone) {
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

    beforeEach(async () => { await resetUsers });

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
            .reply(200, function (uri, body) {
              var token = body.message.global_merge_vars[0].content; // HACK, assume structure 
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

  async function resetUsers() {
    accountNotifCount = 0;
    await testData.resetUsers();
  }

  function cleanUpDetails(accountDetails) {
    delete accountDetails.storageUsed;
  }

});
