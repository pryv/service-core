/*global describe, before, beforeEach, it */

require('./test-helpers');

const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const async = require('async');
const validation = helpers.validation;
const ErrorIds = require('components/errors').ErrorIds;
const methodsSchema = require('../src/schema/eventsMethods');
const should = require('should'); // explicit require to benefit from static function
const storage = helpers.dependencies.storage.user.events;
const testData = helpers.data;
const timestamp = require('unix-timestamp');
const _ = require('lodash');
const url = require('url');


const cuid = require('cuid');
const chai = require('chai');
const assert = chai.assert;
const charlatan = require('charlatan');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

require('date-utils');

describe('[MXEV] events.streamIds', function () {

  describe('events', function () { 
    let server;
    before(async () => {
      server = await context.spawn();
    });
    after(() => {
      server.stop();
    });

    let mongoFixtures;
    before(async function () {
      mongoFixtures = databaseFixture(await produceMongoConnection());
    });

    let user,
      username,
      streamAId,
      streamBId,
      eventIdA,
      eventIdAB,
      trashedEventIdAB,
      eventA,
      eventAB,
      tokenReadA,
      tokenContributeA,
      tokenContributeAB,
      manageABAccessToken,
      basePathEvent,
      basePathStream;

    beforeEach(async function () {
      username = cuid();
      streamAId = 'streamA';
      streamBId = 'streamB';
      eventIdA = cuid();
      eventIdAB = cuid();
      trashedEventIdAB = cuid();
      tokenReadA = cuid();
      tokenContributeA = cuid();
      tokenContributeAB = cuid();
      basePathEvent = `/${username}/events/`;

      user = await mongoFixtures.user(username, {});
      await user.stream({
        id: streamAId,
        name: 'streamA'
      });
      await user.stream({
        id: streamBId,
        name: 'streamB'
      });
      await user.access({
        type: 'app',
        token: tokenReadA,
        permissions: [
          {
            streamId: 'streamA',
            level: 'read'
          }
        ]
      });
      await user.access({
        type: 'app',
        token: tokenContributeA,
        permissions: [
          {
            streamId: 'streamA',
            level: 'contribute'
          }
        ]
      });
      await user.access({
        type: 'app',
        token: tokenContributeAB,
        permissions: [
          {
            streamId: 'streamA',
            level: 'contribute'
          },
          {
            streamId: 'streamB',
            level: 'contribute'
          },
        ]
      });
      eventA = await user.event({
        type: 'note/txt',
        content: 'In A',
        id: eventIdA,
        streamIds: [streamAId],
      });
      eventA = eventA.attrs;
      eventAB = await user.event({
        type: 'note/txt',
        content: 'In A and B',
        id: eventIdAB,
        streamIds: [streamAId, streamBId]
      });
      eventAB = eventAB.attrs;
      trashedEventAB = await user.event({
        type: 'note/txt',
        content: 'In A and B',
        id: trashedEventIdAB,
        streamIds: [streamAId, streamBId],
        trashed: true,
      });
    });
    afterEach(() => {
      mongoFixtures.clean();
    });

    function eventPath(eventId) {
      return url.resolve(basePathEvent, eventId);
    }

    describe('GET /events', function () {

      it('[WJ0S] must return streamIds & streamId containing the first one (if many)', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenContributeA)
        const events = res.body.events;
        events.forEach(e => {
          assert.exists(e.streamId);
          assert.exists(e.streamIds);
        });
      });

      it('[WLL9] must return only the streamIds you have a read access to', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenReadA)
        const events = res.body.events;
        events.forEach(e => {
          assert.equal(e.streamId, streamAId);
          assert.deepEqual(e.streamIds, [streamAId]);
        });
      });

    });

    

    describe('POST /events', function() { 

      it('[X4PX] must not be able to provide both streamId and streamIds', async function () {
        const res = await server.request()
          .post(basePathEvent)
          .set('Authorization', tokenContributeA)
          .send({
            streamId: streamAId,
            streamIds: [streamAId, streamBId],
            type: 'count/generic',
            content: 12,
          });
        assert.equal(res.status, 400);
        // TODO must check error message
      })

      describe('when using "streamId"', async function () {
        it('[1YUV] must return streamIds & streamId', async function () {
          const res = await server.request()
          .post(basePathEvent)
          .set('Authorization', tokenContributeA)
          .send({
            streamId: streamAId,
            type: 'count/generic',
            content: 12,
          });
        assert.equal(res.status, 201);
        const event = res.body.event;
        assert.equal(event.streamId, streamAId);
        assert.deepEqual(event.streamIds, [streamAId]);
        })
      });

      describe('when using "streamIds"', async function () {
        it('[VXMG] must return streamIds & streamId containing the first one', async function () {
          const res = await server.request()
          .post(basePathEvent)
          .set('Authorization', tokenContributeAB)
          .send({
            streamIds: [streamAId, streamBId],
            type: 'count/generic',
            content: 12,
          });
        assert.equal(res.status, 201);
        const event = res.body.event;
        assert.equal(event.streamId, streamAId);
        assert.deepEqual(event.streamIds, [streamAId, streamBId]);
        });

        it('[2QZF] must clean duplicate streamIds', async function () {
          const res = await server.request()
            .post(basePathEvent)
            .set('Authorization', tokenContributeAB)
            .send({
              streamIds: [streamAId, streamBId, streamBId],
              type: 'count/generic',
              content: 12,
            });
          assert.equal(res.status, 201);
          const event = res.body.event;
          assert.deepEqual(event.streamIds, [streamAId, streamBId]);
        });

        it('[NY0E] must forbid providing an unknown streamId', async function () {
          const unknownStreamId = 'does-not-exist';
          const res = await server.request()
            .post(basePathEvent)
            .set('Authorization', tokenContributeA)
            .send({
              streamIds: [unknownStreamId],
              type: 'count/generic',
              content: 12,
            });
          assert.equal(res.status, 400);
          const err = res.body.error;
          assert.equal(err.id, ErrorIds.UnknownReferencedResource)
          assert.deepEqual(err.data, { streamIds: [unknownStreamId] });
        });

        it('[6Z2D] must forbid creating an event in multiple streams, if a contribute permission is missing on at least one stream', async function () {
          const res = await server.request()
            .post(basePathEvent)
            .set('Authorization', tokenContributeA)
            .send({
              streamIds: [streamAId, streamBId],
              type: 'count/generic',
              content: 12,
            });
          assert.equal(res.status, 403);
          const err = res.body.error;
          assert.equal(err.id, ErrorIds.Forbidden);
        });
      });
    });

    describe('PUT /events', function() { 
      
      it('[BBBX] must return streamIds & streamId containing the first one (if many)', async function () {
        const res = await server.request()
          .put(eventPath(eventIdA))
          .set('Authorization', tokenContributeA)
          .send({
            content: 'Now I am updated, still in A though.',
          });
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.streamId, eventA.streamIds[0]);
        assert.deepEqual(event.streamIds, eventA.streamIds);
      });

      it('[42KZ] must allow modification, if you have a contribute permission on at least 1 streamId', async function () {
        const res = await server.request()
          .put(eventPath(eventIdAB))
          .set('Authorization', tokenContributeA)
          .send({
            content: 'Now I am updated, still in AB though.',
          });
        assert.equal(res.status, 200);
      });

      it('[2OBZ] must return only the streamIds you have a read access to', async function () {
        const res = await server.request()
          .put(eventPath(eventIdAB))
          .set('Authorization', tokenContributeA)
          .send({
            content: 'Now I am updated, still in AB though.',
          });
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.streamId, streamAId);
        assert.deepEqual(event.streamIds, [streamAId]);
      });

      it('[Q5P7] must forbid to provide both streamId and streamIds', async function () {
        const res = await server.request()
          .put(eventPath(eventIdA))
          .set('Authorization', tokenContributeA)
          .send({
            streamId: streamBId,
            streamIds: [streamBId],
          });
        assert.equal(res.status, 400);
        // TODO must check error message
      });

      describe('when modifying streamIds', function() { 

        it('[TQHG] must forbid providing an unknown streamId', async function () {
          const unknownStreamId = 'does-not-exist';
          const res = await server.request()
            .put(eventPath(eventIdA))
            .set('Authorization', tokenContributeA)
            .send({
              streamIds: [unknownStreamId],
            });
          assert.equal(res.status, 400);
          const err = res.body.error;
          assert.equal(err.id, ErrorIds.UnknownReferencedResource)
          assert.deepEqual(err.data, { streamIds: [unknownStreamId] });
        });
  
        it('[6Q8B] must allow streamId addition, if you have a contribute permission for it', async function () {
          const res = await server.request()
            .put(eventPath(eventIdA))
            .set('Authorization', tokenContributeAB)
            .send({
              streamIds: [streamAId, streamBId],
            });
          assert.equal(res.status, 200);
          const event = res.body.event;
          assert.equal(event.streamId, streamAId);
          assert.deepEqual(event.streamIds, [streamAId, streamBId]);
        });
        
        it('[MFF7] must forbid streamId addition, if you don\'t have a contribute permission for it', async function () {
          const res = await server.request()
            .put(eventPath(eventIdA))
            .set('Authorization', tokenContributeA)
            .send({
              streamIds: [streamAId, streamBId],
            });
          assert.equal(res.status, 400);
          const err = res.body.error;
        });
  
        it('[83N6] must allow streamId deletion, if you have a contribute permission for it', async function () {
          const res = await server.request()
            .put(eventPath(eventIdAB))
            .set('Authorization', tokenContributeAB)
            .send({
              streamIds: [streamAId],
            });
          assert.equal(res.status, 200);
          const event = res.body.event;
          assert.deepEqual(event.streamIds, [streamAId]);
        });
        
        it('[JLS5] must forbid streamId deletion, if you don\'t have contribute permission for it', async function () {
          const res = await server.request()
            .put(eventPath(eventIdAB))
            .set('Authorization', tokenContributeA)
            .send({
              streamIds: [streamAId],
            });
          assert.equal(res.status, 400);
          const error = res.body.error;
        });
      });

    });

    describe('POST /event/start', function () {

      function path(eventId) {
        return url.resolve(basePathEvent, 'start');
      }

      it('[FOM3] must return a 410 (Gone)', async function () {
        const res = await server.request()
          .post(path())
          .set('Authorization', tokenContributeA)
          .send({
            streamIds: [streamAId],
            type: 'activity/plain'
          });
        assert.equal(res.status, 410);
        const error = res.body.error;
        // TODO: assert error id and message
      });
      
    });
    
    describe('POST /event/stop', function () {

      function path(eventId) {
        return url.resolve(basePathEvent, 'stop');
      }

      it('[BR33] must return a 410 (Gone)', async function () {
        const res = await server.request()
          .post(path())
          .set('Authorization', tokenContributeA)
          .send({
            streamId: streamAId,
            type: 'activity/plain',
          });
        assert.equal(res.status, 410);
        const error = res.body.error;
        // TODO: assert error id and message
      });
      
    });

    describe('DELETE /events', function () {

      function eventPath(eventId) {
        return url.resolve(basePathEvent, eventId);
      }

      it('[BPL0] must return streamIds & streamId containing the first one (if many)', async function () {
        const res = await server.request()
          .delete(eventPath(eventIdAB))
          .set('Authorization', tokenContributeAB)
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.streamId, streamAId);
        assert.deepEqual(event.streamIds, [streamAId, streamBId]);
      });

      it('[SQJQ] must return only the streamIds you have a read access to', async function () {
        const res = await server.request()
          .delete(eventPath(eventIdAB))
          .set('Authorization', tokenContributeA)
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.streamId, streamAId);
        assert.deepEqual(event.streamIds, [streamAId]);
      });

      it('[T5ZY] must allow trashing, if you have a contribute permission on at least 1 streamId', async function () {
        const res = await server.request()
          .delete(eventPath(eventIdAB))
          .set('Authorization', tokenContributeA)
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.trashed, true);
      });

      it('[2G32] must allow deletion, if you have a contribute permission on at least 1 streamId', async function () {
        const res = await server.request()
          .delete(eventPath(trashedEventIdAB))
          .set('Authorization', tokenContributeA)
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.trashed, true);
      });

    });

  });

  describe('streams', function () {
    let server;
    before(async () => {
      server = await context.spawn();
    });
    after(() => {
      server.stop();
    });

    let mongoFixtures;
    before(async function () {
      mongoFixtures = databaseFixture(await produceMongoConnection());
    });

    let user,
      username,
      streamAId,
      streamBId,
      streamA_AId,
      eventIdA_AandB,
      eventIdAandA_A,
      eventIdA_AandA_A_A,
      manageAccessToken,
      basePathEvent,
      basePathStream;

    beforeEach(async function () {
      username = cuid();
      streamAId = 'streamAId';
      streamBId = 'streamBId';
      streamA_AId = 'streamA_AId';
      streamA_A_AId = 'streamA_A_AId';
      eventIdAandA_A = cuid();
      eventIdA_AandB = cuid();
      eventIdA_AandA_A_A = cuid();
      manageAccessToken = cuid();
      basePathStream = `/${username}/streams/`;
      basePathEvent = `/${username}/events/`;

      user = await mongoFixtures.user(username, {});
      await user.stream({
        id: streamAId,
        name: 'streamA'
      });
      await user.stream({
        id: streamBId,
        name: 'streamB'
      });
      await user.stream({
        parentId: streamAId,
        id: streamA_AId,
        name: 'stream son of A'
      });
      await user.stream({
        parentId: streamA_AId,
        id: streamA_A_AId,
        name: 'stream son of son of A'
      });
      await user.access({
        type: 'app',
        token: manageAccessToken,
        permissions: [
          {
            streamId: '*',
            level: 'manage'
          }
        ]
      });
      await user.event({
        type: 'note/txt',
        time: (Date.now() / 1000) -2,
        content: 'In B and Son of A',
        id: eventIdA_AandB,
        streamIds: [streamBId, streamA_AId]
      });
      await user.event({
        type: 'note/txt',
        time: (Date.now() / 1000) -1,
        content: 'In A and Son of A',
        id: eventIdAandA_A,
        streamIds: [streamAId, streamA_AId]
      });
      await user.event({
        type: 'note/txt',
        time: (Date.now() / 1000),
        content: 'In Son of A and Son of Son of A',
        id: eventIdA_AandA_A_A,
        streamIds: [streamA_AId, streamA_A_AId]
      });
    });
    afterEach(() => {
      mongoFixtures.clean();
    });

    /**
     * Stream structure
     A          B
      \
       AA
        \
         AAA
     */

    function pathStreamId(streamId) {
      return url.resolve(basePathStream, streamId);
    }
    function pathEventId(eventId) {
      return url.resolve(basePathEvent, eventId);
    }

    describe('POST /streams', function () {

      it('[EGW2] must forbid setting the "singleActivity" field', async function () {
        const res = await server.request()
          .post(basePathStream)
          .set('Authorization', manageAccessToken)
          .send({
            name: 'something',
            singleActivity: true,
          });
        assert.equal(res.status, 400)
      });
    });

    describe('PUT /streams', function () {

      it('[EY79] must forbid setting the "singleActivity" field', async function () {
        const res = await server.request()
          .put(pathStreamId(streamAId))
          .set('Authorization', manageAccessToken)
          .send({
            singleActivity: true,
          });
        assert.equal(res.status, 400)
      });
    });

    describe('DELETE /streams', function () {

      describe('When the stream\'s event is part of at least another stream outside of its descendants', function () {
      
        describe('when mergeEventsWithParent=false', function () {

          it('[TWDG] must not delete events, but remove the deleted streamId from their streamIds', async function () {
            for (let i = 0; i < 2; i++) {
              await server.request()
                .delete(pathStreamId(streamBId))
                .set('Authorization', manageAccessToken)
                .query({ mergeEventsWithParent: false });
            }
      
            const res = await server.request()
              .get(pathEventId(eventIdA_AandB))
              .set('Authorization', manageAccessToken);
            const event = res.body.event;
            assert.deepEqual(event.streamIds, [streamA_AId]);
          });
        });

      });

      describe('When the event is part of the stream and its children', function () {

        describe('when mergeEventsWithParent=false', function () {

          it('[6SBU] must delete the events', async function () {
            for (let i = 0; i < 2; i++) {
              await server.request()
                .delete(pathStreamId(streamAId))
                .set('Authorization', manageAccessToken)
                .query({ mergeEventsWithParent: false });
            }
      
            const res = await server.request()
              .get(basePathEvent)
              .set('Authorization', manageAccessToken)
              .query({ includeDeletions: true, modifiedSince: 0 });
            const events = res.body.events;
            const deletions = res.body.eventDeletions;
            assert.exists(deletions, 'deleted events are not found');
            let foundAandA_A = false;
            let foundA_AandA_A_A = false;
            deletions.forEach(d => {
              if (d.id === eventIdAandA_A) foundAandA_A = true;
              if (d.id === eventIdA_AandA_A_A) foundA_AandA_A_A = true;
            })
            assert.isTrue(foundAandA_A);
            assert.isTrue(foundA_AandA_A_A);
          });

        });

        describe('when mergeEventsWithParent=true', function () {

          it('[2FRR] must not delete events, but remove all streamIds and add its parentId', async function () {
            for (let i = 0; i < 2; i++) {
              await server.request()
                .delete(basePathStream + streamA_AId)
                .set('Authorization', manageAccessToken)
                .query({ mergeEventsWithParent: true });
            }
      
            const res = await server.request()
              .get(basePathEvent)
              .set('Authorization', manageAccessToken);
            const events = res.body.events;
            assert.equal(events.length, 3);
            
            let foundAandA_A = false;
            let foundA_AandA_A_A = false;
            let foundA_AandB = false;
            events.forEach(e => {
              if (e.id === eventIdAandA_A) {
                foundAandA_A = true;
                assert.deepEqual(e.streamIds, [streamAId]);
              }
              if (e.id === eventIdA_AandA_A_A) {
                foundA_AandA_A_A = true;
                assert.deepEqual(e.streamIds, [streamAId]);
              }
              if (e.id === eventIdA_AandB) {
                foundA_AandB = true;
                assert.deepEqual(e.streamIds, [streamBId, streamAId]);
              }
            });
            assert.isTrue(foundAandA_A);
            assert.isTrue(foundA_AandA_A_A);
            assert.isTrue(foundA_AandB);
          });

        });
      });
      
    });
  });
});
