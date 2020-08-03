/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, it */

require('./test-helpers'); 
var helpers = require('./helpers'),
    ErrorIds = require('components/errors').ErrorIds,
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    validation = helpers.validation,
    methodsSchema = require('../src/schema/profileMethods'),
    testData = helpers.data,
    _ = require('lodash');

describe('profile (app)', function () {

  var user = Object.assign({}, testData.users[0]),
      basePath = '/' + user.username + '/profile',
      request = null, // must be set after server instance started
      appAccess = testData.accesses[4],
      appProfile = testData.profile[2],
      sharedAccess = testData.accesses[1];

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) { request = helpers.request(server.url); stepDone(); }
    ], done);
  });

  describe('GET /public', function () {

    before(testData.resetProfile);

    var path = basePath + '/public';

    it('[FWG1] must return publicly shared key-value profile info', function (done) {
      request.get(path, appAccess.token).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {profile: testData.profile[0].data}
        }, done);
      });
    });

  });

  describe('GET /app', function () {

    before(testData.resetProfile);

    var path = basePath + '/app';

    it('[13DL] must return key-value settings for the current app', function (done) {
      request.get(path, appAccess.token).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {profile: appProfile.data}
        }, done);
      });
    });

    it('[J37U] must refuse requests with a shared access token', function (done) {
      request.get(path, sharedAccess.token).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation
        }, done);
      });
    });

    it('[GYBN] must refuse requests with a personal access token', function (done) {
      var personalRequest = helpers.request(server.url);
      async.series([
        personalRequest.login.bind(personalRequest, user),
        function (stepDone) {
          personalRequest.get(path).end(function (res) {
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.InvalidOperation
            }, stepDone);
          });
        }
      ], done);
    });

  });

  describe('PUT /app', function () {

    beforeEach(testData.resetProfile);

    var path = basePath + '/app';

    it('[1QFB] must add/update/remove the specified keys without touching the others', function (done) {
      var data = {
        newKey: 'New Value', // add
        keyOne: 'No One', // update
        keyTwo: null // delete
      };
      request.put(path, appAccess.token).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var expectedData = _.extend(_.cloneDeep(appProfile.data), data);
        delete expectedData.keyTwo;
        res.body.profile.should.eql(expectedData);

        done();
      });
    });

    it('[0H9A] must refuse requests with a shared access token', function (done) {
      request.put(path, sharedAccess.token).send({any: 'thing'}).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation
        }, done);
      });
    });

    it('[JC5F] must refuse requests with a personal access token', function (done) {
      var personalRequest = helpers.request(server.url);
      async.series([
        personalRequest.login.bind(personalRequest, user),
        function (stepDone) {
          personalRequest.put(path).send({any: 'thing'}).end(function (res) {
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.InvalidOperation
            }, stepDone);
          });
        }
      ], done);
    });

  });

});
