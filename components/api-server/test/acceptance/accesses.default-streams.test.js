/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const cuid = require('cuid');
const _ = require('lodash');
const path = require('path');
const bluebird = require('bluebird');
const nock = require('nock');
const assert = require('chai').assert;
const { describe, before, it } = require('mocha');
const supertest = require('supertest');
const charlatan = require('charlatan');

const ErrorIds = require('errors').ErrorIds;
const ErrorMessages = require('errors/src/ErrorMessages');
const { getApplication } = require('api-server/src/application');
const { Notifications } = require('messages');
const AccessLogic = require('business/src/accesses/AccessLogic');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { databaseFixture } = require('test-helpers');
const { produceMongoConnection } = require('api-server/test/test-helpers');

const { getConfig } = require('@pryv/boiler');

describe("Accesses with account streams", function () {
  let config;
  let app;
  let request;
  let res;
  let accountAccess;
  let accountAccessData;
  let mongoFixtures;
  let basePath;
  let eventsBasePath;
  let access;
  let user;
  let validation;

  async function createUser () {
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      insurancenumber: charlatan.Number.number(4),
      phoneNumber: charlatan.Lorem.characters(3)
    });
    basePath = '/' + user.attrs.username + '/accesses';
    eventsBasePath = '/' + user.attrs.username + '/events';
    access = await user.access({
      type: 'personal',
      token: cuid(),
    });
    access = access.attrs;
    await user.session(access.token);
    return user;
  }

  async function createUserAndAccess (permissionLevel, streamId) {
    await createUser();
    accountAccess = await request.post(basePath)
      .send({
        name: charlatan.Lorem.characters(7),
        permissions: [
          {
            streamId: streamId,
            level: permissionLevel
          }
        ]
      })
      .set('authorization', access.token);
    accountAccessData = accountAccess.body.access;
  }

  async function getAccessInDb (id) {
    return await bluebird.fromCallback(
      (cb) => user.db.accesses.findOne({ id: user.attrs.id }, { _id: id}, null, cb));
  }

  before(async function () {
    const helpers = require('api-server/test/helpers');
    config = await getConfig();
    validation = helpers.validation;
    mongoFixtures = databaseFixture(await produceMongoConnection());

    app = getApplication(true);
    await app.initiate();

    // Initialize notifyTests dependency
    let axonMsgs = [];
    const axonSocket = {
      emit: (...args) => axonMsgs.push(args),
    };
    const notifyTests = new Notifications(axonSocket);
    notifyTests.serverReady();
    require("api-server/src/methods/accesses")(
      app.api,
      notifyTests,
      app.getUpdatesSettings,
      app.storageLayer);
    
    await require("api-server/src/methods/events")(
      app.api,
      app.storageLayer.events,
      app.storageLayer.eventFiles,
      app.config.get('auth'),
      app.config.get('service:eventTypes'),
      notifyTests,
      app.logging,
      app.config.get('versioning'),
      app.config.get('updates'),
      app.config.get('openSource'),
      app.config.get('services'));
    request = supertest(app.expressApp);
  });

  describe('POST /accesses', () => {
    describe('When using a personal access', () => {
      describe('to create an access for visible account streams', () => {
        describe('with a read-level permission', async () => {
          let streamId;
          const permissionLevel = AccessLogic.PERMISSION_LEVEL_READ;
          before(async function () {
            streamId = SystemStreamsSerializer.addCustomerPrefixToStreamId('email');
            await createUserAndAccess(permissionLevel, streamId);
          });
          it('[UE9G] should return 201', async () => {
            assert.equal(accountAccess.status, 201);
          });
          it('[BUYP] should create access in the database', async () => {
            assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
          });
          it('[S3IQ] should enable user to read visible stream event with this access', async () => {
            res = await request.get(eventsBasePath).set('authorization', accountAccessData.token);
            assert.equal(res.body.events.length, 1);
            assert.equal(res.body.events[0].streamId, streamId);
          });

          describe('for the “account” stream', async () => {
            let streamId;
            const permissionLevel = AccessLogic.PERMISSION_LEVEL_READ;
            before(async function () {
              streamId = SystemStreamsSerializer.addPrivatePrefixToStreamId('account');
              await createUserAndAccess(permissionLevel, streamId);
            });
            it('[XEAK] should return 201', async () => {
              assert.equal(accountAccess.status, 201);
            });
            it('[65I4] should create access in the database', async () => {
              assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
            });
            it('[L99L] should allow to access visible events in storageUsed', async () => {
              res = await request.get(eventsBasePath).set('authorization', accountAccessData.token);
              assert.equal(res.body.events.length, 7);
              validation.validateAccountEvents(res.body.events);
            });
          });
          describe('for the “storageUsed” stream', async () => {
            let streamId;
            const permissionLevel = AccessLogic.PERMISSION_LEVEL_READ;
            before(async function () {
              streamId = SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed');
              await createUserAndAccess(permissionLevel, streamId);
            });
            it('[EPEP] should return 201', async () => {
              assert.equal(accountAccess.status, 201);
            });
            it('[U3UM] should create access in the database', async () => {
              assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
            });
            it('[A4UP] should allow to access visible events in storageUsed', async () => {
              res = await request.get(eventsBasePath).set('authorization', accountAccessData.token);
              assert.equal(res.body.events.length, 2);
              assert.isTrue([
                SystemStreamsSerializer.addPrivatePrefixToStreamId('attachedFiles'),
                SystemStreamsSerializer.addPrivatePrefixToStreamId('dbDocuments')
              ].includes(res.body.events[0].streamId));
              assert.isTrue([
                SystemStreamsSerializer.addPrivatePrefixToStreamId('attachedFiles'),
                SystemStreamsSerializer.addPrivatePrefixToStreamId('dbDocuments')
              ].includes(res.body.events[1].streamId));
            });
          });
        });
        describe('with a create-only-level permission', async () => {
          let streamId;
          const permissionLevel = AccessLogic.PERMISSION_LEVEL_CREATE_ONLY;
          before(async function () {
            streamId = SystemStreamsSerializer.addCustomerPrefixToStreamId('email');
            await createUserAndAccess(permissionLevel, streamId);
          });
          it('[IWMQ] should return 201', async () => {
            assert.equal(accountAccess.status, 201);
          });
          it('[APYN] should create access in the database', async () => {
            assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
          });
        });
        describe('with a contribute-level permission', async () => {
          let streamId;
          const permissionLevel = AccessLogic.PERMISSION_LEVEL_CONTRIBUTE;
          before(async function () {
            streamId = SystemStreamsSerializer.addCustomerPrefixToStreamId('email');
            await createUserAndAccess(permissionLevel, streamId);
          });
          it('[R0M1] should return 201', async () => {
            assert.equal(accountAccess.status, 201);
          });
          it('[Q8R8] should create access in the database', async () => {
            assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
          });
          it('[TI1X] should allow to create visible stream events', async () => {
            scope = nock(config.get('services:register:url'));
            scope.put('/users',
              (body) => {
                serviceRegisterRequest = body;
                return true;
              }).reply(200, { errors: [] });
  
            const response = await request.post(eventsBasePath)
              .send({
                streamIds: [streamId],
                content: charlatan.Lorem.characters(7),
                type: 'string/pryv'
              })
              .set('authorization', accountAccessData.token);
  
            assert.equal(response.status, 201);
            assert.exists(response.body.event);
            assert.equal(response.body.event.streamId, streamId);
          });
        });

        describe('with a manage-level permission', async () => {
          let streamId;
          before(async function () {
            streamId = SystemStreamsSerializer.addCustomerPrefixToStreamId('email');
            await createUserAndAccess(AccessLogic.PERMISSION_LEVEL_MANAGE, streamId);
          });
          it('[93HO] should return 400', async () => {
            assert.equal(accountAccess.status, 400);
          });
          it('[YPHX] should return the correct error', async () => {
            assert.deepEqual(accountAccess.body.error, {
              id: ErrorIds.InvalidOperation,
              message: ErrorMessages[ErrorIds.TooHighAccessForAccountStreams],
              data: { param: streamId }
            });
          });
        });
      });
      describe('to create an access for not visible account streams', async () => {
        let streamId;
        before(async function () {
          streamId = SystemStreamsSerializer.addPrivatePrefixToStreamId('passwordHash');
          await createUserAndAccess('read', streamId);
        });
        it('[ATGU] should return 400', async () => {
          assert.equal(accountAccess.status, 400);
        });
        it('[Q2KZ] should return the correct error', async () => {
          assert.deepEqual(accountAccess.body.error, {
            id: ErrorIds.InvalidOperation,
            message: ErrorMessages[ErrorIds.DeniedStreamAccess],
            data: { param: streamId }
          });
        });
      });
    });
  });

  describe('DELETE /accesses', async () => {
    describe('When using a personal access', () => {
      describe('to delete an account stream access', async () => {
        let streamId;
        const permissionLevel = AccessLogic.PERMISSION_LEVEL_READ;
        before(async function () {
          streamId = SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed');
          await createUserAndAccess(permissionLevel, streamId);
          res = await request.delete(path.join(basePath, accountAccess.body.access.id))
            .set('authorization', access.token);
        });
        it('[Z40J] should return 200', async () => {
          assert.equal(res.status, 200);
        });
        it('[MP9T] should delete the access in the database', async () => {
          const deletedAccess = await getAccessInDb(accountAccess.body.access.id);
          assert.equal(deletedAccess, null);
        });
      });
    });
  });
});