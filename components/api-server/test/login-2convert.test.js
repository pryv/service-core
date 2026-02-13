/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Tests extracted from login.test.js - candidates for Pattern C conversion
 * These are error validation tests that don't need server restarts
 * TODO: Convert to Pattern C (use coreRequest, fixtures, cuid)
 */

const assert = require('node:assert');
const async = require('async');
const request = require('superagent');

require('./test-helpers');
const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const validation = helpers.validation;
const ErrorIds = require('errors').ErrorIds;
const testData = helpers.dynData({ prefix: 'lgn2' });

describe('[AUTH-2C] auth (to convert)', function () {
  this.timeout(5000);

  function apiPath (username) {
    return new URL(username, server.url).href;
  }

  function basePath (username) {
    return apiPath(username) + '/auth';
  }

  before(function (done) {
    async.series([
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      testData.resetUsers
    ], done);
  });

  after(async function () {
    await testData.cleanup();
  });

  const user = structuredClone(testData.users[0]);
  const trustedOrigin = 'http://test.pryv.local';
  const authData = {
    username: user.username,
    password: user.password,
    appId: 'pryv-test'
  };

  describe('[AU01-2C] /login error cases', function () {
    function path (username) {
      return basePath(username) + '/login';
    }

    it('[L7JQ-2C] must return a correct error when the local credentials are missing or invalid', function (done) {
      const data = Object.assign({}, authData, {
        username: authData.username,
        password: 'bad-password'
      });
      request
        .post(path(data.username))
        .set('Origin', trustedOrigin)
        .send(data)
        .end(function (err, res) {
          assert.ok(err != null);
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidCredentials
          });
          assert.ok(res.body.token == null);
          done();
        });
    });

    it('[4AQR-2C] must return a correct error if the app id is missing or untrusted', function (done) {
      const data = Object.assign({}, authData, { appId: 'untrusted-app-id' });
      request
        .post(path(data.username))
        .set('Origin', trustedOrigin)
        .send(data)
        .end(function (err, res) {
          assert.ok(err != null);
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidCredentials
          });
          assert.ok(res.body.token == null);
          done();
        });
    });

    it('[NDB0-2C] must return a correct error if the origin is missing or does not match the app id', function (done) {
      request
        .post(path(authData.username))
        .set('Origin', 'http://mismatching.origin')
        .send(authData)
        .end(function (err, res) {
          assert.ok(err != null);
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidCredentials
          });
          assert.ok(res.body.token == null);
          done();
        });
    });
  });
});
