/*global describe, before, beforeEach, it */

var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    attachmentsCheck = helpers.attachmentsCheck,
    commonTests = helpers.commonTests,
    validation = helpers.validation,
    ErrorIds = require('components/errors').ErrorIds,
    eventFilesStorage = helpers.dependencies.storage.user.eventFiles,
    methodsSchema = require('../src/schema/eventsMethods'),
    fs = require('fs'),
    should = require('should'), // explicit require to benefit from static functions
    storage = helpers.dependencies.storage.user.events,
    testData = helpers.data,
    timestamp = require('unix-timestamp'),
    _ = require('lodash');
require('date-utils');

describe('events', function () {

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
        helpers.dependencies.storage.user.accesses.findOne(user, {token: request.token},
            null, function (err, acc) {
          access = acc;
          stepDone();
        });
      }
    ], done);
  });

  describe('GETevents /', function () {

    before(resetEvents);

    it('must return the last 20 non-trashed events (sorted descending) by default',
        function (done) {
      var additionalEvents = [];
      for (var i = 0; i < 50; i++) {
        additionalEvents.push({
          id: (100 + i).toString(),
          time: timestamp.now('-' + (48 + i) + 'h'),
          type: testType,
          streamId: testData.streams[i % 2].id,
          created: timestamp.now('-' + (48 + i) + 'h'),
          createdBy: 'test',
          modified: timestamp.now('-' + (48 + i) + 'h'),
          modifiedBy: 'test'
        });
      }
      async.series([
        storage.insertMany.bind(storage, user, additionalEvents),
        function getDefault(stepDone) {
          request.get(basePath).end(function (res) {
            console.log('XXXXXX test received res.body:', res.text);
            var allEvents = additionalEvents.concat(validation.removeDeletions(testData.events))
                .filter(function (e) {
                  return ! e.trashed && ! _.some(testData.streams, containsTrashedEventStream);
                  function containsTrashedEventStream(stream) {
                    return stream.trashed && stream.id === e.streamId ||
                        _.some(stream.children, containsTrashedEventStream);
                  }
                });
            validation.check(res, {
              status: 200,
              schema: methodsSchema.get.result,
              sanitizeFn: validation.sanitizeEvents,
              sanitizeTarget: 'events',
              body: {events: _.first(_.sortBy(allEvents, 'time').reverse(), 20)}
            }, stepDone);
          });
        },
        testData.resetEvents
      ], done);
    });

    it.skip('must only return events for the given streams (incl. sub-streams) when set',
        function (done) {
      var params = {
        streams: [ testData.streams[0].id, testData.streams[2].id ],
        fromTime: timestamp.now('-48h'),
        sortAscending: false // explicitly set default value to check it works too...
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 9, 7, 6, 4, 3, 2, 1, 0)
          }
        }, done);
      });
    });

    it.skip('must return an error if some of the given streams do not exist', function (done) {
      var params = {streams: ['bad-id-A', 'bad-id-B']};
      request.get(basePath).query(params).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: params
        }, done);
      });
    });

    it.skip('must only return events with the given tag when set', function (done) {
      var params = {
        tags: ['super'],
        fromTime: timestamp.now('-48h')
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 3, 2, 0)
          }
        }, done);
      });
    });

    it.skip('must only return events with any of the given tags when set', function (done) {
      var params = {
        tags: ['super', 'fragilistic'],
        fromTime: timestamp.now('-48h')
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 11, 3, 2, 0)
          }
        }, done);
      });
    });

    it.skip('must only return events of any of the given types when set', function (done) {
      var params = {
        types: ['picture/attached', 'note/webclip'],
        state: 'all'
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 12, 4, 2)
          }
        }, done);
      });
    });

    it.skip('must (unofficially) support a wildcard for event types', function (done) {
      var params = {
        types: ['activity/*'],
        state: 'all'
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events'
        });
        res.body.events.should.containEql(testData.events[8]); // activity/test
        res.body.events.should.containEql(testData.events[9]); // activity/pryv
        done();
      });
    });

    it.skip('must only return events in the given time period sorted ascending when set',
        function (done) {
      var params = {
        // must also include already started but overlapping events
        fromTime: timestamp.add(testData.events[1].time, '58m'),
        toTime: testData.events[3].time,
        sortAscending: true
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 1, 2, 3)
          }
        }, done);
      });
    });

    it.skip('must properly exclude period events completed before the given period', function (done) {
      var params = {
        fromTime: testData.events[1].time + testData.events[1].duration + 1,
        toTime: timestamp.add(testData.events[3].time, '-1m')
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 2)
          }
        }, done);
      });
    });

    it.skip('must return ongoing events started before the given time period', function (done) {
      var params = {
        streams: [testData.streams[0].id],
        fromTime: testData.events[9].time + 1,
        toTime: timestamp.now()
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 9)
          }
        }, done);
      });
    });

    it.skip('must only return events in the given paging range when set', function (done) {
      request.get(basePath).query({ state: 'all', skip: 1, limit: 3 }).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 11, 10, 9)
          }
        }, done);
      });
    });

    it.skip('must return only trashed events when requested', function (done) {
      request.get(basePath).query({state: 'trashed'}).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: { events: _.filter(testData.events, {trashed: true}) }
        }, done);
      });
    });

    it.skip('must return all events (trashed or not) when requested', function (done) {
      request.get(basePath).query({state: 'all'}).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: { events: _.sortBy(validation.removeDeletions(testData.events), 'time').reverse() }
        }, done);
      });
    });

    it.skip('must return only events modified since the given time when requested', function (done) {
      var params = {
        state: 'all',
        modifiedSince: timestamp.now('-45m')
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 12, 11, 10, 0)
          }
        }, done);
      });
    });

    it.skip('must include event deletions (since that time) when requested', function (done) {
      var params = {
        state: 'all',
        modifiedSince: timestamp.now('-45m'),
        includeDeletions: true
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 12, 11, 10, 0),
            eventDeletions: _.at(testData.events, 13)
          }
        }, done);
      });
    });

    it.skip('must not keep event deletions past a certain time ' +
        '(cannot test because cannot force-run Mongo\'s TTL cleanup task)'
    /*, function (done) {
      var params = {
        state: 'all',
        modifiedSince: timestamp.now('-5y'),
        includeDeletions: true
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result
        });
        res.body.eventDeletions.should.eql(_.at(testData.events, 13, 14))
        done();
      });
    }*/);

    it.skip('must only return running period event(s) when requested', function (done) {
      var params = {
        running: true
      };
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: { events: [testData.events[11], testData.events[9]] }
        }, done);
      });
    });

    it.skip('must return an error if no access token is provided', function (done) {
      commonTests.checkAccessTokenAuthentication(server.url, basePath, done);
    });

  });

  describe('GET /<event id>/<file id>', function () {

    before(resetEvents);

    it.skip('must return the attached file with the correct headers', function (done) {
      var event = testData.events[0],
          attachment = event.attachments[0];
      request.get(path(event.id) + '/' + attachment.id).end(function (res) {
        res.statusCode.should.eql(200);

        res.headers.should.have.property('content-type', attachment.type);
        res.headers.should.have.property('content-length', attachment.size.toString());

        done();
      });
    });

    it.skip('must accept a secure read token in the query string instead of the `"Authorization" header',
        function (done) {
      var event = testData.events[0],
          attIndex = 0;
      async.waterfall([
        function retrieveAttachmentInfo(stepDone) {
          request.get(basePath).query({sortAscending: true}).end(function (res) {
            stepDone(null, res.body.events[0].attachments[attIndex]);
          });
        },
        function retrieveAttachedFile(att, stepDone) {
          request.get(path(event.id) + '/' + att.id)
              .unset('Authorization')
              .query({readToken: att.readToken})
              .end(function (res) {
            res.statusCode.should.eql(200);

            res.headers.should.have.property('content-type', att.type);
            res.headers.should.have.property('content-length', att.size.toString());

            stepDone();
          });
        }
      ], done);
    });

    it.skip('must allow a filename path suffix after the file id', function (done) {
      var event = testData.events[0],
          attIndex = 1;
      async.waterfall([
        function retrieveAttachmentInfo(stepDone) {
          request.get(basePath).query({sortAscending: true}).end(function (res) {
            stepDone(null, res.body.events[0].attachments[attIndex]);
          });
        },
        function retrieveAttachedFile(att, stepDone) {
          request.get(path(event.id) + '/' + att.id + '/' + att.fileName)
              .unset('Authorization')
              .query({readToken: att.readToken})
              .end(function (res) {
            res.statusCode.should.eql(200);

            res.headers.should.have.property('content-type', att.type);
            res.headers.should.have.property('content-length', att.size.toString());

            stepDone();
          });
        }
      ], done);
    });

    it.skip('must allow any filename (including special characters)', function (done) {
      var event = testData.events[0],
          attIndex = 1;
      async.waterfall([
        function retrieveAttachmentInfo(stepDone) {
          request.get(basePath).query({sortAscending: true}).end(function (res) {
            stepDone(null, res.body.events[0].attachments[attIndex]);
          });
        },
        function retrieveAttachedFile(att, stepDone) {
          request.get(path(event.id) + '/' + att.id +
              '/1Q84%20%28Livre%201%20-%20Avril-juin%29%20-%20Murakami%2CHaruki.mobi')
              .unset('Authorization')
              .query({readToken: att.readToken})
              .end(function (res) {
            res.statusCode.should.eql(200);
            stepDone();
          });
        }
      ], done);
    });

    it.skip('must refuse an invalid file read token', function (done) {
      var event = testData.events[0];
      request.get(path(event.id) + '/' + event.attachments[0].id)
          .unset('Authorization')
          .query({readToken: access.id + '-Bad-HMAC'})
          .end(function (res) {
        validation.checkError(res, {
          status: 401,
          id: ErrorIds.InvalidAccessToken
        }, done);
      });
    });

    it.skip('must refuse auth via the regular "auth" query string parameter', function (done) {
      var event = testData.events[0];
      request.get(path(event.id) + '/' + event.attachments[0].id)
          .unset('Authorization')
          .query({auth: access.token})
          .end(function (res) {
            validation.checkError(res, {
              status: 401,
              id: ErrorIds.InvalidAccessToken
            }, done);
          });
    });

    it.skip('must return a proper error if trying to get an unknown attachment', function (done) {
      var event = testData.events[0];
      request.get(path(event.id) + '/unknown-file-id').end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

  });

  describe('POST /', function () {

    beforeEach(resetEvents);

    it.skip('must create an event with the sent data, returning it', function (done) {
      var data = {
        time: timestamp.fromDate('2012-03-22T10:00'),
        duration: timestamp.duration('55m'),
        type: 'temperature/celsius',
        content: 36.7,
        streamId: testData.streams[0].id,
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
        function countInitialEvents(stepDone) {
          storage.countAll(user, function (err, count) {
            originalCount = count;
            stepDone();
          });
        },
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
            events.length.should.eql(originalCount + 1, 'events');

            var expected = _.clone(data);
            expected.id = createdEventId;
            expected.tags = ['patapoumpoum'];
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

    it.skip('must set the event\'s time to "now" if missing', function (done) {
      var data = {
        streamId: testData.streams[2].id,
        type: 'mass/kg',
        content: 10.7
      };
      request.post(basePath).send(data).end(function (res) {
        var expectedTimestamp = timestamp.now();

        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });

        // allow 1 second of lag
        res.body.event.time.should.be.within(expectedTimestamp - 1, expectedTimestamp);

        done();
      });
    });

    it.skip('must refuse events with no stream id', function (done) {
      request.post(basePath).send({type: testType}).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });



    it.skip('must return a correct error if an event with the same id already exists', function (done) {
      var data = {
        id: testData.events[0].id,
        streamId: testData.streams[2].id,
        type: 'test/test'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {id: data.id}
        }, done);
      });
    });

    it.skip('must not allow reuse of deleted ids (unlike streams)', function (done) {
      var data = {
        id: testData.events[13].id, // existing deletion
        streamId: testData.streams[2].id,
        type: 'test/test'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {id: data.id}
        }, done);
      });
    });

    it.skip('must only allow ids that are formatted like cuids', function (done) {
      var data = {
        id: 'man, this is a baaad id',
        streamId: testData.streams[2].id,
        type: 'test/test'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });



    it.skip('must fix the tags to an empty array if not set', function (done) {
      var data = { streamId: testData.streams[1].id, type: testType };

      request.post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });

        var createdEvent = res.body.event;
        createdEvent.should.have.property('tags');
        createdEvent.tags.should.eql([]);

        done();
      });
    });

    it.skip('must try casting string event content to number if appropriate', function (done) {
      var data = {
        streamId: testData.streams[2].id,
        type: 'mass/kg',
        content: '75.3'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });

        res.body.event.content.should.equal(+data.content);

        done();
      });
    });

    it.skip('must not stop the running period event if the new event is a mark event (single activity)',
        function (done) {
      var data = { streamId: testData.streams[0].id, type: testType };
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

    it.skip('must not stop the running period event if the stream allows overlapping', function (done) {
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
            validation.check(res, {
              status: 201,
              schema: methodsSchema.create.result
            }, stepDone);
          });
        },
        function verifyData(stepDone) {
          storage.findOne(user, {id: testData.events[11].id}, null, function (err, event) {
            event.should.eql(testData.events[11]);
            stepDone();
          });
        }
      ], done);
    });

    it.skip('must validate the event\'s content if its type is known', function (done) {
      var data = {
        streamId: testData.streams[1].id,
        type: 'note/webclip',
        content: {
          url: 'bad-url',
          content: '<p>昔者莊周夢為蝴蝶，栩栩然蝴蝶也，自喻適志與，不知周也。' +
              '俄然覺，則蘧蘧然周也。不知周之夢為蝴蝶與，蝴蝶之夢為周與？周與蝴蝶則必有分矣。' +
              '此之謂物化。</p>'
        }
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    // cf. GH issue #42
    it.skip('must not fail when validating the content if passing a string instead of an object',
        function (done) {
      var data = {
        streamId: testData.streams[1].id,
        type: 'note/webclip',
        content: 'This should be an object'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it.skip('must return an error if the sent data is badly formatted', function (done) {
      request.post(basePath).send({badProperty: 'bad value'}).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it.skip('must return an error if the associated stream is unknown', function (done) {
      var data = {
        time: timestamp.fromDate('2012-03-22T10:00'),
        type: testType,
        streamId: 'unknown-stream-id'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: {streamId: data.streamId}
        }, done);
      });
    });

    it.skip('must return an error if the event\'s period overlaps existing periods (single activity)',
        function (done) {
      var data = {
        time: timestamp.add(testData.events[1].time, '15m'),
        duration: timestamp.duration('5h30m'),
        type: testType,
        streamId: testData.streams[0].id
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.PeriodsOverlap,
          data: {overlappedIds: [
            testData.events[1].id,
            testData.events[3].id
          ]}
        }, done);
      });
    });

    it.skip('must allow the event\'s period overlapping existing periods when the stream allows it',
        function (done) {
      var data = {
        streamId: testData.streams[1].id,
        time: timestamp.add(testData.events[11].time, '-15m'),
        duration: timestamp.duration('5h30m'),
        type: testType
      };
      request.post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        }, done);
      });
    });

    it.skip('must return an error if the assigned stream is trashed', function (done) {
      var data = {
        type: testType,
        streamId: testData.streams[3].id
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation,
          data: {trashedReference: 'streamId'}
        }, done);
      });
    });

    it.skip('must not fail (500) when sending an array instead of an object', function (done) {
      request.post(basePath).send([{}]).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidParametersFormat
        }, done);
      });
    });

  });

  describe('POST /start', function () {

    beforeEach(resetEvents);

    var path = basePath + '/start';

    it.skip('must create a running period event stopping any previously running event (single activity)',
        function (done) {
      var data = {
        // 15 minutes ago to make sure the previous duration is set accordingly
        time: timestamp.now('-15m'),
        type: testType,
        streamId: testData.streams[0].id,
        tags: ['houba']
      };
      var createdId;

      async.series([
          function addNewEvent(stepDone) {
            request.post(path).send(data).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              createdId = res.body.event.id;
              res.body.stoppedId.should.eql(testData.events[9].id);
              eventsNotifCount.should.eql(1, 'events notifications');
              stepDone();
            });
          },
          function verifyEventData(stepDone) {
            storage.findAll(user, null, function (err, events) {
              var expected = _.clone(data);
              expected.id = createdId;
              expected.duration = null;
              var actual = _.find(events, function (event) {
                return event.id === createdId;
              });
              validation.checkStoredItem(actual, 'event');
              validation.checkObjectEquality(actual, expected);

              var previous = _.find(events, function (event) {
                return event.id === testData.events[9].id;
              });
              var expectedDuration = data.time - previous.time;
              // allow 1 second of lag
              previous.duration.should.be.within(expectedDuration - 1, expectedDuration);

              stepDone();
            });
          }
        ],
        done
      );
    });

    it.skip('must return an error if a period event already exists later (single activity)',
        function (done) {
      var data = {
        time: timestamp.now('-1h05m'),
        type: testType,
        streamId: testData.streams[0].id
      };
      request.post(path).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation,
          data: {conflictingEventId: testData.events[9].id}
        }, done);
      });
    });

    it.skip('must allow starting an event before an existing period when the stream allows overlapping',
        function (done) {
      var data = {
        streamId: testData.streams[1].id,
        time: timestamp.add(testData.events[11].time, '-15m'),
        type: testType
      };
      request.post(basePath + '/start').send(data)
          .end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        }, done);
      });
    });

  });

  describe('POST / (multipart content)', function () {

    beforeEach(resetEvents);

    it.skip('must create a new event with the uploaded files', function (done) {
      var data = {
        time: timestamp.now(),
        type: 'wisdom/test',
        content: {
          chapterOne: '道 可 道 非 常 道...'
        },
        streamId: testData.streams[0].id,
        tags: ['houba']
      };

      request.post(basePath)
          .field('event', JSON.stringify(data))
          .attach('document', testData.attachments.document.path,
              testData.attachments.document.filename)
          .attach('image', testData.attachments.image.path,
              testData.attachments.image.filename)
          .end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });

        var createdEvent = res.body.event;
        validation.checkFilesReadToken(createdEvent, access, filesReadTokenSecret);
        validation.sanitizeEvent(createdEvent);

        var expected = _.extend({
          id: createdEvent.id,
          attachments: [
            {
              id: createdEvent.attachments[0].id,
              fileName: testData.attachments.document.filename,
              type: testData.attachments.document.type,
              size: testData.attachments.document.size
            },
            {
              id: createdEvent.attachments[1].id,
              fileName: testData.attachments.image.filename,
              type: testData.attachments.image.type,
              size: testData.attachments.image.size
            }
          ]
        }, data);
        validation.checkObjectEquality(createdEvent, expected);

        // check attached files
        attachmentsCheck.compareTestAndAttachedFiles(user, createdEvent.id,
            createdEvent.attachments[0].id,
            testData.attachments.document.filename).should.equal('');
        attachmentsCheck.compareTestAndAttachedFiles(user, createdEvent.id,
            createdEvent.attachments[1].id,
            testData.attachments.image.filename).should.equal('');


        eventsNotifCount.should.eql(1, 'events notifications');

        done();
      });
    });

    it.skip('must properly handle part names containing special chars (e.g. ".", "$")', function (done) {
      var data = {
        time: timestamp.now(),
        type: 'wisdom/test',
        content: {
          principles: '三頂三圓三虛。。。'
        },
        streamId: testData.streams[0].id,
        tags: ['bagua']
      };

      request.post(basePath)
          .field('event', JSON.stringify(data))
          .attach('$name.with:special-chars/',
              fs.createReadStream(testData.attachments.document.path),
              {filename: 'file.name.with.many.dots.pdf'})
          .end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });

        var createdEvent = validation.sanitizeEvent(res.body.event);
        var expected = _.extend({
          id: createdEvent.id,
          attachments: [
            {
              id: createdEvent.attachments[0].id,
              fileName: 'file.name.with.many.dots.pdf',
              type: testData.attachments.document.type,
              size: testData.attachments.document.size
            }
          ]
        }, data);
        validation.checkObjectEquality(createdEvent, expected);

        // check attached files
        attachmentsCheck.compareTestAndAttachedFiles(user, createdEvent.id,
            createdEvent.attachments[0].id,
            testData.attachments.document.filename).should.equal('');

        eventsNotifCount.should.eql(1, 'events notifications');

        done();
      });
    });

    it.skip('must return an error if the non-file content part is not JSON', function (done) {
      request.post(basePath)
          .field('event', '<bad>data</bad>')
          .attach('file', testData.attachments.text.path, testData.attachments.text.fileName)
          .end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidRequestStructure
        }, done);
      });
    });

    it.skip('must return an error if there is more than one non-file content part', function (done) {
      request.post(basePath)
          .field('event', JSON.stringify({ streamId: testData.streams[0].id, type: testType }))
          .field('badPart', 'text')
          .end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidRequestStructure
        }, done);
      });
    });

  });

  describe('POST /<event id> (multipart content)', function () {

    beforeEach(resetEvents);

    it.skip('must add the uploaded files to the event as attachments', function (done) {
      var event = testData.events[1],
          time;

      request.post(path(event.id))
          .attach('image', testData.attachments.image.path,
              testData.attachments.image.fileName)
          .attach('text', testData.attachments.text.path,
              testData.attachments.text.fileName)
          .end(function (res) {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var updatedEvent = res.body.event;
        validation.checkFilesReadToken(updatedEvent, access, filesReadTokenSecret);
        validation.sanitizeEvent(updatedEvent);

          var updatedEventAttachments = {};
          updatedEvent.attachments.forEach( function (attachment) {
            updatedEventAttachments[attachment.fileName] = attachment;
          });

          var expected = {};
          expected.attachments = [];
          updatedEvent.attachments.forEach( function (attachment) {
            if (attachment.fileName === testData.attachments.image.filename) {
              expected.attachments.push(
                {
                  id: attachment.id,
                  fileName: testData.attachments.image.filename,
                  type: testData.attachments.image.type,
                  size: testData.attachments.image.size
                }
              );
            }
            if (attachment.fileName === testData.attachments.text.filename) {
              expected.attachments.push(
                {
                  id: attachment.id,
                  fileName: testData.attachments.text.filename,
                  type: testData.attachments.text.type,
                  size: testData.attachments.text.size
                }
              );
            }
          });
          expected.modified = time;
          expected.modifiedBy = access.id;
          expected = _.defaults(expected, event);

        validation.checkObjectEquality(updatedEvent, expected);

        // check attached files
        attachmentsCheck.compareTestAndAttachedFiles(user, event.id,
          updatedEventAttachments[testData.attachments.image.filename].id,
            testData.attachments.image.filename).should.equal('');
        attachmentsCheck.compareTestAndAttachedFiles(user, event.id,
          updatedEventAttachments[testData.attachments.text.filename].id,
            testData.attachments.text.filename).should.equal('');

        eventsNotifCount.should.eql(1, 'events notifications');

        done();
      });
    });

    it.skip('must add the uploaded files to the event without replacing existing attachments',
        function (done) {
      var event = testData.events[0];

      request.post(path(event.id))
          .attach('text', testData.attachments.text.path, testData.attachments.text.fileName)
          .end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var updatedEvent = validation.sanitizeEvent(res.body.event);
        var expectedAttachments = event.attachments.slice();
        expectedAttachments.push({
          id: updatedEvent.attachments[updatedEvent.attachments.length - 1].id,
          fileName: testData.attachments.text.filename,
          type: testData.attachments.text.type,
          size: testData.attachments.text.size
        });

        updatedEvent.attachments.should.eql(expectedAttachments);

        attachmentsCheck.compareTestAndAttachedFiles(user, event.id,
            updatedEvent.attachments[updatedEvent.attachments.length - 1].id,
            testData.attachments.text.filename).should.equal('');

        eventsNotifCount.should.eql(1, 'events notifications');

        done();
      });
    });

  });

  describe('PUT /<id>', function () {

    beforeEach(resetEvents);

    it.skip('must modify the event with the sent data', function (done) {
      var original = testData.events[0],
          time;
      var data = {
        id: 'Bavazakamasarpataparda', // check that properly ignored
        time: timestamp.add(original.time, '-15m'),
        duration: timestamp.add(original.duration, '15m'),
        type: testType,
        content: 'test',
        streamId: testData.streams[0].children[0].id,
        tags: [' yippiya ', ' ', ''], // must trim and ignore empty tags
        description: 'New description',
        clientData: {
          clientField: 'client value'
        },
        //check if properly ignored
        attachments: [
          {
            id: 'bidon',
            fileName: 'bidon.ext',
            type: 'application/bidon',
            size: 0
          }
        ],
        // check if properly ignored
        modified: timestamp.now('-1h')
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

            var expected = _.clone(data);
            expected.id = original.id;
            expected.tags = ['yippiya'];
            expected.modified = time;
            expected.modifiedBy = access.id;
            expected.attachments = original.attachments;
            validation.checkObjectEquality(res.body.event, expected);

            eventsNotifCount.should.eql(1, 'events notifications');
            stepDone();
          });
        },
        function verifyStoredItem(stepDone) {
          storage.database.findOne(storage.getCollectionInfo(user), {_id: original.id}, {},
              function (err, dbEvent) {
            dbEvent.endTime.should.eql(data.time + data.duration);
            stepDone();
          });
        }
      ], done);
    });

    it.skip('must add/update/remove the specified client data fields without touching the others',
        function (done) {
      var original = testData.events[1],
          time;
      var data = {
        clientData: {
          booleanProp: true, // add
          stringProp: 'Where Art Thou?', // update
          numberProp: null // delete
        }
      };

      request.put(path(original.id)).send(data).end(function (res) {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var expected = _.clone(original);
        expected.modified = time;
        expected.modifiedBy = access.id;
        _.extend(expected.clientData, data.clientData);
        delete expected.clientData.numberProp;
        validation.checkObjectEquality(res.body.event, expected);

        eventsNotifCount.should.eql(1, 'events notifications');
        done();
      });
    });

    it.skip('must return the id of the stopped previously running event if any (single activity)',
        function (done) {
      request.put(path(testData.events[3].id)).send({time: timestamp.now()})
          .end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });
        res.body.stoppedId.should.eql(testData.events[9].id);
        eventsNotifCount.should.eql(1, 'events notifications');
        done();
      });
    });

    it.skip('must validate the event\'s content if its type is known', function (done) {
      var data = {
        type: 'position/wgs84',
        content: {
          latitude: 'bad-value',
          longitude: false
        }
      };
      request.put(path(testData.events[2].id)).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it.skip('must return an error if the event does not exist', function (done) {
      request.put(path('unknown-id')).send({time: timestamp.now()}).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

    it.skip('must return an error if the sent data is badly formatted', function (done) {
      request.put(path(testData.events[3].id)).send({badProperty: 'bad value'})
          .end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it.skip('must return an error if the associated stream is unknown', function (done) {
      request.put(path(testData.events[3].id)).send({streamId: 'unknown-stream-id'})
          .end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: {streamId: 'unknown-stream-id'}
        }, done);
      });
    });

    it.skip('must return an error if moving a running period event before another existing ' +
        'period event (single activity)', function (done) {
      var data = { time: timestamp.add(testData.events[3].time, '-5m') };
      request.put(path(testData.events[9].id)).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation,
          data: {conflictingEventId: testData.events[3].id}
        }, done);
      });
    });

    it.skip('must return an error if the event\'s new period overlaps other events\'s (single activity)',
        function (done) {
      request.put(path(testData.events[1].id)).send({duration: timestamp.duration('5h')})
          .end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.PeriodsOverlap,
          data: {overlappedIds: [testData.events[3].id]}
        }, done);
      });
    });

  });

  describe('POST /stop', function () {

    beforeEach(resetEvents);

    var path = basePath + '/stop';

    it.skip('must stop the previously running period event, returning its id (single activity)',
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
            time = timestamp.now();
            validation.check(res, {
              status: 200,
              schema: methodsSchema.stop.result
            });
            res.body.stoppedId.should.eql(stoppedEvent.id);
            eventsNotifCount.should.eql(1, 'events notifications');
            stepDone();
          });
        },
        function verifyStoredItem(stepDone) {
          storage.database.findOne(storage.getCollectionInfo(user), {_id: stoppedEvent.id}, {},
              function (err, dbEvent) {
            var expectedDuration = stopTime - dbEvent.time;
            // allow 1 second of lag
            dbEvent.duration.should.be.within(expectedDuration - 1, expectedDuration);
            dbEvent.modified.should.be.within(time - 1, time);
            dbEvent.modifiedBy.should.eql(access.id);
            dbEvent.endTime.should.eql(dbEvent.time + dbEvent.duration);
            stepDone();
          });
        }
      ], done);
    });

    it.skip('must stop the last running event of the given type when specified', function (done) {
      var stoppedEvent = testData.events[11],
          stopTime;
      async.series([
        function addOtherRunning(stepDone) {
          var data = {
            streamId: stoppedEvent.streamId,
            type: testType
          };
          request.post(basePath + '/start').send(data)
              .end(function (res) {
            res.statusCode.should.eql(201);
            stepDone();
          });
        },
        function (stepDone) {
          var data = {
            streamId: stoppedEvent.streamId,
            type: stoppedEvent.type
          };
          request.post(basePath + '/stop').send(data).end(function (res) {
            stopTime = timestamp.now();
            validation.check(res, {
              status: 200,
              schema: methodsSchema.stop.result
            });
            res.body.stoppedId.should.eql(stoppedEvent.id);
            stepDone();
          });
        },
        function verifyStoredItem(stepDone) {
          storage.database.findOne(storage.getCollectionInfo(user), {_id: stoppedEvent.id}, {},
              function (err, dbEvent) {
            var expectedDuration = stopTime - dbEvent.time;
            // allow 1 second of lag
            dbEvent.duration.should.be.within(expectedDuration - 1, expectedDuration);
            stepDone();
          });
        }
      ], done);
    });

    it.skip('must accept an `id` param to specify the event to stop', function (done) {
      async.series([
        function addOtherRunning(stepDone) {
          var data = {
            streamId: testData.streams[1].children[0].id,
            type: testType
          };
          request.post(basePath + '/start').send(data)
              .end(function (res) {
            res.statusCode.should.eql(201);
            stepDone();
          });
        },
        function (stepDone) {
          var data = {id: testData.events[11].id};
          request.post(basePath + '/stop').send(data)
              .end(function (res) {
            validation.check(res, {
              status: 200,
              schema: methodsSchema.stop.result
            });
            res.body.stoppedId.should.eql(data.id);
            stepDone();
          });
        }
      ], done);
    });

    it.skip('must return an error if the specified event does not exist', function (done) {
      var data = {id: 'unknown'};
      request.post(basePath + '/stop').send(data)
          .end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: {id: 'unknown'}
        }, done);
      });
    });

    it.skip('must return an error if the specified event is not running', function (done) {
      var data = {id: testData.events[6].id};
      request.post(basePath + '/stop').send(data)
          .end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation
        }, done);
      });
    });

    it.skip('must return an error if no event is specified and the stream allows overlapping',
        function (done) {
      var data = {streamId: testData.streams[1].id};
      request.post(basePath + '/stop').send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidParametersFormat
        }, done);
      });
    });

    it.skip('must return an error if neither stream nor event is specified', function (done) {
      request.post(basePath + '/stop').send({}).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidParametersFormat
        }, done);
      });
    });

  });

  describe('DELETE /<event id>/<file id>', function () {

    beforeEach(resetEvents);

    it.skip('must delete the attachment (reference in event + file)', function (done) {
      var event = testData.events[0],
          time;
      var fPath = path(event.id) + '/' + event.attachments[0].id;
      request.del(fPath).end(function (res) {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var updatedEvent = res.body.event;
        validation.checkFilesReadToken(updatedEvent, access, filesReadTokenSecret);
        validation.sanitizeEvent(updatedEvent);
        var expected = _.clone(testData.events[0]);
        expected.attachments = expected.attachments.slice();
        expected.modified = time;
        expected.modifiedBy = access.id;
        expected.attachments.shift();
        validation.checkObjectEquality(updatedEvent, expected);

        var filePath = eventFilesStorage.getAttachedFilePath(user, event.id,
            event.attachments[0].id);
        fs.existsSync(filePath).should.eql(false, 'deleted file existence');

        eventsNotifCount.should.eql(1, 'events notifications');

        done();
      });
    });

    it.skip('must return an error if not existing', function (done) {
      request.del(path(testData.events[0].id) + '/unknown.file').end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

  });

  describe('DELETE /<id>', function () {

    beforeEach(resetEvents);

    it.skip('must flag the event as trashed', function (done) {
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

    it.skip('must delete the event when already trashed including all its attachments', function (done) {
      var id = testData.events[0].id,
          deletionTime;

      async.series([
          storage.update.bind(storage, user, {id: id}, {trashed: true}),
          function deleteEvent(stepDone) {
            request.del(path(id)).end(function (res) {
              deletionTime = timestamp.now();

              validation.check(res, {
                status: 200,
                schema: methodsSchema.del.result
              });
              res.body.eventDeletion.should.eql({id: id});
              eventsNotifCount.should.eql(1, 'events notifications');
              stepDone();
            });
          },
          function verifyEventData(stepDone) {
            storage.findAll(user, null, function (err, events) {
              events.length.should.eql(testData.events.length, 'events');

              var deletion = _.find(events, function (event) {
                return event.id === id;
              });
              should.exist(deletion);
              validation.checkObjectEquality(deletion, { id: id, deleted: deletionTime });

              var dirPath = eventFilesStorage.getAttachedFilePath(user, id);
              fs.existsSync(dirPath).should.eql(false, 'deleted event directory existence');

              stepDone();
            });
          }
        ],
        done
      );
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
