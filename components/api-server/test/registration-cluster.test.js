/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const nock = require('nock');
const charlatan = require('charlatan');
const _ = require('lodash');
const bluebird = require('bluebird');
const supertest = require('supertest');
const assert = require('chai').assert;

const Settings = require('../src/settings');
const { getConfig } = require('components/api-server/config/Config');
const Application = require('../src/application');
const ErrorIds = require('components/errors/src/ErrorIds');
const ErrorMessages = require('components/errors/src/ErrorMessages');
const User = require('components/business/src/users/User');
const UsersRepository = require('components/business/src/users/repository');
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('./test-helpers');

function defaults() {
  return {
    appId: 'pryv-test',
    username: charlatan.Lorem.characters(7),
    email: charlatan.Internet.email(),
    password: 'abcdefgh',
    invitationToken: 'enjoy',
    referer: 'pryv',
    insurancenumber: charlatan.Number.number(3)
  };
}

describe('registration: cluster', function() {
  let app;
  let request;
  let res;
  let settings;
  let config;
  let regUrl;
  let userData;
  let serviceRegisterRequests = [];
  let mongoFixtures;
  let usersRepository;

  // clean the database before starting all tests for registration
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
    await mongoFixtures.context.cleanEverything();
  });
  before(async function () {
    settings = await Settings.load();
    config = getConfig();
    await config.init();
    config.set('dnsLess:isActive', false);
    config.set('openSource:isActive', false);
    regUrl = config.get('services:register:url');

    app = new Application(settings);
    await app.initiate();

    require('../src/methods/auth/register')(
      app.api,
      app.logging,
      app.storageLayer,
      app.settings.get('services').obj()
    );

    request = supertest(app.expressApp);

    usersRepository = new UsersRepository(app.storageLayer.events);
  });
  after(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
    await mongoFixtures.context.cleanEverything();
  });

  const methodPath = '/users';
  const defaultServerName = 'abc';

  function buildValidationRequest(user, hasToken = true) {
    const validationRequest = {
      core: res.req._header.split('Host: ')[1].split('\r\n')[0],
      username: user.username,
      uniqueFields: {
        username: user.username,
        email: user.email,
      },
    };
    hasToken ? validationRequest.invitationToken = user.invitationToken : null;
    return validationRequest;
  }
  function buildRegistrationRequest(user, request, hasToken = true) {
    const registrationRequest = {
      host: { name: res.req._header.split('Host: ')[1].split('\r\n')[0] },
      unique: [ 'username', 'email' ],
      user: {
        username: user.username,
        email: user.email,
        appId: user.appId,
        referer: user.referer,
        insurancenumber: user.insurancenumber,
      }
    };
    hasToken ? registrationRequest.user.invitationToken = user.invitationToken : null;
    return registrationRequest;
  }
  function stripRegistrationRequest(request) {
    delete request.user.language;
    delete request.user.id;
    return request;
  }

  describe('POST /users (create user)', function() {
    describe('when a user with the same username (not email) already exists in core but not in register', () => {
      let oldEmail, firstUser, secondUser, firstValidationRequest, firstRegistrationRequest;
      before(async () => {
        userData = defaults();
        serviceRegisterRequests = [];

        nock(regUrl)
          .post('/users/validate', (body) => {
            serviceRegisterRequests.push(body);
            return true;
          })
          .times(2)
          .reply(200, { errors: [] });
        nock(regUrl)
          .post('/users', (body) => {
            serviceRegisterRequests.push(body);
            return true;
          })
          .times(2)
          .reply(200, {
            username: 'anyusername'
          });
        res = await request.post(methodPath).send(userData);
        firstValidationRequest = _.merge(buildValidationRequest(userData), { uniqueFields: { email: userData.email } });
        firstRegistrationRequest = buildRegistrationRequest(userData);
        firstUser = await usersRepository.getAccountByUsername(userData.username, true);
        oldEmail = userData.email;
        userData.email = charlatan.Internet.email();
        res = await request.post(methodPath).send(userData);
        secondUser = await usersRepository.getAccountByUsername(userData.username, true);
      });
      it('[QV8Z] should respond with status 201', () => {
        assert.equal(res.status, 201);
      });
      it('[TCOM] should respond with the username and apiEndpoint', async () => {
        const body = res.body;
        assert.equal(body.username, userData.username);
        const usersRepository = new UsersRepository(app.storageLayer.events);
        const user = await usersRepository.getAccountByUsername(userData.username, true);
        const personalAccess = await bluebird.fromCallback(
          (cb) => app.storageLayer.accesses.findOne({ id: user.id }, {}, null, cb));

        let initUser = new User(userData);
        initUser.token = personalAccess.token;
        assert.equal(body.apiEndpoint, initUser.getApiEndpoint());
      });
      it('[7QB6] should send the right data to register', () => {
        const firstValidationSent = serviceRegisterRequests[0];
        assert.deepEqual(firstValidationSent, firstValidationRequest, 'first validation request is invalid');

        let firstRegistrationSent = serviceRegisterRequests[1];
        firstRegistrationSent = stripRegistrationRequest(firstRegistrationSent);
        assert.deepEqual(firstRegistrationSent, firstRegistrationRequest, ' first registration request is invalid');

        const secondValidationSent = serviceRegisterRequests[2];
        const secondValidationRequest = buildValidationRequest(userData);
        assert.deepEqual(secondValidationSent, secondValidationRequest, 'second validation request is invalid');

        let secondRegistrationSent = serviceRegisterRequests[3];
        secondRegistrationSent = stripRegistrationRequest(secondRegistrationSent);
        const secondRegistrationRequest = buildRegistrationRequest(userData);
        assert.deepEqual(secondRegistrationSent, secondRegistrationRequest, ' second registration request is invalid');
      });
      it('[A2EM] should replace first user events in the storage', () => {
        const firstEmail = firstUser.events.filter(e => e.type === 'email/string')[0].content;
        const secondEmail = secondUser.events.filter(e => e.type === 'email/string')[0].content;
        assert.equal(firstEmail, oldEmail);
        assert.equal(secondEmail, userData.email);
      });
    });
    describe('when a user with the same username/email already exists in core but not in register', () => {
      let firstValidationRequest;
      let firstRegistrationRequest;
      before(async () => {
        userData = defaults();
        serviceRegisterRequests = [];

        nock(regUrl)
          .post('/users/validate', (body) => {
            serviceRegisterRequests.push(body);
            return true;
          })
          .times(2)
          .reply(200, { errors: [] });
        nock(regUrl)
          .post('/users', (body) => {
            serviceRegisterRequests.push(body);
            return true;
          })
          .times(2)
          .reply(200, {
            username: 'anyusername'
          });

        res = await request.post(methodPath).send(userData);
        firstValidationRequest = buildValidationRequest(userData)
        firstRegistrationRequest = buildRegistrationRequest(userData);
        res = await request.post(methodPath).send(userData);
      });
      it('[GRAW] should respond with status 201', () => {
        assert.equal(res.status, 201);
      });
      it('[AY44] should respond with the username and apiEndpoint (TODO)', () => {
        const body = res.body;
        assert.equal(body.username, userData.username);
      });
      it('[ZHYX] should send the right data to register', () => {
        // validate validation request - first and third requests
        // should be validation and they shuold be equal
        //(remove core because validation and registration was done 
        // by different processes - port is different)
        let validationSent2 = Object.assign({}, serviceRegisterRequests[0]);
        delete validationSent2.core;
        delete serviceRegisterRequests[2].core;
        assert.deepEqual(validationSent2, serviceRegisterRequests[2]);

        // alsl validation request should be valid
        assert.deepEqual(serviceRegisterRequests[0], firstValidationRequest);

        // also first registration request should be valid
        let registrationSent = serviceRegisterRequests[1];
        registrationSent = stripRegistrationRequest(registrationSent);
        assert.deepEqual(registrationSent, firstRegistrationRequest);
      });
    });
    describe('when the username exists in register', () => {
      before(async () => {
        userData = _.extend({}, defaults(), { username: 'wactiv' });
        serviceRegisterRequests = [];

        nock(regUrl)
          .post('/users/validate', (body) => {
            serviceRegisterRequests.push(body);
            return true;
          })
          .reply(400, {
            error: {
              id: ErrorIds.ItemAlreadyExists,
              data: { username: 'wactiv' }
            }
          });
  
        res = await request.post(methodPath).send(userData);
      });
      it('[NUC9] should respond with status 400', () => {
        assert.equal(res.status, 400);  
      });
      it('[X1IA] should respond with the correct error', () => {
        const error = res.body.error;
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
        assert.equal(error.data.username, userData.username);
      });
      it('[JJJY] should send the right data to register', () => {
        const validationSent = serviceRegisterRequests[0];
        assert.deepEqual(validationSent, buildValidationRequest(userData));
      });
    });

    describe('when the email exists in register', () => {
      before(async () => {
        userData = _.extend({}, defaults(), { email: 'wactiv@pryv.io' });
        serviceRegisterRequests = [];

        nock(regUrl)
          .post('/users/validate', (body) => {
            serviceRegisterRequests.push(body);
            return true;
          })
          .reply(400, {
            error: {
              id: ErrorIds.ItemAlreadyExists,
              data: { email: 'wactiv@pryv.io' }
            }
          });
  
        res = await request.post(methodPath).send(userData);
      });
      it('[SJXN] should respond with status 400', () => {
        assert.equal(res.status, 400);
      });
      it('[U0ZN] should respond with the correct error', () => {
        const error = res.body.error;
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
        assert.equal(error.data.email, userData.email);
      });
      it('[2UNK] should send the right data to register', () => {
        const validationSent = serviceRegisterRequests[0];
        assert.deepEqual(validationSent, buildValidationRequest(userData));
      });
    });

    describe('when the user and email exist in register', () => {
      before(async () => {
        userData = _.extend({}, defaults(), {
          username: 'wactiv',
          email: 'wactiv@pryv.io'
        });
        serviceRegisterRequests = [];
  
        nock(regUrl)
          .post('/users/validate', (body) => {
            serviceRegisterRequests.push(body);
            return true;
          })
          .reply(400, {
            error: {
              id: ErrorIds.ItemAlreadyExists,
              data: {
                email: 'wactiv@pryv.io',
                username: 'wactiv'
              }
            }
          });
  
        res = await request.post(methodPath).send(userData);
      });
      it('[I0HG] should respond with status 400', () => {
        assert.equal(res.status, 400);
      });
      it('[QFVZ] should respond with the correct error', () => {
        const error = res.body.error;
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
        assert.equal(error.data.email, userData.email);
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
        assert.equal(error.data.username, userData.username);
      });
      it('[OIRY] should send the right data to register', () => {
        const validationSent = serviceRegisterRequests[0];
        assert.deepEqual(validationSent, buildValidationRequest(userData));
      });
    });

    describe('when there is a simultaneous registration', () => {
      before(async () => {
        userData = defaults();
        serviceRegisterRequests = [];
  
        nock(regUrl)
          .post('/users/validate', (body) => {
            serviceRegisterRequests.push(body);
            return true;
          })
          .reply(400, {
            error: {
              id: ErrorIds.ItemAlreadyExists,
              data: {
                username: userData.username
              }
            }
          });
  
        res = await request.post(methodPath).send(userData);
      });
      it('[I0HG] should respond with status 400', () => {
        assert.equal(res.status, 400);
      });
      it('[QFVZ] should respond with the correct error', () => {
        const error = res.body.error;
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
        // we don't receive conflicting keys yet
      });
      it('[MMG9] should send the right data to register', () => {
        const validationSent = serviceRegisterRequests[0];
        assert.deepEqual(validationSent, buildValidationRequest(userData));
      });
    });

    describe('when invitationTokens are undefined', () => {
      describe('and a random string is provided as "invitationToken"', async () => {
        before(async () => {
          userData = defaults();
          userData.invitationToken = charlatan.Lorem.characters(25);
          serviceRegisterRequests = [];

          nock(regUrl)
            .post('/users/validate', (body) => {
              serviceRegisterRequests.push(body);
              return true;
            })
            .reply(200, { errors: [] });
          nock(regUrl)
            .post('/users', (body) => {
              serviceRegisterRequests.push(body);
              return true;
            })
            .reply(200, {
              username: userData.username
            });
          res = await request.post(methodPath).send(userData);
        });
        it('[CMOV] should respond with status 201', () => {
          assert.equal(res.status, 201);
        });
        it('[F0MO] should send the right data to register', () => {
          const validationSent = serviceRegisterRequests[0];
          assert.deepEqual(validationSent, buildValidationRequest(userData));
          let registrationSent = serviceRegisterRequests[1];
          registrationSent = stripRegistrationRequest(registrationSent);
          assert.deepEqual(registrationSent, buildRegistrationRequest(userData));
        });
      });
      describe('and "invitationToken" is missing', () => {
        before(async () => {
          userData = defaults();
          delete userData.invitationToken;
          serviceRegisterRequests = [];

          nock(regUrl)
            .post('/users/validate', (body) => {
              serviceRegisterRequests.push(body);
              return true;
            })
            .reply(200, { errors: [] });
          nock(regUrl)
            .post('/users', (body) => {
              serviceRegisterRequests.push(body);
              return true;
            })
            .reply(200, {
              username: userData.username,
            });
          res = await request.post(methodPath).send(userData);
        });
        it('[LOIB] should respond with status 201', () => {
          assert.equal(res.status, 201);
        });
        it('[5O4Q] should send the right data to register', () => {
          const validationSent = serviceRegisterRequests[0];
          assert.deepEqual(validationSent, buildValidationRequest(userData, false));
          let registrationSent = serviceRegisterRequests[1];
          registrationSent = stripRegistrationRequest(registrationSent);
          //assert.deepEqual(registrationSent, buildRegistrationRequest(userData, false));
        });
      });
    
    });

    describe('when invitationTokens are defined', () => {
      describe('when a valid one is provided', () => {
        before(async () => {
          userData = defaults();
          serviceRegisterRequests = [];

          nock(regUrl)
            .post('/users/validate', (body) => {
              serviceRegisterRequests.push(body);
              return true;
            })
            .reply(200, { errors: [] });
          nock(regUrl)
            .post('/users', (body) => {
              serviceRegisterRequests.push(body);
              return true;
            })
            .reply(200, {
              username: userData.username,
            });
          res = await request.post(methodPath).send(userData);
        });
        it('[Z2ZY] should respond with status 201', () => {
          assert.equal(res.status, 201);
        });
        it('[DIFS] should send the right data to register', () => {
          const validationSent = serviceRegisterRequests[0];
          assert.deepEqual(validationSent, buildValidationRequest(userData));
          let registrationSent = serviceRegisterRequests[1];
          registrationSent = stripRegistrationRequest(registrationSent);

          assert.deepEqual(registrationSent, buildRegistrationRequest(userData));
        });
      });
      describe('when an invalid one is provided', () => {
        before(async () => {
          userData = defaults();
          serviceRegisterRequests = [];

          nock(regUrl)
            .post('/users/validate', (body) => {
              serviceRegisterRequests.push(body);
              return true;
            })
            .reply(400, {
              error: {
                id: ErrorIds.InvalidInvitationToken
              }
             });
          res = await request.post(methodPath).send(userData);
        });
        it('[4GON] should respond with status 400', () => {
          assert.equal(res.status, 400);
        });
        it('[ZBYW] should send the right data to register', () => {
          const validationSent = serviceRegisterRequests[0];
          assert.deepEqual(validationSent, buildValidationRequest(userData));
        });
      });
    });
    describe('when invitationTokens are set to [] (forbidden creation)', () => {
      describe('when any string is provided', () => {
        before(async () => {
          userData = defaults();
          serviceRegisterRequests = [];

          nock(regUrl)
            .post('/users/validate', (body) => {
              serviceRegisterRequests.push(body);
              return true;
            })
            .reply(400, {
              error: {
                id: ErrorIds.InvalidInvitationToken
              } });
          res = await request.post(methodPath).send(userData);
        });
        it('[CX9N] should respond with status 400', () => {
          assert.equal(res.status, 400);
        });
        it('[IH6K] should send the right data to register', () => {
          const validationSent = serviceRegisterRequests[0];
          assert.deepEqual(validationSent, buildValidationRequest(userData));
        });
      });
    });

    describe('when custom account streams validation exists', () => {
      describe('when email is set as required and it is not set in the request', () => {
        before(async () => {
          userData = defaults();
          // remove email from the request
          delete userData.email;
          res = await request.post(methodPath).send(userData);
        });
        it('[UMWB] should respond with status 400', () => {
          assert.equal(res.status, 400);
        });
        it('[8RDA] should respond with the correct error', () => {
          const error = res.body.error;
          assert.equal(error.id, ErrorIds.InvalidParametersFormat);
          assert.deepEqual(error.data, [
            {
              code: ErrorIds.EmailRequired,
              message: ErrorMessages[ErrorIds.EmailRequired],
              path: '#/',
              param: 'email'
            }
          ]);
        });
      });
      describe('when field does not match custom validation settings', () => {
        before(async () => {
          userData = userData = defaults();
          userData.insurancenumber = 'abc';
          res = await request.post(methodPath).send(userData);
        });
        it('[8W22] should respond with status 400', () => {
          assert.equal(res.status, 400);
        });
        it('[GBKD] should respond with the correct error', () => {
          const error = res.body.error;
          assert.equal(error.id, ErrorIds.InvalidParametersFormat);
          assert.deepEqual(error.data, [
            {
              code: 'cool-error',
              message: 'Cool error',
              path: '#/insurancenumber',
              param: 'insurancenumber'
            }
          ]);
        });
      });
    });

  });
  describe('GET /:username/check', function() {
    function path(username) {
      return `/${username}/check_username`;
    }

    it('[7T9L] when checking a valid available username, it should respond with status 200 and {reserved:false}', async () => {
      userData = defaults();
      serviceRegisterRequests = [];

      nock(regUrl)
        .get(path(userData.username), (body) => {
          serviceRegisterRequests.push(body);
          return true;
        })
        .reply(200, {
          reserved: false
        });

      const res = await request.get(path(userData.username))

      const body = res.body;
      assert.equal(res.status, 200);
      assert.isFalse(body.reserved);
    });

    it('[153Q] when checking a valid taken username, it should respond with status 400 and the correct error', async () => {
      userData = defaults();
      serviceRegisterRequests = [];

      nock(regUrl)
        .get(path(userData.username), (body) => {
          serviceRegisterRequests.push(body);
          return true;
        })
        .reply(400, {
          reserved: true
        });

      const res = await request.get(path(userData.username))

      const body = res.body;
      assert.equal(res.status, 400);
      assert.equal(body.error.id, ErrorIds.ItemAlreadyExists);
      assert.deepEqual(body.error.data, { username: userData.username });
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


