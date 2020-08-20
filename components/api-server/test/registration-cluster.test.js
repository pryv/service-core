/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const helpers = require('./helpers'); // so it doesnt break

const nock = require('nock');
const charlatan = require('charlatan');
const _ = require('lodash');
const bluebird = require('bluebird');
const supertest = require('supertest');
const assert = require('chai').assert;

const Settings = require('../src/settings');
const { config, getConfig } = require('components/api-server/config/Config');
const Application = require('../src/application');
const ErrorIds = require('components/errors/src/ErrorIds');
const ErrorMessages = require('components/errors/src/ErrorMessages');

function defaults() {
  return {
    appId: 'pryv-test',
    username: charlatan.Lorem.characters(7),
    email: charlatan.Internet.email(),
    password: 'abcdefgh',
    invitationToken: 'enjoy',
    referer: 'pryv',
    insurancenumber: charlatan.Number.number()
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

  before(async function() {
    settings = await Settings.load();
    config = getConfig();
    config.set('singleNode:isActive', false);
    config.set('openSource:isActive', false);
    regUrl = settings.get('services.register.url').str();

    app = new Application(settings);
    await app.initiate();

    require('../src/methods/auth/register')(
      app.api,
      app.logging,
      app.storageLayer,
      app.settings.get('services').obj(),
      app.settings.get('server').obj()
    );

    request = supertest(app.expressApp);
  });

  const methodPath = '/users';
  const defaultServerName = 'abc';

  async function successfulServiceRegisterMockup() {
    helpers.instanceTestSetup.set(settings, {
      context: {
        url: settings.services.register.url,
        defaultServerName: defaultServerName
      },
      execute: function() {
        const scope = nock(this.context.url);
        scope.post('/users/validate').reply(200, { errors: [] });
        scope.post('/users').reply(200, {
          username: 'anyusername',
          server: this.context.defaultServerName
        });
      }
    });
    await new Promise(server.ensureStarted.bind(server, settings));
  }

  async function registrationRequest(userData) {
    return await bluebird.fromCallback(cb =>
      request
        .post(methodPath)
        .send(userData)
        .end(res => {
          cb(null, res);
        })
    );
  }

  describe('POST /users (create user)', function() {
    describe('when the username exists in core but not in register', () => {
      before(async () => {
        // pretend saving user only in service-core
        userData = defaults();

        // allow all requests to service-register twice
        nock(regUrl)
          .post('/users/validate')
          .times(2)
          .reply(200, { errors: [] });
        nock(regUrl)
          .post('/users')
          .times(2)
          .reply(200, {
            username: 'anyusername'
          });

        await request.post(methodPath).send(userData);
        res = await request.post(methodPath).send(userData);
      });
      it('should respond with status 201', () => {
        assert.equal(res.status, 201);
      });
      it('should respond with the username and apiEndpoint (TODO)', () => {
        const body = res.body;
        assert.equal(body.username, userData.username);
      });
    });
    describe('when the username exists in register', () => {
      before(async () => {
        userData = _.extend({}, defaults(), { username: 'wactiv' });

        nock(regUrl)
          .post('/users/validate')
          .reply(400, {
            errors: ['Existing_username']
          });
  
        res = await request.post(methodPath).send(userData);
      });
      it('should respond with status 400', () => {
        assert.equal(res.status, 400);  
      });
      it('should respond with the correct error', () => {
        const error = res.body.error;
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
        assert.equal(error.data.username, userData.username);
      });
    });

    describe('when the email exists in register', () => {
      before(async () => {
        userData = _.extend({}, defaults(), { email: 'wactiv@pryv.io' });

        nock(regUrl)
          .post('/users/validate')
          .reply(400, {
            errors: ['Existing_email']
          });
  
        res = await request.post(methodPath).send(userData);
      });
      it('should respond with status 400', () => {
        assert.equal(res.status, 400);
      });
      it('should respond with the correct error', () => {
        const error = res.body.error;
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
        assert.equal(error.data.email, userData.email);
      });
    });

    describe('when the user and email exist in register', () => {
      before(async () => {
        userData = _.extend({}, defaults(), {
          username: 'wactiv',
          email: 'wactiv@pryv.io'
        });
  
        nock(regUrl)
          .post('/users/validate')
          .reply(400, {
            errors: ['Existing_email', 'Existing_username']
          });
  
        res = await request.post(methodPath).send(userData);
      });
      it('should respond with status 400', () => {
        assert.equal(res.status, 400);
      });
      it('should respond with the correct error', () => {
        const error = res.body.error;
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
        assert.equal(error.data.email, userData.email);
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
        assert.equal(error.data.username, userData.username);
      });
    });

    it.skip('Fail to register when reservation is not successful', async () => {
      const userData = _.extend({}, defaults());
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url
        },
        execute: function() {
          const scope = require('nock')(this.context.url);
          scope.post('/users/validate').reply(400, {
            success: false,
            errors: ['DuplicatedUserRegistration']
          });
        }
      });

      await new Promise(server.ensureStarted.bind(server, settings));
      const res = await registrationRequest(userData);

      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [
          {
            code: ErrorIds.DuplicatedUserRegistration,
            message: ErrorMessages[ErrorIds.DuplicatedUserRegistration],
            path: '#/username',
            param: 'username'
          }
        ]
      });
    });
  });
  describe('GET /:username/check', function() {
    const userData = defaults();
    function path(username) {
      return `/${username}/check_username`;
    }

    it('when checking a valid available username, it should respond with status 200 and {reserved:false}', async () => {
      nock(regUrl)
        .get(path(userData.username))
        .reply(200, {
          reserved: false
        });

      const res = await request.get(path(userData.username))

      const body = res.body;
      assert.equal(res.status, 200);
      assert.isFalse(body.reserved);
    });

    it('when checking a valid taken username, it should respond with status 400 and the correct error', async () => {
      const userData = defaults();

      nock(regUrl)
        .get(path(userData.username))
        .reply(400, {
          reserved: true
        });

      const res = await request.get(path(userData.username))

      const body = res.body;
      assert.equal(res.status, 400);
      assert.equal(body.error.id, ErrorIds.ItemAlreadyExists);
      assert.deepEqual(body.error.data, { username: userData.username });
    });

    it('when checking a too short username, it should respond with status 400 and the correct error', async () => {
      const res = await request.get(path('a'.repeat(4)));

      const body = res.body;
      assert.equal(res.status, 400);
      assert.equal(body.error.id, ErrorIds.InvalidParametersFormat);
      assert.isTrue(body.error.data[0].code.includes('username'));
    });
    it('when checking a too long username, it should respond with status 400 and the correct error', async () => {
      const res = await request.get(path('a'.repeat(24)));

      const body = res.body;
      assert.equal(res.status, 400);
      assert.equal(body.error.id, ErrorIds.InvalidParametersFormat);
      assert.isTrue(body.error.data[0].code.includes('username'));
    });
    it('when checking a username with invalid characters, it should respond with status 400 and the correct error', async () => {
      const res = await request.get(path('abc:def'));

      const body = res.body;
      assert.equal(res.status, 400);
      assert.equal(body.error.id, ErrorIds.InvalidParametersFormat);
      assert.isTrue(body.error.data[0].code.includes('username'));
    });
  });
});

describe('Undefined invitationTokens', function() {
  // let defaultConfigInvitationTokens;

  // before(function () {
  //   defaultConfigInvitationTokens = config.get('invitationTokens');
  //   config.set('invitationTokens', null);
  // });

  // after(function () {
  //   config.set('invitationTokens', defaultConfigInvitationTokens);
  // });

  it('should succeed when providing anything in the "invitationToken" field', async () => {
    const userData = _.extend({}, defaults(), {
      invitationToken: 'anythingAtAll'
    });
    await successfulServiceRegisterMockup();
    const res = await registrationRequest(userData);

    validation.check(res, {
      status: 201,
      schema: authSchema.register.result,
      body: {
        username: userData.username,
        server: defaultServerName
      }
    });
  });

  it('should succeed when the "invitationToken" field is missing', async () => {
    const userData = _.extend({}, defaults());
    delete userData.invitationToken;

    await successfulServiceRegisterMockup();
    const res = await registrationRequest(userData);

    validation.check(res, {
      status: 201,
      schema: authSchema.register.result,
      body: {
        username: userData.username,
        server: defaultServerName
      }
    });
  });
});
