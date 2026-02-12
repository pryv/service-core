/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Account tests (Pattern C)
 * Converted from account-2convert.test.js
 * These tests use fixtures with unique identifiers for parallel execution
 */

/* global initTests, initCore, coreRequest, getNewFixture, assert, cuid */

const ErrorIds = require('errors').ErrorIds;
const validation = require('./helpers/validation');
const methodsSchema = require('../src/schema/accountMethods');

describe('[ACCP] account (Pattern C)', function () {
  let fixtures;
  let username, personalToken, appToken;
  let basePath;

  before(async function () {
    await initTests();
    await initCore();

    fixtures = getNewFixture();
    username = cuid();
    personalToken = cuid();
    appToken = cuid();
    basePath = '/' + username + '/account';

    // Create user
    const user = await fixtures.user(username);

    // Create personal access with session
    await user.access({
      type: 'personal',
      token: personalToken
    });
    await user.session(personalToken);

    // Create app access for "forbidden to non-personal" tests
    await user.access({
      type: 'app',
      name: 'test-app',
      token: appToken,
      permissions: [{ streamId: '*', level: 'contribute' }]
    });
  });

  describe('[ACP1] GET /', function () {
    it('[PHSB] must return the user\'s account details', async function () {
      const res = await coreRequest
        .get(basePath)
        .set('Authorization', personalToken);

      validation.check(res, {
        status: 200,
        schema: methodsSchema.get.result
      });

      assert.ok(res.body.account);
      assert.strictEqual(res.body.account.username, username);
    });

    it('[K5EI] must be forbidden to non-personal accesses', async function () {
      const res = await coreRequest
        .get(basePath)
        .set('Authorization', appToken);

      validation.checkErrorForbidden(res);
    });
  });

  describe('[ACP2] PUT /', function () {
    it('[AT0V] must return a correct error if the sent data is badly formatted', async function () {
      const res = await coreRequest
        .put(basePath)
        .set('Authorization', personalToken)
        .send({ badProperty: 'bad value' });

      validation.checkErrorInvalidParams(res);
    });

    it('[NZE2] must be forbidden to non-personal accesses', async function () {
      const res = await coreRequest
        .put(basePath)
        .set('Authorization', appToken)
        .send({ language: 'zh' });

      validation.checkErrorForbidden(res);
    });
  });

  describe('[ACP4] /change-password', function () {
    const changePwdPath = () => basePath + '/change-password';

    it('[STWH] must return an error if the given old password does not match', async function () {
      const data = {
        oldPassword: 'bad-password',
        newPassword: 'Dr0ws$4p'
      };

      const res = await coreRequest
        .post(changePwdPath())
        .set('Authorization', personalToken)
        .send(data);

      validation.checkError(res, {
        status: 400,
        id: ErrorIds.InvalidOperation
      });
    });

    it('[8I1N] must return a correct error if the sent data is badly formatted', async function () {
      const res = await coreRequest
        .post(changePwdPath())
        .set('Authorization', personalToken)
        .send({ badProperty: 'bad value' });

      validation.checkErrorInvalidParams(res);
    });

    it('[J5VH] must be forbidden to non-personal accesses', async function () {
      const res = await coreRequest
        .post(changePwdPath())
        .set('Authorization', appToken)
        .send({ some: 'data' });

      validation.checkErrorForbidden(res);
    });
  });

  describe('[ACP8] /request-password-reset and /reset-password', function () {
    const requestPath = () => basePath + '/request-password-reset';
    const resetPath = () => basePath + '/reset-password';
    const trustedOrigin = 'http://test.pryv.local';

    it('[J6GB] "request" must return an error if the requesting app is not trusted', async function () {
      const res = await coreRequest
        .post(requestPath())
        .set('Origin', trustedOrigin)
        .send({ appId: 'bad-app-id' });

      validation.checkError(res, {
        status: 401,
        id: ErrorIds.InvalidCredentials
      });
    });

    it('[5K14] "request" must return an error if sent data is badly formatted', async function () {
      const res = await coreRequest
        .post(requestPath())
        .send({ badParam: '?' });

      validation.checkErrorInvalidParams(res);
    });

    it('[PKBP] "reset" must return an error if the reset token is invalid/expired', async function () {
      const data = {
        appId: 'pryv-test',
        resetToken: 'bad-token',
        newPassword: '>-=(X)=-<'
      };

      const res = await coreRequest
        .post(resetPath())
        .set('Origin', trustedOrigin)
        .send(data);

      validation.checkError(res, {
        status: 401,
        id: ErrorIds.InvalidAccessToken
      });
    });

    it('[ON9V] "reset" must return an error if the requesting app is not trusted', async function () {
      const res = await coreRequest
        .post(resetPath())
        .set('Origin', trustedOrigin)
        .send({ resetToken: '?', newPassword: '123456', appId: 'bad-app-id' });

      validation.checkError(res, {
        status: 401,
        id: ErrorIds.InvalidCredentials
      });
    });

    it('[T5L9] "reset" must return an error if sent data is badly formatted', async function () {
      const res = await coreRequest
        .post(resetPath())
        .send({ badParam: '?' });

      validation.checkErrorInvalidParams(res);
    });
  });
});
