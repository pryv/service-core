/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/* global initTests, initCore, coreRequest, getNewFixture, assert, cuid, _ */

const { getConfig } = require('@pryv/boiler');
const ErrorIds = require('errors').ErrorIds;
const validation = require('./helpers/validation');
const methodsSchema = require('../src/schema/followedSlicesMethods');
const storage = require('storage');

describe('[FOLS] followed slices', function () {
  let username;
  let basePath;
  let personalToken;
  let appToken;
  let isFerret = null;
  let followedSlicesStorage;
  let user;
  let testFollowedSlices;

  function path (id) {
    return basePath + '/' + id;
  }

  before(async function () {
    await initTests();
    await initCore();

    const config = await getConfig();
    isFerret = config.get('database:isFerret');

    const fixtures = getNewFixture();
    username = cuid();
    personalToken = cuid();
    appToken = cuid();
    basePath = '/' + username + '/followed-slices';
    user = { id: username };

    const database = await storage.getDatabase();
    followedSlicesStorage = new storage.user.FollowedSlices(database);

    // Create user
    const fixtureUser = await fixtures.user(username);

    // Create personal access and session
    await fixtureUser.access({
      type: 'personal',
      token: personalToken
    });
    await fixtureUser.session(personalToken);

    // Create app access for forbidden tests
    await fixtureUser.access({
      type: 'app',
      name: 'test-app',
      token: appToken,
      permissions: [{ streamId: '*', level: 'contribute' }]
    });

    // Define test followed slices
    testFollowedSlices = [
      {
        id: `slice0_${username}`,
        name: 'Slice Zero',
        url: `https://${username}.pryv.io/`,
        accessToken: 'token-zero'
      },
      {
        id: `slice1_${username}`,
        name: 'Slice One',
        url: `https://${username}.pryv.io/`,
        accessToken: 'token-one'
      },
      {
        id: `slice2_${username}`,
        name: 'Slice Two',
        url: `https://other-${username}.pryv.io/`,
        accessToken: 'token-two'
      }
    ];
  });

  async function resetFollowedSlices () {
    // removeAll filters by userId - parallel safe (unlike dropCollectionFully which drops entire collection)
    await new Promise((resolve) => {
      followedSlicesStorage.removeAll(user, () => resolve());
    });
    // Insert test data
    await new Promise((resolve, reject) => {
      followedSlicesStorage.insertMany(user, structuredClone(testFollowedSlices), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  describe('[FS01] GET /', function () {
    before(resetFollowedSlices);

    it('[TNKS] must return all followed slices (ordered by user name, then access token)',
      async function () {
        const res = await coreRequest
          .get(basePath)
          .set('Authorization', personalToken);

        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: { followedSlices: _.sortBy(testFollowedSlices, 'name') }
        });
      });

    it('[U9M4] must be forbidden to non-personal accesses', async function () {
      const res = await coreRequest
        .get(basePath)
        .set('Authorization', appToken);

      validation.checkErrorForbidden(res);
    });
  });

  describe('[FS02] POST /', function () {
    beforeEach(resetFollowedSlices);

    it('[HVYA] must create a new followed slice with the sent data, returning it', async function () {
      const data = {
        name: 'Some followed slice',
        url: 'https://mirza.pryv.io/',
        accessToken: 'some-token'
      };

      // Count initial
      const originalCount = await new Promise((resolve, reject) => {
        followedSlicesStorage.countAll(user, (err, count) => {
          if (err) reject(err);
          else resolve(count);
        });
      });

      // Create new slice
      const res = await coreRequest
        .post(basePath)
        .set('Authorization', personalToken)
        .send(data);

      validation.check(res, {
        status: 201,
        schema: methodsSchema.create.result
      });
      const createdSlice = res.body.followedSlice;

      // Verify data in storage
      const followedSlices = await new Promise((resolve, reject) => {
        followedSlicesStorage.findAll(user, null, (err, slices) => {
          if (err) reject(err);
          else resolve(slices);
        });
      });

      assert.strictEqual(followedSlices.length, originalCount + 1, 'followed slices');

      const expected = structuredClone(data);
      expected.id = createdSlice.id;
      const actual = _.find(followedSlices, (slice) => slice.id === createdSlice.id);
      validation.checkStoredItem(actual, 'followedSlice');
      assert.deepStrictEqual(actual, expected);
    });

    it('[BULL] must return a correct error if the sent data is badly formatted', async function () {
      const res = await coreRequest
        .post(basePath)
        .set('Authorization', personalToken)
        .send({ badProperty: 'bad value' });

      validation.checkErrorInvalidParams(res);
    });

    it('[GPZK] must return a correct error if the same followed slice (url and token) already exists',
      async function () {
        const data = {
          name: 'New name',
          url: testFollowedSlices[0].url,
          accessToken: testFollowedSlices[0].accessToken
        };

        const res = await coreRequest
          .post(basePath)
          .set('Authorization', personalToken)
          .send(data);

        let expectedData = { url: data.url, accessToken: data.accessToken };
        if (isFerret) {
          expectedData = { info: 'FerretDB does not provide duplicate information' };
        }
        validation.checkError(res, {
          status: 409,
          id: ErrorIds.ItemAlreadyExists,
          data: expectedData
        });
      });

    it('[RYNB] must return a correct error if a followed slice with the same name already exists',
      async function () {
        const data = {
          name: testFollowedSlices[0].name,
          url: 'https://hippolyte.pryv.io/',
          accessToken: 'some-token'
        };

        const res = await coreRequest
          .post(basePath)
          .set('Authorization', personalToken)
          .send(data);

        let expectedData = { name: data.name };
        if (isFerret) {
          expectedData = { info: 'FerretDB does not provide duplicate information' };
        }
        validation.checkError(res, {
          status: 409,
          id: ErrorIds.ItemAlreadyExists,
          data: expectedData
        });
      });
  });

  describe('[FS03] PUT /<id>', function () {
    beforeEach(resetFollowedSlices);

    it('[LM08] must modify the followed slice with the sent data', async function () {
      const original = testFollowedSlices[0];
      const newSliceData = {
        name: 'Updated Slice 0'
      };

      const res = await coreRequest
        .put(path(original.id))
        .set('Authorization', personalToken)
        .send(newSliceData);

      validation.check(res, {
        status: 200,
        schema: methodsSchema.update.result
      });

      const expected = Object.assign({}, original, newSliceData);
      assert.deepStrictEqual(res.body.followedSlice, expected);
    });

    it('[QFGH] must return a correct error if the followed slice does not exist', async function () {
      const res = await coreRequest
        .put(path('unknown-id'))
        .set('Authorization', personalToken)
        .send({ name: '?' });

      validation.checkError(res, {
        status: 404,
        id: ErrorIds.UnknownResource
      });
    });

    it('[RUQE] must return a correct error if the sent data is badly formatted', async function () {
      const res = await coreRequest
        .put(path(testFollowedSlices[1].id))
        .set('Authorization', personalToken)
        .send({ badProperty: 'bad value' });

      validation.checkErrorInvalidParams(res);
    });

    it('[T256] must return a correct error if a followed slice with the same name already exists',
      async function () {
        const update = { name: testFollowedSlices[0].name };

        const res = await coreRequest
          .put(path(testFollowedSlices[1].id))
          .set('Authorization', personalToken)
          .send(update);

        let expectedData = { name: update.name };
        if (isFerret) {
          expectedData = { info: 'FerretDB does not provide duplicate information' };
        }
        validation.checkError(res, {
          status: 409,
          id: ErrorIds.ItemAlreadyExists,
          data: expectedData
        });
      });
  });

  describe('[FS04] DELETE /<id>', function () {
    beforeEach(resetFollowedSlices);

    it('[U7LY] must delete the followed slice', async function () {
      const deletedId = testFollowedSlices[2].id;

      const res = await coreRequest
        .delete(path(deletedId))
        .set('Authorization', personalToken);

      validation.check(res, {
        status: 200,
        schema: methodsSchema.del.result
      });

      // Verify data in storage
      const slices = await new Promise((resolve, reject) => {
        followedSlicesStorage.findAll(user, null, (err, s) => {
          if (err) reject(err);
          else resolve(s);
        });
      });

      assert.strictEqual(slices.length, testFollowedSlices.length - 1, 'followed slices');

      const deletedSlice = _.find(slices, (slice) => slice.id === deletedId);
      assert.ok(deletedSlice == null);
    });

    it('[UATV] must return a correct error if the followed slice does not exist', async function () {
      const res = await coreRequest
        .delete(path('unknown-id'))
        .set('Authorization', personalToken);

      validation.checkError(res, {
        status: 404,
        id: ErrorIds.UnknownResource
      });
    });
  });
});
