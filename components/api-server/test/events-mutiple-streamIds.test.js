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


    describe('POST event/', function () {

      beforeEach(resetEvents);

      it('[1GR9] must allow event in multiple streams', function (done) {
        var data = {
          type: 'temperature/celsius',
          content: 36.7,
          streamIds: [testData.streams[7].id, testData.streams[1].id],
        };
        var createdEventId,
          created;

        async.series([
          function addNewEvent(stepDone) {
            request.post(basePath).send(data).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              createdEventId = res.body.event.id;
              stepDone();
            });
          },
          function verifyEventData(stepDone) {
            storage.find(user, {}, null, function (err, events) {
              var expected = _.clone(data);
              expected.id = createdEventId;
              var actual = _.find(events, function (event) {
                return event.id === createdEventId;
              });
              expected.tags = actual.tags;
              expected.time = actual.time;
              expected.streamId = expected.streamIds[0];
              validation.checkStoredItem(actual, 'event');
              validation.checkObjectEquality(actual, expected);

              stepDone();
            });
          }
        ], done);
      });

      it('[1GZ9] must clean double streamIds entries in event in multiple streams', function (done) {
        var data = {
          type: 'temperature/celsius',
          content: 36.7,
          streamIds: [testData.streams[7].id, testData.streams[7].id, testData.streams[1].id],
        };
        var originalCount,
          createdEventId,
          created;

        request.post(basePath).send(data).end(function (res) {
          validation.check(res, {
            status: 201,
            schema: methodsSchema.create.result
          });
          var expected = _.clone(res.body.event);
          expected.streamId = data.streamIds[0];
          expected.streamIds = [testData.streams[7].id, testData.streams[1].id],

            validation.checkObjectEquality(res.body.event, expected);
          done();
        });
      });


      it('[1G19] must not allow event in multiple streams, if one of the stream has not write access', function (done) {
        var data = {
          time: timestamp.fromDate('2012-03-22T10:00'),
          duration: timestamp.duration('55m'),
          type: 'temperature/celsius',
          content: 36.7,
          streamIds: [testData.streams[7].id, testData.streams[1].id],
        };

        async.series([
          function addNewEvent(stepDone) {
            requestA1.post(basePath).send(data).end(function (res) {
              validation.checkError(res, {
                status: 403,
                id: ErrorIds.Forbidden
              }, stepDone);
            });
          }
        ], done);
      });

      it('[POIZ] must not allow mixing  different streamIds and streamId properties', function (done) {
        var data = { streamId: testData.streams[0].id, type: testType };
        data.streamIds = [testData.streams[1].id, testData.streams[7].id];

        async.series([
          function addNew(stepDone) {
            request.post(basePath).send(data).end(function (res) {
              validation.checkError(res, {
                status: 400,
                id: ErrorIds.InvalidOperation,
                data: { streamId: data.streamId, streamIds: data.streamIds }
              }, stepDone);
            });
          }
        ], done);
      });

      it('[5C8K] multiple streams events cannot call "start" (not support on single Activity Streams)',
        function (done) {
          var data = {
            // 15 minutes ago to make sure the previous duration is set accordingly
            time: timestamp.now('-15m'),
            type: testType,
            streamIds: [testData.streams[0].id, testData.streams[1].id],
            tags: ['houba']
          };
          var createdId;

          request.post(basePath + '/start').send(data).end(function (res) {
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.InvalidOperation
            });
            done();
          });
        });



      it('[5NEZ] must return an error if one of the associated stream is unknown', function (done) {
        var data = {
          time: timestamp.fromDate('2012-03-22T10:00'),
          type: testType,
          streamIds: [testData.streams[0].id, 'unknown-stream-id']
        };
        request.post(basePath).send(data).end(function (res) {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.UnknownReferencedResource,
            data: { streamIds: ['unknown-stream-id'] }
          }, done);
        });
      });

    });

    describe('POST event/start', function () {

      beforeEach(resetEvents);

      var path = basePath + '/start';

      it('[5C8J] must not allow a running period event with multiple streamIds',
        function (done) {
          var data = {
            // 15 minutes ago to make sure the previous duration is set accordingly
            time: timestamp.now('-15m'),
            type: testType,
            streamIds: [testData.streams[0].id, testData.streams[1].id],
            tags: ['houba']
          };
          var createdId;

          request.post(path).send(data).end(function (res) {
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.InvalidOperation
            });
            done();
          });
        });



    });

    describe('PUT event/<id>', function () {

      beforeEach(resetEvents);

      it('[4QRX] must allow stream addition', function (done) {
        var original = testData.events[0],
          time;
        var data = {
          streamIds: [testData.streams[1].id, testData.streams[7].id],
        };
        async.series([
          function update(stepDone) {
            request.put(path(original.id)).send(data).end(function (res) {
              time = timestamp.now();
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });

              validation.checkFilesReadToken(res.body.event, access, filesReadTokenSecret);
              validation.sanitizeEvent(res.body.event);

              var expected = _.clone(original);
              expected.modifiedBy = 'a_0';
              expected.modified = time;
              expected.streamId = data.streamIds[0];
              expected.streamIds = data.streamIds;
              validation.checkObjectEquality(res.body.event, expected);

              stepDone();
            });
          }
        ], done);
      });

      it('[4QZU] must not allow stream addition with not authorized streamId', function (done) {
        var original = testData.events[0],
          time;
        var data = {
          streamIds: [testData.streams[0].children[0].id, testData.streams[8].id],
        };
        async.series([
          function update(stepDone) {
            requestA1.put(path(original.id)).send(data).end(function (res) {
              validation.checkError(res, {
                status: 403,
                id: ErrorIds.Forbidden
              }, stepDone);
            });
          }
        ], done);
      });

      it('[01BZ] must return an error if the associated stream is unknown', function (done) {
        request.put(path(testData.events[3].id)).send({ streamIds: [testData.streams[8].id, 'unknown-stream-id'] })
          .end(function (res) {
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.UnknownReferencedResource,
              data: { streamIds: ['unknown-stream-id'] }
            }, done);
          });
      });
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

      it('[AU5U] must forbid deletion of trashed even, when no write access on all streams', function (done) {
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
      eventIdAsA = cuid();
      eventIdBsA = cuid();
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
        time: (Date.now() / 1000) -1,
        content: 'In B and Son of A',
        id: eventIdBsA,
        streamIds: [streamBId, streamASonId]
      });
      await user.event({
        type: 'note/txt',
        time: (Date.now() / 1000),
        content: 'In A and Son of A',
        id: eventIdAsA,
        streamIds: [streamAId, streamASonId]
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

    it('[J6H1] Multiple streams events attached should be deleted if all streams they bellong are deleted (mergeWithparent = false)', async () => {
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
      resEvent.body.eventDeletions.length.should.eql(2);
      resEvent.body.eventDeletions.forEach(deletion => {
        chai.expect([eventIdBsA, eventIdAsA]).to.include(deletion.id);
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

      resEvent.body.events.length.should.eql(2);

      resEvent.body.events[0].streamIds.should.eql(
        [streamAId,streamAId]);
      resEvent.body.events[1].streamIds.should.eql(
        [streamBId,streamAId]);
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
