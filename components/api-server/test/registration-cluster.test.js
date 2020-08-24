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
      it('[GRAW] should respond with status 201', () => {
        assert.equal(res.status, 201);
      });
      it('[AY44] should respond with the username and apiEndpoint (TODO)', () => {
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
      it('[NUC9] should respond with status 400', () => {
        assert.equal(res.status, 400);  
      });
      it('[X1IA] should respond with the correct error', () => {
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
      it('[SJXN] should respond with status 400', () => {
        assert.equal(res.status, 400);
      });
      it('[U0ZN] should respond with the correct error', () => {
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
    });

    describe('when there is a simultaneous registration', () => {
      before(async () => {
        userData = defaults();
  
        nock(regUrl)
          .post('/users/validate')
          .reply(400, {
            errors: ['DuplicatedUserRegistration']
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
    });

    describe('when invitationTokens are undefined', () => {
      describe('and a random string is provided as "invitationToken"', () => {
        before(async () => {
          userData = defaults();
          userData.invitationToken = charlatan.Lorem.characters(25);

          nock(regUrl)
            .post('/users/validate')
            .reply(200, { errors: [] });
          nock(regUrl)
            .post('/users')
            .reply(200, {
              username: userData.username
            });
          res = await request.post(methodPath).send(userData);
        });
        it('[CMOV] should respond with status 201', () => {
          assert.equal(res.status, 201);
        });
      });
      describe('and "invitationToken" is missing', () => {
        before(async () => {
          userData = defaults();
          delete userData.invitationToken;

          nock(regUrl)
            .post('/users/validate')
            .reply(200, { errors: [] });
          nock(regUrl)
            .post('/users')
            .reply(200, {
              username: userData.username,
            });
          res = await request.post(methodPath).send(userData);
        });
        it('[LOIB] should respond with status 201', () => {
          assert.equal(res.status, 201);
        });
      });
    
    });

    describe('when invitationTokens are defined', () => {
      describe('when a valid one is provided', () => {
        before(async () => {
          userData = defaults();

          nock(regUrl)
            .post('/users/validate')
            .reply(200, { errors: [] });
          nock(regUrl)
            .post('/users')
            .reply(200, {
              username: userData.username,
            });
          res = await request.post(methodPath).send(userData);
        });
        it('[Z2ZY] should respond with status 201', () => {
          assert.equal(res.status, 201);
        });
      });
      describe('when an invalid one is provided', () => {
        before(async () => {
          userData = defaults();

          nock(regUrl)
            .post('/users/validate')
            .reply(400, { errors: ['InvalidInvitationToken'] });
          res = await request.post(methodPath).send(userData);
        });
        it('[4GON] should respond with status 400', () => {
          assert.equal(res.status, 400);
        });
      });
    });
    describe('when invitationTokens are set to [] (forbidden creation)', () => {
      describe('when any string is provided', () => {
        before(async () => {
          userData = defaults();

          nock(regUrl)
            .post('/users/validate')
            .reply(400, { errors: ['InvalidInvitationToken'] });
          res = await request.post(methodPath).send(userData);
        });
        it('[CX9N] should respond with status 400', () => {
          assert.equal(res.status, 400);
        });
      });
    });
  });
  describe('GET /:username/check', function() {
    const userData = defaults();
    function path(username) {
      return `/${username}/check_username`;
    }

    it('[7T9L] when checking a valid available username, it should respond with status 200 and {reserved:false}', async () => {
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

    it('[153Q] when checking a valid taken username, it should respond with status 400 and the correct error', async () => {
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


