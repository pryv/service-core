/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

//const { databaseFixture } = require('components/test-helpers');

require('../test-helpers');
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('../test-helpers');

const charlatan = require('charlatan');
const helpers = require('../helpers');
const server = helpers.dependencies.instanceManager;
const validation = helpers.validation;
const authSchema = require('components/api-server/src/schema/authMethods');

const _ = require('lodash');
const bluebird = require('bluebird');
const ErrorIds = require('components/errors/src/ErrorIds');
const ErrorMessages = require('components/errors/src/ErrorMessages');

//TODO IEVA
function randomuser() { return 'testpfx' + Math.floor(Math.random() * (100000)); }

function defaults() {
  return {
    appId: 'pryv-test',
    username: randomuser(),
    email: charlatan.Internet.email(),
    password: 'abcdefgh',
    invitationtoken: 'enjoy',
    referer: 'pryv'
  };
}


describe('User Registration related functionalities', async () => {
  let request = null;
  var basePath = '/user';
  const settings = _.cloneDeep(helpers.dependencies.settings);
  const defaultServerName = 'abc';

  async function successfulServiceRegisterMockup() {
    helpers.instanceTestSetup.set(settings, {
      context: {
        url: settings.services.register.url,
        defaultServerName: defaultServerName
      },
      execute: function () {
        const scope = require('nock')(this.context.url);
        scope.post('/users/validate').reply(200, { errors: [] });
        scope.post('/users').reply(200, { 
          username: 'anyusername',
          server: this.context.defaultServerName
       });
      }
    });
    await (new Promise(server.ensureStarted.bind(server, settings)));
  }

  async function registrationRequest(userData) {
    return await bluebird.fromCallback(cb =>
      request.post(basePath).send(userData).end((res) => {
        cb(null, res);
      }));
  }

  beforeEach(async () => {
    await (new Promise(server.ensureStarted.bind(server, helpers.dependencies.settings)));
    request = helpers.request(server.url);
  });

  describe('POST /user (create user)', function () {
    // fixes missing appId PR#104
    it('user creation should store all provided fields', async () => {
      // setup registration server mock
      const userData = defaults();
      await successfulServiceRegisterMockup();
      const res = await registrationRequest(userData);

      validation.check(res, {
        status: 201,
        schema: authSchema.register.result,
        body: {
          username: userData.username,
          server: defaultServerName,
        }
      });
    });

    it('Too short app id', async () => {

      // var test = {
      //   data: { appId: '' },
      //   status: 400, desc: 'Invalid app Id',
      //   // JSchema: schemas.error,
      //   JValues: { 'id': 'INVALID_APPID' }
      // };
      const userData = _.extend({}, defaults(), { appId: 'a'.repeat(5) });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);
      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [{
          code: ErrorIds.InvalidAppId,
          message: ErrorMessages[ErrorIds.InvalidAppId],
          path: '#/appId',
          param: 'appId'
        }]
      });
    });

    it('Too long app id', async () => {

      // var test = {
      //   data: { appId: '' },
      //   status: 400, desc: 'Invalid app Id',
      //   // JSchema: schemas.error,
      //   JValues: { 'id': 'INVALID_APPID' }
      // };
      const userData = _.extend({}, defaults(), { appId: 'a'.repeat(100) });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);
      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [{
          code: ErrorIds.InvalidAppId,
          message: ErrorMessages[ErrorIds.InvalidAppId],
          path: '#/appId',
          param: 'appId'
        }]
      });
    });

    it('invalid username', async () => {

      // var test = {
      //   data: { username: 'wa' },
      //   status: 400, desc: 'Invalid user',
      //   JValues: { 'id': 'INVALID_USER_NAME' }
      // };

      const userData = _.extend({}, defaults(), { username: 'wa' });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);
      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [{
          code: ErrorIds.InvalidUsername,
          message: ErrorMessages[ErrorIds.InvalidUsername],
          path: '#/username',
          param: 'username'
        }]
      });
    });

    it('reserved username', async () => {

      // var test = {
      //   data: { username: 'pryvwa' },
      //   status: 400, desc: 'Reserved user starting by pryv',
      //   JSchema: schemas.error,
      //   JValues: { 'id': 'RESERVED_USER_NAME' }
      // };

      const userData = _.extend({}, defaults(), { username: 'pryvwa' });
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url
        },
        execute: function () {
          require('nock')(this.context.url).post('/users/validate').reply(400, { 
            errors: [ 'ReservedUsername' ] });
        }
      });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);

      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [{
          code: ErrorIds.ReservedUsername,
          message: ErrorMessages[ErrorIds.ReservedUsername],
          path: '#/username',
          param: 'username'
        }]
      });
    });

    it('listed username', async () => {

      // var test = {
      //   data: { username: 'facebook' },
      //   status: 400, desc: 'Reserved user starting from list',
      //   JSchema: schemas.error,
      //   JValues: { 'id': 'RESERVED_USER_NAME' }
      // };

      const userData = _.extend({}, defaults(), { username: 'facebook' });
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url,
          userData: userData
        },
        execute: function () {
          require('nock')(this.context.url).post('/users/validate').reply(400, { 
            errors: [ 'ReservedUsername' ] });
        }
      });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);

      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [
          {
            code: ErrorIds.ReservedUsername,
            message: ErrorMessages[ErrorIds.ReservedUsername],
            param: 'username',
            path: '#/username'
          }
        ]
      });
    });

    it('invalid email', async () => {

      // var test = {
      //   data: { email: null },
      //   status: 400, desc: 'Invalid email',
      //   JSchema: schemas.error,
      //   JValues: { 'id': 'INVALID_EMAIL' }
      // };
      const userData = _.extend({}, defaults(), { email: null });
      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);
      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [
          {
            code: ErrorIds.InvalidEmail,
            message: ErrorMessages[ErrorIds.InvalidEmail],
            param: 'email',
            path: '#/email'
          }
        ]
      });
    });

    it('invalid language', async () => {

      // var test = {
      //   data: { languageCode: 'abcdef' },
      //   status: 400, desc: 'Invalid language',
      //   JSchema: schemas.error,
      //   JValues: { 'id': 'INVALID_LANGUAGE' }
      // };
      const userData = _.extend({}, defaults(), { languageCode: 'abcdef' });
      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await bluebird.fromCallback(cb =>
        request.post(basePath).send(userData).end((res) => {
          cb(null, res);
        }));

      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [
          {
            code: ErrorIds.InvalidLanguage,
            message: ErrorMessages[ErrorIds.InvalidLanguage],
            param: 'languageCode',
            path: '#/languageCode'
          }
        ]
      });
    });

    it('existing username in service-register', async () => {

      // var test = {
      //   data: { username: 'wactiv' },
      //   status: 400, desc: 'Existing user',
      //   JSchema: schemas.multipleErrors,
      //   JValues: { 'id': 'EXISTING_USER_NAME' }
      // };
      const userData = _.extend({}, defaults(), { username: 'wactiv' });
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url,
          userData: userData
        },
        execute: function () {
          require('nock')(this.context.url).post('/users/validate').reply(400, { 
            errors: [ 'ExistingUsername' ] });
        }
      });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);

      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [
          {
            code: ErrorIds.ExistingUsername,
            message: ErrorMessages[ErrorIds.ExistingUsername],
            param: 'username',
            path: '#/username'
          }
        ]
      });
    });

    it('existing username in service-core but not in service-register', async () => {
      // pretend saving user only in service-core
      const userData = defaults();

      // allow all requests to service-register twice
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url,
          defaultServerName: defaultServerName
        },
        execute: function () {
          const scope = require('nock')(this.context.url);
          scope.post('/users/validate').times(2).reply(200, { errors: [] });
          scope.post('/users').times(2).reply(200, { 
            username: 'anyusername',
            server: this.context.defaultServerName
         });
        }
      });
      await (new Promise(server.ensureStarted.bind(server, settings)));
      await registrationRequest(userData);

     const res = await registrationRequest(userData);

      validation.check(res, {
        status: 201,
        schema: authSchema.register.result,
        body: {
          username: userData.username,
          server: defaultServerName,
        }
      });
    });

    it('existing email in service register', async () => {

      // var test = {
      //   data: { email: 'wactiv@pryv.io' },
      //   status: 400, desc: 'Existing e-mail',
      //   JSchema: schemas.multipleErrors,
      //   JValues: { 'id': 'EXISTING_EMAIL' }
      // };

      const userData = _.extend({}, defaults(), { email: 'wactiv@pryv.io' });
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url
        },
        execute: function () {
          require('nock')(this.context.url).post('/users/validate').reply(400, { 
            errors: [ 'ExistingEmail' ] });
        }
      });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);

      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [
          {
            code: ErrorIds.ExistingEmail,
            message: ErrorMessages[ErrorIds.ExistingEmail],
            param: 'email',
            path: '#/email'
          }
        ]
      });
    });

    it('existing user and email', async () => {

      // var test = {
      //   data: { username: 'wactiv', email: 'wactiv@pryv.io' },
      //   status: 400, desc: 'Existing e-mail & username',
      //   JSchema: schemas.multipleErrors,
      //   JValues: {
      //     'id': 'INVALID_DATA',
      //     'errors': [{ 'id': 'EXISTING_USER_NAME' }, { 'id': 'EXISTING_EMAIL' }]
      //   }
      // };

      const userData = _.extend({}, defaults(), { username: 'wactiv', email: 'wactiv@pryv.io' });
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url,
          userData: userData
        },
        execute: function () {
          require('nock')(this.context.url).post('/users/validate').reply(400, { 
            errors: [ 'ExistingUsername', 'ExistingEmail' ] });
        }
      });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);

      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [
          {
            code: ErrorIds.ExistingUsername,
            message: ErrorMessages[ErrorIds.ExistingUsername],
            param: 'username',
            path: '#/username'
          },
          {
            code: ErrorIds.ExistingEmail,
            message: ErrorMessages[ErrorIds.ExistingEmail],
            param: 'email',
            path: '#/email'
          }
        ]
      });

    });

    it('Fail to register when reservation is not successful', async () => {
      const userData = _.extend({}, defaults());
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url
        },
        execute: function () {
          const scope = require('nock')(this.context.url);
          scope.post('/users/validate').reply(400, {
            "success": false, "errors": ["DuplicatedUserRegistration"]
          });
        }
      });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await registrationRequest(userData);

      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidParametersFormat,
        data: [{
          code: ErrorIds.DuplicatedUserRegistration,
          message: ErrorMessages[ErrorIds.DuplicatedUserRegistration],
          path: '#/username',
          param: 'username'
        }]
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
        invitationtoken: 'anythingAtAll'
      });
      await successfulServiceRegisterMockup();
      const res = await registrationRequest(userData);

      validation.check(res, {
        status: 201,
        schema: authSchema.register.result,
        body: {
          username: userData.username,
          server: defaultServerName,
        }
      });
    });

    it('should succeed when the "invitationtoken" field is missing', async () => {
      const userData = _.extend({}, defaults());
      delete userData.invitationtoken;

      await successfulServiceRegisterMockup();
      const res = await registrationRequest(userData);

      validation.check(res, {
        status: 201,
        schema: authSchema.register.result,
        body: {
          username: userData.username,
          server: defaultServerName,
        }
      });
    });
  });

  describe('POST /username/check', function () {
    let usernameCheckPath = '/username/check';

    it('reserved list', async () => {
      const userData = defaults();
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url
        },
        execute: function () {
          const scope = require('nock')(this.context.url);
          scope.post('/username/check').reply(200, false);
        }
      });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await bluebird.fromCallback(cb =>
        request.post(usernameCheckPath).send(userData).end((res) => {
          cb(null, res);
        }));

      validation.check(res, {
        status: 200,
        body: false,
        error: false
      });
      validation.checkHeaders(res, [{
        'name': 'content-type',
        'value': 'text/plain; charset=utf-8'
      }]);
    });

    it('available', async () => {
      const userData = defaults();
      helpers.instanceTestSetup.set(settings, {
        context: {
          url: settings.services.register.url
        },
        execute: function () {
          const scope = require('nock')(this.context.url);
          scope.post('/username/check').reply(200, true);
        }
      });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await bluebird.fromCallback(cb =>
        request.post(usernameCheckPath).send(userData).end((res) => {
          cb(null, res);
        }));

      validation.check(res, {
        status: 200,
        text: 'true',
        error: false
      });
      validation.checkHeaders(res, [{
        'name': 'content-type',
        'value': 'text/plain; charset=utf-8'
      }]);
    });
  });

  describe('GET /:username/check_username', function () {

    it('too short', async () => {
      // var test = {
      //   username: 'abcd', status: 400, desc: 'too short ',
      //   JSchema: schemas.error, JValues: { 'id': 'INVALID_USER_NAME' }
      // };

      const username = 'abc';

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await bluebird.fromCallback(cb =>
        request.get(`/${username}/check_username`).end((res) => {
          cb(null, res);
        }));
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

      const username = 'abcdefghijklmnopqrstuvwxyzasaasaaas' +
        'abcdefghijklmnopqrstuvwxyzasaasaaas' +
        'abcdefghijklmnopqrstuvwxyzasaasaaas' +
        'abcdefghijklmnopqrstuvwxyzasaasaaas';

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await bluebird.fromCallback(cb =>
        request.get(`/${username}/check_username`).end((res) => {
          cb(null, res);
        }));
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
      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await bluebird.fromCallback(cb =>
        request.get(`/${username}/check_username`).end((res) => {
          cb(null, res);
        }));
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
      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await bluebird.fromCallback(cb =>
        request.get(`/${username}/check_username`).end((res) => {
          cb(null, res);
        }));
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
        execute: function () {
          require('nock')(this.context.url)
            .get('/' + this.context.username + '/check_username').reply(200, { reserved: false, reason: 'RESERVED_USER_NAME' });
        }
      });
      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await bluebird.fromCallback(cb =>
        request.get(`/${username}/check_username`).end((res) => {
          cb(null, res);
        }));
      validation.check(res, {
        status: 200,
        id: ErrorIds.InvalidParametersFormat,

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
        execute: function () {
          require('nock')(this.context.url)
            .get(`/${this.context.username}/check_username`).reply(200, { reserved: false, reason: 'RESERVED_USER_NAME' });
        }
      });

      await (new Promise(server.ensureStarted.bind(server, settings)));
      const res = await bluebird.fromCallback(cb =>
        request.get(`/${username}/check_username`).end((res) => {
          cb(null, res);
        })); 
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
      execute: function () {
        require('nock')(this.context.url)
          .get(`/${this.context.username}/check_username`).reply(200, { reserved: false, reason: 'RESERVED_USER_NAME' });
      }
    });


    await (new Promise(server.ensureStarted.bind(server, settings)));
    const res = await bluebird.fromCallback(cb =>
      request.get(`/${username}/check_username`).end((res) => {
        cb(null, res);
      }));

    validation.check(res, {
      status: 200,
      reserved: false,
      reason: ErrorIds.ReservedUsername,
    });
  });
});