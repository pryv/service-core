/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, it */

require('./test-helpers'); 
var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    validation = helpers.validation,
    methodsSchema = require('../src/schema/profileMethods'),
    storage = helpers.dependencies.storage.user.profile,
    testData = helpers.data,
    _ = require('lodash');

describe('profile (personal)', function () {

  var user = Object.assign({}, testData.users[0]),
      basePath = '/' + user.username + '/profile',
      request = null; // must be set after server instance started
  var publicProfile = testData.profile[0],
      privateProfile = testData.profile[1];

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

  describe('GET', function () {

    before(testData.resetProfile);

    it('[J61R] /public must return publicly shared key-value profile info',
        testGet.bind(null, publicProfile));

    it('[HIMS] /private must return private key-value profile info',
        testGet.bind(null, privateProfile));

    function testGet(profile, done) {
      request.get(basePath + '/' + profile.id).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {profile: profile.data}
        }, done);
      });
    }

    it('[36B1] must return an appropriate error for other paths', function (done) {
      request.get(basePath + '/unknown-profile').end(function (res) {
        res.statusCode.should.eql(404);
        done();
      });
    });

    it('[FUJA] "private" must be forbidden to non-personal accesses', function (done) {
      request.get(basePath + '/private', testData.accesses[4].token).end(function (res) {
        console.log(res.body);
        validation.checkErrorForbidden(res, done);
      });
    });
  });

  describe('PUT', function () {

    beforeEach(testData.resetProfile);

    it('[M28R] /public must add/update/remove the specified keys without touching the others',
        testPut.bind(null, publicProfile));

    it('[WU9C] /private must add/update/remove the specified keys without touching the others',
        testPut.bind(null, privateProfile));

    it('[2AS6] must create the profile if not existing', function (done) {
      async.series([
        storage.removeAll.bind(storage, user),
        testPut.bind(null, { id: 'public', data: {} })
      ], done);
    });

    function testPut(original, done) {
      var data = {
        newKey: 'New Value', // add
        keyOne: 'No One', // update
        keyTwo: null // delete
      };
      request.put(basePath + '/' + original.id).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var expectedData = _.extend(_.cloneDeep(original.data), data);
        delete expectedData.keyTwo;
        res.body.profile.should.eql(expectedData);

        done();
      });
    }

    it('[Q99E] must return an appropriate error for other paths', function (done) {
      request.put(basePath + '/unknown-profile').send({an: 'update'}).end(function (res) {
        res.statusCode.should.eql(404);
        done();
      });
    });

    it('[T565] must be forbidden to non-personal accesses', function (done) {
      request.put(basePath + '/public', testData.accesses[4].token).send({an: 'update'})
      .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });
});
