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
const assert = require('chai').assert;
const { describe, before, it } = require('mocha');
const supertest = require('supertest');
const charlatan = require('charlatan');

const ErrorIds = require('components/errors').ErrorIds;
const ErrorMessages = require('components/errors/src/ErrorMessages');
const Settings = require('components/api-server/src/settings');
const Application = require('components/api-server/src/application');
const Notifications = require('components/api-server/src/Notifications');
const accessLogic = require('components/model/src/accessLogic');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('components/api-server/test/test-helpers');


describe("[B5FF] Account with default-streams", function () {
  let app;
  let request;
  let res;
  let accountAccess;
  let mongoFixtures;
  let basePath;
  let eventsBasePath;
  let access;
  let user;
  let accessInDb;
  

  async function createUser () {
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      insurancenumber: 1234,
      phoneNumber: '+123'
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
    if (accountAccess.body?.access?.id) {
      accessInDb = await getAccessInDb(accountAccess.body.access.id);
    }
  }

  async function getAccessInDb (id) {
    return await bluebird.fromCallback(
      (cb) => user.db.accesses.findOne({ id: user.attrs.id }, { _id: id}, null, cb));
  }

  before(async function () {
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
      const streamId = 'passwordHash';
      before(async function () {
        await createUserAndAccess('read', streamId);
      });
      it('Should return 400', async () => {
        assert.equal(accountAccess.status, 400);
      });
      it('Should return the correct error', async () => {
        assert.deepEqual(accountAccess.body.error, {
          id: ErrorIds.DeniedStreamAccess,
          message: ErrorMessages[ErrorIds.DeniedStreamAccess],
          data: { param: streamId }
        });
      });
    });
    describe('[5459] When user tries to create access for visible account stream', async () => {
      describe('[F1DE] When user tries to create access with permission level manage', async () => {
        const streamId = 'email';
        before(async function () {
          await createUserAndAccess(accessLogic.PERMISSION_LEVEL_MANAGE, streamId);
        });
        it('Should return 400', async () => {
          assert.equal(accountAccess.status, 400);
        });
        it('Should return the correct error', async () => {
          assert.deepEqual(accountAccess.body.error, {
            id: ErrorIds.TooHighAccessForAccountStreams,
            message: ErrorMessages[ErrorIds.TooHighAccessForAccountStreams],
            data: { param: streamId }
          });
        });
      });
      describe('[4B0C] When user tries to create access with permission level read', async () => {
        const streamId = 'email';
        const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('Access should be created in the database', async () => {
          assert.deepEqual(accessInDb.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
        it('User can read visible stream event with this access', async () => {
          res = await request.get(eventsBasePath).set('authorization', accessInDb.token);
          assert.equal(res.body.events.length, 1);
          assert.equal(res.body.events[0].streamId, streamId);
        });
      });
      describe('[0972] When user tries to create access with permission level create-only', async () => {
        const streamId = 'email';
        const permissionLevel = accessLogic.PERMISSION_LEVEL_CREATE_ONLY;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('Access should be created in the database', async () => {
          assert.deepEqual(accessInDb.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
      });
      describe('[84B0] When user tries to create access with permission level contribute', async () => {
        const streamId = 'email';
        const permissionLevel = accessLogic.PERMISSION_LEVEL_CONTRIBUTE;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('Access should be created in the database', async () => {
          assert.deepEqual(accessInDb.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
      });
      describe('[5ECB] When user tries to create access for “account” stream', async () => {
        const streamId = 'account';
        const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('Access should be created in the database', async () => {
          assert.deepEqual(accessInDb.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
        it('User can access visible events in storageUsed with this access', async () => {
          res = await request.get(eventsBasePath).set('authorization', accessInDb.token);
          assert.equal(res.body.events.length, 7);
          //TODO IEVA assert.equal(res.body.events[0].streamId, streamId);
        });
      });
      describe('[274A] When user tries to create access for “storageUsed” stream', async () => {
        const streamId = 'storageUsed';
        const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
        before(async function () {
          await createUserAndAccess(permissionLevel, streamId);
        });
        it('Should return 201', async () => {
          assert.equal(accountAccess.status, 201);
        });
        it('Access should be created in the database', async () => {
          assert.deepEqual(accessInDb.permissions, [{ streamId: streamId, level: permissionLevel }]);
        });
        it('User can access visible events in storageUsed with this access', async () => {
          res = await request.get(eventsBasePath).set('authorization', accessInDb.token);
          //TODO IEVAassert.equal(res.body.events.length, 2);
          //TODO IEVAassert.equal(res.body.events[0].streamId, streamId);
        });
      });
    });
  });

  describe('DELETE /accesses', async () => {
    describe('[F13A] When user tries to delete account stream access', async () => {
      const streamId = 'storageUsed';
      const permissionLevel = accessLogic.PERMISSION_LEVEL_READ;
      before(async function () {
        await createUserAndAccess(permissionLevel, streamId);
        res = await request.delete(path.join(basePath, accountAccess.body.access.id))
          .set('authorization', access.token);
      });
      it('Should return 200', async () => {
        assert.equal(res.status, 200);
      });
      it('Access should be deleted from the database', async () => {
        const deletedAccess = await getAccessInDb(accountAccess.body.access.id);
        assert.equal(deletedAccess, null);
      });
    });
  });

});