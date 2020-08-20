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
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');
const ErrorIds = require('components/errors/src/ErrorIds');
const ErrorMessages = require('components/errors/src/ErrorMessages');

//TODO IEVA
function randomuser() {
  return 'testpfx' + Math.floor(Math.random() * 100000);
}

function defaults() {
  return {
    appId: 'pryv-test',
    username: randomuser(),
    email: charlatan.Internet.email(),
    password: 'abcdefgh',
    invitationToken: 'enjoy',
    referer: 'pryv',
    insurancenumber: charlatan.Number.number(),
  };
}

describe('registration: cluster', async () => {
  let app;
  let registerBody;
  let request;
  let res;
  let settings;
  let config;
  let regUrl;

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

    registerBody = {
      username: charlatan.Lorem.characters(7),
      password: charlatan.Lorem.characters(7),
      email: charlatan.Internet.email(),
      appId: charlatan.Lorem.characters(7)
    };
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
    it('existing username in service-register', async () => {
      const userData = _.extend({}, defaults(), { username: 'wactiv' });

      nock(regUrl)
        .post('/users/validate')
        .reply(400, {
          errors: ['Existing_username']
        });

      const res = await request.post(methodPath).send(userData);
      const error = res.body.error;
      assert.equal(res.status, 400);
      assert.equal(error.id, ErrorIds.ItemAlreadyExists);
      assert.equal(error.data.username, userData.username);
    });

    it('existing username in service-core but not in service-register', async () => {
      // pretend saving user only in service-core
      const userData = defaults();

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
      const res = await request.post(methodPath).send(userData);
      const body = res.body;
      assert.equal(res.status, 201);
      assert.equal(body.username, userData.username);
    });

    it('existing email in service register', async () => {
      const userData = _.extend({}, defaults(), { email: 'wactiv@pryv.io' });

      nock(regUrl)
        .post('/users/validate')
        .reply(400, {
          errors: ['Existing_email']
        });

      const res = await request.post(methodPath).send(userData);
      const error = res.body.error;
      assert.equal(res.status, 400);
      assert.equal(error.id, ErrorIds.ItemAlreadyExists);
      assert.equal(error.data.email, userData.email);
    });

    it('existing user and email', async () => {
      const userData = _.extend({}, defaults(), {
        username: 'wactiv',
        email: 'wactiv@pryv.io'
      });

      nock(regUrl)
        .post('/users/validate')
        .reply(400, {
          errors: ['Existing_email', 'Existing_username']
        });

      const res = await request.post(methodPath).send(userData);
      const error = res.body.error;
      assert.equal(res.status, 400);
      assert.equal(error.id, ErrorIds.ItemAlreadyExists);
      assert.equal(error.data.email, userData.email);
      assert.equal(error.id, ErrorIds.ItemAlreadyExists);
      assert.equal(error.data.username, userData.username);
    });

    it('Fail to register when reservation is not successful', async () => {
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
  describe('POST /username/check', function() {

    const userData = defaults();
    const path = '/username/check';

    it('available', async () => {
    
      nock(regUrl)
        .get(`/${userData.username}/check_username`)
        .reply(200, {
          reserved: false
        });

      const res = await request
        .post(path)
        .send({
          username: userData.username
        });

      const body = res.body;
      assert.equal(res.status, 200);
      assert.isFalse(body.reserved);
    });

    it('unavailable', async () => {
      const userData = defaults();

      nock(regUrl)
        .get(`/${userData.username}/check_username`)
        .reply(400, {
          reserved: true
        });

      const res = await request
        .post(path)
        .send({
          username: userData.username
        });

      const body = res.body;
      console.log(body)
      assert.equal(res.status, 400);
      assert.equal(body.error.id, ErrorIds.ItemAlreadyExists);
      assert.deepEqual(body.error.data, { username: userData.username });
    });
  });
});

describe('Undefined invitationTokens', async () => {
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

describe('GET /:username/check_username', function() {
  it('too short', async () => {
    // var test = {
    //   username: 'abcd', status: 400, desc: 'too short ',
    //   JSchema: schemas.error, JValues: { 'id': 'INVALID_USER_NAME' }
    // };

    const username = 'abc';

    await new Promise(server.ensureStarted.bind(server, settings));
    const res = await bluebird.fromCallback(cb =>
      request.get(`/${username}/check_username`).end(res => {
        cb(null, res);
      })
    );
    validation.checkError(res, {
      status: 400,
      id: ErrorIds.InvalidParametersFormat,
      data: [
        {
          code: ErrorIds.InvalidUsername,
          message: ErrorMessages[ErrorIds.InvalidUsername],
          param: 'username',
          path: '#/username'
        }
      ]
    });
  });

  it('invalid username', async () => {
    // var test = {
    //   username: 'abcdefghijklmnopqrstuvwxyzasaasaaas' +
    //     'abcdefghijklmnopqrstuvwxyzasaasaaas' +
    //     'abcdefghijklmnopqrstuvwxyzasaasaaas' +
    //     'abcdefghijklmnopqrstuvwxyzasaasaaas', status: 400, desc: 'too long ',
    //   JSchema: schemas.error, JValues: { 'id': 'INVALID_USER_NAME' }
    // };

    const username =
      'abcdefghijklmnopqrstuvwxyzasaasaaas' +
      'abcdefghijklmnopqrstuvwxyzasaasaaas' +
      'abcdefghijklmnopqrstuvwxyzasaasaaas' +
      'abcdefghijklmnopqrstuvwxyzasaasaaas';

    await new Promise(server.ensureStarted.bind(server, settings));
    const res = await bluebird.fromCallback(cb =>
      request.get(`/${username}/check_username`).end(res => {
        cb(null, res);
      })
    );
    validation.checkError(res, {
      status: 400,
      id: ErrorIds.InvalidParametersFormat,
      data: [
        {
          code: ErrorIds.InvalidUsername,
          message: ErrorMessages[ErrorIds.InvalidUsername],
          param: 'username',
          path: '#/username'
        }
      ]
    });
  });

  it('invalid character 1', async () => {
    // var test = {
    //   username: 'abc%20def', status: 400, desc: 'invalid character 1',
    //   JSchema: schemas.error, JValues: { 'id': 'INVALID_USER_NAME' }
    // };
    const username = 'abc%20def';
    await new Promise(server.ensureStarted.bind(server, settings));
    const res = await bluebird.fromCallback(cb =>
      request.get(`/${username}/check_username`).end(res => {
        cb(null, res);
      })
    );
    validation.checkError(res, {
      status: 400,
      id: ErrorIds.InvalidParametersFormat,
      data: [
        {
          code: ErrorIds.InvalidUsername,
          message: ErrorMessages[ErrorIds.InvalidUsername],
          param: 'username',
          path: '#/username'
        }
      ]
    });
  });

  it('invalid character 2', async () => {
    // var test = {
    //   username: 'abc.def', status: 400, desc: 'invalid character 2',
    //   JSchema: schemas.error, JValues: { 'id': 'INVALID_USER_NAME' }
    // };

    const username = 'abc.def';
    await new Promise(server.ensureStarted.bind(server, settings));
    const res = await bluebird.fromCallback(cb =>
      request.get(`/${username}/check_username`).end(res => {
        cb(null, res);
      })
    );
    validation.checkError(res, {
      status: 400,
      id: ErrorIds.InvalidParametersFormat,
      data: [
        {
          code: ErrorIds.InvalidUsername,
          message: ErrorMessages[ErrorIds.InvalidUsername],
          param: 'username',
          path: '#/username'
        }
      ]
    });
  });

  it('authorized', async () => {
    // var test = {
    //   username: 'abcd-ef', status: 200, desc: '- authorized ',
    //   JSchema: schemas.checkUID
    // };
    const username = 'abcd-ef';
    helpers.instanceTestSetup.set(settings, {
      context: {
        url: settings.services.register.url,
        username: username
      },
      execute: function() {
        require('nock')(this.context.url)
          .get('/' + this.context.username + '/check_username')
          .reply(200, { reserved: false, reason: 'RESERVED_USER_NAME' });
      }
    });
    await new Promise(server.ensureStarted.bind(server, settings));
    const res = await bluebird.fromCallback(cb =>
      request.get(`/${username}/check_username`).end(res => {
        cb(null, res);
      })
    );
    validation.check(res, {
      status: 200,
      id: ErrorIds.InvalidParametersFormat
    });
  });

  it('correct', async () => {
    // var test = {
    //   username: 'wactiv', status: 200, desc: 'correct ',
    //   JSchema: schemas.checkUID
    // };

    const username = 'wactiv';
    helpers.instanceTestSetup.set(settings, {
      context: {
        url: settings.services.register.url,
        username: username
      },
      execute: function() {
        require('nock')(this.context.url)
          .get(`/${this.context.username}/check_username`)
          .reply(200, { reserved: false, reason: 'RESERVED_USER_NAME' });
      }
    });

    await new Promise(server.ensureStarted.bind(server, settings));
    const res = await bluebird.fromCallback(cb =>
      request.get(`/${username}/check_username`).end(res => {
        cb(null, res);
      })
    );
    validation.check(res, {
      status: 200,
      reserved: false
    });
  });
});

it('reserved dns', async () => {
  // var test = {
  //   username: 'access', status: 200, desc: 'reserved dns',
  //   JSchema: schemas.checkUID, JValues: { reserved: true, reason: 'RESERVED_USER_NAME' }
  // };

  const username = 'access';
  helpers.instanceTestSetup.set(settings, {
    context: {
      url: settings.services.register.url,
      username: username
    },
    execute: function() {
      require('nock')(this.context.url)
        .get(`/${this.context.username}/check_username`)
        .reply(200, { reserved: false, reason: 'RESERVED_USER_NAME' });
    }
  });

  await new Promise(server.ensureStarted.bind(server, settings));
  const res = await bluebird.fromCallback(cb =>
    request.get(`/${username}/check_username`).end(res => {
      cb(null, res);
    })
  );

  validation.check(res, {
    status: 200,
    reserved: false,
    reason: ErrorIds.ReservedUsername
  });
});
