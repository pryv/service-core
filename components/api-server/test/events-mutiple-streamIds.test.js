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

describe('[MXEV] events muliple streamIds', function () {


  describe('events actions', function () {

    var user = testData.users[0],
      basePath = '/' + user.username + '/events',
      testType = 'test/test',
      // these must be set after server instance started
      request = null,
      requestA1 = null,
      access = null,
      filesReadTokenSecret = helpers.dependencies.settings.auth.filesReadTokenSecret;

    function path(id, base) {
      return (base || basePath) + '/' + id;
    }


    before(function (done) {
      async.series([
        testData.resetUsers,
        testData.resetAccesses,
        testData.resetStreams,
        server.ensureStarted.bind(server, helpers.dependencies.settings),
        function (stepDone) {
          requestA1 = helpers.request(server.url);
          requestA1.token = testData.accesses[1].token;
          request = helpers.request(server.url);
          request.login(user, stepDone);
        },
        function (stepDone) {
          helpers.dependencies.storage.user.accesses.findOne(user, { token: request.token },
            null, function (err, acc) {
              access = acc;
              stepDone();
            });
        }
      ], done);
    });

    describe('PUT event/<id>', function () {

      beforeEach(resetEvents);

    });

    describe('DELETE event/<id>', function () {

      beforeEach(resetEvents);

      it('[XT5U] must flag the multiple stream event as trashed, when write access on all streams', function (done) {
        var data = {
          time: timestamp.fromDate('2012-03-22T10:00'),
          duration: timestamp.duration('55m'),
          type: 'temperature/celsius',
          content: 36.7,
          streamIds: [testData.streams[7].id, testData.streams[1].id],
        };

        let event = null;
        async.series([
          function addNewEvent(stepDone) {
            request.post(basePath).send(data).end(function (res) {
              should.exist(res.body.event);
              event = res.body.event;
              stepDone();
            });
          },
          function delEvent(stepDone) {
            request.del(path(event.id)).end(function (res) {
              time = timestamp.now();
              validation.check(res, {
                status: 200,
                schema: methodsSchema.del.result
              });

              var trashedEvent = res.body.event;
              trashedEvent.trashed.should.eql(true);
              stepDone();
            });
          }
        ], done);
      });

      it('[AU5U] must forbid deletion of trashed event, when no write access on all streams', function (done) {
        var data = {
          time: timestamp.fromDate('2012-03-22T10:00'),
          duration: timestamp.duration('55m'),
          type: 'temperature/celsius',
          content: 36.7,
          streamIds: [testData.streams[7].id, testData.streams[1].id],
        };

        let event = null;
        async.series([
          function addNewEvent(stepDone) {
            request.post(basePath).send(data).end(function (res) {
              should.exist(res.body.event);
              event = res.body.event;
              stepDone();
            });
          },
          function delEvent(stepDone) {
            requestA1.del(path(event.id)).end(function (res) {
              validation.checkError(res, {
                status: 403,
                id: ErrorIds.Forbidden
              }, stepDone);
            });
          }
        ], done);
      });

    });

  });


  describe('event tests with fixtures', function () { 
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

      it('must return streamIds & streamId containing the first one (if many)', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenContributeA)
        const events = res.body.events;
        events.forEach(e => {
          assert.exists(e.streamId);
          assert.exists(e.streamIds);
        });
      });

      it('must return only the streamIds you have a read access to', async function () {
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

      it('must not be able to provide both streamId and streamIds', async function () {
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
        it('must return streamIds & streamId', async function () {
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
        it('[1GR9] must return streamIds & streamId containing the first one', async function () {
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

        it('[1GZ9] must clean duplicate streamIds', async function () {
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

        it('[5NEZ] must forbid providing an unknown streamId', async function () {
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

        it('[1G19] must forbid creating an event in multiple streams, if a contribute permission is missing on at least one stream', async function () {
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
      
      it('must return streamIds & streamId containing the first one (if many)', async function () {
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

      it('[4QRZ] must allow modification, if you have a contribute permission on at least 1 streamId', async function () {
        const res = await server.request()
          .put(eventPath(eventIdAB))
          .set('Authorization', tokenContributeA)
          .send({
            content: 'Now I am updated, still in AB though.',
          });
        assert.equal(res.status, 200);
      });

      it('must return only the streamIds you have a read access to', async function () {
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

      it('must forbid to provide both streamId and streamIds', async function () {
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

        it('[01BZ] must forbid providing an unknown streamId', async function () {
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
  
        it('[4QRX] must allow streamId addition, if you have a contribute permission for it', async function () {
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
        
        it('[4QZU] must forbid streamId addition, if you don\'t have a contribute permission for it', async function () {
          const res = await server.request()
            .put(eventPath(eventIdA))
            .set('Authorization', tokenContributeA)
            .send({
              streamIds: [streamAId, streamBId],
            });
          assert.equal(res.status, 400);
          const err = res.body.error;
        });
  
        it('must allow streamId deletion, if you have a contribute permission for it', async function () {
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
        
        it('must forbid streamId deletion, if you don\'t have contribute permission for it', async function () {
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

      it('must return a 410 (Gone)', async function () {
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

      it('must return a 410 (Gone)', async function () {
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

      it('must return streamIds & streamId containing the first one (if many)', async function () {
        const res = await server.request()
          .delete(eventPath(eventIdAB))
          .set('Authorization', tokenContributeAB)
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.streamId, streamAId);
        assert.deepEqual(event.streamIds, [streamAId, streamBId]);
      });

      it('must return only the streamIds you have a read access to', async function () {
        const res = await server.request()
          .delete(eventPath(eventIdAB))
          .set('Authorization', tokenContributeA)
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.streamId, streamAId);
        assert.deepEqual(event.streamIds, [streamAId]);
      });

      it('must allow trashing, if you have a contribute permission on at least 1 streamId', async function () {
        const res = await server.request()
          .delete(eventPath(eventIdAB))
          .set('Authorization', tokenContributeA)
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.trashed, true);
      });

      it('must allow deletion, if you have a contribute permission on at least 1 streamId', async function () {
        const res = await server.request()
          .delete(eventPath(trashedEventIdAB))
          .set('Authorization', tokenContributeA)
        assert.equal(res.status, 200);
        const event = res.body.event;
        assert.equal(event.trashed, true);
      });

    });

  });

  describe('streams actions', function () {
    let server;
    before(async () => {
      server = await context.spawn();
    });
    after(() => {
      server.stop();
    });

    let mongoFixtures;
    beforeEach(async function () {
      mongoFixtures = databaseFixture(await produceMongoConnection());
    });
    afterEach(() => {
      mongoFixtures.clean();
    });

    let user,
      username,
      streamAId,
      streamBId,
      streamASonId,
      eventIdBsA,
      eventIdAsA,
      manageAccessToken,
      basePathEvent,
      basePathStream;

    beforeEach(async function () {
      username = cuid();
      streamAId = 'streamA';
      streamBId = 'streamB';
      streamASonId = 'streamASonId';
      streamASonAsonId = 'streamASonAsonId';
      eventIdAsA = cuid();
      eventIdBsA = cuid();
      eventIdsAssA = cuid();
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
        id: streamASonId,
        name: 'stream son of A'
      });
      await user.stream({
        parentId: streamASonId,
        id: streamASonAsonId,
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
        id: eventIdBsA,
        streamIds: [streamBId, streamASonId]
      });
      await user.event({
        type: 'note/txt',
        time: (Date.now() / 1000) -1,
        content: 'In A and Son of A',
        id: eventIdAsA,
        streamIds: [streamAId, streamASonId]
      });
      await user.event({
        type: 'note/txt',
        time: (Date.now() / 1000),
        content: 'In Son of A and Son of Son of A',
        id: eventIdsAssA,
        streamIds: [streamASonId, streamASonAsonId]
      });
    });

    it('[J6H8] Deleting a stream, should not delete multiple streams Event but remove the streamId from list (mergeWithparent = false)', async () => {
      for (let i = 0; i < 2; i++) {
        const resStreamDelete = await server.request()
          .delete(basePathStream + streamASonId)
          .query({ mergeEventsWithParent: false })
          .set('Authorization', manageAccessToken);
      }

      const resEvent = await server.request()
        .get(basePathEvent)
        .set('Authorization', manageAccessToken);

      resEvent.body.events.length.should.eql(2);
      resEvent.body.events[1].streamIds.should.eql([streamBId]);
      resEvent.body.events[0].streamIds.should.eql([streamAId]);
    });

    it('[J6H9] Multiple streams events attached in a parent and child stream, should be deleted if parent stream is deleted (mergeWithparent = false)', async () => {
      for (let i = 0; i < 2; i++) {
        const resStreamDelete = await server.request()
          .delete(basePathStream + streamAId)
          .query({ mergeEventsWithParent: false })
          .set('Authorization', manageAccessToken);
      }

      const resEvent = await server.request()
        .get(basePathEvent)
        .set('Authorization', manageAccessToken);

      resEvent.body.events.length.should.eql(1);
      resEvent.body.events[0].streamIds.should.eql([streamBId]);
    });

    it('[J6H1] Multiple streams events attached should be deleted if all streams they belong are deleted (mergeWithparent = false)', async () => {
      for (let i = 0; i < 2; i++) {
        await server.request()
          .delete(basePathStream + streamAId)
          .query({ mergeEventsWithParent: false })
          .set('Authorization', manageAccessToken);
        await server.request()
          .delete(basePathStream + streamBId)
          .query({ mergeEventsWithParent: false })
          .set('Authorization', manageAccessToken);
      }

      const resEvent = await server.request()
        .get(basePathEvent)
        .query({ includeDeletions: true, modifiedSince: 0 })
        .set('Authorization', manageAccessToken);

      resEvent.body.events.length.should.eql(0);
      resEvent.body.eventDeletions.length.should.eql(3);
      resEvent.body.eventDeletions.forEach(deletion => {
        chai.expect([eventIdBsA, eventIdAsA, eventIdsAssA]).to.include(deletion.id);
      });
    });


    it('[J7H8] Deleting a stream, should not delete multiple streams Events but merge with parent streamId from list (mergeWithparent = true)', async () => {
      for (let i = 0; i < 2; i++) {
        const resStreamDelete = await server.request()
          .delete(basePathStream + streamASonId)
          .query({ mergeEventsWithParent: true })
          .set('Authorization', manageAccessToken);
      }

      const resEvent = await server.request()
        .get(basePathEvent)
        .set('Authorization', manageAccessToken);

      resEvent.body.events.length.should.eql(3);
      
      resEvent.body.events[2].streamIds.should.eql(
        [streamBId, streamAId]);
      resEvent.body.events[1].streamIds.should.eql(
        [streamAId,streamAId]);
      resEvent.body.events[0].streamIds.should.eql(
        [streamAId, streamAId]);
    });




  });


  function resetEvents(done) {
    eventsNotifCount = 0;
    async.series([
      testData.resetEvents,
      testData.resetAttachments
    ], done);
  }

});
