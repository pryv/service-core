/*global describe, before, beforeEach, it */

require('./test-helpers'); 
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
    _ = require('lodash');
require('date-utils');

describe('system (ex-register)', function () {
  before(function() {
    process.env.NODE_ENV = 'test';
  });

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
          post(newUserData, function (res) {
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

    it('must run the process but not save anything for test username "recla"', 
      function (done) {
        var originalCount,
            createdUserId,
            settings = _.clone(helpers.dependencies.settings);
        
        should(process.env.NODE_ENV).be.eql('test');
        
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
            post(data, function (res) {
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
	  .end(function (res) {
	validation.check(res, {
	  status: 201
	}, done);
      });
    });

    it('must return a correct 400 error if the sent data is badly formatted', function (done) {
      post({ badProperty: 'bad value' }, function (res) {
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
      post(data, function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {username: data.username}
        }, done);
      });
    });

    it('must return a correct 404 error when authentication is invalid', function (done) {
      request.post(path()).set('authorization', 'bad-key').send(JSON.stringify(newUserData))
          .end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

    it('must return a correct error if the content type is wrong', function (done) {
      request.post(path())
          .set('authorization', helpers.dependencies.settings.auth.adminAccessKey)
          .set('Content-Type', 'application/Jssson') // <-- error
          .send(JSON.stringify(newUserData))
          .end(function (res) {
            validation.checkError(res, {
              status: 415,
              id: ErrorIds.UnsupportedContentType
            }, done);
          });
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
              .end(function (res) {
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
              .end(function (res) {
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
      request.get(path(user.username)).set('authorization', 'bad-key').end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

  });

});
