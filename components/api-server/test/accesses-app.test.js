/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/*global describe, before, beforeEach, it */

require('./test-helpers'); 
const helpers = require('./helpers');
const ErrorIds = require('components/errors').ErrorIds;
const server = helpers.dependencies.instanceManager;
const async = require('async');
const validation = helpers.validation;
const methodsSchema = require('../src/schema/accessesMethods');
const storage = helpers.dependencies.storage.user.accesses;
const testData = helpers.data;
const timestamp = require('unix-timestamp');
const _ = require('lodash');
const should = require('should');

import type Request from './helpers';

describe('accesses (app)', function () {

  const additionalTestAccesses = [
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
      createdBy: 'app_A',
      modified: timestamp.now(),
      modifiedBy: 'app_A'
    },
    {
      id: 'root_A',
      token: 'root_A_token',
      name: 'Root token',
      type: 'app',
      permissions: [
        {
          streamId: '*',
          level: 'manage'
        }
      ],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    },
    {
      id: 'shared_B',
      token: 'shared_B_token',
      name: 'Shared access B (with permission on unexisting stream)',
      type: 'shared',
      permissions: [
        {
          streamId: 'idonotexist',
          level: 'read'
        }
      ],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    }
  ];
  const user = testData.users[0];
  const access = additionalTestAccesses[0];
  const basePath = '/' + user.username + '/accesses';
  let request: ?Request = null; // must be set after server instance started

  function path(id) {
    return basePath + '/' + id;
  }
  function req(): Request {
    if (request) return request; 
    throw new Error('request is still not defined.');
  }
  
  // to verify data change notifications
  let accessesNotifCount;
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

    it('[YEHW] must return shared accesses whose permissions are a subset of the current one\'s',
      function (done) {
        req().get(basePath, access.token).end(function (res) {
          validation.check(res, {
            status: 200,
            schema: methodsSchema.get.result,
            body: {accesses: [additionalTestAccesses[2]]}
          }, done);
        });
      });

    it('[GLHP] must be forbidden to requests with a shared access token', function (done) {
      const sharedAccess = testData.accesses[1];
      req().get(basePath, sharedAccess.token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  describe('POST /', function () {

    beforeEach(resetAccesses);

    it('[QVHS] must create a new shared access with the sent data and return it', function (done) {
      const  data = {
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

        const expected: {[key: string]: any} = _.cloneDeep(data);
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

    it('[6GR1] must forbid trying to create a non-shared access', function (done) {
      const data = {
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

    it('[A4MC] must forbid trying to create an access with greater permissions', function (done) {
      const data = {
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

    it('[QN6D] must return a correct error if the sent data is badly formatted', function (done) {
      const data = {
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

    it('[4HAE] must allow creation of shared accesses with an access that has superior permission on root stream (*)', function (done) {
      const access = additionalTestAccesses[3];

      const data = {
        name: 'New Access',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read'
          }
        ]
      };
      req().post(basePath, access.token).send(data).end(function (res) {
        should.exist(res.body);
        should.not.exist(res.body.error);
        should(res.statusCode).be.eql(201);
        done();
      });
    });

  });

  describe('PUT /<token>', function () {

    beforeEach(resetAccesses);

    it('[11UZ]  must return a 410 (Gone)', function (done) {
      req().put(path(additionalTestAccesses[1].id), access.token)
          .send({name: 'Updated App Access'}).end(function (res) {
            validation.check(res, {status: 410});
            done();
      });
    });
  });

  describe('DELETE /<id>', function () {

    beforeEach(resetAccesses);

    it('[5BOO] must delete the shared access', function (done) {
      const deletedAccess = additionalTestAccesses[2];
      let deletionTime;
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

            const expected = _.assign({
              deleted: deletionTime
            }, deletedAccess);
            const actual = _.find(accesses, {id: deletedAccess.id});
            validation.checkObjectEquality(actual, expected);

            stepDone();
          });
        }
      ],
          done
      );
    });

    it('[ZTSX] forbid deletion of already deleted for AppTokens', function (done) {
      req().del(path(access.id), access.token).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.del.result,
          body: { 
            accessDeletion: { id: access.id },
            relatedDeletions: [{
              id: additionalTestAccesses[2].id
            }] 
          }
        });

        req().del(path(access.id), access.token).end(function (res2) {
          validation.check(res2, {
            status: 403});

          done();
        });

      });
    });

    

    it('[VGQS] must forbid trying to delete a non-shared access', function (done) {
      req().del(path(additionalTestAccesses[1].id), access.token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[ZTSY] must forbid trying to delete an access that was not created by itself', function (done) {
      req().del(path(testData.accesses[1].id), access.token).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[J32P] must return a correct error if the access does not exist', function (done) {
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
