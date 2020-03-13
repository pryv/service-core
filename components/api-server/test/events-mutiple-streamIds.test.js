/*global describe, before, beforeEach, it */

require('./test-helpers');

const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const async = require('async');
const attachmentsCheck = helpers.attachmentsCheck;
const commonTests = helpers.commonTests;
const validation = helpers.validation;
const ErrorIds = require('components/errors').ErrorIds;
const eventFilesStorage = helpers.dependencies.storage.user.eventFiles;
const methodsSchema = require('../src/schema/eventsMethods');
const fs = require('fs');
const should = require('should'); // explicit require to benefit from static function
const storage = helpers.dependencies.storage.user.events;
const testData = helpers.data;
const timestamp = require('unix-timestamp');
const _ = require('lodash');

const chai = require('chai');
const assert = chai.assert;
const supertest = require('supertest');

require('date-utils');

describe('events muliple streamIds', function () {

  var user = testData.users[0],
    basePath = '/' + user.username + '/events',
    testType = 'test/test',
    // these must be set after server instance started
    request = null,
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


  describe('POST /', function () {

    beforeEach(resetEvents);

    it('[1GR9] must allow event in multiple streams', function (done) {
      var data = {
        time: timestamp.fromDate('2012-03-22T10:00'),
        duration: timestamp.duration('55m'),
        type: 'temperature/celsius',
        content: 36.7,
        streamIds: [testData.streams[8].id, testData.streams[1].id],
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

    it.skip('[1G19] must not allow event in multiple streams, if one of the stream has not write access', function (done) {
      var data = {
        time: timestamp.fromDate('2012-03-22T10:00'),
        duration: timestamp.duration('55m'),
        type: 'temperature/celsius',
        content: 36.7,
        streamIds: [testData.streams[8].id, testData.streams[1].id],
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


    it('[6ZH8] must not allow running period event if the new event is multiple streams',
      function (done) {
        var data = { streamId: testData.streams[0].id, type: testType };

        data.streamIds = [testData.streams[0].id, testData.streams[8].id];
        async.series([
          function addNew(stepDone) {
            request.post(basePath).send(data).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              }, stepDone);
            });
          },
          function verifyData(stepDone) {
            storage.findAll(user, null, function (err, events) {
              var expected = testData.events[9];
              var actual = _.find(events, function (event) {
                return event.id === expected.id;
              });
              actual.should.eql(expected);

              stepDone();
            });
          }
        ], done);
      });

    it('[UL6Y] must not allow stop for event with multiple streamIds', function (done) {
      var data = {
        streamId: testData.streams[1].id,
        duration: timestamp.duration('1h'),
        type: testType,
        tags: []
      };
      async.series([
        function addNew(stepDone) {
          request.post(basePath).send(data).end(function (res) {
            should.not.exist(res.body.stoppedId);
            console.log(res.body);
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.InvalidOperation,
              data: { trashedReference: 'streamIds' }
            }, stepDone);
          });
        }
      ], done);
    });


    it('[5NEZ] must return an error if one of the associated stream is unknown', function (done) {
      var data = {
        time: timestamp.fromDate('2012-03-22T10:00'),
        type: testType,
        streamIds: [testData.streams[0].id, 'unknown-stream-id']
      };
      request.post(basePath).send(data).end(function (res) {
        console.log(res.text);
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: { streamIds: ['unknown-stream-id'] }
        }, done);
      });
    });

  });

  describe('POST /start', function () {

    beforeEach(resetEvents);

    var path = basePath + '/start';

    it('[5C8J] must not allow a running period event with multiple streamIds',
      function (done) {
        var data = {
          // 15 minutes ago to make sure the previous duration is set accordingly
          time: timestamp.now('-15m'),
          type: testType,
          streamIds: [testData.streams[0].id, testData.streams[8].id],
          tags: ['houba']
        };
        var createdId;

        async.series([
          function addNewEvent(stepDone) {
            request.post(path).send(data).end(function (res) {
              validation.checkError(res, {
                status: 400,
                id: ErrorIds.InvalidOperation,
                data: 'to be set'
              }, stepDone);
            });
          }
        ],
          done
        );
      });

  });

  describe('PUT /<id>', function () {

    beforeEach(resetEvents);

    it('[4QRX] must allow stream addition', function (done) {
      var original = testData.events[0],
        time;
      var data = {
        streamIds: [testData.streams[0].children[0].id, testData.streams[8].id],
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
            expected.streamIds = data.streamIds;
            validation.checkObjectEquality(res.body.event, expected);

            eventsNotifCount.should.eql(1, 'events notifications');
            stepDone();
          });
        },
        function verifyStoredItem(stepDone) {
          storage.database.findOne(storage.getCollectionInfo(user), { _id: original.id }, {},
            function (err, dbEvent) {
              dbEvent.endTime.should.eql(data.time + data.duration);
              stepDone();
            });
        }
      ], done);
    });

    it.skip('[4QZU] must not allow stream addition with not authorized streamId', function (done) {
      var original = testData.events[0],
        time;
      var data = {
        streamIds: [testData.streams[0].children[0].id, testData.streams[8].id],
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
            expected.streamIds = data.streamIds;
            validation.checkObjectEquality(res.body.event, expected);

            eventsNotifCount.should.eql(1, 'events notifications');
            stepDone();
          });
        },
        function verifyStoredItem(stepDone) {
          storage.database.findOne(storage.getCollectionInfo(user), { _id: original.id }, {},
            function (err, dbEvent) {
              dbEvent.endTime.should.eql(data.time + data.duration);
              stepDone();
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



  describe('POST /stop', function () {

    beforeEach(resetEvents);

    var path = basePath + '/stop';

    it.skip('[VE5U] must not allow /stop on multiple multiple streams events ',
      function (done) {
        var stopTime = timestamp.now('-5m'),
          stoppedEvent = testData.events[9],
          time;

        async.series([
          function stop(stepDone) {
            var data = {
              streamId: testData.streams[0].id,
              time: stopTime
            };
            request.post(path).send(data).end(function (res) {
              validation.checkError(res, {
                status: 400,
                id: ErrorIds.InvalidOperation,
                data: 'to be set'
              }, stepDone);
            });
          }
        ], done);
      });

  });

  describe('DELETE /<event id>/<file id>', function () {

    beforeEach(resetEvents);

    it.skip('[RD8Z] must allow deletion of an attachment in an multiple streams event with write access on all streams ', function (done) {
      // WRITE IT
      var event = testData.events[0];
      var fPath = path(event.id) + '/' + event.attachments[0].id;
      request.del(fPath).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var updatedEvent = res.body.event;
        validation.checkFilesReadToken(updatedEvent, access, filesReadTokenSecret);
        validation.sanitizeEvent(updatedEvent);
        var expected = _.clone(testData.events[0]);
        expected.attachments = expected.attachments.slice();
        // NOTE We cannot be sure that we still are at the exact same second that
        // we were just now when we did the call. So don't use time here, test
        // for time delta below. 
        delete expected.modified;
        expected.modifiedBy = access.id;
        expected.attachments.shift();
        validation.checkObjectEquality(updatedEvent, expected);

        var time = timestamp.now();
        should(updatedEvent.modified).be.approximately(time, 2);

        var filePath = eventFilesStorage.getAttachedFilePath(user, event.id,
          event.attachments[0].id);
        fs.existsSync(filePath).should.eql(false, 'deleted file existence');

        eventsNotifCount.should.eql(1, 'events notifications');

        done();
      });
    });

    it.skip('[RD9Z] must allow deletion of an attachment in an multiple streams event with write access on all streams ', function (done) {
      // WRITE IT
      var event = testData.events[0];
      var fPath = path(event.id) + '/' + event.attachments[0].id;
      request.del(fPath).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var updatedEvent = res.body.event;
        validation.checkFilesReadToken(updatedEvent, access, filesReadTokenSecret);
        validation.sanitizeEvent(updatedEvent);
        var expected = _.clone(testData.events[0]);
        expected.attachments = expected.attachments.slice();
        // NOTE We cannot be sure that we still are at the exact same second that
        // we were just now when we did the call. So don't use time here, test
        // for time delta below. 
        delete expected.modified;
        expected.modifiedBy = access.id;
        expected.attachments.shift();
        validation.checkObjectEquality(updatedEvent, expected);

        var time = timestamp.now();
        should(updatedEvent.modified).be.approximately(time, 2);

        var filePath = eventFilesStorage.getAttachedFilePath(user, event.id,
          event.attachments[0].id);
        fs.existsSync(filePath).should.eql(false, 'deleted file existence');

        eventsNotifCount.should.eql(1, 'events notifications');

        done();
      });
    });

  });

  describe('DELETE /<id>', function () {

    beforeEach(resetEvents);

    it.skip('[XT5U] must flag the multiple stream event as trashed, when write access on all streams', function (done) {
      var id = testData.events[0].id,
        time;

      request.del(path(id)).end(function (res) {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.del.result
        });

        var trashedEvent = res.body.event;
        trashedEvent.trashed.should.eql(true);
        trashedEvent.modified.should.be.within(time - 1, time);
        trashedEvent.modifiedBy.should.eql(access.id);
        validation.checkFilesReadToken(trashedEvent, access, filesReadTokenSecret);

        eventsNotifCount.should.eql(1, 'events notifications');
        done();
      });
    });

    it.skip('[AU5U] must forbid deletion of trashed even, when no write access on all streams', function (done) {
      var id = testData.events[0].id,
        time;

      request.del(path(id)).end(function (res) {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.del.result
        });

        var trashedEvent = res.body.event;
        trashedEvent.trashed.should.eql(true);
        trashedEvent.modified.should.be.within(time - 1, time);
        trashedEvent.modifiedBy.should.eql(access.id);
        validation.checkFilesReadToken(trashedEvent, access, filesReadTokenSecret);

        eventsNotifCount.should.eql(1, 'events notifications');
        done();
      });
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
