/*global describe, before, beforeEach, it */

require('./test-helpers'); 
var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    childProcess = require('child_process'),
    ErrorIds = require('components/errors').ErrorIds,
    validation = helpers.validation,
    methodsSchema = require('../src/schema/accountMethods'),
    pwdResetReqsStorage = helpers.dependencies.storage.passwordResetRequests,
    should = require('should'),
    storage = helpers.dependencies.storage.users,
    storageSize = helpers.dependencies.storage.size,
    testData = helpers.data,
    _ = require('lodash');

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

    it('must return the user\'s account details', function (done) {
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

    it('must be forbidden to non-personal accesses', function (done) {
      request.get(basePath, testData.accesses[4].token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  describe('PUT /', function () {

    beforeEach(resetUsers);

    it('must modify account details with the sent data, notifying register if e-mail changed',
      function (done) {
        var settings = _.clone(helpers.dependencies.settings);
        var updatedData = {
          email: 'userzero.new@test.com',
          language: 'zh'
        };

        // setup registration server mock

        var regServerCalled = false;
        helpers.instanceTestSetup.set(settings, {
          context: _.defaults({username: user.username}, settings.services.register),
          execute: function () {
            var path = '/users/' + this.context.username + '/change-email';
            require('nock')(this.context.url).post(path)
                .matchHeader('Authorization', this.context.key)
                .reply(200, 
                  function (uri, requestBody) {
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

              var expected = _.defaults(updatedData, user);
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
              validation.checkStoredItem(updatedUser, 'user');
              stepDone();
            });
          }
        ], done);
      });

    it('must return a correct error if the sent data is badly formatted', function (done) {
      request.put(basePath).send({badProperty: 'bad value'}).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must be forbidden to non-personal accesses', function (done) {
      request
        .put(basePath, testData.accesses[4].token)
        .send({language: 'zh'}).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  describe('storage space monitoring', function () {

    // when checking files storage size we allow a small 1k error margin to account for folder sizes

    // tests the computation of user storage size which is used from different API methods
    // (so we're not directly testing an API method here)
    it('must properly compute used storage size for a given user when called', function (done) {
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
            storageUsed.attachedFiles.should.be.approximately(expectedAttsSize, 1024);

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
            // SPURIOUS Comparison sometimes fails by more than 1024.
            storageUsed.attachedFiles.should.be.approximately(initialStorageUsed.attachedFiles +
                newAtt.size, 1024);
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
    it('must properly compute storage size for all users in nightly script', function (done) {
      var initialStorageUsed,
          newAtt = testData.attachments.image;
      async.series([
        runNightlyScript,
        function verifyInitial(stepDone) {
          storage.findAll(null, function (err, accounts) {
            accounts.forEach(function (account) {
              account.storageUsed.dbDocuments.should.be.above(0);
            });
            initialStorageUsed = _.find(accounts, {id: user.id}).storageUsed;
            initialStorageUsed.attachedFiles.should.be.above(0);
            stepDone();
          });
        },
        addEventWithAttachment.bind(null, newAtt),
        runNightlyScript,
        function verifyUpdated(stepDone) {
          storage.findOne({id: user.id}, null, function (err, account) {
            account.storageUsed.dbDocuments.should.be.above(initialStorageUsed.dbDocuments);
            account.storageUsed.attachedFiles.should.be.approximately(
                initialStorageUsed.attachedFiles + newAtt.size, 1024);
            stepDone();
          });
        }
      ], done);

      // TODO: move all cron stuff to separate module (in common lib?) and call it from here
      function runNightlyScript(callback) {
        var worker = childProcess.fork(
            __dirname + '/../src/runNightlyTasks.js',
            process.argv.slice(2));
        worker.on('exit', function (code) {
          callback(code !== 0 ?
              new Error('Cache cleanup unexpectedly failed (see logs for details)') : null);
        });
      }
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

    it('must be approximately updated (diff) when adding an attached file', function (done) {
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
                    initialStorageUsed.attachedFiles + newAtt.size, 1024);
            stepDone();
          });
        }
      ], done);
    });

    it('must be approximately updated (diff) when deleting an attached file', function (done) {
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
                initialStorageUsed.attachedFiles - deletedAtt.size, 1024);
            stepDone();
          });
        }
      ], done);
    });

    it('must be approximately updated (diff) when deleting an event', function (done) {
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
                initialStorageUsed.attachedFiles - getTotalAttachmentsSize(deletedEvt), 1024);
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

    it('must change the password to the given value', function (done) {
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

    it('must return an error if the given old password does not match', function (done) {
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

    it('must return a correct error if the sent data is badly formatted', function (done) {
      request.post(path).send({badProperty: 'bad value'}).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must be forbidden to non-personal accesses', function (done) {
      request.post(path, testData.accesses[4].token).send({some: 'data'}).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  describe('/request-password-reset and /reset-password', function () {

    beforeEach(resetUsers);

    var requestPath = basePath + '/request-password-reset',
        resetPath = basePath + '/reset-password',
        authData = {appId: 'pryv-test'};

    it('"request" must trigger an email with a reset token, store that token, ' +
       'then "reset" must reset the password to the given value', function (done) {
      var settings = _.clone(helpers.dependencies.settings),
          resetToken = null,
          newPassword = 'Dr0ws$4p';

      // setup mail server mock

      helpers.instanceTestSetup.set(settings, {
        context: settings.services.email,
        execute: function () {
          require('nock')(this.context.url).post(this.context.sendMessagePath)
              .reply(200, function (uri, requestBody) {
            var body = JSON.parse(requestBody);
            var token = body.message.global_merge_vars[1].content; /* HACK, assume structure */
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
          pwdResetReqsStorage.get(resetToken, function (err, resetReq) {
            should.exist(resetReq);
            stepDone();
          });
        },
        function doReset(stepDone) {
          var data = _.defaults({
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

    it('"request" must return an error if the requesting app is not trusted', function (done) {
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

    it('"request" must return an error if sent data is badly formatted', function (done) {
      request.post(requestPath).send({badParam: '?'})
          .unset('authorization')
          .end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('"reset" must return an error if the reset token is invalid/expired', function (done) {
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

    it('"reset" must return an error if the requesting app is not trusted', function (done) {
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

    it('"reset" must return an error if sent data is badly formatted', function (done) {
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
