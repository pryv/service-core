/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/* global initTests, initCore, coreRequest, getNewFixture, assert, cuid, _ */

const timestamp = require('unix-timestamp');
const { ErrorIds } = require('errors');
const methodsSchema = require('../src/schema/accessesMethods');
const { ApiEndpoint } = require('utils');
const { getConfig } = require('@pryv/boiler');
const { integrity } = require('business');
const storage = require('storage');

describe('[ACCP] accesses (app)', function () {
  let validation;
  let username, user;
  let stream0, stream1, stream0Child;
  let appAccessA, appAccessAToken;
  let appAccessB, appAccessBToken;
  let sharedAccessA, sharedAccessAToken;
  let rootAccess, rootAccessToken;
  let sharedAccessB, sharedAccessBToken;
  let sharedAccess, sharedAccessToken;
  let basePath;
  let fixtures;
  let database;
  let accessStorage;

  function buildApiEndpoint (uname, token) {
    return ApiEndpoint.build(uname, token);
  }

  before(async function () {
    await initTests();
    await initCore();
    await getConfig();

    validation = require('./helpers/validation');

    fixtures = getNewFixture();
    username = cuid();
    basePath = '/' + username + '/accesses';

    database = await storage.getDatabase();
    accessStorage = new storage.user.Accesses(database);
    user = { id: username };

    // Create user with streams
    const fixtureUser = await fixtures.user(username);

    // Create streams
    stream0 = await fixtureUser.stream({ id: cuid(), name: 'Stream 0' });
    stream0Child = await stream0.stream({ id: cuid(), name: 'Stream 0 Child' });
    stream1 = await fixtureUser.stream({ id: cuid(), name: 'Stream 1' });

    // Create tokens
    appAccessAToken = cuid();
    appAccessBToken = cuid();
    sharedAccessAToken = cuid();
    rootAccessToken = cuid();
    sharedAccessBToken = cuid();
    sharedAccessToken = cuid();

    // Use unique IDs based on username to avoid conflicts with parallel tests
    const appAId = `app_A_${username}`;
    const appBId = `app_B_${username}`;
    const sharedAId = `shared_A_${username}`;
    const rootAId = `root_A_${username}`;
    const sharedBId = `shared_B_${username}`;
    const sharedRegularId = `shared_regular_${username}`;

    // Create app access A (main access for tests)
    appAccessA = {
      id: appAId,
      token: appAccessAToken,
      name: 'App access A',
      type: 'app',
      permissions: [
        { streamId: stream0.attrs.id, level: 'manage' },
        { streamId: stream1.attrs.id, level: 'contribute' }
      ],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    };
    appAccessA.apiEndpoint = buildApiEndpoint(username, appAccessAToken);
    integrity.accesses.set(appAccessA);

    // Create app access B (subset of A)
    appAccessB = {
      id: appBId,
      token: appAccessBToken,
      name: 'App access B (subset of A)',
      type: 'app',
      permissions: [{ streamId: stream0.attrs.id, level: 'read' }],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    };
    appAccessB.apiEndpoint = buildApiEndpoint(username, appAccessBToken);
    integrity.accesses.set(appAccessB);

    // Create shared access A (created by app_A)
    sharedAccessA = {
      id: sharedAId,
      token: sharedAccessAToken,
      name: 'Shared access A (subset of app access A)',
      type: 'shared',
      permissions: [{ streamId: stream0Child.attrs.id, level: 'read' }],
      created: timestamp.now(),
      createdBy: appAId,
      modified: timestamp.now(),
      modifiedBy: appAId
    };
    sharedAccessA.apiEndpoint = buildApiEndpoint(username, sharedAccessAToken);
    integrity.accesses.set(sharedAccessA);

    // Create root access
    rootAccess = {
      id: rootAId,
      token: rootAccessToken,
      name: 'Root token',
      type: 'app',
      permissions: [{ streamId: '*', level: 'manage' }],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    };
    rootAccess.apiEndpoint = buildApiEndpoint(username, rootAccessToken);
    integrity.accesses.set(rootAccess);

    // Create shared access B (with permission on non-existing stream)
    sharedAccessB = {
      id: sharedBId,
      token: sharedAccessBToken,
      name: 'Shared access B (with permission on unexisting stream)',
      type: 'shared',
      permissions: [{ streamId: 'idonotexist', level: 'read' }],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    };
    sharedAccessB.apiEndpoint = buildApiEndpoint(username, sharedAccessBToken);
    integrity.accesses.set(sharedAccessB);

    // Create a shared access for forbidden tests
    sharedAccess = {
      id: sharedRegularId,
      token: sharedAccessToken,
      name: 'Regular shared access',
      type: 'shared',
      permissions: [{ streamId: stream0.attrs.id, level: 'read' }],
      created: timestamp.now(),
      createdBy: 'test',
      modified: timestamp.now(),
      modifiedBy: 'test'
    };
    sharedAccess.apiEndpoint = buildApiEndpoint(username, sharedAccessToken);
    integrity.accesses.set(sharedAccess);
  });

  async function resetAccesses () {
    // Clear accesses collection
    await new Promise((resolve, reject) => {
      accessStorage.dropCollection(user, (err) => {
        if (err && !/ns not found/.test(err.message)) reject(err);
        else resolve();
      });
    });
    // Re-insert all test accesses
    const allAccesses = [appAccessA, appAccessB, sharedAccessA, rootAccess, sharedAccessB, sharedAccess];
    await new Promise((resolve, reject) => {
      accessStorage.insertMany(user, allAccesses, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  function path (id) {
    return basePath + '/' + id;
  }

  describe('[AA01] GET /', function () {
    before(resetAccesses);

    it("[YEHW] must return shared accesses whose permissions are a subset of the current one's", async function () {
      const res = await coreRequest
        .get(basePath)
        .set('Authorization', appAccessAToken);

      validation.check(res, {
        status: 200,
        schema: methodsSchema.get.result,
        body: { accesses: [sharedAccessA] }
      });
    });

    it('[GLHP] must be forbidden to requests with a shared access token', async function () {
      const res = await coreRequest
        .get(basePath)
        .set('Authorization', sharedAccessToken);

      validation.checkErrorForbidden(res);
    });
  });

  describe('[AA02] POST /', function () {
    beforeEach(resetAccesses);

    it('[QVHS] must create a new shared access with the sent data and return it', async function () {
      const data = {
        name: 'New Access',
        permissions: [
          {
            streamId: stream0.attrs.id,
            level: 'read',
            defaultName: 'Should be ignored',
            name: 'Should be ignored'
          }
        ]
      };

      const res = await coreRequest
        .post(basePath)
        .set('Authorization', appAccessAToken)
        .send(data);

      validation.check(res, {
        status: 201,
        schema: methodsSchema.create.result
      });

      const expected = structuredClone(data);
      expected.id = res.body.access.id;
      expected.token = res.body.access.token;
      expected.apiEndpoint = buildApiEndpoint(username, expected.token);
      expected.type = 'shared';
      delete expected.permissions[0].defaultName;
      delete expected.permissions[0].name;
      expected.created = res.body.access.created;
      expected.createdBy = res.body.access.createdBy;
      expected.modified = res.body.access.modified;
      expected.modifiedBy = res.body.access.modifiedBy;
      expected.deviceName = null;
      integrity.accesses.set(expected);
      validation.checkObjectEquality(res.body.access, expected);
    });

    it('[6GR1] must forbid trying to create a non-shared access', async function () {
      const data = {
        name: 'New Access',
        type: 'app',
        permissions: [{ streamId: stream0.attrs.id, level: 'read' }]
      };

      const res = await coreRequest
        .post(basePath)
        .set('Authorization', appAccessAToken)
        .send(data);

      validation.checkErrorForbidden(res);
    });

    it('[A4MC] must forbid trying to create an access with greater permissions', async function () {
      const data = {
        name: 'New Access',
        permissions: [{ streamId: stream1.attrs.id, level: 'manage' }]
      };

      const res = await coreRequest
        .post(basePath)
        .set('Authorization', appAccessAToken)
        .send(data);

      validation.checkErrorForbidden(res);
    });

    it('[QN6D] must return a correct error if the sent data is badly formatted', async function () {
      const data = {
        name: 'New Access',
        permissions: [{ streamId: stream0.attrs.id, level: 'bad-level' }]
      };

      const res = await coreRequest
        .post(basePath)
        .set('Authorization', appAccessAToken)
        .send(data);

      validation.checkErrorInvalidParams(res);
    });

    it('[4HAE] must allow creation of shared accesses with an access that has superior permission on root stream (*)', async function () {
      const data = {
        name: 'New Access',
        permissions: [{ streamId: stream0.attrs.id, level: 'read' }]
      };

      const res = await coreRequest
        .post(basePath)
        .set('Authorization', rootAccessToken)
        .send(data);

      assert.ok(res.body);
      assert.ok(res.body.error == null);
      assert.strictEqual(res.statusCode, 201);
    });
  });

  describe('[AA03] PUT /<token>', function () {
    beforeEach(resetAccesses);

    it('[11UZ]  must return a 410 (Gone)', async function () {
      const res = await coreRequest
        .put(path(appAccessB.id))
        .set('Authorization', appAccessAToken)
        .send({ name: 'Updated App Access' });

      validation.check(res, { status: 410 });
    });
  });

  describe('[AA04] DELETE /<id>', function () {
    beforeEach(resetAccesses);

    it('[5BOO] must delete the shared access', async function () {
      const deletedAccess = sharedAccessA;
      const deletionTime = timestamp.now();

      const res = await coreRequest
        .delete(path(deletedAccess.id))
        .set('Authorization', appAccessAToken);

      validation.check(res, {
        status: 200,
        schema: methodsSchema.del.result,
        body: { accessDeletion: { id: deletedAccess.id } }
      });

      // Verify data in storage
      const accesses = await new Promise((resolve, reject) => {
        accessStorage.findAll(user, null, (err, acc) => {
          if (err) reject(err);
          else resolve(acc);
        });
      });

      const actual = _.find(accesses, { id: deletedAccess.id });
      assert.ok(actual.deleted >= deletionTime - 1, 'access should be marked deleted');
    });

    it('[ZTSX] forbid deletion of already deleted for AppTokens', async function () {
      // First deletion
      const res1 = await coreRequest
        .delete(path(appAccessA.id))
        .set('Authorization', appAccessAToken);

      validation.check(res1, {
        status: 200,
        schema: methodsSchema.del.result,
        body: {
          accessDeletion: { id: appAccessA.id },
          relatedDeletions: [{ id: sharedAccessA.id }]
        }
      });

      // Second deletion should be forbidden
      const res2 = await coreRequest
        .delete(path(appAccessA.id))
        .set('Authorization', appAccessAToken);

      validation.check(res2, { status: 403 });
    });

    it('[VGQS] must forbid trying to delete a non-shared access', async function () {
      const res = await coreRequest
        .delete(path(appAccessB.id))
        .set('Authorization', appAccessAToken);

      validation.checkErrorForbidden(res);
    });

    it('[ZTSY] must forbid trying to delete an access that was not created by itself', async function () {
      const res = await coreRequest
        .delete(path(sharedAccess.id))
        .set('Authorization', appAccessAToken);

      validation.checkErrorForbidden(res);
    });

    it('[J32P] must return a correct error if the access does not exist', async function () {
      const res = await coreRequest
        .delete(path('unknown-id'))
        .set('Authorization', appAccessAToken);

      validation.checkError(res, {
        status: 404,
        id: ErrorIds.UnknownResource
      });
    });
  });
});
