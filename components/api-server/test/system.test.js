
/*global describe, before, beforeEach, after, it */

require('./test-helpers'); 

const async = require('async');
const should = require('should');
const request = require('superagent');
const timestamp = require('unix-timestamp');
const url = require('url');
const _ = require('lodash');
const assert = require('chai').assert; 

const helpers = require('./helpers');
const ErrorIds = require('components/errors').ErrorIds;
const server = helpers.dependencies.instanceManager;
const methodsSchema = require('../src/schema/systemMethods');
const validation = helpers.validation;
const encryption = require('components/utils').encryption;
const storage = helpers.dependencies.storage.users;
const testData = helpers.data;

const os = require('os');
const fs = require('fs');

require('date-utils');

describe('system (ex-register)', function () {

  this.timeout(5000);
  function basePath() {
    return url.resolve(server.url, '/system');
  }

  beforeEach(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses
    ], done);
  });

  // NOTE: because we mock the email sending service for user creation and to
  // keep test code simple, test order is important. The first test configures
  // the mock service in order to test email sending, the second one
  // reconfigures it so that it just replies OK for subsequent tests.   
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

    describe('when email sending really works', function() {
      it('must create a new user with the sent data, sending a welcome email', function (done) {
        let settings = _.cloneDeep(helpers.dependencies.settings);
        settings.services.email.enabled = true;
        let mailSent = false;
        
        let originalCount;
        let createdUserId;
            
        // setup mail server mock
        helpers.instanceTestSetup.set(settings, {
          context: settings.services.email,
          execute: function () {
            require('nock')(this.context.url)
              .post(this.context.sendMessagePath)
              .reply(200, function (uri, requestBody) {
                var body = JSON.parse(requestBody);
                if (body.message.global_merge_vars[0].content !== 'mr-dupotager' ||
                  ! /welcome/.test(body.template_name)) 
                {
                  // MISMATCHED REQ BODY: require('util').inspect(body, {depth: null}));
                  console.log( // eslint-disable-line no-console
                    require('util').inspect(body, {depth: null})); 
                }
                this.context.messagingSocket.emit('mail-sent1');
              }.bind(this));
          }
        });
        // fetch notification from server process
        server.once('mail-sent1', function () {
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

              var expected = _.cloneDeep(newUserData);
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
    });
    
    it('must not send a welcome email if mailing is deactivated', function (done) {
      let settings = _.cloneDeep(helpers.dependencies.settings);
      settings.services.email.enabled = false;
      testWelcomeMailNotSent(settings, done);
    });
    it('must not send a welcome email if welcome mail is deactivated', function (done) {
      let settings = _.cloneDeep(helpers.dependencies.settings);
      settings.services.email.enabled = {
        welcome : false
      };
      testWelcomeMailNotSent(settings, done);
    });
    
    function testWelcomeMailNotSent (settings, callback) {
      // setup mail server mock
      helpers.instanceTestSetup.set(settings, {
        context: settings.services.email,
        execute: function () {
          require('nock')(this.context.url).post(this.context.sendMessagePath)
            .reply(200, function () {
              this.context.messagingSocket.emit('mail-sent2');
            }.bind(this));
        }
      });
      
      // fetch notification from server process
      server.once('mail-sent2', function () {
        return callback('Welcome email should not be sent!');
      });

      async.series([
        server.ensureStarted.bind(server, settings),
        function registerNewUser(stepDone) {
          post(newUserData, function (err, res) {
            validation.check(res, {
              status: 201,
              schema: methodsSchema.createUser.result
            });

            stepDone();
          });
        }
      ], callback);
    }

    describe('when it just replies OK', function() {
      before(server.ensureStarted.bind(server, helpers.dependencies.settings));
    
      it('must run the process but not save anything for test username "recla"', 
        function (done) {
          var originalCount,
              createdUserId,
              settings = _.cloneDeep(helpers.dependencies.settings);
    
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
        request
          .post(path())
          .set('authorization', 'bad-key').send(newUserData)
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
          .set('Content-Type', 'application/Jssdlfkjslkjfon') // <-- case error
          .end(function (err, res) {
            validation.checkError(res, {
              status: 415,
              id: ErrorIds.UnsupportedContentType
            }, done);
          });
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
          should(data.indexOf(newUserData.passwordHash)).be.equal(-1);
          should(data.indexOf('passwordHash=(hidden)')).be.aboveOrEqual(0);
          callback();
        });
      }
    
      function verifyNoPasswordHashFieldInLogs(callback) {
        fs.readFile(logFilePath, 'utf8', function (err, data) {
          if (err) {
            return callback(err);
          }
          should(data.indexOf('passwordHash=')).be.equal(-1);
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

    before(server.ensureStarted.bind(server, helpers.dependencies.settings));

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
            .end(function (err) {
              stepDone(err);
            });
        },
        function makeUserRequest2(stepDone) {
          request.get(url.resolve(server.url, '/' + user.username + '/events'))
            .set('authorization', testData.accesses[1].token)
            .end(function (err) {
              expectedTime = timestamp.now();
              stepDone(err);
            });
        },
        function getUpdatedInfo(stepDone) {
          request.get(path(user.username))
            .set('authorization', helpers.dependencies.settings.auth.adminAccessKey)
            .end(function (err, res) {
              const info = res.body.userInfo;
              
              assert.approximately(info.lastAccess, expectedTime, 2);
              
              info.callsTotal
                .should.eql(originalInfo.callsTotal + 2, 
                  'calls total');
              info.callsDetail['events:get']
                .should.eql(originalInfo.callsDetail['events:get'] + 2, 
                  'calls detail');
                
              const accessKey1 = testData.accesses[4].name; // app access
              const accessKey2 = 'shared';                  // shared access
              
              info.callsPerAccess[accessKey1]
                .should.eql(originalInfo.callsPerAccess[accessKey1] + 1, 
                  'calls per access (personal)');
              info.callsPerAccess[accessKey2]
                .should.eql(originalInfo.callsPerAccess[accessKey2] + 1,
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
