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

const { getConfig } = require('components/api-server/config/Config');
const ErrorIds = require('components/errors').ErrorIds;
const ErrorMessages = require('components/errors/src/ErrorMessages');
const Settings = require('components/api-server/src/settings');
const Application = require('components/api-server/src/application');
const Notifications = require('components/api-server/src/Notifications');
const accessLogic = require('components/model/src/accessLogic');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('components/api-server/test/test-helpers');

describe("[B5FF] Account with default-streams", function () {
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
  let accessInDb;
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
    config = getConfig();
    validation = helpers.validation;
    mongoFixtures = databaseFixture(await produceMongoConnection());

    const settings = await Settings.load();

    app = new Application(settings);
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
      app.getLogger('methods/accesses'),
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

  describe('POST /accesses', async () => {
    describe('[F454] When user tries to create access for not visible account stream', async () => {
      const streamId = SystemStreamsSerializer.addDotToStreamId('passwordHash');
      before(async function () {
        await createUserAndAccess('read', streamId);
      });
      it('[ATGU] Should return 400', async () => {
        assert.equal(accountAccess.status, 400);
      });
      it('[Q2KZ] Should return the correct error', async () => {
        assert.deepEqual(accountAccess.body.error, {
          id: ErrorIds.DeniedStreamAccess,
          message: ErrorMessages[ErrorIds.DeniedStreamAccess],
          data: { param: streamId }
        });
      });
    });
    describe('[5459] When user tries to create access for visible account stream', async () => {
      describe('[F1DE] When user tries to create access with permission level manage', async () => {
        const streamId = SystemStreamsSerializer.addDotToStreamId('email');
        before(async function () {
          await createUserAndAccess(accessLogic.PERMISSION_LEVEL_MANAGE, streamId);
        });
        it('[93HO] Should return 400', async () => {
          assert.equal(accountAccess.status, 400);
        });
        it('[YPHX] Should return the correct error', async () => {
          assert.deepEqual(accountAccess.body.error, {
            id: ErrorIds.TooHighAccessForAccountStreams,
            message: ErrorMessages[ErrorIds.TooHighAccessForAccountStreams],
            data: { param: streamId }
          });
        });
      });
      describe('[4B0C] When user tries to create access with permission level read', async () => {
        const streamId = SystemStreamsSerializer.addDotToStreamId('email');
        const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('[UE9G] Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('[BUYP] Access should be created in the database', async () => {
          assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
        it('[S3IQ] User can read visible stream event with this access', async () => {
          res = await request.get(eventsBasePath).set('authorization', accountAccessData.token);
          assert.equal(res.body.events.length, 1);
          assert.equal(res.body.events[0].streamId, streamId);
        });
      });
      describe('[0972] When user tries to create access with permission level create-only', async () => {
        const streamId = SystemStreamsSerializer.addDotToStreamId('email');
        const permissionLevel = accessLogic.PERMISSION_LEVEL_CREATE_ONLY;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('[IWMQ] Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('[APYN] Access should be created in the database', async () => {
          assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
      });
      describe('[84B0] When user tries to create access with permission level contribute', async () => {
        const streamId = SystemStreamsSerializer.addDotToStreamId('email');
        const permissionLevel = accessLogic.PERMISSION_LEVEL_CONTRIBUTE;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('[R0M1] Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('[Q8R8] Access should be created in the database', async () => {
          assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
        it('[TI1X] User can create visible stream event with this access', async () => {
          scope = nock(config.get('services:register:url'))
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
      describe('[5ECB] When user tries to create access for “account” stream', async () => {
        const streamId = SystemStreamsSerializer.addDotToStreamId('account');
        const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('[XEAK] Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('[65I4] Access should be created in the database', async () => {
          assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
        it('[L99L] User can access visible events in storageUsed with this access', async () => {
          res = await request.get(eventsBasePath).set('authorization', accountAccessData.token);
          assert.equal(res.body.events.length, 7);
          validation.validateAccountEvents(res.body.events);
        });
      });
      describe('[274A] When user tries to create access for “storageUsed” stream', async () => {
        const streamId = SystemStreamsSerializer.addDotToStreamId('storageUsed');
        const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('[EPEP] Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('[U3UM] Access should be created in the database', async () => {
          assert.deepEqual(accountAccessData.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
        it('[A4UP] User can access visible events in storageUsed with this access', async () => {
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
  });

  describe('DELETE /accesses', async () => {
    describe('[F13A] When user tries to delete account stream access', async () => {
      const streamId = SystemStreamsSerializer.addDotToStreamId('storageUsed');
      const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
      before(async function () {
        await createUserAndAccess(permissionLevel, streamId);
        res = await request.delete(path.join(basePath, accountAccess.body.access.id))
          .set('authorization', access.token);
      });
      it('[Z40J] Should return 200', async () => {
        assert.equal(res.status, 200);
      });
      it('[MP9T] Access should be deleted from the database', async () => {
        const deletedAccess = await getAccessInDb(accountAccess.body.access.id);
        assert.equal(deletedAccess, null);
      });
    });
  });

});