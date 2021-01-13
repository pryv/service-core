/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/*global describe, before, beforeEach, after, it */

require('./test-helpers'); 

const async = require('async');
const should = require('should');
const request = require('superagent');
const timestamp = require('unix-timestamp');
const url = require('url');
const _ = require('lodash');
const assert = require('chai').assert; 
const bluebird = require('bluebird');
const os = require('os');
const fs = require('fs');

const helpers = require('./helpers');
const ErrorIds = require('components/errors').ErrorIds;
const server = helpers.dependencies.instanceManager;
const methodsSchema = require('../src/schema/systemMethods');
const validation = helpers.validation;
const encryption = require('components/utils').encryption;
const storage = helpers.dependencies.storage.user.events;
const testData = helpers.data;
const UsersRepository = require('components/business/src/users/repository');
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');
const charlatan = require('charlatan');

require('date-utils');


describe('system route', function () {
  let mongoFixtures,
    username, 
    server;

  before(async function() {
    mongoFixtures = databaseFixture(await produceMongoConnection());
    username = 'system-test';
    server = await context.spawn();
  });
  after(() => {
    mongoFixtures.clean();
    server.stop();
  });

  before(async () => {
    await mongoFixtures.user(username, {});
  });

  it('[JT1A] should parse correctly usernames starting with "system"', async () => { 
    const res = await server.request().get('/' + username + '/events')
      .set('authorization', 'dummy');
    should.exist(res.body.error);
    res.body.error.id.should.eql('invalid-access-token');
  });

});

describe('system (ex-register)', function () {
  let mongoFixtures;
  
  this.timeout(5000);
  function basePath() {
    return url.resolve(server.url, '/system');
  }

  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
    await mongoFixtures.context.cleanEverything();
  });

  beforeEach(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses
    ], done);
  });

  after(async function () {
    await mongoFixtures.context.cleanEverything();
  });
  // NOTE: because we mock the email sending service for user creation and to
  // keep test code simple, test order is important. The first test configures
  // the mock service in order to test email sending, the second one
  // reconfigures it so that it just replies OK for subsequent tests.   
  describe('POST /create-user', function () {

    function path() {
      return basePath() + '/create-user';
    }
    function post (data, callback) {
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

    describe('when email sending really works', function () {
      before(async function () {
        await mongoFixtures.context.cleanEverything();
      });
      it('[FUTR] must create a new user with the sent data, sending a welcome email', async function () {
        let settings = _.cloneDeep(helpers.dependencies.settings);
        settings.services.email.enabled = true;

        let mailSent = false;
        
        let originalCount;
            
        // setup mail server mock
        helpers.instanceTestSetup.set(settings, {
          context: settings.services.email,
          execute: function () {
            require('nock')(this.context.url)
              .post('')
              .reply(200, function (uri, requestBody) {
                var body = JSON.parse(requestBody);
                body.message.global_merge_vars[0].content.should.be.equal('mr-dupotager');
                body.template_name.should.match(/welcome/);
                this.context.messagingSocket.emit('mail-sent1');
              }.bind(this));
          }
        });
        // fetch notification from server process
        server.once('mail-sent1', function () {
          mailSent = true;
        });
        await (new Promise(server.ensureStarted.bind(server, settings)));

        const usersRepository = new UsersRepository(storage);
        const originalUsers = await usersRepository.getAll();

        originalCount = originalUsers.length;
        // create user
        const res = await bluebird.fromCallback(cb => post(newUserData, cb));
        validation.check(res, {
          status: 201,
          schema: methodsSchema.createUser.result
        });
        mailSent.should.eql(true);

        // getUpdatedUsers
        const users = await usersRepository.getAll(true);
        users.length.should.eql(originalCount + 1, 'users');

        var expected = _.cloneDeep(newUserData);
        expected.storageUsed = { dbDocuments: 0, attachedFiles: 0 };
        var actual = _.find(users, function (user) {
          return user.username === newUserData.username;
        });
        validation.checkStoredItem(actual.getAccountWithId(), 'user');
        // password hash is not retrieved with getAll
        delete expected.passwordHash;
        actual.getAccount().should.eql(expected);
      });
    });
    
    it('[0G7C] must not send a welcome email if mailing is deactivated', function (done) {
      let settings = _.cloneDeep(helpers.dependencies.settings);
      settings.services.email.enabled = false;
      testWelcomeMailNotSent(settings, done);
    });
    it('[TWBF] must not send a welcome email if welcome mail is deactivated', function (done) {
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
        function registerNewUser (stepDone) {
          let newUserDataExpected = Object.assign({}, newUserData);
          post(newUserDataExpected, function (err, res) {
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

      it('[9K71] must run the process but not save anything for test username "recla"', 
        async function () {
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

          await (new Promise(server.ensureStarted.bind(server, settings)));

          const usersRepository = new UsersRepository(storage);
          originalUsers = await usersRepository.getAll();
          originalCount = originalUsers.length;

          // create user
          var data = {
            username: 'recla',
            passwordHash: encryption.hashSync('youpi'),
            email: 'recla@rec.la',
            language: 'fr'
          };
          const res = await bluebird.fromCallback(cb => post(data, cb));

          validation.check(res, {
            status: 201,
            schema: methodsSchema.createUser.result
          });
          createdUserId = res.body.id;

          // getUpdatedUsers
          const users = await usersRepository.getAll();
          users.length.should.eql(originalCount, 'users');
          should.not.exist(_.find(users, { id: createdUserId }));
        });
    
      it('[ZG1L] must support the old "/register" path for backwards-compatibility', function (done) {
        let newUserDataExpected = Object.assign({}, newUserData);
        request.post(url.resolve(server.url, '/register/create-user'))
          .set('authorization', helpers.dependencies.settings.auth.adminAccessKey)
          .send(newUserDataExpected)
          .end(function (err, res) {
            validation.check(res, {
              status: 201
            }, done);
          });
      });
    
      it('[VGF5] must return a correct 400 error if the sent data is badly formatted', function (done) {
        post({ badProperty: 'bad value' }, function (err, res) {
          validation.checkErrorInvalidParams(res, done);
        });
      });

      it('[ABI5] must return a correct 400 error if the language property is above 5 characters', function (done) {
        let newUserDataExpected = Object.assign({}, newUserData);
        post(_.assignIn(newUserDataExpected, { language: 'abcdef' }), function (err, res) {
          validation.checkErrorInvalidParams(res, done);
        });
      });

      it('[OVI4] must return a correct 400 error if the language property is the empty string', function (done) {
        let newUserDataExpected = Object.assign({}, newUserData);
        post(_.assignIn(newUserDataExpected, { language: '' }), function (err, res) {
          validation.checkErrorInvalidParams(res, done);
        });
      });
    
      it('[RD10] must return a correct 400 error if a user with the same user name already exists',
        async function () {
          var data = {
            username: testData.users[0].username,
            passwordHash: '$-1s-b4d-f0r-U',
            email: 'roudoudou@choupinou.ch',
            language: 'fr'
          };
          try{
            await bluebird.fromCallback(cb => post(data, cb));
            throw new Error('The response should not be successful');
          } catch (err) {
            validation.checkError(err.response, {
              status: 409,
              id: ErrorIds.ItemAlreadyExists,
              data: {username: data.username}
            });
          }
        });
      it('[NPJE] must return a correct 400 error if a user with the same email address already exists', async () => {
        const existingUser = await mongoFixtures.user(charlatan.Lorem.characters(10));
        const data = {
          username: charlatan.Lorem.characters(10),
          passwordHash: '$-1s-b4d-f0r-U',
          email: existingUser.attrs.email,
          language: 'fr'
        };

        try{
          await bluebird.fromCallback(
            (cb) => post(data, cb));
          console.log('test passed even it should not');
          assert.isTrue(false);
        } catch (err) {
          assert.equal(err.response.status, 409)
          assert.equal(err.response.body.error.id, ErrorIds.ItemAlreadyExists);
          assert.deepEqual(err.response.body.error.data, { email: data.email });
        }
      });
    
      it('[Y5JB] must return a correct 404 error when authentication is invalid', function (done) {
        let newUserDataExpected = Object.assign({}, newUserData);
        request
          .post(path())
          .set('authorization', 'bad-key').send(newUserDataExpected)
          .end(function (err, res) {
            validation.checkError(res, {
              status: 404,
              id: ErrorIds.UnknownResource
            }, done);
          });
      });
    
      it('[GF3L] must return a correct error if the content type is wrong', function (done) {
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
      it('[Y69B] must replace the passwordHash in the logs by (hidden) when the authentication is invalid', function (done) {
        let newUserDataExpected = Object.assign({}, newUserData);
        async.series([
          function failCreateUser(stepDone) {
            request.post(path()).set('authorization', 'bad-key').send(newUserDataExpected)
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
      it('[MEJ9] must replace the passwordHash in the logs by (hidden) when the payload is invalid (here parameters)', function (done) {
        let newUserDataExpected = Object.assign({}, newUserData);
        async.series([
          function failCreateUser(stepDone) {
            post(_.extend({ invalidParam: 'yolo' }, newUserDataExpected), function (err, res) {
              validation.checkError(res, {
                status: 400,
                id: ErrorIds.InvalidParametersFormat
              }, stepDone);
            });
          },
          verifyHiddenPasswordHashInLogs
        ], done);
      });
    
      it('[CO6H] must not mention the passwordHash in the logs when none is provided', function (done) {
        let newUserDataExpected = Object.assign({}, newUserData);
        async.series([
          function failCreateUser(stepDone) {
            let dataWithNoPasswordHash = _.cloneDeep(newUserDataExpected);
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
    
      function verifyHiddenPasswordHashInLogs (callback) {
        let newUserDataExpected = Object.assign({}, newUserData);
        fs.readFile(logFilePath, 'utf8', function (err, data) {
          if (err) {
            return callback(err);
          }
          should(data.indexOf(newUserDataExpected.passwordHash)).be.equal(-1);
          if (/passwordHash/.test(data))
            should(data.indexOf('(hidden password)')).be.aboveOrEqual(0);
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

    let user = Object.assign({}, testData.users[0]);
    function path(username) {
      return basePath() + '/user-info/' + username;
    }

    before(server.ensureStarted.bind(server, helpers.dependencies.settings));

    it('[9C1A] must return user information (including time of last account use)', function (done) {
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
    it('[FNJ5] must return a correct 404 error when authentication is invalid', function (done) {
      request.get(path(user.username)).set('authorization', 'bad-key').end(function (err, res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });
  });

});
