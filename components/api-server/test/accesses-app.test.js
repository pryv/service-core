// @flow

/*global describe, before, beforeEach, it */

require('./test-helpers'); 
var helpers = require('./helpers'),
    ErrorIds = require('components/errors').ErrorIds,
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    validation = helpers.validation,
    methodsSchema = require('../src/schema/accessesMethods'),
    storage = helpers.dependencies.storage.user.accesses,
    testData = helpers.data,
    timestamp = require('unix-timestamp'),
    _ = require('lodash');
const should = require('should');

import type Request from './helpers';

describe('accesses (app)', function () {

  var additionalTestAccesses = [
    {
      id: 'app_A',
      token: 'app_A_token',
      name: 'App access A',
      type: 'app',
      permissions: [
        {
          streamId: testData.streams[0].id,
          level: 'manage'
        },
        {
          streamId: testData.streams[1].id,
          level: 'contribute'
        },
        {
          tag: 'super',
          level: 'contribute'
        }
      ],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    },
    {
      id: 'app_B',
      token: 'app_B_token',
      name: 'App access B (subset of A)',
      type: 'app',
      permissions: [
        {
          streamId: testData.streams[0].id,
          level: 'read'
        },
        {
          tag: 'super',
          level: 'read'
        }
      ],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    },
    {
      id: 'shared_A',
      token: 'shared_A_token',
      name: 'Shared access A (subset of app access A)',
      type: 'shared',
      permissions: [
        {
          streamId: testData.streams[0].children[0].id,
          level: 'read'
        },
        {
          tag: 'super',
          level: 'read'
        }
      ],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    }
  ];
  var user = testData.users[0],
      access = additionalTestAccesses[0],
      basePath = '/' + user.username + '/accesses',
      request: ?Request = null; // must be set after server instance started

  function path(id) {
    return basePath + '/' + id;
  }
  function req(): Request {
    if (request) return request; 
    throw new Error('request is still not defined.');
  }
  
  // to verify data change notifications
  var accessesNotifCount;
  server.on('accesses-changed', function () { accessesNotifCount++; });

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetStreams,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) { request = helpers.request(server.url); stepDone(); }
    ], done);
  });

  describe('GET /', function () {

    before(resetAccesses);

    it('must return shared accesses whose permissions are a subset of the current one\'s',
      function (done) {
        req().get(basePath, access.token).end(function (res) {
          validation.check(res, {
            status: 200,
            schema: methodsSchema.get.result,
            body: {accesses: [additionalTestAccesses[2]]}
          }, done);
        });
      });

    it('must be forbidden to requests with a shared access token', function (done) {
      var sharedAccess = testData.accesses[1];
      req().get(basePath, sharedAccess.token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  describe('POST /', function () {

    beforeEach(resetAccesses);

    it('must create a new shared access with the sent data and return it', function (done) {
      var data = {
        name: 'New Access',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read',
            defaultName: 'Should be ignored',
            name: 'Should be ignored'
          },
          {
            tag: 'super',
            level: 'read'
          }
        ]
      };
      req().post(basePath, access.token).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });

        var expected: {[key: string]: any} = _.cloneDeep(data);
        expected.id = res.body.access.id;
        expected.token = res.body.access.token;
        expected.type = 'shared';
        delete expected.permissions[0].defaultName;
        delete expected.permissions[0].name;
        validation.checkObjectEquality(res.body.access, expected);

        should(accessesNotifCount).be.eql(1, 'accesses notifications');
        done();
      });
    });

    it('must forbid trying to create a non-shared access', function (done) {
      var data = {
        name: 'New Access',
        type: 'app',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read'
          }
        ]
      };
      req().post(basePath, access.token).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid trying to create an access with greater permissions', function (done) {
      var data = {
        name: 'New Access',
        permissions: [
          {
            streamId: testData.streams[1].id,
            level: 'manage'
          }
        ]
      };
      req().post(basePath, access.token).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must return a correct error if the sent data is badly formatted', function (done) {
      var data = {
        name: 'New Access',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'bad-level'
          }
        ]
      };
      req().post(basePath, access.token).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

  });

  describe('PUT /<token>', function () {

    beforeEach(resetAccesses);

    it('must modify the access with the sent data', function (done) {
      var original = additionalTestAccesses[2];
      var data = {
        name: 'Updated Shared Access A',
        permissions: [
          {
            streamId: testData.streams[0].children[1].id,
            level: 'read'
          }
        ]
      };
      req().put(path(original.id), access.token).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var expected: {[key: string]: any} = _.clone(data);
        expected.modifiedBy = access.id;
        delete expected.token;
        delete expected.type;
        _.defaults(expected, original);
        delete expected.modified;
        validation.checkObjectEquality(res.body.access, expected);

        should(accessesNotifCount).be.eql(1, 'accesses notifications');
        done();
      });
    });

    it('must forbid trying to modify a non-shared access', function (done) {
      req().put(path(additionalTestAccesses[1].id), access.token)
          .send({name: 'Updated App Access'}).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid trying to modify an access with greater permissions', function (done) {
      req().put(path(testData.accesses[1].id), access.token)
          .send({name: 'Updated Shared Access'}).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must return a correct error if the access does not exist', function (done) {
      req().put(path('unknown-id'), access.token).send({name: '?'}).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

    it('must return a correct error if the sent data is badly formatted', function (done) {
      var data = {
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'bad-level'
          }
        ]
      };
      req().put(path(additionalTestAccesses[2].id), access.token).send(data)
      .end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must return a correct error if an access with the same name already exists', (done) => {
      req()
        .put(path(additionalTestAccesses[2].id), access.token)
        .send({name: testData.accesses[1].name}).end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.ItemAlreadyExists,
            data: { type: 'shared', name: testData.accesses[1].name }
          }, done);
        });
    });

  });

  describe('DELETE /<token>', function () {

    beforeEach(resetAccesses);

    it('must delete the shared access', function (done) {
      var deletedAccess = additionalTestAccesses[2],
          deletionTime;
      async.series([
        function deleteAccess(stepDone) {
          deletionTime = timestamp.now();
          req().del(path(deletedAccess.id), access.token).end(function (res) {
            validation.check(res, {
              status: 200,
              schema: methodsSchema.del.result,
              body: {accessDeletion: {id: deletedAccess.id}}
            });
            should(accessesNotifCount).be.eql(1, 'accesses notifications');
            stepDone();
          });
        },
        function verifyData(stepDone) {
          storage.findAll(user, null, function (err, accesses) {
            accesses.length.should.eql(testData.accesses.length + additionalTestAccesses.length,
                                       'accesses');

            var expected = _.extend({
              _token: deletedAccess.token,
              _type: deletedAccess.type,
              _name: deletedAccess.name,
              deleted: deletionTime
            }, _.omit(deletedAccess, 'token', 'type', 'name'));
            var actual = _.find(accesses, {id: deletedAccess.id});
            validation.checkObjectEquality(actual, expected);

            stepDone();
          });
        }
      ],
          done
      );
    });

    it('must forbid trying to delete a non-shared access', function (done) {
      req().del(path(additionalTestAccesses[1].id), access.token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid trying to delete an access with greater permissions', function (done) {
      req().del(path(testData.accesses[1].id), access.token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must return a correct error if the access does not exist', function (done) {
      req().del(path('unknown-id'), access.token).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

  });

  function resetAccesses(done) {
    accessesNotifCount = 0;
    async.series([
      testData.resetAccesses,
      storage.insertMany.bind(storage, user, additionalTestAccesses)
    ], done);
  }

});
