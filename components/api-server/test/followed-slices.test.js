/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, it */

require('./test-helpers'); 
var helpers = require('./helpers'),
    ErrorIds = require('errors').ErrorIds,
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    validation = helpers.validation,
    methodsSchema = require('../src/schema/followedSlicesMethods'),
    should = require('should'), // explicit require to benefit from static functions
    storage = helpers.dependencies.storage.user.followedSlices,
    testData = helpers.data,
    _ = require('lodash');

describe('followed slices', function () {

  var user = Object.assign({}, testData.users[0]),
      basePath = '/' + user.username + '/followed-slices',
      request = null; // must be set after server instance started

  function path(id) {
    return basePath + '/' + id;
  }

  // to verify data change notifications
  var followedSlicesNotifCount;
  server.on('axon-followed-slices-changed', function () { followedSlicesNotifCount++; });

  before(function (done) {
    async.series([
      testData.resetUsers,
      helpers.dependencies.storage.user.accesses
          .removeAll.bind(helpers.dependencies.storage.user.accesses, user),
      helpers.dependencies.storage.user.accesses
          .insertMany.bind(helpers.dependencies.storage.user.accesses, user,
              [testData.accesses[4]]),
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      }
    ], done);
  });

  describe('GET /', function () {

    before(resetFollowedSlices);

    it('[TNKS] must return all followed slices (ordered by user name, then access token)',
        function (done) {
      request.get(basePath).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {followedSlices: _.sortBy(testData.followedSlices, 'name')}
        }, done);
      });
    });

    it('[U9M4] must be forbidden to non-personal accesses', function (done) {
      request.get(basePath, testData.accesses[4].token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  describe('POST /', function () {

    beforeEach(resetFollowedSlices);

    it('[HVYA] must create a new followed slice with the sent data, returning it', function (done) {
      var data = {
        name: 'Some followed slice',
        url: 'https://mirza.pryv.io/',
        accessToken: 'some-token'
      };
      var originalCount,
          createdSlice;

      async.series([
          function countInitial(stepDone) {
            storage.countAll(user, function (err, count) {
              originalCount = count;
              stepDone();
            });
          },
          function addNew(stepDone) {
            request.post(basePath).send(data).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              createdSlice = res.body.followedSlice;
              followedSlicesNotifCount.should.eql(1, 'followed slices notifications');
              stepDone();
            });
          },
          function verifyData(stepDone) {
            storage.findAll(user, null, function (err, followedSlices) {
              followedSlices.length.should.eql(originalCount + 1, 'followed slices');

              var expected = _.clone(data);
              expected.id = createdSlice.id;
              var actual = _.find(followedSlices, function (slice) {
                return slice.id === createdSlice.id;
              });
              validation.checkStoredItem(actual, 'followedSlice');
              actual.should.eql(expected);

              stepDone();
            });
          }
        ],
        done
      );
    });

    it('[BULL] must return a correct error if the sent data is badly formatted', function (done) {
      request.post(basePath).send({badProperty: 'bad value'}).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[GPZK] must return a correct error if the same followed slice (url and token) already exists',
        function (done) {
      var data = {
        name: 'New name',
        url: testData.followedSlices[0].url,
        accessToken: testData.followedSlices[0].accessToken
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 409,
          id: ErrorIds.ItemAlreadyExists,
          data: { url: data.url, accessToken: data.accessToken }
        }, done);
      });
    });

    it('[RYNB] must return a correct error if a followed slice with the same name already exists',
        function (done) {
      var data = {
        name: testData.followedSlices[0].name,
        url: 'https://hippolyte.pryv.io/',
        accessToken: 'some-token'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 409,
          id: ErrorIds.ItemAlreadyExists,
          data: {name: data.name}
        }, done);
      });
    });

  });

  describe('PUT /<id>', function () {

    beforeEach(resetFollowedSlices);

    it('[LM08] must modify the followed slice with the sent data', function (done) {
      var original = testData.followedSlices[0];
      var newSliceData = {
        name: 'Updated Slice 0'
      };

      request.put(path(original.id)).send(newSliceData).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var expected = _.clone(newSliceData);
        _.defaults(expected, original);
        res.body.followedSlice.should.eql(expected);

        followedSlicesNotifCount.should.eql(1, 'followed slices notifications');
        done();
      });
    });

    it('[QFGH] must return a correct error if the followed slice does not exist', function (done) {
      request.put(path('unknown-id')).send({name: '?'}).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

    it('[RUQE] must return a correct error if the sent data is badly formatted', function (done) {
      request.put(path(testData.followedSlices[1].id)).send({badProperty: 'bad value'})
          .end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[T256] must return a correct error if a followed slice with the same name already exists',
        function (done) {
      var update = {name: testData.followedSlices[0].name};
      request.put(path(testData.followedSlices[1].id)).send(update).end(function (res) {
        validation.checkError(res, {
          status: 409,
          id: ErrorIds.ItemAlreadyExists,
          data: {name: update.name}
        }, done);
      });
    });

  });

  describe('DELETE /<id>', function () {

    beforeEach(resetFollowedSlices);

    it('[U7LY] must delete the followed slice', function (done) {
      var deletedId = testData.followedSlices[2].id;
      async.series([
          function deleteSlice(stepDone) {
            request.del(path(deletedId)).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.del.result
              });
              followedSlicesNotifCount.should.eql(1, 'followed slices notifications');
              stepDone();
            });
          },
          function verifyData(stepDone) {
            storage.findAll(user, null, function (err, slices) {
              slices.length.should.eql(testData.followedSlices.length - 1, 'followed slices');

              var deletedSlice = _.find(slices, function (slice) {
                return slice.id === deletedId;
              });
              should.not.exist(deletedSlice);

              stepDone();
            });
          }
        ],
        done
      );
    });

    it('[UATV] must return a correct error if the followed slice does not exist', function (done) {
      request.del(path('unknown-id')).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

  });

  function resetFollowedSlices(done) {
    followedSlicesNotifCount = 0;
    let user = Object.assign({}, testData.users[0]);
    testData.resetFollowedSlices(done, user);
  }

});
