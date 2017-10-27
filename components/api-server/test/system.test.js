/*global describe, before, beforeEach, after, it */

var helpers = require('./helpers'),
    ErrorIds = require('components/errors').ErrorIds,
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    methodsSchema = require('../src/schema/systemMethods'),
    validation = helpers.validation,
    encryption = require('components/utils').encryption,
    should = require('should'),
    storage = helpers.dependencies.storage.users,
    request = helpers.request.superagent,
    testData = helpers.data,
    timestamp = require('unix-timestamp'),
    url = require('url'),
    _ = require('lodash'),
    os = require('os'),
    fs = require('fs');

require('date-utils');

describe('system (ex-register)', function () {

  this.timeout(5000);

  function basePath() {
    return url.resolve(server.url, '/system');
  }

  before(server.ensureStarted.bind(server, helpers.dependencies.settings));

  beforeEach(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses
    ], done);
  });

  // NOTE: because we mock the email sending service for user creation and to keep test code simple,
  // test order is important. The first test configures the mock service in order to test email
  // sending, the second one reconfigures it so that it just replies OK for subsequent tests.
  describe('POST /create-user', function () {

    function path() {
      return basePath() + '/create-user';
    }

    function post(data, callback) {
      return request.post(path())
          .set('authorization', helpers.dependencies.settings.auth.adminAccessKey)
          .send(data)
          .end(callback);
    }

    var newUserPassword = '1l0v3p0t1r0nZ';
    var newUserData = {
      username: 'mr-dupotager',
      passwordHash: encryption.hashSync(newUserPassword),
      email: 'dupotager@test.com',
      language: 'fr'
    };

    it('must create a new user with the sent data, sending a welcome email', function (done) {
      var originalCount,
          createdUserId,
          settings = _.clone(helpers.dependencies.settings),
          mailSent = false;

      // setup mail server mock
      helpers.instanceTestSetup.set(settings, {
        context: settings.services.email,
        execute: function () {
          require('nock')(this.context.url).post(this.context.sendMessagePath)
              .reply(200, function (uri, requestBody) {
            var body = JSON.parse(requestBody);
            if (body.message.global_merge_vars[0].content !== 'mr-dupotager' ||
                ! /welcome/.test(body.template_name)) {
              console.log('MISMATCHED REQ BODY: ' + require('util').inspect(body, {depth: null}));
              return;
            }
            this.context.messagingSocket.emit('mail-sent');
          }.bind(this));
        }
      });
      // fetch notification from server process
      server.on('mail-sent', function () {
        mailSent = true;
      });

      async.series([
        server.ensureStarted.bind(server, settings),
        function countInitialUsers(stepDone) {
          storage.countAll(function (err, count) {
            originalCount = count;
            stepDone();
          });
        },
        function registerNewUser(stepDone) {
          post(newUserData, function (err, res) {
            validation.check(res, {
              status: 201,
              schema: methodsSchema.createUser.result
            });
            createdUserId = res.body.id;
            mailSent.should.eql(true);
            stepDone();
          });
        },
        function getUpdatedUsers(stepDone) {
          storage.findAll(null, function (err, users) {
            users.length.should.eql(originalCount + 1, 'users');

            var expected = _.clone(newUserData);
            expected.id = createdUserId;
            expected.storageUsed = { dbDocuments: 0, attachedFiles: 0 };
            var actual = _.find(users, function (user) {
              return user.id === createdUserId;
            });
            validation.checkStoredItem(actual, 'user');
            actual.should.eql(expected);

            stepDone();
          });
        }
      ], done);
    });

    it('must run the process but not save anything for test username "recla"', function (done) {
      var originalCount,
	  createdUserId,
	  settings = _.clone(helpers.dependencies.settings);

      // setup mail server mock, persisting over the next tests
      helpers.instanceTestSetup.set(settings, {
	context: settings.services.email,
	execute: function () {
	  require('nock')(this.context.url).persist()
	      .post(this.context.sendMessagePath)
	      .reply(200);
	}
      });

      async.series([
	server.ensureStarted.bind(server, settings),
        function countInitialUsers(stepDone) {
          storage.countAll(function (err, count) {
            originalCount = count;
            stepDone();
          });
        },
        function registerNewUser(stepDone) {
          var data = {
            username: 'recla',
            passwordHash: encryption.hashSync('youpi'),
            email: 'recla@rec.la',
            language: 'fr'
          };
          post(data, function (err, res) {
            validation.check(res, {
              status: 201,
              schema: methodsSchema.createUser.result
            });
            createdUserId = res.body.id;
            stepDone();
          });
        },
        function getUpdatedUsers(stepDone) {
          storage.findAll(null, function (err, users) {
            users.length.should.eql(originalCount, 'users');
            should.not.exist(_.find(users, {id: createdUserId}));
            stepDone();
          });
        }
      ], done);
    });

    it('must support the old "/register" path for backwards-compatibility', function (done) {
      request.post(url.resolve(server.url, '/register/create-user'))
	  .set('authorization', helpers.dependencies.settings.auth.adminAccessKey)
	  .send(newUserData)
	  .end(function (err, res) {
	validation.check(res, {
	  status: 201
	}, done);
      });
    });

    it('must return a correct 400 error if the sent data is badly formatted', function (done) {
      post({ badProperty: 'bad value' }, function (err, res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must return a correct 400 error if a user with the same user name already exists',
        function (done) {
      var data = {
        username: testData.users[0].username,
        passwordHash: '$-1s-b4d-f0r-U',
        email: 'roudoudou@choupinou.ch',
        language: 'fr'
      };
      post(data, function (err, res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {username: data.username}
        }, done);
      });
    });

    it('must return a correct 404 error when authentication is invalid', function (done) {
      request.post(path()).set('authorization', 'bad-key').send(newUserData)
          .end(function (err, res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

    it('must return a correct error if the content type is wrong', function (done) {
      request.post(path())
          .set('authorization', helpers.dependencies.settings.auth.adminAccessKey)
          .set('Content-Type', 'application/wrongUnexistantType')
          .send(new Buffer('I need to provide a buffer here for superagent not to crash'))
          .end(function (err, res) {
            validation.checkError(res, {
              status: 415,
              id: ErrorIds.UnsupportedContentType
            }, done);
          });
    });

    describe('when we log into a temporary log file', function () {

      let logFilePath = '';

      beforeEach(function (done) {
        async.series([
          ensureLogFileIsEmpty,
          generateLogFile,
          instanciateServerWithLogs
        ], done);
      });

      function ensureLogFileIsEmpty(stepDone) {
        if ( logFilePath.length <= 0 ) return stepDone();
        fs.truncate(logFilePath, function (err) {
          if (err && err.code === 'ENOENT') {
            return stepDone();
          } // ignore error if file doesn't exist
          stepDone(err);
        });
      }

      function generateLogFile(stepDone) {
        logFilePath = os.tmpdir() + '/password-logs.log';
        stepDone();
      }

      function instanciateServerWithLogs(stepDone) {
        let settings = _.cloneDeep(helpers.dependencies.settings);
        settings.logs = {
          file: {
            active: true,
            path: logFilePath,
            level: 'debug',
            maxsize: 500000,
            maxFiles: 50,
            json: false
          }
        };
        server.ensureStarted.call(server, settings, stepDone);
      }

      after(server.ensureStarted.bind(server,helpers.dependencies.settings));

      // cf. GH issue #64
      it('must replace the passwordHash in the logs by (hidden) when the authentication is invalid', function (done) {
        async.series([
          function failCreateUser(stepDone) {
            request.post(path()).set('authorization', 'bad-key').send(newUserData)
              .end(function (err, res) {
                validation.checkError(res, {
                  status: 404,
                  id: ErrorIds.UnknownResource
                }, stepDone);
              });
          },
          verifyHiddenPasswordHashInLogs
        ], done);
      });

      // cf. GH issue #64 too
      it('must replace the passwordHash in the logs by (hidden) when the payload is invalid (here parameters)', function (done) {
        async.series([
          function failCreateUser(stepDone) {
            post(_.extend({invalidParam: 'yolo'}, newUserData), function (err, res) {
              validation.checkError(res, {
                status: 400,
                id: ErrorIds.InvalidParametersFormat
              }, stepDone);
            });
          },
          verifyHiddenPasswordHashInLogs
        ], done);
      });

      it('must not mention the passwordHash in the logs when none is provided', function (done) {
        async.series([
          function failCreateUser(stepDone) {
            let dataWithNoPasswordHash = _.cloneDeep(newUserData);
            delete dataWithNoPasswordHash.passwordHash;

            post(dataWithNoPasswordHash, function (err, res) {
              validation.checkError(res, {
                status: 400,
                id: ErrorIds.InvalidParametersFormat
              }, stepDone);
            });
          },
          verifyNoPasswordHashFieldInLogs
        ], done);
      });

      function verifyHiddenPasswordHashInLogs(callback) {
        fs.readFile(logFilePath, 'utf8', function (err, data) {
          if (err) {
            return callback(err);
          }
          should(data.indexOf(newUserData.passwordHash) === -1).be.true();
          should(data.indexOf('passwordHash=(hidden)') >= 0).be.true();
          callback();
        });
      }

      function verifyNoPasswordHashFieldInLogs(callback) {
        fs.readFile(logFilePath, 'utf8', function (err, data) {
          if (err) {
            return callback(err);
          }
          should(data.indexOf('passwordHash=') === -1).be.true();
          callback();
        });
      }

    });


  });



  describe('GET /user-info/{username}', function () {

    var user = testData.users[0];

    function path(username) {
      return basePath() + '/user-info/' + username;
    }

    it('must return user information (including time of last account use)', function (done) {
      var originalInfo,
          expectedTime;
      async.series([
        function getInitialInfo(stepDone) {
          request.get(path(user.username))
              .set('authorization', helpers.dependencies.settings.auth.adminAccessKey)
              .end(function (err, res) {
            validation.check(res, {
              status: 200,
              schema: methodsSchema.getUserInfo.result
            });
            originalInfo = res.body.userInfo;
            stepDone();
          });
        },
        function makeUserRequest1(stepDone) {
          request.get(url.resolve(server.url, '/' + user.username + '/events'))
              .set('authorization', testData.accesses[4].token)
              .end(function () {
            stepDone();
          });
        },
        function makeUserRequest2(stepDone) {
          request.get(url.resolve(server.url, '/' + user.username + '/events'))
              .set('authorization', testData.accesses[1].token)
              .end(function () {
            expectedTime = timestamp.now();
            stepDone();
          });
        },
        function getUpdatedInfo(stepDone) {
          request.get(path(user.username))
              .set('authorization', helpers.dependencies.settings.auth.adminAccessKey)
              .end(function (err, res) {
            var info = res.body.userInfo;
            Math.round(info.lastAccess).should.eql(Math.round(expectedTime));
            info.callsTotal.should.eql(originalInfo.callsTotal + 2, 'calls total');
            info.callsDetail['events:get'].should.eql(originalInfo.callsDetail['events:get'] + 2,
                'calls detail');
            var accessKey1 = testData.accesses[4].name, // app access
                accessKey2 = 'shared'; // shared access
            info.callsPerAccess[accessKey1].should.eql(originalInfo.callsPerAccess[accessKey1] + 1,
                'calls per access (personal)');
            info.callsPerAccess[accessKey2].should.eql(originalInfo.callsPerAccess[accessKey2] + 1,
                'calls per access (shared)');
            stepDone();
          });
        }
      ], done);
    });

    it('must return a correct 404 error when authentication is invalid', function (done) {
      request.get(path(user.username)).set('authorization', 'bad-key').end(function (err, res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

  });

});
