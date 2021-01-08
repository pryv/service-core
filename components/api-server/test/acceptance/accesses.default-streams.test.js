/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
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

const ErrorIds = require('components/errors').ErrorIds;
const ErrorMessages = require('components/errors/src/ErrorMessages');
const Application = require('components/api-server/src/application');
const Notifications = require('components/api-server/src/Notifications');
const accessLogic = require('components/model/src/accessLogic');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('components/api-server/test/test-helpers');

const { getGifnoc } = require('boiler');

describe("Accesses with account streams", function () {
  let gifnoc;
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
    const helpers = require('components/api-server/test/helpers');
    gifnoc = await getGifnoc();
    validation = helpers.validation;
    mongoFixtures = databaseFixture(await produceMongoConnection());

    app = new Application();
    await app.initiate();

    // Initialize notifications dependency
    let axonMsgs = [];
    const axonSocket = {
      emit: (...args) => axonMsgs.push(args),
    };
    const notifications = new Notifications(axonSocket);
    notifications.serverReady();
    require("components/api-server/src/methods/accesses")(
      app.api,
      notifications,
      app.getUpdatesSettings,
      app.storageLayer);
    
    require("components/api-server/src/methods/events")(
      app.api,
      app.storageLayer.events,
      app.storageLayer.eventFiles,
      app.settings.get('auth').obj(),
      app.settings.get('service.eventTypes').str(),
      notifications,
      app.logging,
      app.settings.get('audit').obj(),
      app.settings.get('updates').obj(),
      app.settings.get('openSource').obj(),
      app.settings.get('services').obj());
    request = supertest(app.expressApp);
  });

  describe('POST /accesses', () => {
    describe('When using a personal access', () => {
      describe('to create an access for visible account streams', () => {
        describe('with a read-level permission', async () => {
          const streamId = SystemStreamsSerializer.addDotToStreamId('email');
          const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
          before(async function () {
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
            const streamId = SystemStreamsSerializer.addDotToStreamId('account');
            const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
            before(async function () {
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
            const streamId = SystemStreamsSerializer.addDotToStreamId('storageUsed');
            const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
            before(async function () {
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
                SystemStreamsSerializer.addDotToStreamId('attachedFiles'),
                SystemStreamsSerializer.addDotToStreamId('dbDocuments')
              ].includes(res.body.events[0].streamId));
              assert.isTrue([
                SystemStreamsSerializer.addDotToStreamId('attachedFiles'),
                SystemStreamsSerializer.addDotToStreamId('dbDocuments')
              ].includes(res.body.events[1].streamId));
            });
          });
        });
        describe('with a create-only-level permission', async () => {
          const streamId = SystemStreamsSerializer.addDotToStreamId('email');
          const permissionLevel = accessLogic.PERMISSION_LEVEL_CREATE_ONLY;
          before(async function () {
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
          const streamId = SystemStreamsSerializer.addDotToStreamId('email');
          const permissionLevel = accessLogic.PERMISSION_LEVEL_CONTRIBUTE;
          before(async function () {
            await createUserAndAccess(permissionLevel, streamId);
          });
          it('[R0M1] should return 201', async () => {
            assert.equal(accountAccess.status, 201);
          });
          it('[Q8R8] should create access in the database', async () => {
            assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
          });
          it('[TI1X] should allow to create visible stream events', async () => {
            scope = nock(gifnoc.get('services:register:url'));
            scope.put('/users',
              (body) => {
                serviceRegisterRequest = body;
                return true;
              }).reply(200, { errors: [] });
  
            const newEvent = await request.post(eventsBasePath)
              .send({
                streamIds: [streamId],
                content: charlatan.Lorem.characters(7),
                type: 'string/pryv'
              })
              .set('authorization', accountAccessData.token);
  
            assert.equal(newEvent.status, 201);
            assert.equal(newEvent.body.hasOwnProperty('event'), true);
            assert.equal(newEvent.body.event.streamId, streamId);
          });
        });

        describe('with a manage-level permission', async () => {
          const streamId = SystemStreamsSerializer.addDotToStreamId('email');
          before(async function () {
            await createUserAndAccess(accessLogic.PERMISSION_LEVEL_MANAGE, streamId);
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
        const streamId = SystemStreamsSerializer.addDotToStreamId('passwordHash');
        before(async function () {
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
        const streamId = SystemStreamsSerializer.addDotToStreamId('storageUsed');
        const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
        before(async function () {
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