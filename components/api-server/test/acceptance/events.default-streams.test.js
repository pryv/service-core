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
const path = require('path');
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
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('components/api-server/test/test-helpers');

describe("Events of system streams", () => {
  let config;
  let validation;
  let app;
  let request;
  let res;
  let mongoFixtures;
  let basePath;
  let access;
  let user;
  let serviceRegisterRequest;
  let scope;

  async function createUser () {
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      insurancenumber: charlatan.Number.number(4),
      phoneNumber: charlatan.Lorem.characters(3)
    });
    basePath = '/' + user.attrs.username + '/events';
    access = await user.access({
      type: 'personal',
      token: cuid(),
    });
    access = access.attrs;
    await user.session(access.token);
    return user;
  }

  /**
   * Create additional event
   * @param string streamId 
   */
  async function createAdditionalEvent (streamId) {
    eventDataForadditionalEvent = {
      streamIds: [streamId],
      content: charlatan.Lorem.characters(7),
      type: 'string/pryv'
    };
    return await request.post(basePath)
      .send(eventDataForadditionalEvent)
      .set('authorization', access.token);
  }

  async function createAdditionalEventAndupdateMainOne (streamId) {
    eventData = {
      streamIds: [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE],
      content: charlatan.Lorem.characters(7),
      type: 'string/pryv'
    };

    const initialEvent = await bluebird.fromCallback(
      (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));

    // create an additional event
    await createAdditionalEvent(streamId);

    let response = await request.put(path.join(basePath, initialEvent.id))
      .send(eventData)
      .set('authorization', access.token);
    return response;
  }

  before(async function () {
    config = getConfig();
    config.set('singleNode:isActive', false);
    const helpers = require('components/api-server/test/helpers');
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
    await config.resetConfig();
  });

  describe('GET /events', () => {
    describe('When using a personal access', () => {
      before(async function () {
        await createUser();
        res = await request.get(basePath).set('authorization', access.token);
      });
      // TODO IEVA
      it('[KS6K] should return visible system events')
      it('[36F7] should not return non visible system events', async () => {
        // lets separate core events from all other events and validate them separatelly
        const separatedEvents = validation.separateAccountStreamsAndOtherEvents(res.body.events);

        // events contains only visible streamIds
        assert.equal(separatedEvents.events.length, 0);
        assert.equal(separatedEvents.accountStreamsEvents.length, 7);
      });
      
      it('[C32B] should not return events internal properties that enforce db uniqueness', async () => {
        Object.keys(res.body.events).forEach(i => {
          assert.equal(res.body.events[i].hasOwnProperty(`${
            SystemStreamsSerializer.removeDotFromStreamId(res.body.events[i].streamIds[0])}__unique`), false);
        });
      });
    });
    describe('When using a shared access with a read-level permission on the .account stream', () => {
      let sharedAccess;
      let separatedEvents;
      before(async function () {
        await createUser();
        sharedAccess = await user.access({
          token: cuid(),
          type: 'shared',
          permissions: [{
            streamId: SystemStreamsSerializer.addDotToStreamId('account'),
            level: 'read'
          }],
        });
        res = await request.get(basePath).set('authorization', sharedAccess.attrs.token);
        // lets separate core events from all other events and validate them separatelly
        separatedEvents = validation.separateAccountStreamsAndOtherEvents(res.body.events);
      });
      
      it('[DRFH] should return visible system events', async () => {
        // events contains only visible streamIds
        assert.equal(Object.keys(separatedEvents.accountStreamsEvents).length, 7);
      });
      it('[AE8W] should not return non visible system events', async () => {
        assert.equal(Object.keys(separatedEvents.events).length, 0);
      });
    });
    
    describe('When using a shared access with a read-level permission on all streams (star) and a visible system stream', () => {
      let sharedAccess;
      const streamIdWithDot = '.email';
      before(async function () {
        await createUser();
        sharedAccess = await user.access({
          token: cuid(),
          type: 'shared',
          permissions: [{
            streamId: '*',
            level: 'read'
          },
          {
            streamId: streamIdWithDot,
            level: 'read'
          }],
          clientData: 'This is a consent'
        });
        res = await request.get(basePath).set('authorization', sharedAccess.attrs.token);
      });

      it('[GF3A] should return only the account event for which a permission was explicitely provided', async () => {
        assert.equal(res.body.events.length, 1);
        assert.isTrue(res.body.events[0].streamIds.includes(streamIdWithDot));
      });
    });

    describe('When using a shared access with a read-level permission on all streams (star)', () => {
      let sharedAccess;
      before(async function () {
        await createUser();
        sharedAccess = await user.access({
          token: cuid(),
          type: 'shared',
          permissions: [{
            streamId: '*',
            level: 'read'
          }],
        });
        res = await request.get(basePath).set('authorization', sharedAccess.attrs.token);
      });

      it('[RM74] should not return any system events', async () => {
        assert.equal(res.body.events.length, 0);
      });
    });
  });

  describe('GET /events/<id>', async () => {
    async function findDefaultCoreEvent (streamId) {
      return await bluebird.fromCallback(
        (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));
    }
    describe('When using a personal access', () => {
      describe('to retrieve a visible system event', () => {
        let defaultEvent;
        const streamId = 'username';
        const streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
        before(async function () {
          await createUser();
          defaultEvent = await findDefaultCoreEvent(streamIdWithDot);
          res = await request.get(path.join(basePath, defaultEvent.id)).set('authorization', access.token);
        });
        it('[9IEX] should return 200', async () => {
          assert.equal(res.status, 200);
        });
        it('[IYE6] should return the event', async () => {
          assert.equal(res.body.event.id, defaultEvent.id);
          assert.equal(res.body.event.streamId, streamIdWithDot);
        });
  
        it('[4Q5L] should not return the event\'s internal properties that enforce db uniqueness', async () => {
          assert.equal(res.body.event.hasOwnProperty(`${streamId}__unique`), false);
        });
      });
      describe('to retrieve a non visible system event', () => {
        before(async function () {
          await createUser();
          const defaultEvent = await findDefaultCoreEvent(SystemStreamsSerializer.addDotToStreamId('passwordHash'));
          res = await request.get(path.join(basePath, defaultEvent.id)).set('authorization', access.token);
        });
        it('[Y2OA] should return 404', async () => {
          assert.equal(res.status, 404);
        });
  
        it('[DHZE] should return the right error message', async () => {
          assert.equal(res.body.error.id, ErrorIds.UnknownResource);
        });
      });
    });
    
    describe('When using a shared access with a read-level permission on all streams (star) and a visible system stream', () => {
      let defaultEvent;
      const streamId = 'username';
      const streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
      before(async () => {
        await createUser();
        sharedAccess = await user.access({
          token: cuid(),
          type: 'shared',
          permissions: [{
            streamId: '*',
            level: 'read'
          },
          {
            streamId: streamIdWithDot,
            level: 'read'
          }],
          clientData: 'This is a consent'
        });
        
        defaultEvent = await findDefaultCoreEvent(streamIdWithDot);
        res = await request.get(path.join(basePath, defaultEvent.id))
          .set('authorization', sharedAccess.attrs.token);
      });
      it('[YPZX] should return 200', async () => {
        assert.equal(res.status, 200);
      });
      it('[1NRM] should return the event', async () => {
        assert.exists(res.body.event);
        assert.isTrue(res.body.event.streamIds.includes(streamIdWithDot));
      });
    });
  });

  describe('POST /events', async () => {
    let eventData;
    describe('When using a personal access', () => {
      
      describe('to create an editable system event', async () => {
        describe('which is non indexed and non unique', async () => {
          before(async function () {
            await createUser();
            eventData = {
              streamIds: [SystemStreamsSerializer.addDotToStreamId('phoneNumber')],
              content: charlatan.Lorem.characters(7),
              type: 'string/pryv'
            };
  
            res = await request.post(basePath)
              .send(eventData)
              .set('authorization', access.token);
          });
          it('[F308] should return 201', async () => {
            assert.equal(res.status, 201);
          });
          it('[9C2D] should return the created event', async () => {
            assert.equal(res.body.event.content, eventData.content);
            assert.equal(res.body.event.type, eventData.type);
            assert.deepEqual(res.body.event.streamIds, [SystemStreamsSerializer.addDotToStreamId('phoneNumber'), SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
          });
          it('[A9DC] should add the ‘active’ streamId to the new event which should be removed from other events of the same stream', async () => {
            assert.equal(res.body.event.streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE), true);
            const allEvents = await bluebird.fromCallback(
              (cb) => user.db.events.find({ id: user.attrs.id }, { streamIds: SystemStreamsSerializer.addDotToStreamId('phoneNumber')}, null, cb));
            assert.equal(allEvents.length, 2);
            // check the order
            assert.deepEqual(allEvents[0].id, res.body.event.id);
            // verify streamIds
            assert.deepEqual(allEvents[0].streamIds, [SystemStreamsSerializer.addDotToStreamId('phoneNumber'), SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
            assert.deepEqual(allEvents[1].streamIds, [SystemStreamsSerializer.addDotToStreamId('phoneNumber')]);
          });
        });
        describe('which is indexed', async () => {
            before(async function () {
              await createUser();
              eventData = {
                streamIds: [SystemStreamsSerializer.addDotToStreamId('language')],
                content: charlatan.Lorem.characters(7),
                type: 'string/pryv'
              };

              nock.cleanAll();
              scope = nock(config.get('services:register:url'))
              scope.put('/users',
                (body) => {
                  serviceRegisterRequest = body;
                  return true;
                }).reply(200, { errors: [] });

              res = await request.post(basePath)
                .send(eventData)
                .set('authorization', access.token);
            });

            it('[8C80] should return 201', async () => {
              assert.equal(res.status, 201);
            });
            it('[67F7] should return the created event', async () => {
              assert.equal(res.body.event.content, eventData.content);
              assert.equal(res.body.event.type, eventData.type);
              assert.deepEqual(res.body.event.streamIds, [SystemStreamsSerializer.addDotToStreamId('language'), SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
            });
            it('[467D] should add the ‘active’ streamId to the new event which should be removed from other events of the same stream', async () => {
              const allEvents = await bluebird.fromCallback(
                (cb) => user.db.events.find({ id: user.attrs.id }, { streamIds: '.language' }, null, cb));
              assert.equal(allEvents[0].streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE), true);
              assert.equal(allEvents[0].streamIds.includes(SystemStreamsSerializer.addDotToStreamId('language')), true);
              assert.equal(allEvents[1].streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE), false);
              assert.equal(allEvents[1].streamIds.includes(SystemStreamsSerializer.addDotToStreamId('language')), true);
            });
            it('[199D] should notify register with the new data', async () => {
              assert.equal(scope.isDone(), true);

              assert.deepEqual(serviceRegisterRequest, {
                user: {
                  language: [{
                    value: eventData.content,
                    isUnique: false,
                    isActive: true,
                    creation: true
                  }],
                  username: user.attrs.username,
                },
                fieldsToDelete: {}
              });
            });
        });
        describe('which is indexed and unique', async () => {
          describe('whose content is unique', async () => {
            let allEventsInDb;
            let streamId = SystemStreamsSerializer.addDotToStreamId('email');
            before(async function () {
              await createUser();
              eventData = {
                streamIds: [streamId],
                content: charlatan.Lorem.characters(7),
                type: 'string/pryv'
              };
  
              nock.cleanAll();
              scope = nock(config.get('services:register:url'))
              scope.put('/users',
                (body) => {
                serviceRegisterRequest = body;
                return true;
              }).reply(200, { errors: [] });
  
              res = await request.post(basePath)
                .send(eventData)
                .set('authorization', access.token);
            });
            it('[SQZ2] should return 201', async () => {
              assert.equal(res.status, 201);
            });
            it('[YS79] should return the created event', async () => {
              assert.equal(res.body.event.content, eventData.content);
              assert.equal(res.body.event.type, eventData.type);
              assert.equal(res.body.event.hasOwnProperty('email__unique'), false);           
            });
            it('[15H6] should add properties enforcing uniqueness in the storage', async () => {
              allEventsInDb = await bluebird.fromCallback(
                (cb) => user.db.events.database.find(
                  { name: 'events' },
                  { userId: user.attrs.id, streamIds: streamId },
                  {}, cb)
              );
              assert.equal(allEventsInDb.length, 2);  
              assert.equal(allEventsInDb[0].hasOwnProperty('email__unique'), true);  
              assert.equal(allEventsInDb[1].hasOwnProperty('email__unique'), true);  
            });
            it('[DA23] should add the ‘active’ streamId to the new event which should be removed from other events of the same stream', async () => {
              assert.deepEqual(res.body.event.streamIds, [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE, SystemStreamsSerializer.options.STREAM_ID_UNIQUE]);
              assert.deepEqual(allEventsInDb[0].streamIds, [streamId, SystemStreamsSerializer.options.STREAM_ID_UNIQUE]);
              // check that second event is our new event and that it contains active streamId
              assert.deepEqual(allEventsInDb[1]._id, res.body.event.id);
              assert.deepEqual(allEventsInDb[1].streamIds, [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE, SystemStreamsSerializer.options.STREAM_ID_UNIQUE]);
            });
            it('[D316] should notify register with the new data', async () => {
              assert.equal(scope.isDone(), true);
              
              assert.deepEqual(serviceRegisterRequest, {
                user: {
                  email: [{
                    value: eventData.content,
                    isUnique: true,
                    isActive: true,
                    creation: true
                  }],
                  username: user.attrs.username,
                },
                fieldsToDelete: {}
              });
            });
          });
          describe('whose content is already taken in register', async () => {
            before(async function () {
              await createUser();
              eventData = {
                streamIds: [SystemStreamsSerializer.addDotToStreamId('email')],
                content: charlatan.Lorem.characters(7),
                type: 'string/pryv'
              };
  
              nock.cleanAll();
              nock(config.get('services:register:url')).put('/users')
                .reply(400, {
                  error: {
                    id: ErrorIds.ItemAlreadyExists,
                    data: {
                      email: eventData.content
                    }
                  }
                });
  
              res = await request.post(basePath)
                .send(eventData)
                .set('authorization', access.token);
            });
            
            it('[89BC] should return 400', async () => {
              assert.equal(res.status, 400);
            });
            it('[89BC] should return the correct error', async () => {
              assert.equal(res.body.error.id, ErrorIds.ItemAlreadyExists);
              assert.deepEqual(res.body.error.data, { email: eventData.content});
            });
          });
          describe('[6B8D] When creating an event that is already taken only on core', async () => {
            // simulating single-node behaviour for non-unique event error
            let serviceRegisterRequest;
            let streamId = SystemStreamsSerializer.addDotToStreamId('email');
            let email = charlatan.Lorem.characters(7);
            before(async function () {
              await createUser();
              eventData = {
                streamIds: [streamId],
                content: email,
                type: 'string/pryv'
              };
  
              nock.cleanAll();
              nock(config.get('services:register:url')).put('/users',
                (body) => {
                  serviceRegisterRequest = body;
                  return true;
                }).times(2).reply(200, { errors: [] });
  
                await request.post(basePath)
                  .send(eventData)
                  .set('authorization', access.token);
                res = await request.post(basePath)
                  .send(eventData)
                  .set('authorization', access.token);
            });
  
            it('[2021] should return a 400 error', async () => {
              assert.equal(res.status, 400);
            });
            it('[121E] should return the correct error', async () => {
              assert.equal(res.body.error.id, ErrorIds.ItemAlreadyExists);
              assert.deepEqual(res.body.error.data, { email: email });
            });
          });
          
        });
      });

      describe('to create an non editable system event', async () => {
        before(async () => {
          await createUser();
          eventData = {
            streamIds: [SystemStreamsSerializer.options.STREAM_ID_USERNAME],
            content: charlatan.Lorem.characters(7),
            type: 'string/pryv'
          };
  
          res = await request.post(basePath)
            .send(eventData)
            .set('authorization', access.token);
        });
        it('[6CE0] should return a 400 error', async () => {
          assert.equal(res.status, 400);
        });
        it('[90E6] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
          assert.deepEqual(res.body.error.data, { streamId: SystemStreamsSerializer.options.STREAM_ID_USERNAME});
          assert.equal(res.body.error.message, ErrorMessages[ErrorIds.ForbiddenNoneditableAccountStreamsEdit]);
        });
      });
    });

    describe('when using a shared access with a contribute-level permission on a system stream', () => {
      let sharedAccess;
      let initialEvent;
      let user2;
      const streamId = 'email';
      const streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
      before(async function () {
        user2 = await createUser();
        sharedAccess = await user.access({
          token: cuid(),
          type: 'shared',
          permissions: [{
            streamId: streamIdWithDot,
            level: 'contribute'
          }],
          clientData: 'This is a consent'
        });

        nock.cleanAll();
        scope = nock(config.get('services:register:url'))
        scope.put('/users',
          (body) => {
            serviceRegisterRequest = body;
            return true;
          }).reply(200, { errors: [] });
        
        eventData = {
          streamIds: [streamIdWithDot],
          content: charlatan.Lorem.characters(7),
          type: 'string/pryv'
        };

        res = await request.post(basePath)
          .send(eventData)
          .set('authorization', sharedAccess.attrs.token);
      });

      it('[X49R] should return 201', async () => {
        assert.equal(res.status, 201);
      });
      it('[764A] should return the created event', async () => {
        assert.equal(res.body.event.createdBy, sharedAccess.attrs.id);
        assert.deepEqual(res.body.event.streamIds, [streamIdWithDot, SystemStreamsSerializer.options.STREAM_ID_ACTIVE, SystemStreamsSerializer.options.STREAM_ID_UNIQUE]);
      });
      it('[765A] should notify register with the new data', async () => {
        assert.equal(scope.isDone(), true);
        assert.deepEqual(serviceRegisterRequest, {
          user: {
            [streamId]: [{
              value: res.body.event.content,
              isUnique: true,
              isActive: true,
              creation: true
            }],
            username: user.attrs.username,
          },
          fieldsToDelete: {}
        });
      });
    });

    describe('when using a shared access with a manage-level permission on all streams (star)', () => {
      let sharedAccess;
      const streamIdWithDot = SystemStreamsSerializer.addDotToStreamId('email');
      before(async function () {
        await createUser();
        sharedAccess = await user.access({
          token: cuid(),
          type: 'shared',
          permissions: [{
            streamId: '*',
            level: 'manage'
          }],
        });

        eventData = {
          streamIds: [streamIdWithDot],
          content: charlatan.Lorem.characters(7),
          type: 'string/pryv'
        };

        res = await request.post(basePath)
          .send(eventData)
          .set('authorization', sharedAccess.attrs.token);
      });

      it('[YX07] should return 403', async () => {
        assert.equal(res.status, 403);
      });
      it('[YYU1] should return correct error id', async () => {
        assert.equal(res.body.error.id, ErrorIds.Forbidden);
      });
    });
  });

  describe('PUT /events/<id>', () => {

    describe('when using a personal access', () => {
      
      describe('to update an editable system event', () => {
        let scope;
        let serviceRegisterRequest;
        async function editEvent (streamId) {
          eventData = {
            streamIds: [streamId],
            content: charlatan.Lorem.characters(7),
            type: 'string/pryv'
          };
          const initialEvent = await bluebird.fromCallback(
            (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));
  
          res = await request.put(path.join(basePath, initialEvent.id))
            .send(eventData)
            .set('authorization', access.token);
          return res;
        }
  
        describe('which is non indexed and non unique', () => {
          before(async function () {
            await createUser();
            eventData = {
              content: charlatan.Lorem.characters(7),
              type: 'string/pryv'
            };
            const initialEvent = await bluebird.fromCallback(
              (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: SystemStreamsSerializer.addDotToStreamId('phoneNumber') }, null, cb));
  
            res = await request.put(path.join(basePath, initialEvent.id))
              .send(eventData)
              .set('authorization', access.token);
          });
          it('[2FA2] should return 200', async () => {
            assert.equal(res.status, 200);
          });
          it('[763A] should return the updated event', async () => {
            assert.equal(res.body.event.content, eventData.content);
            assert.equal(res.body.event.type, eventData.type);
            assert.deepEqual(res.body.event.streamIds, [
              SystemStreamsSerializer.addDotToStreamId('phoneNumber'),
              SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
          });

          describe('by adding the “active” streamId', () => {
            let streamId = SystemStreamsSerializer.addDotToStreamId('phoneNumber');
            before(async function () {
              await createUser();
              res = await createAdditionalEventAndupdateMainOne(streamId);
            });
            it('[562A] should return 200', async () => {
              assert.equal(res.status, 200);
            });
            it('[5622] should return the updated event', async () => {
               assert.equal(res.body.event.content, eventData.content);
               assert.equal(res.body.event.type, eventData.type);
              assert.deepEqual(res.body.event.streamIds, [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
            });
            it('[CF70] should remove the "active" streamId for events of the same stream', async () => {
              const allEvents = await bluebird.fromCallback(
                (cb) => user.db.events.find({ id: user.attrs.id }, { streamIds: streamId }, null, cb));
              assert.equal(allEvents.length, 2);
              // check the order
              assert.deepEqual(allEvents[1].id, res.body.event.id);
              // verify streamIds
              assert.deepEqual(allEvents[0].streamIds, [streamId]);
              assert.deepEqual(allEvents[1].streamIds, [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
            });
          });
          describe('by changing its steamIds', () => {
            describe('when editing with 2 streamIds at the time', () => {
              before(async function () {
                await createUser();
                eventData = {
                  streamIds: [
                    SystemStreamsSerializer.addDotToStreamId('email'),
                    SystemStreamsSerializer.addDotToStreamId('phoneNumber')
                  ],
                  content: charlatan.Lorem.characters(7),
                  type: 'string/pryv'
                };
                const initialEvent = await bluebird.fromCallback(
                  (cb) => user.db.events.findOne({ id: user.attrs.id },
                    { streamIds: SystemStreamsSerializer.addDotToStreamId('phoneNumber') }, null, cb));
  
                res = await request.put(path.join(basePath, initialEvent.id))
                  .send(eventData)
                  .set('authorization', access.token);
              });
              it('[9004] should return 400', async () => {
                assert.equal(res.status, 400);
              });
              it('[E3KE] should return the correct error', async () => {
                assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
                assert.equal(res.body.error.message, ErrorMessages[ErrorIds.ForbiddenMultipleAccountStreams]);
                assert.deepEqual(res.body.error.data, { streamId: SystemStreamsSerializer.addDotToStreamId('email')});
              });
            });
            describe('when substituting a system stream with another one', () => {
              before(async function () {
                await createUser();
                eventData = {
                  streamIds: [SystemStreamsSerializer.addDotToStreamId('email')],
                  content: charlatan.Lorem.characters(7),
                  type: 'string/pryv'
                };
                const initialEvent = await bluebird.fromCallback(
                  (cb) => user.db.events.findOne({ id: user.attrs.id },
                    { streamIds: SystemStreamsSerializer.addDotToStreamId('phoneNumber') }, null, cb));
  
                res = await request.put(path.join(basePath, initialEvent.id))
                  .send(eventData)
                  .set('authorization', access.token);
              });
              it('[9004] should return 400', async () => {
                assert.equal(res.status, 400);
              });
              it('[E3AE] should return the correct error', async () => {
                assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
                assert.equal(res.body.error.message, ErrorMessages[ErrorIds.ForbiddenToChangeAccountStreamId]);
              });
            });
          });
        });

        describe('which is indexed', () => {
            describe('as register is working', async () => {
              const streamId = 'language';
              let streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
              before(async function () {
                await createUser();
                nock.cleanAll();
                scope = nock(config.get('services:register:url'));
                scope.put('/users',
                  (body) => {
                    serviceRegisterRequest = body;
                    return true;
                  }).reply(200, { errors: [] });
                await editEvent(streamIdWithDot);
              });
              it('[0RUK] should return 200', async () => {
                assert.equal(res.status, 200);
              });
              it('[E43M] should notify register with the updated data', async () => {
                assert.equal(scope.isDone(), true);
                
                assert.deepEqual(serviceRegisterRequest, {
                  user: {
                    [streamId]: [{
                      value: eventData.content,
                      isUnique: false,
                      isActive: true,
                      creation: false
                    }],
                    username: user.attrs.username,
                  },
                  fieldsToDelete: {}
                });
              });
              describe('by adding the “active” streamId', () => {
                before(async function () {
                  await createUser();
                  let streamId = SystemStreamsSerializer.addDotToStreamId('language');
                  nock.cleanAll();
                  scope = nock(config.get('services:register:url'))
                  scope.put('/users',
                    (body) => {
                      serviceRegisterRequest = body;
                      return true;
                    }).times(2).reply(200, { errors: [] });
                  res = await createAdditionalEventAndupdateMainOne(streamId);
                });
                it('[0D18] should notify register with the updated data', async () => {
                  assert.equal(scope.isDone(), true);
                  assert.deepEqual(serviceRegisterRequest, {
                    user: {
                      language: [{
                        value: eventData.content,
                        isUnique: false,
                        isActive: true,
                        creation: false
                      }],
                      username: user.attrs.username,
                    },
                    fieldsToDelete: {}
                  });
                });
              });
            });
            describe('as register is out', async () => {
              const streamId = 'language';
              const streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
              before(async function () {
                await createUser();
                nock.cleanAll();
                scope = nock(config.get('services:register:url'));
                scope.put('/users',
                  (body) => {
                    serviceRegisterRequest = body;
                    return true;
                  }).replyWithError({
                    message: 'something awful happened',
                    code: '500',
                  });
                await editEvent(streamIdWithDot);
              });
              it('[AA92] should return 500', async () => {
                assert.equal(res.status, 500);
              });
              it('[645C] should notify register with the updated data', async () => {
                assert.equal(scope.isDone(), true);
                assert.deepEqual(serviceRegisterRequest, {
                  user: {
                    [streamId]: [{
                      value: eventData.content,
                      isUnique: false,
                      isActive: true,
                      creation: false
                    }],
                    username: user.attrs.username,
                  },
                  fieldsToDelete: {}
                });
              });
            });
        });

        describe('which is unique', () => {
          describe('by updating a unique field that is valid', () => {
            const streamId = 'email';
            const streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
            before(async function () {
              await createUser();
              scope = nock(config.get('services:register:url'));
              scope.put('/users',
                (body) => {
                  serviceRegisterRequest = body;
                  return true;
                }).reply(200, { errors: [] });
              await editEvent(streamIdWithDot);
            });
            it('[4BB1] should return 200', async () => {
              assert.equal(res.status, 200);
            });
            it('[GWHU] should send a request to service-register to update the unique field', async () => {
              assert.equal(scope.isDone(), true);
              assert.deepEqual(serviceRegisterRequest, {
                user: {
                  email: [{
                    value: eventData.content,
                    isUnique: true,
                    isActive: true,
                    creation: false
                  }],
                  username: user.attrs.username,
                },
                fieldsToDelete: {}
              });
            });
            it('[C457] should save an additional field to enforce uniqueness in mongodb', async () => {
              updatedEvent = await bluebird.fromCallback(
                (cb) => user.db.events.database.findOne(
                  { name: 'events' },
                  { userId: user.attrs.id, streamIds: streamIdWithDot },
                  {}, cb)
              );
              assert.equal(updatedEvent.content, eventData.content);
              assert.equal(updatedEvent.type, eventData.type);
              assert.equal(updatedEvent.hasOwnProperty(`${streamId}__unique`), true);  
            });
            describe('by adding the “active” streamId', () => {
              before(async () => {
                await createUser();
                let streamId = SystemStreamsSerializer.addDotToStreamId('email');
                nock.cleanAll();
                scope = nock(config.get('services:register:url'))
                scope.put('/users',
                  (body) => {
                    serviceRegisterRequest = body;
                    return true;
                  }).times(2).reply(200, { errors: [] });
                res = await createAdditionalEventAndupdateMainOne(streamId);
              });
    
              it('[HJWE] should return 200', () => {
                assert.equal(res.status, 200);
              });
              it('[6AAT] should notify register with the updated data', () => {
                assert.equal(scope.isDone(), true);
                assert.deepEqual(serviceRegisterRequest, {
                  user: {
                    email: [{
                      value: eventData.content,
                      isUnique: true,
                      isActive: true,
                      creation: false
                    }],
                    username: user.attrs.username,
                  },
                  fieldsToDelete: {}
                });
              });
            });
          });
          describe('by updating a unique field that is already taken', () => {
            describe('with a field that is not unique in register', () => {
              let streamIdWithDot;
              before(async function () {
                const streamId = 'email';
                streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
    
                await createUser();
                eventData = {
                  streamIds: [streamIdWithDot],
                  content: charlatan.Lorem.characters(7),
                  type: 'string/pryv'
                };
                nock.cleanAll();
                scope = nock(config.get('services:register:url'))
                scope.put('/users',
                  (body) => {
                    serviceRegisterRequest = body;
                    return true;
                  }).reply(400, {
                    error: {
                      id: ErrorIds.ItemAlreadyExists,
                      data: {
                        [streamId]: eventData.content
                      }
                    }
                  });
                const initialEvent = await bluebird.fromCallback(
                  (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamIdWithDot }, null, cb));
    
                res = await request.put(path.join(basePath, initialEvent.id))
                  .send(eventData)
                  .set('authorization', access.token);
              });
              it('[F8A8] should return 400', async () => {
                assert.equal(res.status, 400);
                assert.equal(res.body.error.id, ErrorIds.ItemAlreadyExists);
                assert.deepEqual(res.body.error.data, { email: eventData.content});
              });
              it('[5A04] should notify register with the updated data', async () => {
                assert.equal(scope.isDone(), true);
    
                assert.deepEqual(serviceRegisterRequest, {
                  user: {
                    email: [{
                      value: eventData.content,
                      isUnique: true,
                      isActive: true,
                      creation: false
                    }],
                    username: user.attrs.username,
                  },
                  fieldsToDelete: {}
                });
              });
              
            });
            describe('with a field that is not unique in mongodb', () => {
              before(async function () {
                const streamId = SystemStreamsSerializer.addDotToStreamId('email');
                const user1 = await createUser();
                const user2 = await createUser();
                eventData = {
                  streamIds: [streamId],
                  content: user1.attrs.email,
                  type: 'string/pryv'
                };
                nock.cleanAll();
                scope = nock(config.get('services:register:url'))
                scope.put('/users',
                  (body) => {
                    serviceRegisterRequest = body;
                    return true;
                  }).reply(200, { errors: [] });
                const initialEvent = await bluebird.fromCallback(
                  (cb) => user2.db.events.findOne({ id: user2.attrs.id }, { streamIds: streamId }, null, cb));
    
                res = await request.put(path.join(basePath, initialEvent.id))
                  .send(eventData)
                  .set('authorization', access.token);
              });
              it('[5782] should return 400', async () => {
                assert.equal(res.status, 400);
              });
              it('[B285] should return the correct error', async () => {
                const error = res.body.error;
                assert.equal(error.id, ErrorIds.ItemAlreadyExists);
                assert.equal(error.data.email, eventData.content);
              });
            });
          });
        });
  
      });

      describe('to update a non editable system event', () => {
        before(async function () {
          await createUser();
          eventData = {
            content: charlatan.Lorem.characters(7),
            type: 'string/pryv'
          };
          const initialEvent = await bluebird.fromCallback(
            (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: SystemStreamsSerializer.options.STREAM_ID_USERNAME }, null, cb));
  
          res = await request.put(path.join(basePath, initialEvent.id))
            .send(eventData)
            .set('authorization', access.token);
        });
        it('[034D] should return 400', async () => {
          assert.equal(res.status, 400);
        });
        it('[BB5F] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
          assert.equal(res.body.error.message, ErrorMessages[ErrorIds.ForbiddenNoneditableAccountStreamsEdit]);
          assert.deepEqual(res.body.error.data, { streamId: SystemStreamsSerializer.options.STREAM_ID_USERNAME});
        });
      });
    });
    // TODO IEVA
    describe('when using a shared access with a contribute-level access on a system stream', () => {
      before(async function () {
      });
      it('[W8PQ] should return 200', async () => {
      });
      it('[TFOI] should return the updated event', async () => {
      });
    });
    describe('when using a shared access with a manage-level permission on all streams (star)', () => {
      describe('to update an editable system event', () => {
        before(async function () {
          await createUser();
          sharedAccess = await user.access({
            token: cuid(),
            type: 'shared',
            permissions: [{
              streamId: '*',
              level: 'manage'
            }],
            clientData: 'This is a consent'
          });
          eventData = {
            content: charlatan.Lorem.characters(7),
            type: 'string/pryv'
          };
          const initialEvent = await bluebird.fromCallback(
            (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: SystemStreamsSerializer.addDotToStreamId('phoneNumber') }, null, cb));
  
          res = await request.put(path.join(basePath, initialEvent.id))
            .send(eventData)
            .set('authorization', sharedAccess.attrs.token);
        });
        it('[H1XL] should return 403', async () => {
          assert.equal(res.status, 403);
        });
        it('[7QA3] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.Forbidden);
        });
      });
    });
  });

  describe('DELETE /events/<id>', () => {
    describe('When using a personal access', () => {
      describe('to delete an editable streams event', () => {
        describe('that has no ‘active’ streamId', () => {
          describe('which is unique', () => { 
            let streamId = 'email';
            let streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
            let initialEvent;
            before(async function () {
              nock.cleanAll();
              scope = nock(config.get('services:register:url'));
              scope.put('/users',
                (body) => {
                  serviceRegisterRequest = body;
                  return true;
                }).times(2).reply(200, { errors: [] });
              await createUser();
              initialEvent = await bluebird.fromCallback(
                (cb) => user.db.events.database.findOne(
                  { name: 'events' },
                  { userId: user.attrs.id, streamIds: streamIdWithDot },
                  {}, cb));
              await createAdditionalEvent(streamIdWithDot);
  
              res = await request.delete(path.join(basePath, initialEvent._id))
                .set('authorization', access.token);
            });
            it('[43B1] should return 200', async () => { 
              assert.equal(res.status, 200);
            });
            it('[3E12] should return the trashed event', async () => {
              assert.equal(res.body.event.id, initialEvent._id);
              assert.equal(res.body.event.trashed, true);
             });
            it('[FJK3] should not return the event\'s internal properties that enforce db uniqueness', async () => { 
              assert.notEqual(res.body.event[`${streamId}__unique`], initialEvent[`${streamId}__unique`]);
            });
            it('[F328] should notify register with the deleted data', async () => { 
              assert.equal(scope.isDone(), true);
              assert.deepEqual(serviceRegisterRequest, {
                user: {
                  username: user.attrs.username,
                },
                fieldsToDelete: { [streamId]: initialEvent.content}
              });
            });
          });
          describe('which is indexed', () => { 
            let streamId = SystemStreamsSerializer.addDotToStreamId('language');
            let initialEvent;
            before(async function () {
              nock.cleanAll();
              scope = nock(config.get('services:register:url'));
              scope.put('/users',
                (body) => {
                  serviceRegisterRequest = body;
                  return true;
                }).times(1).reply(200, { errors: [] });
              await createUser();
              initialEvent = await bluebird.fromCallback(
                (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));
  
              await createAdditionalEvent(streamId);
  
              res = await request.delete(path.join(basePath, initialEvent.id))
                .set('authorization', access.token);
            });
            it('[1B70] should return 200', async () => { 
              assert.equal(res.status, 200);
            });
            it('[CBB9] should return the trashed event', async () => { 
              assert.equal(res.body.event.id, initialEvent.id);
              assert.equal(res.body.event.trashed, true);
            });
          });
        });
        describe('that has the ‘active’ streamId', () => {
          let streamId = SystemStreamsSerializer.addDotToStreamId('language');
          let initialEvent;
          before(async function () {
            await createUser();
            initialEvent = await bluebird.fromCallback(
              (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));
            res = await request.delete(path.join(basePath, initialEvent.id))
              .set('authorization', access.token);
          });
          it('[10EC] should return 400', async () => { 
            assert.equal(res.status, 400);
          });
          it('[D4CA] should return the correct error', async () => { 
            assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
            assert.equal(res.body.error.message, ErrorMessages[ErrorIds.ForbiddenAccountStreamsEventDeletion]);
          });
        });
      });
      describe('to delete a non editable system event', () => {
        let streamId = SystemStreamsSerializer.addDotToStreamId('username');
        let initialEvent;
        before(async function () {
          nock.cleanAll();
          scope = nock(config.get('services:register:url'));
          scope.put('/users',
            (body) => {
              serviceRegisterRequest = body;
              return true;
            }).times(2).reply(200, { errors: [] });
          await createUser();
          initialEvent = await bluebird.fromCallback(
            (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));
  
          await createAdditionalEvent(streamId);
  
          res = await request.delete(path.join(basePath, initialEvent.id))
            .set('authorization', access.token);
        });
        it('[8EDB] should return a 400', async () => { 
          assert.equal(res.status, 400);
        });
        it('[A727] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
          assert.equal(res.body.error.message, ErrorMessages[ErrorIds.ForbiddenAccountStreamsEventDeletion]);
        });
      });
    });

    // TODO IEVA
    describe('when using a shared access with a contribute-level access on a system stream', () => {
      before(async function () {
      });
      it('[I1I1] should return 200', async () => {
      });
      it('[UFLT] should return the updated event', async () => {
      });
    });

    describe('when using a shared access with a manage-level permission on all streams (star)', () => {
      let streamId = 'email';
      let streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
      let initialEvent;
      before(async function () {
        nock.cleanAll();
        scope = nock(config.get('services:register:url'));
        scope.put('/users',
          (body) => {
            serviceRegisterRequest = body;
            return true;
          }).times(2).reply(200, { errors: [] });
        await createUser();
        initialEvent = await bluebird.fromCallback(
          (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamIdWithDot }, null, cb));

        await createAdditionalEvent(streamIdWithDot);
        sharedAccess = await user.access({
          token: cuid(),
          type: 'shared',
          permissions: [{
            streamId: '*',
            level: 'manage'
          }],
          clientData: 'This is a consent'
        });

        res = await request.delete(path.join(basePath, initialEvent.id))
          .set('authorization', sharedAccess.attrs.token);
      });
      it('[43B1] should return 403', async () => {
        assert.equal(res.status, 403);
      });
      it('[3E12] should return the correct error', async () => {
        assert.equal(res.body.error.id, ErrorIds.Forbidden);
      });
    });
    
  });
});