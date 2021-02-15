/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const assert = require('chai').assert;
const { describe, before, it, after } = require('mocha');
const supertest = require('supertest');
const charlatan = require('charlatan');
const bluebird = require('bluebird');
const Application = require('api-server/src/application');
const { getConfig } = require('@pryv/boiler');
const UsersRepository = require('business/src/users/repository');
const User = require('business/src/users/User');
const { databaseFixture } = require('test-helpers');
const { produceMongoConnection } = require('api-server/test/test-helpers');
const Notifications = require('api-server/src/Notifications');
const ErrorIds = require('errors/src/ErrorIds');

describe('[BMM2] registration: DNS-less', () => {
  let config;
  let mongoFixtures;
  let app;
  let request;
  let res;
  before(async function () {
    config = await getConfig();
    config.injectTestConfig({
      dnsLess: {isActive: true},
      openSource: {isActive: false},
      custom: { systemStreams: null}
    });
  });
  after(async function () {
    config.injectTestConfig({});
  });
  before(async function() {
    mongoFixtures = databaseFixture(await produceMongoConnection());
    app = new Application();
    await app.initiate();

    require('api-server/src/methods/auth/register-dnsless')(
      app.api,
      app.logging,
      app.storageLayer,
      app.config.get('services'),
    );

    // get events for a small test of valid token
    // Initialize notifications dependency
    let axonMsgs = [];
    const axonSocket = {
      emit: (...args) => axonMsgs.push(args),
    };
    const notifications = new Notifications(axonSocket);
    await require("api-server/src/methods/events")(
      app.api,
      app.storageLayer.events,
      app.storageLayer.eventFiles,
      app.config.get('auth'),
      app.config.get('service:eventTypes'),
      notifications,
      app.logging,
      app.config.get('audit'),
      app.config.get('updates'),
      app.config.get('openSource'),
      app.config.get('services'));
    
    request = supertest(app.expressApp);
    
    
  });
  describe('POST /users', () => {
    let registerBody;
    before(() => {
      registerBody = {
        username: charlatan.Lorem.characters(7),
        password: charlatan.Lorem.characters(7),
        email: charlatan.Internet.email(),
        appId: charlatan.Lorem.characters(7),
        insurancenumber: charlatan.Number.number(3),
        phoneNumber: charlatan.Number.number(3),
      };
    });
    
    describe('when given valid input', function() {
      before(async function() {
        res = await request.post('/users').send(registerBody);
      });
      it('[KB3T] should respond with status 201', function() {
        assert.equal(res.status, 201);
      });
      it('[VDA8] should respond with a username and apiEndpoint in the request body', async () => {
        assert.equal(res.body.username, registerBody.username);
        const usersRepository = new UsersRepository(app.storageLayer.events);
        const user = await usersRepository.getAccountByUsername(registerBody.username, true);
        const personalAccess = await bluebird.fromCallback(
          (cb) => app.storageLayer.accesses.findOne({ id: user.id }, {}, null, cb));
        let initUser = new User(registerBody);
        initUser.token = personalAccess.token;
        assert.equal(res.body.apiEndpoint, initUser.getApiEndpoint());
      });
      it('[LPLP] Valid access token exists in the response', async function () {
        assert.exists(res.body.apiEndpoint);
        const token = res.body.apiEndpoint.split('//')[1].split('@')[0];

        // check that I can get events with this token
        res2 = await request.get(`/${res.body.username}/events`)
          .set('authorization', token);
        assert.equal(res2.status, 200);
        assert.isTrue(res2.body.events.length > 0);
      });
      it('[M5XB] should store all the fields', function() {});
    });
    describe('Schema validation', function() {
      describe(
        'when given an invalid username parameter',
        testInvalidParameterValidation(
          'username', 
          {
            minLength: 5,
            maxLength: 23,
            lettersAndDashesOnly: true,
            type: 'string',
          }, 
          ['G81N','JQ7V','EIKE','XTD0','TSC6','TL2W','MST7','WG46','M6CD','3Q1H'],
        )
      );
      describe(
        'when given an invalid password parameter',
        testInvalidParameterValidation(
          'password', 
          {
            minLength: 4,
            maxLength: 100,
            type: 'string',
          },
          ['MP5F','T56V','XFG4','SBCX','LQWX','KJGF','OYZM','FSE9'],
        )
      );
      describe(
        'when given an invalid email parameter',
        testInvalidParameterValidation(
          'email', {
            maxLength: 300,
            type: 'string',
          },
          ['PJY5','6SID','6OX5','GV6I','1JN8','S8U8'],
        )
      );
      describe(
        'when given an invalid appId parameter',
        testInvalidParameterValidation(
          'appId', 
          {
            minLength: 6,
            maxLength: 99,
            type: 'string',
          },
          ['NZ4J','K4LE','8G9V','4XCV','HI9V','AQFL','I9QE','5P2E']
        )
      );
      describe(
        'when given an invalid invitationToken parameter',
        testInvalidParameterValidation(
          'invitationToken', 
          {
            type: 'string',
          },
          ['FJ51','UEKC','79A5','CYW6'],
        )
      );
      describe(
        'when given an invalid referer parameter',
        testInvalidParameterValidation(
          'referer', 
          {
            maxLength: 99,
            type: 'string',
            allowNull: true
          },
          ['DUQN','VTN5','C4PK','AFUH','J1DW','V51E','5BNJ'],
        )
      );
      describe(
        'when given an invalid language parameter',
        testInvalidParameterValidation(
          'language', 
          {
            minLength: 1,
            maxLength: 5,
            type: 'string',
          },
          ['0QGW','RHT6','E95A','R1LT','LP4S','GDMW','QYT8','UPWY'],
        )
      );
    });
    describe('Property values uniqueness', function() {
      describe('username property', function() {
        before(async function () {
          await mongoFixtures.context.cleanEverything();
          await app.database.deleteMany({ name: 'events' });

          res = await request.post('/users').send(registerBody);
          assert.equal(res.status, 201);
          res = await request.post('/users').send(registerBody);
        });
        it('[LZ1K] should respond with status 409', function() {
          assert.equal(res.status, 409);
        });
        it('[M2HD] should respond with the correct error message', function() {
          assert.exists(res.error);
          assert.exists(res.error.text);
          
          // changed to new error format to match the cluster
          const error = JSON.parse(res.error.text);
          assert.deepEqual(error.error.data, { username: registerBody.username });
        });
        it('[9L3R] should not store the user in the database twice', async function() {
          const usersRepository = new UsersRepository(app.storageLayer.events);
          const users = await usersRepository.getAll();
          assert.equal(users.length, 1);
          assert.equal(users[0].username, registerBody.username);
        });
      });
    });

    function verifyInvalidInputResponse(
      registerBodyModification,
      expectedErrorParam,
      testTags,
    ) {
      return () => {
        before(async function() {
          const invalidRegisterBody = Object.assign(
            {},
            registerBody,
            registerBodyModification
          );
          res = await request.post('/users').send(invalidRegisterBody);
        });
        it(`[${testTags[0]}] should respond with status 400`, function() {
          assert.equal(res.status, 400);
        });
        it(`[${testTags[1]}] should respond with the correct error message`, function() {
          assert.exists(res.error);
          assert.exists(res.error.text);
          const error = JSON.parse(res.error.text);
          assert.include(error.error.data[0].param, expectedErrorParam);
        });
      };
    }

    function testInvalidParameterValidation(parameterName, constraints, testTags) {
      return () => {
        if (constraints.minLength) {
          describe(
            'that is too short',
            verifyInvalidInputResponse(
              {
                [parameterName]: charlatan.Lorem.characters(
                  constraints.minLength - 1
                )
              },
              parameterName,
              [ testTags.pop(), testTags.pop() ]
            )
          );
        }
        if (constraints.maxLength) {
          describe(
            'that is too long',
            verifyInvalidInputResponse(
              {
                [parameterName]: charlatan.Lorem.characters(
                  constraints.maxLength + 1
                )
              },
              parameterName,
              [ testTags.pop(), testTags.pop() ]
            )
          );
        }
        if (constraints.lettersAndDashesOnly) {
          describe(
            'that has invalid characters',
            verifyInvalidInputResponse(
              {
                [parameterName]: "/#+]\\'"
              },
              parameterName,
              [ testTags.pop(), testTags.pop() ]
            )
          );
        }
        if (constraints.type) {
          let val;
          if (constraints.type === 'string') {
            val = true;
          }
          if (val) {
            describe(
              'that has an invalid type',
              verifyInvalidInputResponse(
                {
                  [parameterName]: val
                },
                parameterName,
                [ testTags.pop(), testTags.pop() ]
              )
            );
          }
        }
        if (!constraints.allowNull) {
          describe(
            'that is null',
            verifyInvalidInputResponse(
              {
                [parameterName]: null
              },
              parameterName,
              [testTags.pop(), testTags.pop()]
            )
          );
        }
      };
    }
  });
  describe('GET /reg/:username/check', function() {

    const existingUsername = 'existing-username';
    before(async function () {
      await mongoFixtures.user({
        username: existingUsername,
      });
    });

    function path(username) {
      return `/reg/${username}/check_username`;
    }

    it('[7T9L] when checking a valid available username, it should respond with status 200 and {reserved:false}', async () => {
      const res = await request.get(path('unexisting-username'))

      const body = res.body;
      assert.equal(res.status, 200);
      assert.isFalse(body.reserved);
    });

    it('[153Q] when checking a valid taken username, it should respond with status 409 and the correct error', async () => {
      const res = await request.get(path(existingUsername))

      const body = res.body;
      assert.equal(res.status, 409);
      assert.equal(body.error.id, ErrorIds.ItemAlreadyExists);
      assert.deepEqual(body.error.data, { username: existingUsername });
    });

    it('[H09H] when checking a too short username, it should respond with status 400 and the correct error', async () => {
      const res = await request.get(path('a'.repeat(4)));

      const body = res.body;
      assert.equal(res.status, 400);
      assert.equal(body.error.id, ErrorIds.InvalidParametersFormat);
      assert.isTrue(body.error.data[0].code.includes('username'));
    });
    it('[VFE1] when checking a too long username, it should respond with status 400 and the correct error', async () => {
      const res = await request.get(path('a'.repeat(24)));

      const body = res.body;
      assert.equal(res.status, 400);
      assert.equal(body.error.id, ErrorIds.InvalidParametersFormat);
      assert.isTrue(body.error.data[0].code.includes('username'));
    });
    it('[FDTC] when checking a username with invalid characters, it should respond with status 400 and the correct error', async () => {
      const res = await request.get(path('abc:def'));

      const body = res.body;
      assert.equal(res.status, 400);
      assert.equal(body.error.id, ErrorIds.InvalidParametersFormat);
      assert.isTrue(body.error.data[0].code.includes('username'));
    });
  });
});
