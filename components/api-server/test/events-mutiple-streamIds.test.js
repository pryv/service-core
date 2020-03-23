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

    // to verify data change notifications
    var eventsNotifCount;
    server.on('events-changed', function () { eventsNotifCount++; });

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
          time: timestamp.fromDate('2012-03-22T10:00'),
          duration: timestamp.duration('55m'),
          type: 'temperature/celsius',
          content: 36.7,
          streamIds: [testData.streams[7].id, testData.streams[1].id],
          tags: [' patapoumpoum ', '   ', ''], // must trim and ignore empty tags
          description: 'Test description',
          clientData: {
            testClientDataField: 'testValue'
          },
          // check if properly ignored
          created: timestamp.now('-1h'),
          createdBy: 'should-be-ignored',
          modified: timestamp.now('-1h'),
          modifiedBy: 'should-be-ignored'
        };
        var originalCount,
          createdEventId,
          created;

        async.series([
          function addNewEvent(stepDone) {
            request.post(basePath).send(data).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              created = timestamp.now();
              createdEventId = res.body.event.id;
              eventsNotifCount.should.eql(1, 'events notifications');
              stepDone();
            });
          },
          function verifyEventData(stepDone) {
            storage.find(user, {}, null, function (err, events) {
              var expected = _.clone(data);
              expected.id = createdEventId;
              expected.tags = ['patapoumpoum'];
              expected.streamId = data.streamIds[0];
              expected.created = expected.modified = created;
              expected.createdBy = expected.modifiedBy = access.id;
              var actual = _.find(events, function (event) {
                return event.id === createdEventId;
              });
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

              eventsNotifCount.should.eql(1, 'events notifications');
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
              eventsNotifCount.should.eql(2, 'events notifications');
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
      eventId,
      manageAccesId;

    beforeEach(async function () {
      username = cuid();
      streamAId = cuid();
      streamBId = cuid();
      streamASonId = cuid();
      eventId = cuid();
      manageAccesId = cuid();

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
        parentId: streamASonId,
        id: streamASonId,
        name: 'stream son of A'
      });
      await user.access({
        type: 'app',
        id: manageAccesId,
        permissions: [
          {
            streamId: '*',
            level: 'manage'
          }
        ]
      });
      await user.event({
        type: 'note/txt',
        content: 'Hello',
        id: eventId,
        streamIds: [streamBId, streamASonId],
        level: 'manage'
      });
    });


    it('[S6Z4] Does nothing (yet)', async () => {
      let basePath = `/${username}/events`;

      const res = await server.request()
        .get(basePath)
        .set('Authorization', manageAccesId);

      console.log(res.body);
      /** 
      const res = await server.request()
        .delete(basePath)
        .set('Authorization', manageAccesId)
        .send({
          type: 'shared',
          name: 'whatever',
          permissions: [{
            streamId: createOnlyStreamId,
            level: 'create-only',
          }]
        });
      assert.equal(res.status, 201);
      const access = res.body.access;
      assert.exists(access);
        **/
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
