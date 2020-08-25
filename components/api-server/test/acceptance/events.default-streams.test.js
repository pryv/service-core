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
const ErrorIds = require('components/errors').ErrorIds;
const ErrorMessages = require('components/errors/src/ErrorMessages');
const Settings = require('components/api-server/src/settings');
const Application = require('components/api-server/src/application');
const Notifications = require('components/api-server/src/Notifications');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('components/api-server/test/test-helpers');
const helpers = require('components/api-server/test/helpers');
const validation = helpers.validation;


describe("[AGT3] Events of default-streams", function () {
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
      type: 'app',
      permissions: [
        {
          streamId: '*',
          level: 'manage',
        }
      ],
      token: cuid(),
    });
    access = access.attrs;
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

  describe('GET /events', async () => {
    describe('[C326] When user provide app token he can get default-streams events', async () => {
      before(async function () {
        await createUser();
        res = await request.get(basePath).set('authorization', access.token);
      });
      it('[36F7] User should not be able to see “not visible” core steams', async () => {
        // lets separate core events from all other events and validate them separatelly
        const separatedEvents = validation.separateAccountStreamsAndOtherEvents(res.body.events);

        // events contains only visible streamIds
        assert.equal(separatedEvents.events.length, 0);
        assert.equal(separatedEvents.accountStreamsEvents.length, 7);
      });
      
      it('[C32B] Unique events does not return additional field that enforces the uniqueness', async () => {
        Object.keys(res.body.events).forEach(event => {
          assert.equal(event.hasOwnProperty(`${event.streamId}__unique`), false);
        });
      });
    });
    describe('[1EB4] When user provide access token he can get default-streams events', async () => {
      let sharedAccess;
      let separatedEvents;
      before(async function () {
        await createUser();
        sharedAccess = await user.access({
          token: cuid(),
          type: 'shared',
          permissions: [{
            streamId: 'account',
            level: 'manage'
          }],
          clientData: 'This is a consent'
        });
        res = await request.get(basePath).set('authorization', sharedAccess.attrs.token);
        // lets separate core events from all other events and validate them separatelly
        separatedEvents = validation.separateAccountStreamsAndOtherEvents(res.body.events);
      });
      
      it('User should be able to see "visible” core steams', async () => {
        // events contains only visible streamIds
        assert.equal(Object.keys(separatedEvents.accountStreamsEvents).length, 7);
      });
      it('User should not be able to see “not visible” core steams', async () => {
        assert.equal(Object.keys(separatedEvents.events).length, 0);
      });
    });
  });

  describe('GET /events/<id>', async () => {
    async function findDefaultCoreEvent (streamId) {
      return await bluebird.fromCallback(
        (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));
    }
    describe('[C826] When user retrieves the event from “not visible” account stream', async () => {
      before(async function () {
        await createUser();
        const defaultEvent = await findDefaultCoreEvent('passwordHash');
        res = await request.get(path.join(basePath, defaultEvent.id)).set('authorization', access.token);
      });
      it('Should return 404', async () => {
        assert.equal(res.status, 404);
      });

      it('Should return the right error message', async () => {
        assert.equal(res.body.error.id, ErrorIds.UnknownResource);
      });
    });
    describe('[88BJ] When user retrieves the event from “visible” unique account stream', async () => {
      let defaultEvent;
      const streamId = 'username';
      before(async function () {
        await createUser();
        defaultEvent = await findDefaultCoreEvent(streamId);
        res = await request.get(path.join(basePath, defaultEvent.id)).set('authorization', access.token);
      });
      it('Should return 200', async () => { 
        assert.equal(res.status, 200);
      });
      it('Should return the event', async () => {
        assert.equal(res.body.event.id, defaultEvent.id);
        assert.equal(res.body.event.streamId, streamId);
      });

      it('Additional field that was saved to enforce the uniqueness is not returned', async () => {
        assert.equal(res.body.event.hasOwnProperty(`${streamId}__unique`), false);
      });
    });
  });

  describe('POST /events', async () => {
    let eventData;
    describe('[ED75] When creating an even with non editable account stream id', async () => {
      before(async function () {
        await createUser();
        eventData = {
          streamIds: ['username'],
          content: charlatan.Lorem.characters(7),
          type: 'string/pryv'
        };

        res = await request.post(basePath)
          .send(eventData)
          .set('authorization', access.token);
      });
      it('[6CE0] Should return a 400 error', async () => {
        assert.equal(res.status, 400);
      });
      it('[90E6] Should return the correct error', async () => {
        assert.equal(res.body.error.data[0].code, ErrorIds.DeniedEventModification);
        assert.equal(res.body.error.data[0].message, ErrorMessages[ErrorIds.DeniedEventModification]);
      });
    });

    describe('When creating an even with editable account stream id', async () => {
      describe('[7CD9] When saving not indexed and not unique event', async () => {
        before(async function () {
          await createUser();
          eventData = {
            streamIds: ['phoneNumber'],
            content: charlatan.Lorem.characters(7),
            type: 'string/pryv'
          };

          res = await request.post(basePath)
            .send(eventData)
            .set('authorization', access.token);
        });
        it('[F308] Should return 201', async () => {
          assert.equal(res.status, 201);
        });
        it('[9C2D] Should return the created event', async () => {
          assert.equal(res.body.event.content, eventData.content);
          assert.equal(res.body.event.type, eventData.type);
          assert.deepEqual(res.body.event.streamIds, ['phoneNumber', SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
        });
        it('[A9DC] New event gets streamId ‘active’ and ‘active’ stream property is removed from all other events from the same stream ', async () => {
          assert.equal(res.body.event.streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE), true);
          const allEvents = await bluebird.fromCallback(
            (cb) => user.db.events.find({ id: user.attrs.id }, {streamIds: 'phoneNumber'}, null, cb));
          assert.equal(allEvents.length, 2);
          // check the order
          assert.deepEqual(allEvents[0].id, res.body.event.id);
          // verify streamIds
          assert.deepEqual(allEvents[0].streamIds, ['phoneNumber', SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
          assert.deepEqual(allEvents[1].streamIds, ['phoneNumber']);
        });
      });
      describe('[4EB9] When event belongs to the unique account stream', async () => {
        describe('[2FA2] When creating an event that is valid', async () => {
          let allEventsInDb;

          before(async function () {
            await createUser();
            eventData = {
              streamIds: ['email'],
              content: charlatan.Lorem.characters(7),
              type: 'string/pryv'
            };

            const settings = _.cloneDeep(helpers.dependencies.settings);
            nock.cleanAll();
            scope = nock(settings.services.register.url)
            scope.put('/users',
              (body) => {
              serviceRegisterRequest = body;
              return true;
            }).reply(200, { errors: [] });

            res = await request.post(basePath)
              .send(eventData)
              .set('authorization', access.token);
          });
          it('[7A76] Should return 201', async () => {
            assert.equal(res.status, 201);
          });
          it('[5831] Should return the created event', async () => {
            assert.equal(res.body.event.content, eventData.content);
            assert.equal(res.body.event.type, eventData.type);
            assert.equal(res.body.event.hasOwnProperty('email__unique'), false);           
          });
          it('[78FE] Unique streamId and event properties enforcing uniqueness are appended', async () => {
            allEventsInDb = await bluebird.fromCallback(
              (cb) => user.db.events.find({ id: user.attrs.id }, { streamIds: 'email' }, null, cb));
            assert.equal(allEventsInDb.length, 2);  
            assert.equal(allEventsInDb[0].hasOwnProperty('email__unique'), true);  
            assert.equal(allEventsInDb[1].hasOwnProperty('email__unique'), true);  
          });
          it('[DA23] New event gets streamId ‘active’ and ‘active’ stream property is removed from all other events from the same stream ', async () => {
            assert.deepEqual(res.body.event.streamIds, ['email', SystemStreamsSerializer.options.STREAM_ID_ACTIVE, 'unique']);
            assert.deepEqual(allEventsInDb[0].streamIds, ['email', SystemStreamsSerializer.options.STREAM_ID_ACTIVE, 'unique']);
            assert.deepEqual(allEventsInDb[1].streamIds, ['email', 'unique']);
          });
          it('[D316] New event data is sent to service-register', async () => {
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
        describe('[7464] When creating an event that is already taken in service-register', async () => {
          before(async function () {
            await createUser();
            eventData = {
              streamIds: ['email'],
              content: charlatan.Lorem.characters(7),
              type: 'string/pryv'
            };

            const settings = _.cloneDeep(helpers.dependencies.settings);
            nock.cleanAll();
            nock(settings.services.register.url).put('/users')
              .reply(400, {
                errors: [
                  {
                    id: 'Existing_email',
                    message: 'Not important message',
                  }
                ]
              });

            res = await request.post(basePath)
              .send(eventData)
              .set('authorization', access.token);
          });
          
          it('[89BC] Should return a 400 error', async () => {
            assert.equal(res.status, 400);
          });
          it('[89BC] Should return the correct error', async () => {
            assert.equal(res.body.error.data.length, 1);
            assert.equal(res.body.error.data[0].code, ErrorIds['Existing_email']);
            assert.equal(res.body.error.data[0].message, ErrorMessages[ErrorIds['Existing_email']]);
          });
        });
        describe('[6B8D] When creating an event that is already taken only on core', async () => {
          let serviceRegisterRequest;

          before(async function () {
            await createUser();
            eventData = {
              streamIds: ['email'],
              content: charlatan.Lorem.characters(7),
              type: 'string/pryv'
            };

            const settings = _.cloneDeep(helpers.dependencies.settings);
            nock.cleanAll();
            nock(settings.services.register.url).put('/users',
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

          it('[2021] Should return a 400 error', async () => {
            assert.equal(res.status, 400);
          });
          it('[121E] Should return the correct error', async () => {
            assert.equal(res.body.error.data.length, 1);
            assert.equal(res.body.error.data[0].code, ErrorIds['Existing_email']);
            assert.equal(res.body.error.data[0].message, ErrorMessages[ErrorIds['Existing_email']]);
          });
        });
        describe('When event belongs to the indexed account stream', async () => {
          describe('[6070] When creating an event that is valid', async () => {

            before(async function () {
              await createUser();
              eventData = {
                streamIds: ['language'],
                content: charlatan.Lorem.characters(7),
                type: 'string/pryv'
              };

              const settings = _.cloneDeep(helpers.dependencies.settings);
              nock.cleanAll();
              scope = nock(settings.services.register.url)
              scope.put('/users',
                (body) => {
                  serviceRegisterRequest = body;
                  return true;
                }).reply(200, { errors: [] });

              res = await request.post(basePath)
                .send(eventData)
                .set('authorization', access.token);
            });

            it('[8C80] Should return 201', async () => {
              assert.equal(res.status, 201);
            });
            it('[67F7] Should return the created event', async () => {
              assert.equal(res.body.event.content, eventData.content);
              assert.equal(res.body.event.type, eventData.type);
              assert.deepEqual(res.body.event.streamIds, ['language', SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
            });
            it('[467D] New event gets streamId ‘active’ and ‘active’ stream property is removed from all other events from the same stream', async () => {
              const allEvents = await bluebird.fromCallback(
                (cb) => user.db.events.find({ id: user.attrs.id }, { streamIds: 'language' }, null, cb));
              assert.equal(allEvents[0].streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE), true);
              assert.equal(allEvents[0].streamIds.includes('language'), true);
              assert.equal(allEvents[1].streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE), false);
              assert.equal(allEvents[1].streamIds.includes('language'), true);
            });
            it('[199D] New event data is sent to service-register', async () => {
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
        });
      });
    });


    describe('[TY63] When creating indexed stream with contribute access token', async () => {
      let sharedAccess;
      let initialEvent;
      let user2;
      let streamId = 'email';
      before(async function () {
        user2 = await createUser();
        sharedAccess = await user.access({
          token: cuid(),
          type: 'shared',
          permissions: [{
            streamId: streamId,
            level: 'contribute'
          }],
          clientData: 'This is a consent'
        });

        const settings = _.cloneDeep(helpers.dependencies.settings);
        nock.cleanAll();
        scope = nock(settings.services.register.url)
        scope.put('/users',
          (body) => {
            serviceRegisterRequest = body;
            return true;
          }).reply(200, { errors: [] });
        
        eventData = {
          streamIds: [streamId],
          content: charlatan.Lorem.characters(7),
          type: 'string/pryv'
        };

        res = await request.post(basePath)
          .send(eventData)
          .set('authorization', sharedAccess.attrs.token);
      });

      it('Should return 201', async () => {
        assert.equal(res.status, 201);
      });
      it('[764A] Should return the updated event', async () => {
        assert.equal(res.body.event.createdBy, sharedAccess.attrs.id);
        assert.deepEqual(res.body.event.streamIds, [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE, 'unique']);
      });
      it('[765A] Should send a request to service-register to update the indexed field', async () => {
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
  });

  describe('PUT /events/<id>', async () => {
    describe('[D1FD] When updating non editable streams', async () => {
      before(async function () {
        await createUser();
        eventData = {
          content: charlatan.Lorem.characters(7),
          type: 'string/pryv'
        };
        const initialEvent = await bluebird.fromCallback(
          (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: 'username' }, null, cb));

        res = await request.put(path.join(basePath, initialEvent.id))
          .send(eventData)
          .set('authorization', access.token);
      });
      it('[034D] Should return a 400 error', async () => {
        assert.equal(res.status, 400);
      });
      it('[BB5F] Should return the correct error', async () => {
        assert.equal(res.body.error.data[0].code, ErrorIds.DeniedEventModification);
        assert.equal(res.body.error.data[0].message, ErrorMessages[ErrorIds.DeniedEventModification]);
      });
    });

    describe('When updating editable streams', async () => {

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

      describe('[RT59] Editing not indexed, not unique event with valid data', async () => {
        before(async function () {
          await createUser();
          eventData = {
            content: charlatan.Lorem.characters(7),
            type: 'string/pryv'
          };
          const initialEvent = await bluebird.fromCallback(
            (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: 'phoneNumber' }, null, cb));

          res = await request.put(path.join(basePath, initialEvent.id))
            .send(eventData)
            .set('authorization', access.token);
        });
        it('[2FA2] Should return 200', async () => {
          assert.equal(res.status, 200);
        });
        it('[763A] Should return the updated event', async () => {
          assert.equal(res.body.event.content, eventData.content);
          assert.equal(res.body.event.type, eventData.type);
          assert.deepEqual(res.body.event.streamIds, ['phoneNumber', SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
        });
      });

      describe('When updating streams streamId', async () => {
        let scope;
        let serviceRegisterRequest;
        describe('[BAE1] When adding the “active” streamId for not indexed, not unique event', async () => {
          before(async function () {
            await createUser();
            let streamId = 'phoneNumber';
            res = await createAdditionalEventAndupdateMainOne(streamId);
          });
          it('[562A] Should return a 200', async () => {
            assert.equal(res.status, 200);
          });
          it('[5622] Should return the updated event', async () => {
             assert.equal(res.body.event.content, eventData.content);
             assert.equal(res.body.event.type, eventData.type);
            assert.deepEqual(res.body.event.streamIds, ['phoneNumber', SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
          });
          it('[CF70] events of the same streams should be stripped from “active” streamId.', async () => {
            const allEvents = await bluebird.fromCallback(
              (cb) => user.db.events.find({ id: user.attrs.id }, { streamIds: 'phoneNumber' }, null, cb));
            assert.equal(allEvents.length, 2);
            // check the order
            assert.deepEqual(allEvents[1].id, res.body.event.id);
            // verify streamIds
            assert.deepEqual(allEvents[0].streamIds, ['phoneNumber']);
            assert.deepEqual(allEvents[1].streamIds, ['phoneNumber', SystemStreamsSerializer.options.STREAM_ID_ACTIVE]);
          });
        });
        describe('[6AAD] When adding the “active” streamId for a unique stream', async () => {
          before(async function () {
            await createUser();
            let streamId = 'email';
            const settings = _.cloneDeep(helpers.dependencies.settings);
            nock.cleanAll();
            scope = nock(settings.services.register.url)
            scope.put('/users',
              (body) => {
                serviceRegisterRequest = body;
                return true;
              }).times(2).reply(200, { errors: [] });
            res = await createAdditionalEventAndupdateMainOne(streamId);
          });

          it('[6AAT] Should send a request to service-register to update its user main information', async () => {
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
        describe('[CE66] When adding the “active” streamId for a indexed stream', async () => {
          before(async function () {
            await createUser();
            let streamId = 'language';
            const settings = _.cloneDeep(helpers.dependencies.settings);
            nock.cleanAll();
            scope = nock(settings.services.register.url)
            scope.put('/users',
              (body) => {
                serviceRegisterRequest = body;
                return true;
              }).times(2).reply(200, { errors: [] });
            res = await createAdditionalEventAndupdateMainOne(streamId);
          });
          it('[0D18] Should send a request to service-register to update its user main information', async () => {
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
        describe('When trying to add second core steamId to the event that has a account stream Id', async () => {
          describe('[EEE9] When editing with 2 streamIds at the time', async () => {
            before(async function () {
              await createUser();
              eventData = {
                streamIds: ['email', 'phoneNumber'],
                content: charlatan.Lorem.characters(7),
                type: 'string/pryv'
              };
              const initialEvent = await bluebird.fromCallback(
                (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: 'phoneNumber' }, null, cb));

              res = await request.put(path.join(basePath, initialEvent.id))
                .send(eventData)
                .set('authorization', access.token);
            });
            it('[9004] Should return a 400 error', async () => {
              assert.equal(res.status, 400);
            });
            it('[E3AE] Should return the correct error', async () => {
              assert.equal(res.body.error.data[0].code, ErrorIds.DeniedMultipleAccountStreams);
              assert.equal(res.body.error.data[0].message, ErrorMessages[ErrorIds.DeniedMultipleAccountStreams]);
            });
          });
          describe('[EEV9] When changing account stream with another core steram', async () => {
            before(async function () {
              await createUser();
              eventData = {
                streamIds: ['email'],
                content: charlatan.Lorem.characters(7),
                type: 'string/pryv'
              };
              const initialEvent = await bluebird.fromCallback(
                (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: 'phoneNumber' }, null, cb));

              res = await request.put(path.join(basePath, initialEvent.id))
                .send(eventData)
                .set('authorization', access.token);
            });
            it('[9004] Should return a 400 error', async () => {
              assert.equal(res.status, 400);
            });
            it('[E3AE] Should return the correct error', async () => {
              assert.equal(res.body.error.data[0].code, ErrorIds.DeniedMultipleAccountStreams);
              assert.equal(res.body.error.data[0].message, ErrorMessages[ErrorIds.DeniedMultipleAccountStreams]);
            });
          });
        });
      });
      describe('When updating an unique field that is already taken', async () => {
        describe('[1127] When the field is not unique in service register', async () => {
          before(async function () {
            const streamId = 'email';
            await createUser();
            eventData = {
              streamIds: [streamId],
              content: charlatan.Lorem.characters(7),
              type: 'string/pryv'
            };
            const settings = _.cloneDeep(helpers.dependencies.settings);
            nock.cleanAll();
            scope = nock(settings.services.register.url)
            scope.put('/users',
              (body) => {
                serviceRegisterRequest = body;
                return true;
              }).reply(400, { errors: [{ id: `Existing_${streamId}`}] });
            const initialEvent = await bluebird.fromCallback(
              (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));

            res = await request.put(path.join(basePath, initialEvent.id))
              .send(eventData)
              .set('authorization', access.token);
          });
          it('[5A04] Should send a request to service-register to update the unique field', async () => {
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
          it('[F8A8] Should return a 400 as it is already taken in service-register', async () => {
            assert.equal(res.status, 400);
            assert.equal(res.body.error.data[0].code, ErrorIds['Existing_email']);
            assert.equal(res.body.error.data[0].message, ErrorMessages[ErrorIds['Existing_email']]);
          });
        });
        describe('[0FDB] When the field is not unique in mongodb', async () => {
          before(async function () {
            const streamId = 'email';
            const user1 = await createUser();
            const user2 = await createUser();
            eventData = {
              streamIds: [streamId],
              content: user1.attrs.email,
              type: 'string/pryv'
            };
            const settings = _.cloneDeep(helpers.dependencies.settings);
            nock.cleanAll();
            scope = nock(settings.services.register.url)
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
          it('[5782] Should return a 400 error', async () => {
            assert.equal(res.status, 400);
          });
          it('[B285] Should return the correct error', async () => {
            assert.equal(res.body.error.data[0].code, ErrorIds['Existing_email']);
            assert.equal(res.body.error.data[0].message, ErrorMessages[ErrorIds['Existing_email']]);
          });
        });
      });
      describe('[290B] When updating a unique field that is valid', async () => {
        const streamId = 'email';
        before(async function () {
          await createUser();
          //await nock.cleanAll();
          const settings = _.cloneDeep(helpers.dependencies.settings);
          scope = nock(settings.services.register.url)
          scope.put('/users',
            (body) => {
              serviceRegisterRequest = body;
              return true;
            }).reply(200, { errors: [] });
          await editEvent(streamId);
        });
        it('Should send a request to service-register to update the unique field', async () => {
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
        it('[4BB1] Should return a 200', async () => {
          assert.equal(res.status, 200);
        });
        it('[C457] Should save an additional field to enforce uniqueness in mongodb', async () => {
          const updatedEvent = await bluebird.fromCallback(
            (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));
          assert.equal(updatedEvent.content, eventData.content);
          assert.equal(updatedEvent.type, eventData.type);
          assert.equal(updatedEvent.hasOwnProperty(`${streamId}__unique`), true);  
        });
      });
      describe('When updating an indexed field that is valid', async () => {
        describe('[ED88] When service-register working as expected', async () => {
          const streamId = 'language';
          before(async function () {
            await createUser();
            nock.cleanAll();
            const settings = _.cloneDeep(helpers.dependencies.settings);
            scope = nock(settings.services.register.url)
            scope.put('/users',
              (body) => {
                serviceRegisterRequest = body;
                return true;
              }).reply(200, { errors: [] });
            await editEvent(streamId);
          });
          it('Should send a request to service-register to update the indexed field', async () => {
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
          it('Should return a 200', async () => {
            assert.equal(res.status, 200);
          });
        });
        describe('[B23F] When service-register is out', async () => {
          const streamId = 'language';
          before(async function () {
            await createUser();
            nock.cleanAll();
            const settings = _.cloneDeep(helpers.dependencies.settings);
            scope = nock(settings.services.register.url)
            scope.put('/users',
              (body) => {
                serviceRegisterRequest = body;
                return true;
              }).replyWithError({
                message: 'something awful happened',
                code: '500',
              });
            await editEvent(streamId);
          });
          it('[645C] Should send a request to service-register to update the indexed field', async () => {
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
          it('[AA92] Should return a 500', async () => {
            assert.equal(res.status, 500);
          });
        });
      });
    });
  });

  describe('DELETE /events/<id>', async () => {
    describe('[E7EB] When deleting editable default streams event', async () => {
      describe('[04CB] Event has no ‘active’ streamId', async () => {
        describe('[D94D] Event belongs to the unique stream', async () => { 
          let streamId = 'email';
          let initialEvent;
          before(async function () {
            const settings = _.cloneDeep(helpers.dependencies.settings);
            nock.cleanAll();
            scope = nock(settings.services.register.url)
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
          it('[43B1] Should return a 200', async () => { 
            assert.equal(res.status, 200);
          });
          it('[3E12] Should return a deleted event', async () => {
            assert.equal(res.body.event.id, initialEvent.id);
            assert.equal(res.body.event.trashed, true);
           });
          it('Event should not have property that enforces uniqueness anymore', async () => { 
            //TODO IEVA - should I implement real deletion
            assert.notEqual(res.body.event[`${streamId}__unique`], initialEvent[`${streamId}__unique`]);
          });
          it('[F328] Deleted event data is sent to service-register', async () => { 
            assert.equal(scope.isDone(), true);
            assert.deepEqual(serviceRegisterRequest, {
              user: {
                username: user.attrs.username,
              },
              fieldsToDelete: { [streamId]: initialEvent.content}
            });
          });
        });
        describe('[C84A] Event belongs to the indexed stream', async () => { 
          let streamId = 'language';
          let initialEvent;
          before(async function () {
            const settings = _.cloneDeep(helpers.dependencies.settings);
            nock.cleanAll();
            scope = nock(settings.services.register.url)
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
          it('[1B70] Should return a 200', async () => { 
            assert.equal(res.status, 200);
          });
          it('[CBB9] Should return a deleted event', async () => { 
            assert.equal(res.body.event.id, initialEvent.id);
            assert.equal(res.body.event.trashed, true);
          });
        });
      });
      describe('[B7A2] Event has ‘active’ streamId', async () => {
        let streamId = 'language';
        let initialEvent;
        before(async function () {
          await createUser();
          initialEvent = await bluebird.fromCallback(
            (cb) => user.db.events.findOne({ id: user.attrs.id }, { streamIds: streamId }, null, cb));
          res = await request.delete(path.join(basePath, initialEvent.id))
            .set('authorization', access.token);
        });
        it('[10EC] Should return a 400', async () => { 
          assert.equal(res.status, 400);
        });
        it('[D4CA] Should return the correct error', async () => { 
          assert.equal(res.body.error.id, ErrorIds.DeniedEventModification);
        });
      });
    });
    describe('[CDD1] When deleting not editable default streams event', async () => {
      let streamId = 'username';
      let initialEvent;
      before(async function () {
        const settings = _.cloneDeep(helpers.dependencies.settings);
        nock.cleanAll();
        scope = nock(settings.services.register.url)
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
      it('[8EDB] Should return a 400', async () => { 
        assert.equal(res.status, 400);
      });
      it('[A727] Should return the correct error', async () => {
        assert.equal(res.body.error.id, ErrorIds.DeniedEventModification);
      });
    });
  });
});