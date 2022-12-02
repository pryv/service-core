/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const cuid = require('cuid');
const path = require('path');
const assert = require('chai').assert;
const supertest = require('supertest');
const charlatan = require('charlatan');
const ErrorIds = require('errors').ErrorIds;
const { getApplication } = require('api-server/src/application');

const { pubsub } = require('messages');
const { databaseFixture } = require('test-helpers');
const validation = require('api-server/test/helpers').validation;
const { produceMongoConnection } = require('api-server/test/test-helpers');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { defaults: dataStoreDefaults } = require('@pryv/datastore');
const treeUtils = require('utils/src/treeUtils');

describe('System streams', function () {
  let app;
  let request;
  let res;
  let mongoFixtures;
  let basePath;
  let access;
  let user;

  async function createUser () {
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      insurancenumber: charlatan.Number.number(4),
      phoneNumber: charlatan.Lorem.characters(3)
    });
    basePath = '/' + user.attrs.username + '/streams';
    access = await user.access({
      type: 'personal',
      token: cuid()
    });
    access = access.attrs;
    await user.session(access.token);
    return user;
  }

  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());

    app = getApplication(true);
    await app.initiate();

    // Initialize notifications dependency
    const axonMsgs = [];
    const axonSocket = {
      emit: (...args) => axonMsgs.push(args)
    };
    pubsub.setTestNotifier(axonSocket);

    pubsub.status.emit(pubsub.SERVER_READY);
    require('api-server/src/methods/streams')(app.api);

    request = supertest(app.expressApp);
  });

  describe('GET /streams', () => {
    describe('When using a personal access', () => {
      it('[9CGO] Should return all streams - including system ones', async () => {
        const expectedRes = [];
        validation.addStoreStreams(expectedRes);
        let readableStreams = [
          {
            name: 'Account',
            id: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
            parentId: null,
            children: [
              {
                name: 'Language',
                id: SystemStreamsSerializer.addPrivatePrefixToStreamId('language'),
                parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
                children: []
              },
              {
                name: 'Storage used',
                id: SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed'),
                parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
                children: [
                  {
                    name: 'Db Documents',
                    id: SystemStreamsSerializer.addPrivatePrefixToStreamId('dbDocuments'),
                    parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed'),
                    children: []
                  },
                  {
                    name: 'Attached files',
                    id: SystemStreamsSerializer.addPrivatePrefixToStreamId('attachedFiles'),
                    parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed'),
                    children: []
                  }
                ]
              },
              {
                name: 'insurancenumber',
                id: SystemStreamsSerializer.addCustomerPrefixToStreamId('insurancenumber'),
                parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
                children: []
              },
              {
                name: 'phoneNumber',
                id: SystemStreamsSerializer.addCustomerPrefixToStreamId('phoneNumber'),
                parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
                children: []
              },
              {
                name: 'Email',
                id: SystemStreamsSerializer.addCustomerPrefixToStreamId('email'),
                parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
                children: []
              }
            ]
          },
          {
            id: SystemStreamsSerializer.addPrivatePrefixToStreamId('helpers'),
            name: 'Helpers',
            parentId: null,
            children: [
              {
                id: SystemStreamsSerializer.addPrivatePrefixToStreamId('active'),
                name: 'Active',
                parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('helpers'),
                children: []
              }

            ]
          }
        ];

        readableStreams = treeUtils.cloneAndApply(readableStreams, (s) => {
          s.createdBy = dataStoreDefaults.SystemAccessId;
          s.modifiedBy = dataStoreDefaults.SystemAccessId;
          return s;
        });

        dataStoreDefaults.applyOnStreams(readableStreams);

        expectedRes.push(...readableStreams);

        await createUser();
        res = await request.get(basePath).set('authorization', access.token);

        assert.deepEqual(res.body.streams, expectedRes);
      });
    });
  });

  describe('POST /streams', () => {
    describe('When using a personal access', () => {
      describe('to create a child to a system stream', () => {
        before(async function () {
          await createUser();
          res = await request.post(basePath)
            .send({
              name: charlatan.Lorem.characters(7),
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('language')
            })
            .set('authorization', access.token);
        });
        it('[GRI4] should return status 400', async () => {
          assert.equal(res.status, 400);
        });
        it('[XP07] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
        });
      });
    });
  });

  describe('PUT /streams/<id>', () => {
    describe('When using a personal access', () => {
      let streamData;
      describe('to update a system stream', () => {
        before(async function () {
          await createUser();
          streamData = {
            name: 'lanugage2'
          };
          res = await request.put(path.join(basePath, SystemStreamsSerializer.addPrivatePrefixToStreamId('language')))
            .send(streamData)
            .set('authorization', access.token);
        });
        it('[SLIR] should return status 400', async () => {
          assert.equal(res.status, 400);
        });
        it('[V6HC] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
        });
      });
    });
  });

  describe('DELETE /streams/<id>', () => {
    describe('When using a personal access', () => {
      describe('to delete a system stream', () => {
        before(async function () {
          await createUser();
          res = await request.delete(path.join(basePath, SystemStreamsSerializer.addPrivatePrefixToStreamId('language')))
            .set('authorization', access.token);
        });
        it('[1R35] should return status 400', async () => {
          assert.equal(res.status, 400);
        });
        it('[4939] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
        });
      });
    });
  });
});
