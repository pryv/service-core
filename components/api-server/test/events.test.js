/* global describe, before, beforeEach, it */

require('./test-helpers');

const helpers = require('./helpers');

const server = helpers.dependencies.instanceManager;
const async = require('async');

const { attachmentsCheck } = helpers;
const { commonTests } = helpers;
const { validation } = helpers;
const { ErrorIds } = require('components/errors');

const eventFilesStorage = helpers.dependencies.storage.user.eventFiles;
const fs = require('fs');
const should = require('should');
// explicit require to benefit from static function
const storage = helpers.dependencies.storage.user.events;
const testData = helpers.data;
const timestamp = require('unix-timestamp');
const _ = require('lodash');

const chai = require('chai');

const { assert } = chai;
const supertest = require('supertest');
const methodsSchema = require('../src/schema/eventsMethods');

require('date-utils');

describe('events', () => {
  const user = testData.users[0];
  const basePath = `/${user.username}/events`;
  const testType = 'test/test';
  // these must be set after server instance started
  let request = null;
  let access = null;
  const { filesReadTokenSecret } = helpers.dependencies.settings.auth;

  function path(id, base) {
    return `${base || basePath}/${id}`;
  }

  // to verify data change notifications
  let eventsNotifCount;
  server.on('events-changed', () => { eventsNotifCount++; });

  before((done) => {
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
          null, (err, acc) => {
            access = acc;
            stepDone();
          });
      },
    ], done);
  });

  describe('GET /', () => {
    before(resetEvents);

    it('[WC8C] must return the last 20 non-trashed events (sorted descending) by default',
      (done) => {
        const additionalEvents = [];
        for (let i = 0; i < 50; i++) {
          additionalEvents.push({
            id: (100 + i).toString(),
            time: timestamp.now(`-${48 + i}h`),
            type: testType,
            streamIds: [testData.streams[i % 2].id],
            created: timestamp.now(`-${48 + i}h`),
            createdBy: 'test',
            modified: timestamp.now(`-${48 + i}h`),
            modifiedBy: 'test',
          });
        }

        async.series([
          storage.insertMany.bind(storage, user, additionalEvents),
          function getDefault(stepDone) {
            request.get(basePath).end((res) => {
              const allEvents = additionalEvents
                .concat(validation.removeDeletionsAndHistory(testData.events))
                .filter((e) => {
                  return !e.trashed && !_.some(testData.streams, containsTrashedEventStream);
                  function containsTrashedEventStream(stream) {
                    return stream.trashed && stream.id === e.streamIds[0]
                      || _.some(stream.children, containsTrashedEventStream);
                  }
                });

              // add streamId
              // allEvents.map(function (event) { event.streamId = event.streamIds[0]; return event });
              validation.check(res, {
                status: 200,
                schema: methodsSchema.get.result,
                sanitizeFn: validation.sanitizeEvents,
                sanitizeTarget: 'events',
                body: { events: _.take(_.sortBy(allEvents, 'time').reverse(), 20) },
              }, stepDone);
            });
          },
          testData.resetEvents,
        ], done);
      });

    it('[U8U9] must only return events for the given streams (incl. sub-streams) when set',
      (done) => {
        const params = {
          streams: [testData.streams[0].id, testData.streams[2].id],
          fromTime: timestamp.now('-48h'),
          sortAscending: false, // explicitly set default value to check it works too...
        };
        request.get(basePath).query(params).end((res) => {
          validation.check(res, {
            status: 200,
            schema: methodsSchema.get.result,
            sanitizeFn: validation.sanitizeEvents,
            sanitizeTarget: 'events',
            body: {
              events: _.at(testData.events, 9, 7, 6, 4, 3, 2, 1, 0),
            },
          }, done);
        });
      });

    it('[S0M6] must return an error if some of the given streams do not exist', (done) => {
      const params = { streams: ['bad-id-A', 'bad-id-B'] };
      request.get(basePath).query(params).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: params,
        }, done);
      });
    });

    it('[R667] must only return events with the given tag when set', (done) => {
      const params = {
        tags: ['super'],
        fromTime: timestamp.now('-48h'),
      };
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 3, 2, 0),
          },
        }, done);
      });
    });

    it('[KNJY] must only return events with any of the given tags when set', (done) => {
      const params = {
        tags: ['super', 'fragilistic'],
        fromTime: timestamp.now('-48h'),
      };
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 11, 3, 2, 0),
          },
        }, done);
      });
    });

    it('[QR4I] must only return events of any of the given types when set', (done) => {
      const params = {
        types: ['picture/attached', 'note/webclip'],
        state: 'all',
      };
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 12, 4, 2),
          },
        }, done);
      });
    });

    it('[TWP8] must (unofficially) support a wildcard for event types', (done) => {
      const params = {
        types: ['activity/*'],
        state: 'all',
      };
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
        });
        res.body.events.should.containEql(testData.events[8]); // activity/test
        res.body.events.should.containEql(testData.events[9]); // activity/pryv
        done();
      });
    });

    it('[7MOU] must only return events in the given time period sorted ascending when set',
      (done) => {
        const params = {
        // must also include already started but overlapping events
          fromTime: timestamp.add(testData.events[1].time, '58m'),
          toTime: testData.events[3].time,
          sortAscending: true,
        };
        request.get(basePath).query(params).end((res) => {
          validation.check(res, {
            status: 200,
            schema: methodsSchema.get.result,
            sanitizeFn: validation.sanitizeEvents,
            sanitizeTarget: 'events',
            body: {
              events: _.at(testData.events, 1, 2, 3),
            },
          }, done);
        });
      });

    it('[W5IT] must take into account fromTime and toTime even if set to 0', (done) => {
      const params = {
        fromTime: 0,
        toTime: 0,
      };
      const events = testData.events.filter((e) => e.time == 0);
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events,
          },
        }, done);
      });
    });

    it('[Y6SY] must take into account modifiedSince even if set to 0', (done) => {
      const params = {
        modifiedSince: 0,
      };

      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
        });
        res.body.events.should.not.containEql(testData.events[27]);
        done();
      });
    });

    it('[QNDP] must properly exclude period events completed before the given period', (done) => {
      const params = {
        fromTime: testData.events[1].time + testData.events[1].duration + 1,
        toTime: timestamp.add(testData.events[3].time, '-1m'),
      };
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 2),
          },
        }, done);
      });
    });

    it('[5UFW] must return ongoing events started before the given time period', (done) => {
      const params = {
        streams: [testData.streams[0].id],
        fromTime: testData.events[9].time + 1,
        toTime: timestamp.now(),
      };
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.at(testData.events, 9),
          },
        }, done);
      });
    });

    it('[S9J4] must only return events in the given paging range when set', (done) => {
      request.get(basePath).query({ state: 'all', skip: 1, limit: 3 }).end((res) => {
        const events = (validation.removeDeletionsAndHistory(testData.events)).sort((a, b) => (b.time - a.time)).slice(1, 4);
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events,
          },
        }, done);
      });
    });

    it('[915E] must return only trashed events when requested', (done) => {
      request.get(basePath).query({ state: 'trashed' }).end((res) => {
        const events = (validation.removeDeletionsAndHistory(testData.events)).sort((a, b) => (b.time - a.time));
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: { events: _.filter(events, { trashed: true }) },
        }, done);
      });
    });

    it('[6H0Z] must return all events (trashed or not) when requested', (done) => {
      request.get(basePath).query({ state: 'all', limit: 1000 }).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events: _.sortBy(validation.removeDeletionsAndHistory(testData.events), 'time')
              .reverse(),
          },
        }, done);
      });
    });

    it('[JZYF] must return only events modified since the given time when requested', (done) => {
      const params = {
        state: 'all',
        modifiedSince: timestamp.now('-45m'),
      };
      let events = validation.removeDeletionsAndHistory(testData.events).filter((e) => e.modified >= timestamp.now('-45m'));
      events = events.sort((a, b) => (b.time - a.time));
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events,
          },
        }, done);
      });
    });

    it('[B766] must include event deletions (since that time) when requested', (done) => {
      const params = {
        state: 'all',
        modifiedSince: timestamp.now('-45m'),
        includeDeletions: true,
      };
      let events = _.clone(testData.events).sort((a, b) => (b.time - a.time));
      const eventDeletions = events.filter((e) => (e.deleted && e.deleted > timestamp.now('-45m')));
      events = validation.removeDeletionsAndHistory(events).filter((e) => (e.modified >= timestamp.now('-45m')));
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events,
            eventDeletions,
          },
        }, done);
      });
    });

    it('[ESLZ] must not keep event deletions past a certain time '
        + '(cannot test because cannot force-run Mongo\'s TTL cleanup task)',
      // TODO do this test when cleanup is delegated to nightlyTask
    /* , function (done) {
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
    } */);

    it('[V72A] must only return running period event(s) when requested', (done) => {
      const params = {
        running: true,
      };
      const events = validation.removeDeletionsAndHistory(testData.events).filter((e) => (typeof e.duration !== 'undefined') && e.duration === null).sort((a, b) => b.time - a.time);
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          sanitizeFn: validation.sanitizeEvents,
          sanitizeTarget: 'events',
          body: {
            events,
          },
        }, done);
      });
    });

    it('[68IL] must return an error if no access token is provided', (done) => {
      commonTests.checkAccessTokenAuthentication(server.url, basePath, done);
    });
  });

  describe('GET /<event id>/<file id>', () => {
    before(resetEvents);

    it('[F29M] must return the attached file with the correct headers', (done) => {
      const event = testData.events[0];
      const attachment = event.attachments[0];

      request.get(`${path(event.id)}/${attachment.id}`).end((res) => {
        res.statusCode.should.eql(200);

        res.headers.should.have.property('content-type', attachment.type);
        res.headers.should.have.property('content-length', attachment.size.toString());

        done();
      });
    });

    it('[PP6G] must return readToken in attachments', (done) => {
      const event = testData.events[0];

      request.get(`${path(event.id)}/`).end((res) => {
        res.statusCode.should.eql(200);
        res.body.event.should.have.property('attachments');
        res.body.event.attachments.forEach((attachment) => {
          attachment.should.have.property('readToken');
        });

        done();
      });
    });

    it('[NL65] must accept a secure read token in the query string instead of the `"Authorization" header',
      (done) => {
        const event = testData.events[0];
        const attIndex = 0;
        async.waterfall([
          function retrieveAttachmentInfo(stepDone) {
            request.get(basePath).query({ sortAscending: true, streams: event.streamIds[0] }).end((res) => {
              stepDone(null, res.body.events[0].attachments[attIndex]);
            });
          },
          function retrieveAttachedFile(att, stepDone) {
            request.get(`${path(event.id)}/${att.id}`)
              .unset('Authorization')
              .query({ readToken: att.readToken })
              .end((res) => {
                res.statusCode.should.eql(200);

                res.headers.should.have.property('content-type', att.type);
                res.headers.should.have.property('content-length', att.size.toString());

                stepDone();
              });
          },
        ], done);
      });

    it('[TN27] must allow a filename path suffix after the file id', (done) => {
      const event = testData.events[0];
      const attIndex = 1;
      async.waterfall([
        function retrieveAttachmentInfo(stepDone) {
          request.get(basePath).query({ sortAscending: true, streams: event.streamIds[0] }).end((res) => {
            stepDone(null, res.body.events[0].attachments[attIndex]);
          });
        },
        function retrieveAttachedFile(att, stepDone) {
          request.get(`${path(event.id)}/${att.id}/${att.fileName}`)
            .unset('Authorization')
            .query({ readToken: att.readToken })
            .end((res) => {
              res.statusCode.should.eql(200);

              res.headers.should.have.property('content-type', att.type);
              res.headers.should.have.property('content-length', att.size.toString());

              stepDone();
            });
        },
      ], done);
    });

    it('[LOUB] must allow any filename (including special characters)', (done) => {
      const event = testData.events[0];
      const attIndex = 1;
      async.waterfall(
        [
          function retrieveAttachmentInfo(stepDone) {
            request
              .get(`/${user.username}/events/${event.id}`)
              .query({ sortAscending: true, streams: [event.streamId] })
              .end((res) => {
                stepDone(null, res.body.event.attachments[attIndex]);
              });
          },
          function retrieveAttachedFile(att, stepDone) {
            request
              .get(
                `${path(event.id)
                }/${
                  att.id
                }/1Q84%20%28Livre%201%20-%20Avril-juin%29%20-%20Murakami%2CHaruki.mobi`,
              )
              .unset('Authorization')
              .query({ readToken: att.readToken })
              .end((res) => {
                res.statusCode.should.eql(200);
                stepDone();
              });
          },
        ],
        done,
      );
    });

    it('[9NJ0] must refuse an invalid file read token', (done) => {
      const event = testData.events[0];
      request.get(`${path(event.id)}/${event.attachments[0].id}`)
        .unset('Authorization')
        .query({ readToken: `${access.id}-Bad-HMAC` })
        .end((res) => {
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidAccessToken,
          }, done);
        });
    });

    it('[9HNM] must refuse auth via the regular "auth" query string parameter', (done) => {
      const event = testData.events[0];
      request.get(`${path(event.id)}/${event.attachments[0].id}`)
        .unset('Authorization')
        .query({ auth: access.token })
        .end((res) => {
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidAccessToken,
          }, done);
        });
    });

    it('[MMCZ] must return a proper error if trying to get an unknown attachment', (done) => {
      const event = testData.events[0];
      request.get(`${path(event.id)}/unknown-file-id`).end((res) => {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource,
        }, done);
      });
    });
  });

  describe('POST /', () => {
    beforeEach(resetEvents);

    it('[1GR6] must create an event with the sent data, returning it', (done) => {
      const data = {
        time: timestamp.fromDate('2012-03-22T10:00'),
        duration: timestamp.duration('55m'),
        type: 'temperature/celsius',
        content: 36.7,
        streamIds: [testData.streams[0].id],
        tags: [' patapoumpoum ', '   ', ''], // must trim and ignore empty tags
        description: 'Test description',
        clientData: {
          testClientDataField: 'testValue',
        },
        // check if properly ignored
        created: timestamp.now('-1h'),
        createdBy: 'should-be-ignored',
        modified: timestamp.now('-1h'),
        modifiedBy: 'should-be-ignored',
      };
      let originalCount;
      let createdEventId;
      let created;

      async.series([
        function countInitialEvents(stepDone) {
          storage.countAll(user, (err, count) => {
            originalCount = count;
            stepDone();
          });
        },
        function addNewEvent(stepDone) {
          request.post(basePath).send(data).end((res) => {
            validation.check(res, {
              status: 201,
              schema: methodsSchema.create.result,
            });
            created = timestamp.now();
            createdEventId = res.body.event.id;
            eventsNotifCount.should.eql(1, 'events notifications');
            stepDone();
          });
        },
        function verifyEventData(stepDone) {
          storage.find(user, {}, null, (err, events) => {
            events.length.should.eql(originalCount + 1, 'events');

            const expected = _.clone(data);
            expected.streamId = expected.streamIds[0];
            expected.id = createdEventId;
            expected.tags = ['patapoumpoum'];
            expected.created = expected.modified = created;
            expected.createdBy = expected.modifiedBy = access.id;
            const actual = _.find(events, (event) => event.id === createdEventId);
            actual.streamId = actual.streamIds[0];
            validation.checkStoredItem(actual, 'event');
            validation.checkObjectEquality(actual, expected);

            stepDone();
          });
        },
      ], done);
    });

    it('[QSBV] must set the event\'s time to "now" if missing', (done) => {
      const data = {
        streamIds: [testData.streams[2].id],
        type: 'mass/kg',
        content: 10.7,
      };
      request.post(basePath).send(data).end((res) => {
        const expectedTimestamp = timestamp.now();

        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result,
        });

        // allow 1 second of lag
        res.body.event.time.should.be.within(expectedTimestamp - 1, expectedTimestamp);

        done();
      });
    });

    it('[6BVW] must accept explicit null for optional fields', (done) => {
      const data = {
        type: 'test/null',
        streamIds: [testData.streams[2].id],
        duration: null,
        content: null,
        description: null,
        clientData: null,
        tags: null,
        trashed: null,
      };
      request.post(basePath).send(data).end((res) => {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result,
        }, done);
      });
    });

    it('[D2TH] must refuse events with no stream id', (done) => {
      request.post(basePath).send({ type: testType }).end((res) => {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[WN86] must return a correct error if an event with the same id already exists', (done) => {
      const data = {
        id: testData.events[0].id,
        streamIds: [testData.streams[2].id],
        type: 'test/test',
      };
      request.post(basePath).send(data).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: { id: data.id },
        }, done);
      });
    });

    it('[94PW] must not allow reuse of deleted ids (unlike streams)', (done) => {
      const data = {
        id: testData.events[13].id, // existing deletion
        streamIds: [testData.streams[2].id],
        type: 'test/test',
      };
      request.post(basePath).send(data).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: { id: data.id },
        }, done);
      });
    });

    it('[DRFA] must only allow ids that are formatted like cuids', (done) => {
      const data = {
        id: 'man, this is a baaad id',
        streamIds: [testData.streams[2].id],
        type: 'test/test',
      };
      request.post(basePath).send(data).end((res) => {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[O7Y2] must reject tags that are too long', (done) => {
      const bigTag = new Array(600).join('a');
      const data = {
        streamIds: [testData.streams[2].id],
        type: 'generic/count',
        content: 1,
        tags: [bigTag],
      };
      request.post(basePath).send(data).end((res) => {
        validation.check(res, {
          status: 400,
          id: ErrorIds.invalidParametersFormat,
          data: bigTag,
        }, done);
      });
    });

    it('[2885] must fix the tags to an empty array if not set', (done) => {
      const data = { streamId: testData.streams[1].id, type: testType };

      request.post(basePath).send(data).end((res) => {
        should(res.statusCode).be.eql(201);

        const createdEvent = res.body.event;
        createdEvent.should.have.property('tags');
        createdEvent.tags.should.eql([]);

        done();
      });
    });

    it('[0IHM] must try casting string event content to number if appropriate', (done) => {
      const data = {
        streamId: testData.streams[2].id,
        type: 'mass/kg',
        content: '75.3',
      };
      request.post(basePath).send(data).end((res) => {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result,
        });

        res.body.event.content.should.equal(+data.content);

        done();
      });
    });

    it.skip('[H7CN] must not stop the running period event if the new event is a mark event (single activity)',
      (done) => {
        const data = { streamIds: [testData.streams[0].id], type: testType };
        async.series([
          function addNew(stepDone) {
            request.post(basePath).send(data).end((res) => {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result,
              }, stepDone);
            });
          },
          function verifyData(stepDone) {
            storage.findAll(user, null, (err, events) => {
              const expected = testData.events[9];
              const actual = _.find(events, (event) => event.id === expected.id);
              actual.should.eql(expected);

              stepDone();
            });
          },
        ], done);
      });

    it('[UL6Y] must not stop the running period event if the stream allows overlapping', (done) => {
      const data = {
        streamIds: [testData.streams[1].id],
        duration: timestamp.duration('1h'),
        type: testType,
        tags: [],
      };
      async.series([
        function addNew(stepDone) {
          request.post(basePath).send(data).end((res) => {
            should.not.exist(res.body.stoppedId);
            validation.check(res, {
              status: 201,
              schema: methodsSchema.create.result,
            }, stepDone);
          });
        },
        function verifyData(stepDone) {
          storage.findOne(user, { id: testData.events[11].id }, null, (err, event) => {
            // HERE
            event.should.eql(testData.events[11]);
            stepDone();
          });
        },
      ], done);
    });

    it('[FZ4T] must validate the event\'s content if its type is known', (done) => {
      const data = {
        streamIds: [testData.streams[1].id],
        type: 'note/webclip',
        content: {
          url: 'bad-url',
          content: '<p>昔者莊周夢為蝴蝶，栩栩然蝴蝶也，自喻適志與，不知周也。'
              + '俄然覺，則蘧蘧然周也。不知周之夢為蝴蝶與，蝴蝶之夢為周與？周與蝴蝶則必有分矣。'
              + '此之謂物化。</p>',
        },
      };
      request.post(basePath).send(data).end((res) => {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    // cf. GH issue #42
    it('[EL88] must not fail when validating the content if passing a string instead of an object',
      (done) => {
        const data = {
          streamIds: [testData.streams[1].id],
          type: 'note/webclip',
          content: 'This should be an object',
        };
        request.post(basePath).send(data).end((res) => {
          validation.checkErrorInvalidParams(res, done);
        });
      });

    it('[JUM6] must return an error if the sent data is badly formatted', (done) => {
      request.post(basePath).send({ badProperty: 'bad value' }).end((res) => {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[5NEL] must return an error if the associated stream is unknown', (done) => {
      const data = {
        time: timestamp.fromDate('2012-03-22T10:00'),
        type: testType,
        streamIds: ['unknown-stream-id'],
      };
      request.post(basePath).send(data).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: { streamIds: data.streamIds },
        }, done);
      });
    });

    it.skip('[1GGK] must return an error if the event\'s period overlaps existing periods (single activity)',
      (done) => {
        const data = {
          time: timestamp.add(testData.events[1].time, '15m'),
          duration: timestamp.duration('5h30m'),
          type: testType,
          streamIds: [testData.streams[0].id],
        };
        request.post(basePath).send(data).end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.PeriodsOverlap,
            data: {
              overlappedIds: [
                testData.events[1].id,
                testData.events[3].id,
              ],
            },
          }, done);
        });
      });

    it('[3S2T] must allow the event\'s period overlapping existing periods when the stream allows it',
      (done) => {
        const data = {
          streamIds: [testData.streams[1].id],
          time: timestamp.add(testData.events[11].time, '-15m'),
          duration: timestamp.duration('5h30m'),
          type: testType,
        };
        request.post(basePath).send(data).end((res) => {
          validation.check(res, {
            status: 201,
            schema: methodsSchema.create.result,
          }, done);
        });
      });

    it('[Q0L6] must return an error if the assigned stream is trashed', (done) => {
      const data = {
        type: testType,
        streamIds: [testData.streams[3].id],
      };
      request.post(basePath).send(data).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation,
          data: { trashedReference: 'streamIds' },
        }, done);
      });
    });

    it('[WUSC] must not fail (500) when sending an array instead of an object', (done) => {
      request.post(basePath).send([{}]).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidParametersFormat,
        }, done);
      });
    });
  });

  describe.skip('POST /start', () => {
    beforeEach(resetEvents);

    const path = `${basePath}/start`;

    it('[5C8J] must create a running period event stopping any previously running event (single activity)',
      (done) => {
        const data = {
        // 15 minutes ago to make sure the previous duration is set accordingly
          time: timestamp.now('-15m'),
          type: testType,
          streamIds: [testData.streams[0].id],
          tags: ['houba'],
        };
        let createdId;

        async.series([
          function addNewEvent(stepDone) {
            request.post(path).send(data).end((res) => {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result,
              });
              createdId = res.body.event.id;
              res.body.stoppedId.should.eql(testData.events[9].id);
              eventsNotifCount.should.eql(1, 'events notifications');
              stepDone();
            });
          },
          function verifyEventData(stepDone) {
            storage.findAll(user, null, (err, events) => {
              const expected = _.clone(data);
              expected.id = createdId;
              expected.duration = null;
              const actual = _.find(events, (event) => event.id === createdId);
              validation.checkStoredItem(actual, 'event');
              validation.checkObjectEquality(actual, expected);

              const previous = _.find(events, (event) => event.id === testData.events[9].id);
              const expectedDuration = data.time - previous.time;
              // allow 1 second of lag
              previous.duration.should.be.within(expectedDuration - 1, expectedDuration);

              stepDone();
            });
          },
        ],
        done);
      });

    it('[JHUM] must return an error if a period event already exists later (single activity)',
      (done) => {
        const data = {
          time: timestamp.now('-1h05m'),
          type: testType,
          streamIds: [testData.streams[0].id],
        };
        request.post(path).send(data).end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.InvalidOperation,
            data: { conflictingEventId: testData.events[9].id },
          }, done);
        });
      });

    it('[7FJZ] must allow starting an event before an existing period when the stream allows overlapping',
      (done) => {
        const data = {
          streamIds: [testData.streams[1].id],
          time: timestamp.add(testData.events[11].time, '-15m'),
          type: testType,
        };
        request.post(`${basePath}/start`).send(data)
          .end((res) => {
            validation.check(res, {
              status: 201,
              schema: methodsSchema.create.result,
            }, done);
          });
      });
  });

  describe('POST / (multipart content)', () => {
    beforeEach(resetEvents);

    it('[4CUV] must create a new event with the uploaded files', (done) => {
      const data = {
        time: timestamp.now(),
        type: 'wisdom/test',
        content: {
          chapterOne: '道 可 道 非 常 道...',
        },
        streamIds: [testData.streams[0].id],
        tags: ['houba'],
      };
      request.post(basePath)
        .field('event', JSON.stringify(data))
        .attach('document', testData.attachments.document.path,
          testData.attachments.document.filename)
        .attach('image', testData.attachments.image.path,
          testData.attachments.image.filename)
        .end((res) => {
          validation.check(res, {
            status: 201,
            schema: methodsSchema.create.result,
          });

          const createdEvent = res.body.event;
          validation.checkFilesReadToken(createdEvent, access, filesReadTokenSecret);
          validation.sanitizeEvent(createdEvent);

          const expected = _.extend({
            id: createdEvent.id,
            attachments: [
              {
                id: createdEvent.attachments[0].id,
                fileName: testData.attachments.document.filename,
                type: testData.attachments.document.type,
                size: testData.attachments.document.size,
              },
              {
                id: createdEvent.attachments[1].id,
                fileName: testData.attachments.image.filename,
                type: testData.attachments.image.type,
                size: testData.attachments.image.size,
              },
            ],
            streamIds: data.streamIds,
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

    it('[HROI] must properly handle part names containing special chars (e.g. ".", "$")', (done) => {
      const data = {
        time: timestamp.now(),
        type: 'wisdom/test',
        content: {
          principles: '三頂三圓三虛。。。',
        },
        streamIds: [testData.streams[0].id],
        tags: ['bagua'],
      };

      request.post(basePath)
        .field('event', JSON.stringify(data))
        .attach('$name.with:special-chars/',
          fs.createReadStream(testData.attachments.document.path),
          { filename: 'file.name.with.many.dots.pdf' })
        .end((res) => {
          validation.check(res, {
            status: 201,
            schema: methodsSchema.create.result,
          });

          const createdEvent = validation.sanitizeEvent(res.body.event);
          const expected = _.extend({
            id: createdEvent.id,
            attachments: [
              {
                id: createdEvent.attachments[0].id,
                fileName: 'file.name.with.many.dots.pdf',
                type: testData.attachments.document.type,
                size: testData.attachments.document.size,
              },
            ],
            streamIds: [data.streamIds[0]],
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

    it('[0QGV] must return an error if the non-file content part is not JSON', (done) => {
      request.post(basePath)
        .field('event', '<bad>data</bad>')
        .attach('file', testData.attachments.text.path, testData.attachments.text.fileName)
        .end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.InvalidRequestStructure,
          }, done);
        });
    });

    it('[R8ER] must return an error if there is more than one non-file content part', (done) => {
      request.post(basePath)
        .field('event',
          JSON.stringify({ streamIds: [testData.streams[0].id], type: testType }))
        .field('badPart', 'text')
        .end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.InvalidRequestStructure,
          }, done);
        });
    });
  });

  describe('POST /<event id> (multipart content)', () => {
    beforeEach(resetEvents);

    it('[ZI01] must add the uploaded files to the event as attachments', (done) => {
      const event = testData.events[1];
      let time;

      request.post(path(event.id))
        .attach('image', testData.attachments.image.path,
          testData.attachments.image.fileName)
        .attach('text', testData.attachments.text.path,
          testData.attachments.text.fileName)
        .end((res) => {
          time = timestamp.now();
          validation.check(res, {
            status: 200,
            schema: methodsSchema.update.result,
          });

          const updatedEvent = res.body.event;
          validation.checkFilesReadToken(updatedEvent, access, filesReadTokenSecret);
          validation.sanitizeEvent(updatedEvent);

          const updatedEventAttachments = {};
          updatedEvent.attachments.forEach((attachment) => {
            updatedEventAttachments[attachment.fileName] = attachment;
          });

          let expected = {};
          expected.attachments = [];
          updatedEvent.attachments.forEach((attachment) => {
            if (attachment.fileName === testData.attachments.image.filename) {
              expected.attachments.push(
                {
                  id: attachment.id,
                  fileName: testData.attachments.image.filename,
                  type: testData.attachments.image.type,
                  size: testData.attachments.image.size,
                },
              );
            }
            if (attachment.fileName === testData.attachments.text.filename) {
              expected.attachments.push(
                {
                  id: attachment.id,
                  fileName: testData.attachments.text.filename,
                  type: testData.attachments.text.type,
                  size: testData.attachments.text.size,
                },
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

    it('[EUZM] must add the uploaded files to the event without replacing existing attachments',
      (done) => {
        const event = testData.events[0];

        request
          .post(path(event.id))
          .attach('text',
            testData.attachments.text.path,
            testData.attachments.text.fileName)
          .end((res) => {
            validation.check(res, {
              status: 200,
              schema: methodsSchema.update.result,
            });

            const updatedEvent = validation.sanitizeEvent(res.body.event);
            const expectedAttachments = event.attachments.slice();
            expectedAttachments.push({
              id: updatedEvent.attachments[updatedEvent.attachments.length - 1].id,
              fileName: testData.attachments.text.filename,
              type: testData.attachments.text.type,
              size: testData.attachments.text.size,
            });

            const { attachments } = updatedEvent;
            should(attachments.length).be.eql(expectedAttachments.length);

            attachments.should.eql(expectedAttachments);

            attachmentsCheck.compareTestAndAttachedFiles(user, event.id,
              attachments[attachments.length - 1].id,
              testData.attachments.text.filename).should.equal('');

            eventsNotifCount.should.eql(1, 'events notifications');

            done();
          });
      });
  });

  describe('GET /<id>', () => {
    beforeEach(resetEvents);

    it('[8GSS] allows access at level=read', async () => {
      const request = supertest(server.url);
      const access = _.find(testData.accesses, (v) => v.id === 'a_2');
      const event = testData.events[0];

      const response = await request.get(path(event.id))
        .set('authorization', access.token);

      assert.isTrue(response.ok);
      assert.strictEqual(response.body.event.id, event.id);
    });
    it('[IBO4] denies access without authorization', async () => {
      const request = supertest(server.url);
      const event = testData.events[0];

      const response = await request
        .get(path(event.id));

      assert.strictEqual(response.status, 401);
    });
  });

  describe('PUT /<id>', () => {
    beforeEach(resetEvents);

    it('[4QRU] must modify the event with the sent data', (done) => {
      const original = testData.events[0];
      let time;
      const data = {
        time: timestamp.add(original.time, '-15m'),
        duration: timestamp.add(original.duration, '15m'),
        type: testType,
        content: 'test',
        streamIds: [testData.streams[0].children[0].id],
        tags: [' yippiya ', ' ', ''], // must trim and ignore empty tags
        description: 'New description',
        clientData: {
          clientField: 'client value',
        },
      };
      async.series([
        function update(stepDone) {
          request.put(path(original.id)).send(data).end((res) => {
            time = timestamp.now();
            validation.check(res, {
              status: 200,
              schema: methodsSchema.update.result,
            });

            validation.checkFilesReadToken(res.body.event, access, filesReadTokenSecret);
            validation.sanitizeEvent(res.body.event);

            const expected = _.clone(data);
            expected.id = original.id;
            expected.tags = ['yippiya'];
            expected.modified = time;
            expected.modifiedBy = access.id;
            expected.attachments = original.attachments;
            expected.streamIds = data.streamIds;
            validation.checkObjectEquality(res.body.event, expected);

            eventsNotifCount.should.eql(1, 'events notifications');
            stepDone();
          });
        },
        function verifyStoredItem(stepDone) {
          storage.database.findOne(storage.getCollectionInfo(user), { _id: original.id }, {},
            (err, dbEvent) => {
              dbEvent.endTime.should.eql(data.time + data.duration);
              stepDone();
            });
        },
      ], done);
    });

    it('[6B05] must add/update/remove the specified client data fields without touching the others',
      (done) => {
        const original = testData.events[1];
        let time;
        const data = {
          clientData: {
            booleanProp: true, // add
            stringProp: 'Where Art Thou?', // update
            numberProp: null, // delete
          },
        };

        request.put(path(original.id)).send(data).end((res) => {
        // BUG Depending on when we do this inside any given second, by the time
        // we call timestamp.now here, we already have a different second than
        // we had when we made the request. -> Random test success.
          time = timestamp.now();
          validation.check(res, {
            status: 200,
            schema: methodsSchema.update.result,
          });

          should(res.body.event.modified).be.approximately(time, 2);
          const expected = _.clone(original);
          delete expected.modified;
          expected.modifiedBy = access.id;
          expected.streamId = expected.streamIds[0];
          _.extend(expected.clientData, data.clientData);
          delete expected.clientData.numberProp;
          validation.checkObjectEquality(res.body.event, expected);

          eventsNotifCount.should.eql(1, 'events notifications');
          done();
        });
      });

    it.skip('[C9GL] must return the id of the stopped previously running event if any (single activity)',
      (done) => {
        request.put(path(testData.events[3].id)).send({ time: timestamp.now() })
          .end((res) => {
            validation.check(res, {
              status: 200,
              schema: methodsSchema.update.result,
            });
            res.body.stoppedId.should.eql(testData.events[9].id);
            eventsNotifCount.should.eql(1, 'events notifications');
            done();
          });
      });

    it('[FM3G] must accept explicit null for optional fields', (done) => {
      const data = {
        type: 'test/null',
        duration: null,
        content: null,
        description: null,
        clientData: null,
        tags: null,
        trashed: null,
      };
      request.put(path(testData.events[10].id)).send(data)
        .end((res) => {
          validation.check(res, {
            status: 200,
            schema: methodsSchema.update.result,
          }, done);
        });
    });

    it('[BS75] must validate the event\'s content if its type is known', (done) => {
      const data = {
        type: 'position/wgs84',
        content: {
          latitude: 'bad-value',
          longitude: false,
        },
      };
      request.put(path(testData.events[2].id)).send(data).end((res) => {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[FU83] must return an error if the event does not exist', (done) => {
      request.put(path('unknown-id')).send({ time: timestamp.now() }).end((res) => {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource,
        }, done);
      });
    });

    it('[W2QL] must return an error if the sent data is badly formatted', (done) => {
      request.put(path(testData.events[3].id)).send({ badProperty: 'bad value' })
        .end((res) => {
          validation.checkErrorInvalidParams(res, done);
        });
    });

    it('[01B2] must return an error if the associated stream is unknown', (done) => {
      request.put(path(testData.events[3].id)).send({ streamIds: ['unknown-stream-id'] })
        .end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.UnknownReferencedResource,
            data: { streamIds: ['unknown-stream-id'] },
          }, done);
        });
    });

    it.skip('[SPN1] must return an error if moving a running period event before another existing '
        + 'period event (single activity)', (done) => {
      const data = { time: timestamp.add(testData.events[3].time, '-5m') };
      request.put(path(testData.events[9].id)).send(data).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation,
          data: { conflictingEventId: testData.events[3].id },
        }, done);
      });
    });

    it.skip('[FPEE] must return an error if the event\'s new period overlaps other events\'s (single activity)',
      (done) => {
        request.put(path(testData.events[1].id)).send({ duration: timestamp.duration('5h') })
          .end((res) => {
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.PeriodsOverlap,
              data: { overlappedIds: [testData.events[3].id] },
            }, done);
          });
      });

    describe('forbidden updates of protected fields', () => {
      const event = {
        type: 'note/txt',
        content: 'forbidden event update test',
        streamId: testData.streams[0].id,
      };
      let eventId;

      beforeEach((done) => {
        request.post(basePath).send(event).end((res) => {
          validation.check(res, {
            status: 201,
            schema: methodsSchema.create.result,
          });
          eventId = res.body.event.id;
          done();
        });
      });

      it('[L15U] must prevent update of protected fields and throw a forbidden error in strict mode',
        (done) => {
          const forbiddenUpdate = {
            id: 'forbidden',
            attachments: [],
            created: 1,
            createdBy: 'bob',
            modified: 1,
            modifiedBy: 'alice',
          };

          async.series([
            function instanciateServerWithStrictMode(stepDone) {
              setIgnoreProtectedFieldUpdates(false, stepDone);
            },
            function testForbiddenUpdate(stepDone) {
              request.put(path(eventId)).send(forbiddenUpdate)
                .end((res) => {
                  validation.checkError(res, {
                    status: 403,
                    id: ErrorIds.Forbidden,
                  }, stepDone);
                });
            },
          ], done);
        });

      it('[6NZ7] must prevent update of protected fields and log a warning in non-strict mode',
        (done) => {
          const forbiddenUpdate = {
            id: 'forbidden',
            attachments: [],
            created: 1,
            createdBy: 'bob',
            modified: 1,
            modifiedBy: 'alice',
          };
          async.series([
            function instanciateServerWithNonStrictMode(stepDone) {
              setIgnoreProtectedFieldUpdates(true, stepDone);
            },
            function testForbiddenUpdate(stepDone) {
              request.put(path(eventId)).send(forbiddenUpdate)
                .end((res) => {
                  validation.check(res, {
                    status: 200,
                    schema: methodsSchema.update.result,
                  });
                  const update = res.body.event;
                  should(update.id).not.be.equal(forbiddenUpdate.id);
                  should(update.created).not.be.equal(forbiddenUpdate.created);
                  should(update.createdBy).not.be.equal(forbiddenUpdate.createdBy);
                  should(update.modified).not.be.equal(forbiddenUpdate.modified);
                  should(update.modifiedBy).not.be.equal(forbiddenUpdate.modifiedBy);
                  stepDone();
                });
            },
          ], done);
        });

      function setIgnoreProtectedFieldUpdates(activated, stepDone) {
        const settings = _.cloneDeep(helpers.dependencies.settings);
        settings.updates.ignoreProtectedFields = activated;
        server.ensureStarted.call(server, settings, stepDone);
      }
    });

    it('[CUM3] must reject tags that are too long', (done) => {
      const bigTag = new Array(600).join('a');

      request.put(path(testData.events[1].id)).send({ tags: [bigTag] })
        .end((res) => {
          validation.check(res, {
            status: 400,
            id: ErrorIds.InvalidParametersFormat,
            data: bigTag,
          }, done);
        });
    });
  });

  // Fixes #208
  describe('PUT HF/non-HF events', () => {
    const streamId = testData.streams[0].id;
    const normalEvent = { streamIds: [streamId], type: 'activity/plain' };
    const hfEvent = { streamIds: [streamId], type: 'series:activity/plain' };
    let normalEventId;
    let hfEventId;
    const isOpenSource = helpers.dependencies.settings.openSource.isActive;

    before(function (done) {
      if (isOpenSource) {
        this.skip();
        return done();
      }
      async.parallel([
        function createNormalEvent(stepDone) {
          request.post(basePath).send(normalEvent).end((res) => {
            should.exist(res.status);
            should(res.status).be.eql(201);

            should.exist(res.body.event.id);
            normalEventId = res.body.event.id;

            stepDone();
          });
        },
        function createHfEvent(stepDone) {
          request.post(basePath).send(hfEvent).end((res) => {
            should.exist(res.status);
            should(res.status).be.eql(201);

            should.exist(res.body.event.id);
            hfEventId = res.body.event.id;

            stepDone();
          });
        },
      ], done);
    });

    it('[Z7R1] a normal event should not be updated to an hf-event', (done) => {
      request.put(path(normalEventId)).send(hfEvent).end((res) => {
        should.exist(res.status);
        should(res.status).be.eql(400);

        should.exist(res.body.error.id);
        should(res.body.error.id).be.eql('invalid-operation');

        done();
      });
    });

    it('[Z7R2] An hf-event should not be updated to a normal event', (done) => {
      request.put(path(hfEventId)).send(normalEvent).end((res) => {
        should.exist(res.status);
        should(res.status).be.eql(400);

        should.exist(res.body.error.id);
        should(res.body.error.id).be.eql('invalid-operation');

        done();
      });
    });
  });

  describe.skip('POST /stop', () => {
    beforeEach(resetEvents);

    const path = `${basePath}/stop`;

    it('[VE5N] must stop the previously running period event, returning its id (single activity)',
      (done) => {
        const stopTime = timestamp.now('-5m');
        const stoppedEvent = testData.events[9];
        let time;

        async.series([
          function stop(stepDone) {
            const data = {
              streamIds: [testData.streams[0].id],
              time: stopTime,
            };
            request.post(path).send(data).end((res) => {
              time = timestamp.now();
              validation.check(res, {
                status: 200,
                schema: methodsSchema.stop.result,
              });
              res.body.stoppedId.should.eql(stoppedEvent.id);
              eventsNotifCount.should.eql(1, 'events notifications');
              stepDone();
            });
          },
          function verifyStoredItem(stepDone) {
            storage.database.findOne(storage.getCollectionInfo(user), { _id: stoppedEvent.id }, {},
              (err, dbEvent) => {
                const expectedDuration = stopTime - dbEvent.time;
                // allow 1 second of lag
                dbEvent.duration.should.be.within(expectedDuration - 1, expectedDuration);
                dbEvent.modified.should.be.within(time - 1, time);
                dbEvent.modifiedBy.should.eql(access.id);
                dbEvent.endTime.should.eql(dbEvent.time + dbEvent.duration);
                stepDone();
              });
          },
        ], done);
      });

    it('[HYQ3] must stop the last running event of the given type when specified', (done) => {
      const stoppedEvent = testData.events[11];
      let stopTime;
      async.series([
        function addOtherRunning(stepDone) {
          const data = {
            streamIds: [stoppedEvent.streamId],
            type: testType,
          };
          request.post(`${basePath}/start`).send(data)
            .end((res) => {
              res.statusCode.should.eql(201);
              stepDone();
            });
        },
        function (stepDone) {
          const data = {
            streamIds: [stoppedEvent.streamId],
            type: stoppedEvent.type,
          };
          request.post(`${basePath}/stop`).send(data).end((res) => {
            stopTime = timestamp.now();
            validation.check(res, {
              status: 200,
              schema: methodsSchema.stop.result,
            });
            res.body.stoppedId.should.eql(stoppedEvent.id);
            stepDone();
          });
        },
        function verifyStoredItem(stepDone) {
          storage.database.findOne(storage.getCollectionInfo(user), { _id: stoppedEvent.id }, {},
            (err, dbEvent) => {
              const expectedDuration = stopTime - dbEvent.time;
              // allow 1 second of lag
              dbEvent.duration.should.be.within(expectedDuration - 1, expectedDuration);
              stepDone();
            });
        },
      ], done);
    });

    it('[7NH0] must accept an `id` param to specify the event to stop', (done) => {
      async.series([
        function addOtherRunning(stepDone) {
          const data = {
            streamIds: [testData.streams[1].children[0].id],
            type: testType,
          };
          request.post(`${basePath}/start`).send(data)
            .end((res) => {
              res.statusCode.should.eql(201);
              stepDone();
            });
        },
        function (stepDone) {
          const data = { id: testData.events[11].id };
          request.post(`${basePath}/stop`).send(data)
            .end((res) => {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.stop.result,
              });
              res.body.stoppedId.should.eql(data.id);
              stepDone();
            });
        },
      ], done);
    });

    it('[GPSM] must return an error if the specified event does not exist', (done) => {
      const data = { id: 'unknown' };
      request.post(`${basePath}/stop`).send(data)
        .end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.UnknownReferencedResource,
            data: { id: 'unknown' },
          }, done);
        });
    });

    it('[0Y4J] must return an error if the specified event is not running', (done) => {
      const data = { id: testData.events[6].id };
      request.post(`${basePath}/stop`).send(data)
        .end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.InvalidOperation,
          }, done);
        });
    });

    it('[KN22] must return an error if no event is specified and the stream allows overlapping',
      (done) => {
        const data = { streamIds: [testData.streams[1].id] };
        request.post(`${basePath}/stop`).send(data).end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.InvalidParametersFormat,
          }, done);
        });
      });

    it('[BMC6] must return an error if neither stream nor event is specified', (done) => {
      request.post(`${basePath}/stop`).send({}).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidParametersFormat,
        }, done);
      });
    });
  });

  describe('DELETE /<event id>/<file id>', () => {
    beforeEach(resetEvents);

    it('[RW8M] must delete the attachment (reference in event + file)', (done) => {
      const event = testData.events[0];
      const fPath = `${path(event.id)}/${event.attachments[0].id}`;
      request.del(fPath).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result,
        });

        const updatedEvent = res.body.event;
        validation.checkFilesReadToken(updatedEvent, access, filesReadTokenSecret);
        validation.sanitizeEvent(updatedEvent);
        const expected = _.clone(testData.events[0]);
        expected.attachments = expected.attachments.slice();
        // NOTE We cannot be sure that we still are at the exact same second that
        // we were just now when we did the call. So don't use time here, test
        // for time delta below.
        delete expected.modified;
        expected.modifiedBy = access.id;
        expected.attachments.shift();
        validation.checkObjectEquality(updatedEvent, expected);

        const time = timestamp.now();
        should(updatedEvent.modified).be.approximately(time, 2);

        const filePath = eventFilesStorage.getAttachedFilePath(user, event.id,
          event.attachments[0].id);
        fs.existsSync(filePath).should.eql(false, 'deleted file existence');

        eventsNotifCount.should.eql(1, 'events notifications');

        done();
      });
    });

    it('[ZLZN] must return an error if not existing', (done) => {
      request.del(`${path(testData.events[0].id)}/unknown.file`).end((res) => {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource,
        }, done);
      });
    });
  });

  describe('DELETE /<id>', () => {
    beforeEach(resetEvents);

    it('[AT5Y] must flag the event as trashed', (done) => {
      const { id } = testData.events[0];
      let time;

      request.del(path(id)).end((res) => {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.del.result,
        });

        const trashedEvent = res.body.event;
        trashedEvent.trashed.should.eql(true);
        trashedEvent.modified.should.be.within(time - 1, time);
        trashedEvent.modifiedBy.should.eql(access.id);
        validation.checkFilesReadToken(trashedEvent, access, filesReadTokenSecret);

        eventsNotifCount.should.eql(1, 'events notifications');
        done();
      });
    });

    it('[73CD] must delete the event when already trashed including all its attachments', (done) => {
      const { id } = testData.events[0];
      let deletionTime;

      async.series([
	  storage.updateOne.bind(storage, user, { id }, { trashed: true }),
        function deleteEvent(stepDone) {
          request.del(path(id)).end((res) => {
            deletionTime = timestamp.now();

            validation.check(res, {
              status: 200,
              schema: methodsSchema.del.result,
            });
            res.body.eventDeletion.should.eql({ id });
            eventsNotifCount.should.eql(1, 'events notifications');
            stepDone();
          });
        },
        function verifyEventData(stepDone) {
          storage.findAll(user, null, (err, events) => {
            events.length.should.eql(testData.events.length, 'events');

            const deletion = _.find(events, (event) => event.id === id);
            should.exist(deletion);
            validation.checkObjectEquality(deletion, { id, deleted: deletionTime });

            const dirPath = eventFilesStorage.getAttachedFilePath(user, id);
            fs.existsSync(dirPath).should.eql(false, 'deleted event directory existence');

            stepDone();
          });
        },
      ],
      done);
    });
  });

  function resetEvents(done) {
    eventsNotifCount = 0;
    async.series([
      testData.resetEvents,
      testData.resetAttachments,
    ], done);
  }
});
