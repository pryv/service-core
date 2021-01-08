/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const cuid = require('cuid');
const _ = require('lodash');
const bluebird = require('bluebird');
const nock = require('nock');
const assert = require('chai').assert;
const { describe, before, it } = require('mocha');
const supertest = require('supertest');
const charlatan = require('charlatan');
const ErrorIds = require('components/errors').ErrorIds;
const Application = require('components/api-server/src/application');
const Notifications = require('components/api-server/src/Notifications');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');
const { gifnoc } = require('boiler');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('components/api-server/test/test-helpers');
const helpers = require('components/api-server/test/helpers');
const pwdResetReqsStorage = helpers.dependencies.storage.passwordResetRequests;

describe('Account with system streams', function () {
  let helpers;
  let app;
  let request;
  let res;
  let mongoFixtures;
  let basePath;
  let access;
  let user;
  let serviceRegisterRequest;
  let config;
  

  async function createUser () {
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      insurancenumber: charlatan.Number.number(4),
      phoneNumber: charlatan.Lorem.characters(3)
    });

    basePath = '/' + user.attrs.username + '/account';
    access = await user.access({
      type: 'personal',
      token: cuid(),
    });
    access = access.attrs;
    await user.session(access.token);

    return user;
  }

  async function getActiveEvent (streamId) {
    let streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
    return await bluebird.fromCallback(
      (cb) => user.db.events.findOne({ id: user.attrs.id },
        {
          streamIds: {
            $all: [
              SystemStreamsSerializer.options.STREAM_ID_ACTIVE,
              streamIdWithDot
            ]
          }
        }, null, cb));
  }

  async function getNotActiveEvent (streamId) {
    let streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
    return await bluebird.fromCallback(
      (cb) => user.db.events.findOne({ id: user.attrs.id },
        {
          $and: [
            { streamIds: streamIdWithDot },
            { streamIds: { $ne: SystemStreamsSerializer.options.STREAM_ID_ACTIVE } }
          ]
        }, null, cb));
  }
  /**
   * Create additional event
   * @param string streamId 
   */
  async function createAdditionalEvent (streamId) {
    let streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
    eventDataForadditionalEvent = {
      streamIds: [streamIdWithDot],
      content: charlatan.Lorem.characters(7),
      type: 'string/pryv'
    };
    return await request.post('/' + user.attrs.username + '/events')
      .send(eventDataForadditionalEvent)
      .set('authorization', access.token);
  }

  before(async function () {
    helpers = require('components/api-server/test/helpers');
    mongoFixtures = databaseFixture(await produceMongoConnection());
    gifnoc.injectTestConfig({dnsLess: { isActive: true }})  
    app = new Application();
    await app.initiate();

    // Initialize notifications dependency
    let axonMsgs = [];
    const axonSocket = {
      emit: (...args) => axonMsgs.push(args),
    };
    const notifications = new Notifications(axonSocket);
    notifications.serverReady();
    require("components/api-server/src/methods/account")(
      app.api,
      app.storageLayer.events,
      app.storageLayer.passwordResetRequests,
      app.settings.get('auth').obj(),
      app.settings.get('services').obj(),
      notifications,
      app.logging);
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

  after(async function () {
    gifnoc.injectTestConfig({});
  });

  describe('GET /account', () => {
    describe('and when user has multiple events per stream and additional streams events', () => {
      let allVisibleAccountEvents;
      let scope;
      before(async function () {
        await createUser();
        // create additional events for all editable streams
        const settings = _.cloneDeep(helpers.dependencies.settings);
        scope = nock(settings.services.register.url);
        
        scope.put('/users',
          (body) => {
            serviceRegisterRequest = body;
            return true;
          }).times(4).reply(200, { errors: [] });
        const editableStreamsIds = ['.email', '.language', '.phoneNumber', '.insurancenumber'];
        const visibleStreamsIds = ['.username', '.email', '.language', '.phoneNumber', '.insurancenumber', '.dbDocuments', '.attachedFiles'];

        let i;
        for (i = 0; i < editableStreamsIds.length; i++){
          await createAdditionalEvent(editableStreamsIds[i]);
        }

        allVisibleAccountEvents = await bluebird.fromCallback(
          (cb) => user.db.events.find({ id: user.attrs.id },
            {
              $and: [
                { streamIds: { $in: visibleStreamsIds } },
                { streamIds: SystemStreamsSerializer.options.STREAM_ID_ACTIVE }]
            }, null, cb));
        // get account info
        res = await request.get(basePath).set('authorization', access.token);
      });
      it('[XRKX] should return 200', async () => {
        assert.equal(res.status, 200);
      });
      it('[JUHR] should return account information in the structure that is defined in system streams and only active values', async () => {
        const usernameAccountEvent = allVisibleAccountEvents.filter(event => event.streamIds.includes(
          SystemStreamsSerializer.addDotToStreamId('username')))[0];
        const emailAccountEvent = allVisibleAccountEvents.filter(event =>
          event.streamIds.includes(SystemStreamsSerializer.addDotToStreamId('email')))[0];
        const languageAccountEvent = allVisibleAccountEvents.filter(event =>
          event.streamIds.includes(SystemStreamsSerializer.addDotToStreamId('language')))[0];
        const dbDocumentsAccountEvent = allVisibleAccountEvents.filter(event =>
          event.streamIds.includes(SystemStreamsSerializer.addDotToStreamId('dbDocuments')))[0];
        const attachedFilesAccountEvent = allVisibleAccountEvents.filter(event =>
          event.streamIds.includes(SystemStreamsSerializer.addDotToStreamId('attachedFiles')))[0];
        const insurancenumberAccountEvent = allVisibleAccountEvents.filter(event =>
          event.streamIds.includes(SystemStreamsSerializer.addDotToStreamId('insurancenumber')))[0];
        const phoneNumberAccountEvent = allVisibleAccountEvents.filter(event =>
          event.streamIds.includes(SystemStreamsSerializer.addDotToStreamId('phoneNumber')))[0];

        assert.equal(res.body.account.username, usernameAccountEvent.content);
        assert.equal(res.body.account.email, emailAccountEvent.content);
        assert.equal(res.body.account.language, languageAccountEvent.content);
        assert.equal(res.body.account.storageUsed.dbDocuments, dbDocumentsAccountEvent.content);
        assert.equal(res.body.account.storageUsed.attachedFiles, attachedFilesAccountEvent.content);
      });
      it('[R5S0] should return only visible default stream events', async () => {
        assert.equal(Object.keys(res.body.account).length, 4);
      });
    });
  });

  describe('POST /change-password', () => {
    describe('and when valid data is provided', () => {
      let passwordBefore;
      let passwordAfter;
      before(async function () {
        await createUser();
        basePath += '/change-password'
        // modify account info
        passwordBefore = await getActiveEvent('passwordHash');
        res = await request.post(basePath)
          .send({
            newPassword: charlatan.Lorem.characters(7),
            oldPassword: user.attrs.password,
          })
          .set('authorization', access.token);
        passwordAfter = await getActiveEvent('passwordHash');
      });
      it('[X9VQ] should return 200', async () => {
        assert.equal(res.status, 200);
      });
      it('[PWAA] should update event with password hash', async () => {
        assert.notEqual(passwordBefore.content, passwordAfter.content);
      });
    });
    describe('when the password in the database does not exist', () => {
      before(async function () {
        await createUser();
        basePath += '/change-password'
        // remove passwordHash event from the database
        await bluebird.fromCallback(
          (cb) => user.db.events.removeOne({ id: user.attrs.id },
            {
              streamIds: SystemStreamsSerializer.addDotToStreamId('passwordHash')
            }, cb));
        
        // make sure the event was deleted
        let password = await getActiveEvent('passwordHash');
        assert.isNull(password);

        res = await request.post(basePath)
          .send({
            newPassword: charlatan.Lorem.characters(7),
            oldPassword: 'any-password',
          })
          .set('authorization', access.token);
      });
      it('[8S2S] should return 400', async () => {
        assert.equal(res.status, 400);
      });
      it('[WG4L] should return the correct error', async () => {
        assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
      });
    });
  });

  describe('POST /reset-password', () => {
    describe('when the password in the database does not exist', () => {
      async function generateResetToken (username) {
        // generate a reset token for user1
        return await bluebird.fromCallback(
          (cb) => pwdResetReqsStorage.generate(username,cb));
      }
      before(async function () {
        await createUser();
        basePath += '/reset-password'
        // remove passwordHash event from the database
        await bluebird.fromCallback(
          (cb) => user.db.events.removeOne({ id: user.attrs.id },
            {
              streamIds: SystemStreamsSerializer.addDotToStreamId('passwordHash')
            }, cb));

        // make sure the event was deleted
        let password = await getActiveEvent('passwordHash');
        assert.isNull(password);

        res = await request.post(basePath)
          .send({
            newPassword: charlatan.Lorem.characters(7),
            resetToken: await generateResetToken(user.attrs.username),
            appId: 'pryv-test'
          })
          .set('Origin', 'http://test.pryv.local')
          .set('authorization', access.token);
      });
      it('[551W] should return 500', async () => {
        assert.equal(res.status, 500);
      });
      it('[I5M6] should return the correct error', async () => {
        assert.equal(res.body.error.id, ErrorIds.UnexpectedError);
      });
    });
  });

  describe('PUT /account', () => {
      describe('and when user tries to modify the username', () => {
        before(async function () {
          await createUser();
          // modify account info
          res = await request.put(basePath)
            .send({username: charlatan.Lorem.characters(7)})
            .set('authorization', access.token);
        });
        it('[P69J] should return 400', async () => {
          assert.equal(res.status, 400);
        });
        it('[DBM6] should return the correct error', async () => {
          // currently stupid z-schema error is thrown, so let like this because the method will be deprecated
          assert.equal(res.body.error.data.length, 1);
          assert.equal(res.body.error.data[0].code, 'OBJECT_ADDITIONAL_PROPERTIES');
        });
      });
      describe('and when user tries to modify non editable fields', () => {
        before(async function () {
          await createUser();
          // modify account info
          res = await request.put(basePath)
            .send({ attachedFiles: 2 })
            .set('authorization', access.token);
        });
        it('[90N3] should return 400', async () => {
          assert.equal(res.status, 400);
        });
        it('[QHZ4] should return the correct error', async () => {
          // currently stupid z-schema error is thrown, so let like this because the method will be deprecated
          assert.equal(res.body.error.data.length, 1);
          assert.equal(res.body.error.data[0].code, 'OBJECT_ADDITIONAL_PROPERTIES');
        });
      });
      describe('and when updating a unique field that are already taken', () => {
        describe('and the field is not unique in mongodb', () => {
          let scope;
          let user2;
          before(async function () {
            user2 = await createUser();
            await createUser();
            const settings = _.cloneDeep(helpers.dependencies.settings);
            scope = nock(settings.services.register.url)
            scope.put(`/users`)
              .reply(200, {});
  
            // modify account info
            res = await request.put(basePath)
              .send({ email: user2.attrs.email })
              .set('authorization', access.token);
          });
          it('[K3X9] should return a 409 error', async () => {
            assert.equal(res.status, 409);
          });
          it('[8TRP] should return the correct error', async () => {
            assert.equal(res.body.error.id, ErrorIds.ItemAlreadyExists);
            assert.deepEqual(res.body.error.data, { email: user2.attrs.email});
          });
        });
      });

      describe('and when user tries to edit email or language when non-active fields exists', () => {
        let newEmail = charlatan.Lorem.characters(7);
        let newLanguage = charlatan.Lorem.characters(2);
        let activeEmailBefore;
        let notActiveEmailBefore;
        let activeLanguageBefore;
        let notActiveLanguageBefore;
  
        let activeEmailAfter;
        let notActiveEmailAfter;
        let activeLanguageAfter;
        let notActiveLanguageAfter;

        let scope;
        before(async function () {
          await createUser();
          const settings = _.cloneDeep(helpers.dependencies.settings);
          nock.cleanAll();
          scope = nock(settings.services.register.url)
          scope.put(`/users`)
            .reply(200, {});
          scope.put('/users',
            (body) => {
              serviceRegisterRequest = body;
              return true;
            }).times(3).reply(200, {});
          
          // create additional events
          await createAdditionalEvent('email');
          await createAdditionalEvent('language');
  
          activeEmailBefore = await getActiveEvent('email');
          notActiveEmailBefore = await getNotActiveEvent('email');
          activeLanguageBefore = await getActiveEvent('language');
          notActiveLanguageBefore = await getNotActiveEvent('language');
  
          // modify account info
          res = await request.put(basePath)
            .send({
              email: newEmail,
              language: newLanguage,
            })
            .set('authorization', access.token);
          
          activeEmailAfter = await getActiveEvent('email');
          notActiveEmailAfter = await getNotActiveEvent('email');
          activeLanguageAfter = await getActiveEvent('language');
          notActiveLanguageAfter = await getNotActiveEvent('language');
        });
        it('[JJ81] should return 200', async () => {
          assert.equal(res.status, 200);
        });
        it('[K9IC] should returned updated account data', async () => {
          assert.deepEqual(res.body.account, {
              username: user.attrs.username,
              email: newEmail,
              language: newLanguage,
              storageUsed: { dbDocuments: 0, attachedFiles: 0 },
          });
        });
        it('[JQHX] should update only active events in the database', async () => {
          assert.deepEqual(notActiveEmailBefore, notActiveEmailAfter);
          assert.deepEqual(notActiveLanguageBefore, notActiveLanguageAfter);
          assert.notEqual(activeEmailBefore.content, activeEmailAfter.content);
          assert.notEqual(activeLanguageBefore.content, activeLanguageAfter.content);
          assert.equal(activeEmailAfter.content, newEmail);
          assert.equal(activeLanguageAfter.content, newLanguage);
        });
        it('[Y6MC] Should send a request to service-register to update its user main information and unique fields', async () => {
          // email is already skipped
          assert.deepEqual(serviceRegisterRequest, {
            username: user.attrs.username,
            user: {
              email: [
                {
                  creation: false,
                  isActive: true,
                  isUnique: true,
                  value: newEmail
                }
              ],
              language: [
                {
                  value: newLanguage,
                  isUnique: false,
                  isActive: true,
                  creation: false
                }
              ],
            },
            fieldsToDelete: {}
          });
        });
      });
      
  });
});