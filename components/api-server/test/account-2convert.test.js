/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Tests extracted from account.test.js - candidates for Pattern C conversion
 * These tests don't require server restarts or mock injection
 * TODO: Convert to Pattern C (use coreRequest, fixtures, cuid)
 */

const async = require('async');

require('./test-helpers');
const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const ErrorIds = require('errors').ErrorIds;
const validation = helpers.validation;
const methodsSchema = require('../src/schema/accountMethods');
const testData = helpers.data;

describe('[ACCO-2C] account (to convert)', function () {
  const user = structuredClone(testData.users[0]);
  let request = null;

  const basePath = '/' + user.username + '/account';

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      }
    ], done);
  });

  describe('[AC01-2C] GET /', function () {
    beforeEach(async () => { await testData.resetUsers(); });

    it('[PHSB-2C] must return the user\'s account details', function (done) {
      request.get(basePath).end(function (res) {
        const expected = structuredClone(user);
        delete expected.id;
        delete expected.password;
        delete expected.storageUsed;
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: { account: expected },
          sanitizeFn: cleanUpDetails,
          sanitizeTarget: 'account'
        }, done);
      });
    });

    it('[K5EI-2C] must be forbidden to non-personal accesses', function (done) {
      request.get(basePath, testData.accesses[4].token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });
  });

  describe('[AC02-2C] PUT /', function () {
    beforeEach(async () => { await testData.resetUsers(); });

    it('[AT0V-2C] must return a correct error if the sent data is badly formatted', function (done) {
      request.put(basePath).send({ badProperty: 'bad value' }).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[NZE2-2C] must be forbidden to non-personal accesses', function (done) {
      request
        .put(basePath, testData.accesses[4].token)
        .send({ language: 'zh' }).end(function (res) {
          validation.checkErrorForbidden(res, done);
        });
    });
  });

  describe('[AC04-2C] /change-password', function () {
    before(async () => { await testData.resetUsers(); });

    const path = basePath + '/change-password';

    it('[STWH-2C] must return an error if the given old password does not match', function (done) {
      const data = {
        oldPassword: 'bad-password',
        newPassword: 'Dr0ws$4p'
      };
      request.post(path).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation
        }, done);
      });
    });

    it('[8I1N-2C] must return a correct error if the sent data is badly formatted', function (done) {
      request.post(path).send({ badProperty: 'bad value' }).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[J5VH-2C] must be forbidden to non-personal accesses', function (done) {
      request.post(path, testData.accesses[4].token).send({ some: 'data' }).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });
  });

  describe('[AC08-2C] /request-password-reset and /reset-password', function () {
    const requestPath = basePath + '/request-password-reset';
    const resetPath = basePath + '/reset-password';
    const authData = { appId: 'pryv-test' };

    it('[J6GB-2C] "request" must return an error if the requesting app is not trusted', function (done) {
      request.post(requestPath).send({ appId: 'bad-app-id' })
        .unset('authorization')
        .set('Origin', 'http://test.pryv.local')
        .end(function (res) {
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidCredentials
          }, done);
        });
    });

    it('[5K14-2C] "request" must return an error if sent data is badly formatted', function (done) {
      request.post(requestPath).send({ badParam: '?' })
        .unset('authorization')
        .end(function (res) {
          validation.checkErrorInvalidParams(res, done);
        });
    });

    it('[PKBP-2C] "reset" must return an error if the reset token is invalid/expired', function (done) {
      const data = Object.assign({}, authData, {
        resetToken: 'bad-token',
        newPassword: '>-=(♥️)=-<'
      });
      request.post(resetPath).send(data)
        .unset('authorization')
        .set('Origin', 'http://test.pryv.local')
        .end(function (res) {
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidAccessToken
          }, done);
        });
    });

    it('[ON9V-2C] "reset" must return an error if the requesting app is not trusted', function (done) {
      request.post(resetPath).send({ resetToken: '?', newPassword: '123456', appId: 'bad-app-id' })
        .unset('authorization')
        .set('Origin', 'http://test.pryv.local')
        .end(function (res) {
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidCredentials
          }, done);
        });
    });

    it('[T5L9-2C] "reset" must return an error if sent data is badly formatted', function (done) {
      request.post(resetPath).send({ badParam: '?' })
        .unset('authorization')
        .end(function (res) {
          validation.checkErrorInvalidParams(res, done);
        });
    });
  });

  function cleanUpDetails (accountDetails) {
    delete accountDetails.storageUsed;
  }
});
