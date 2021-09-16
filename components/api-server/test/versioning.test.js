/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, after, it */

const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const async = require('async');
const validation = helpers.validation;
const eventsMethodsSchema = require('../src/schema/eventsMethods');
const streamsMethodsSchema = require('../src/schema/streamsMethods');
const should = require('should'); // explicit require to benefit from static functions
const _ = require('lodash');
const storage = helpers.dependencies.storage.user.events;
const timestamp = require('unix-timestamp');
const testData = helpers.data;
const bluebird = require('bluebird');
const url = require('url');
const charlatan = require('charlatan');
const SystemStreamSerializer = require('business/src/system-streams/serializer');
const { integrity } = require('business');
const assert = require('chai').assert;
require('date-utils');

describe('Versioning', function () {

  const user = Object.assign({}, testData.users[0]);
  let request = null;

  function pathToEvent(eventId) {
    let resPath = '/' + user.username + '/events';
    if (eventId) {
      resPath += '/' + eventId;
    }
    return resPath;
  }

  function pathToStream(streamId) {
    let resPath = '/' + user.username + '/streams';
    if (streamId) {
      resPath += '/' + streamId;
    }
    return resPath;
  }

  before(function (done) {
    const settings = _.cloneDeep(helpers.dependencies.settings);
    settings.versioning.forceKeepHistory = true;
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      testData.resetStreams,
      testData.resetEvents,
      testData.resetAttachments,
      server.ensureStarted.bind(server, settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      }
    ], done);
  });

  after(function (done) {
    const settings = _.cloneDeep(helpers.dependencies.settings);
    settings.versioning = {
      forceKeepHistory: false,
      deletionMode: 'keep-nothing'
    };
    server.ensureStarted.call(server, settings, done);
  });

  const eventWithHistory = testData.events[16];
  const trashedEventWithHistory = testData.events[19];
  const eventWithNoHistory = testData.events[22];
  const runningEventOnNormalStream = testData.events[23];
  const runningEventOnSingleActivityStream = testData.events[24];
  const eventOnChildStream = testData.events[25];

  const normalStream = testData.streams[7];
  const singleActivityStream = testData.streams[8];
  const childStream = normalStream.children[0];

  describe('Events', function () {

    it('[RWIA] must not return history when calling events.get', function (done) {

      const queryParams = {limit: 100};

      request.get(pathToEvent(null)).query(queryParams).end(function (res) {
        const separatedEvents = validation.separateAccountStreamsAndOtherEvents(res.body.events);
        res.body.events = separatedEvents.events;
        validation.check(res, {
          status: 200,
          schema: eventsMethodsSchema.get.result
        });
        const events = res.body.events;
        (events.length).should.be.above(0);
        events.forEach(function (event) {
          should.not.exist(event.headId);
        });
        done();
      });
    });

    describe('deletionMode', function () {

      beforeEach(testData.resetEvents);

      it('[FLLW] must delete the event\'s history when deleting it with deletionMode=keep-nothing',
        function (done) {
          const settings = _.cloneDeep(helpers.dependencies.settings);
          settings.versioning.deletionMode = 'keep-nothing';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(trashedEventWithHistory.id)).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.del.result
                });
                res.body.eventDeletion.id.should.eql(trashedEventWithHistory.id);
                stepDone();
              });
            },
            function findDeletionInStorage(stepDone) {
              storage.findDeletion(user, {id: trashedEventWithHistory.id}, null,
                function (err, event) {
                  if (err) {
                    return stepDone(err);
                  }
                  should.exist(event);
                  event.id.should.eql(trashedEventWithHistory.id);
                  should.exist(event.deleted);
                  stepDone();
                });
            },
            function checkThatHistoryIsDeleted(stepDone) {

              storage.findHistory(user, trashedEventWithHistory.id, null,
                function (err, events) {
                  if (err) {
                    return stepDone(err);
                  }
                  (events.length).should.be.eql(0);
                  stepDone();
                });
            }
          ], done);
        });

      it('[6W0B] must minimize the event\'s history when deleting it with deletionMode=keep-authors',
        function (done) {
          const settings = _.cloneDeep(helpers.dependencies.settings);
          settings.versioning.deletionMode = 'keep-authors';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(trashedEventWithHistory.id)).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.del.result
                });
                stepDone();
              });
            },
            function verifyDeletedHeadInStorage(stepDone) {
              storage.findDeletion(user, {id: trashedEventWithHistory.id}, null,
                function (err, event) {
                  if (err) {
                    return stepDone(err);
                  }
                  should.exist(event);
                  (Object.keys(event).length).should.eql(5);
                  event.id.should.eql(trashedEventWithHistory.id);
                  should.exist(event.deleted);
                  should.exist(event.modified);
                  should.exist(event.modifiedBy);
                  should.exist(event.integrity);
                  stepDone();
                });
            },
            function verifyDeletedHistoryInStorage(stepDone) {
              storage.findHistory(user, trashedEventWithHistory.id, null,
                function (err, events) {
                  if (err) {
                    return stepDone(err);
                  }
                  (events.length).should.be.eql(2);
                  events.forEach(function (event) {
                    (Object.keys(event).length).should.eql(5);
                    should.exist(event.id);
                    should.exist(event.headId);
                    should.exist(event.modified);
                    should.exist(event.modifiedBy);
                    should.exist(event.integrity);
                  });
                  stepDone();
                });
            }
          ], done);
        });

      it('[1DBC] must not modify the event\'s history when deleting it with ' +
        'deletionMode=keep-everything',
        function (done) {
          const settings = _.cloneDeep(helpers.dependencies.settings);
          settings.versioning.deletionMode = 'keep-everything';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(trashedEventWithHistory.id)).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.del.result
                });
                stepDone();
              });
            },
            function verifyDeletedHeadInStory(stepDone) {
              storage.findDeletion(user, {id: trashedEventWithHistory.id}, null,
                function (err, event) {
                  if (err) {
                    return stepDone(err);
                  }
                  should.exist(event);
                  const expected = _.cloneDeep(trashedEventWithHistory);
                  delete expected.streamId;
                  expected.deleted = event.deleted;
                  integrity.events.set(expected);
                  event.should.eql(expected);
                  stepDone();
                });
            },
            function checkThatHistoryIsUnchanged(stepDone) {
              storage.findHistory(user, trashedEventWithHistory.id, null,
                function (err, events) {
                  if (err) {
                    return stepDone(err);
                  }
                  // TODO clean this test
                  const checked = {first: false, second: false};
                  (events.length).should.eql(2);
                  events.forEach(function (event) {
                    if (event.id === testData.events[20].id) {
                      event.should.eql(testData.events[20]);
                      checked.first = true;
                    } else if (event.id === testData.events[21].id) {
                      event.should.eql(testData.events[21]);
                      checked.second = true;
                    }
                  });
                  checked.should.eql({first: true, second: true});
                  stepDone();
                });
            }
          ], done);
        });
    });

    describe('events.getOne', function () {

      it('[YRI7] must not return an event\'s history when calling getOne with includeHistory flag off',
        function (done) {
          request.get(pathToEvent(eventWithHistory.id)).query({includeHistory: false}).end(
            function (res) {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.getOne.result
              });
              should.not.exist(res.body.history);
              done();
            }
          );
        });

      it('[KPQZ] must return an event\'s history when calling getOne with includeHistory flag on',
        function (done) {
          request.get(pathToEvent(eventWithHistory.id)).query({includeHistory: true}).end(
            function (res) {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.getOne.result
              });
              should.exist(res.body.history);

              done();
            }
          );
        });
    });

    describe('forceKeepHistory is OFF', function () {

      before(function (done) {
        const settings = _.cloneDeep(helpers.dependencies.settings);
        settings.versioning.forceKeepHistory = false;
        server.ensureStarted.call(server, settings, done);
      });

      beforeEach(testData.resetEvents);

      it('[PKA9] must not generate history when updating an event', function (done) {
        const updateData = {
          content: 'updated content'
        };
        async.series([
          function updateEvent (stepDone) {
            request.put(pathToEvent(eventWithNoHistory.id)).send(updateData).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.update.result
              });
              stepDone();
            });
          },
          function callGetOne(stepDone) {
            request.get(pathToEvent(eventWithNoHistory.id)).query({includeHistory: true}).end(
              function (res) {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result
                });
                should.exist(res.body);
                (res.body.history.length).should.eql(0);
                stepDone();
              });
          }
        ], done);
      });
    });

    describe('forceKeepHistory is ON', function () {

      beforeEach(testData.resetEvents);

      before(function (done) {
        const settings = _.cloneDeep(helpers.dependencies.settings);
        settings.versioning.forceKeepHistory = true;
        async.series([
          server.ensureStarted.bind(server, settings)
        ], done);
      });

      it('[0P6S] must generate history when updating an event', function (done) {
        const updateData = {
          content: 'first updated content'
        };
        async.series([
          function updateEventOnce(stepDone) {
            request.put(pathToEvent(eventWithNoHistory.id)).send(updateData).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.update.result
              });
              stepDone();
            });
          },
          function updateEventTwice(stepDone) {
            updateData.content = 'second updated content';
            request.put(pathToEvent(eventWithNoHistory.id)).send(updateData).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.update.result
              });
              stepDone();
            });
          },
          function verifyThatHistoryIsIncludedAndSorted(stepDone) {
            request.get(pathToEvent(eventWithNoHistory.id))
              .query({includeHistory: true}).end(
              function (res) {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result
                });
                should.exist(res.body);
                should.exist(res.body.history);
                (res.body.history.length).should.eql(2);
                const history = res.body.history;
                let time = 0;
                history.forEach(function (previousVersion) {
                  delete previousVersion.streamId;
                  (previousVersion.headId).should.eql(eventWithNoHistory.id);
                  // check sorted by modified field
                  if (time !== 0) {
                    (previousVersion.modified).should.be.above(time);
                  }
                  time = previousVersion.modified;
                  (_.omit(previousVersion, ['id', 'headId', 'modified', 'modifiedBy', 'content', 'tags', 'integrity']))
                    .should.eql(_.omit(eventWithNoHistory,
                      ['id', 'headId', 'modified', 'modifiedBy', 'content', 'tags', 'integrity']));
                });
                stepDone();
              });
          }
        ], done);
      });

      it('[NZQB] must generate history when trashing an event', function (done) {
        async.series([
          function trashEvent(stepDone) {
            request.del(pathToEvent(eventWithNoHistory.id)).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.update.result
              });
              stepDone();
            });
          },
          function verifyThatHistoryIsIncluded(stepDone) {
            request.get(pathToEvent(eventWithNoHistory.id))
              .query({includeHistory: true}).end(
              function (res) {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result
                });
                should.exist(res.body);
                should.exist(res.body.history);
                (res.body.history.length).should.eql(1);
                const previousVersion = res.body.history[0];
                delete previousVersion.streamId;
                (previousVersion.headId).should.eql(eventWithNoHistory.id);
                (_.omit(previousVersion, ['id', 'headId', 'modified', 'modifiedBy', 'trashed', 'integrity']))
                  .should.eql(_.omit(eventWithNoHistory,
                    ['id', 'headId', 'modified', 'modifiedBy', 'integrity']));
                stepDone();
              });
          }
        ], done);
      });

    });

  });

  describe('Streams', function () {

    before(function (done) {
      const settings = _.cloneDeep(helpers.dependencies.settings);
      settings.versioning = {
        forceKeepHistory: true
      };
      server.ensureStarted.call(server, settings, done);
    });

    beforeEach(function (done) {
      async.series([
        testData.resetStreams,
        testData.resetEvents
      ], done);
    });

    it('[H1PK] must generate events\' history when their stream is deleted with ' +
    ' mergeEventsWithParents=true since their streamId is modified', function (done) {
      async.series([
        function deleteStream(stepDone) {
          request.del(pathToStream(childStream.id))
            .query({mergeEventsWithParent: true}).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: streamsMethodsSchema.del.result
              });
              res.body.streamDeletion.id.should.eql(childStream.id);
              stepDone();
            });
        },
        function verifyHistory(stepDone) {
          request.get(pathToEvent(eventOnChildStream.id)).query({includeHistory: true})
            .end(function (res) {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.getOne.result
              });
              const event = res.body.event;
              event.streamId.should.eql(normalStream.id);
              const history = res.body.history;
              should.exist(history);
              history.length.should.eql(2);
              history.forEach(function (previousVersion) {
                previousVersion.headId.should.eql(eventOnChildStream.id);
                previousVersion.streamId.should.eql(childStream.id);
              });
              stepDone();
            });
        }
      ], done);
    });

    it('[95TJ] must delete the events\' history when their stream is deleted with ' +
    ' mergeEventsWithParents=false and deletionMode=\'keep-nothing\'', function (done) {
      const settings = _.cloneDeep(helpers.dependencies.settings);
      settings.versioning = {
        deletionMode: 'keep-nothing'
      };
      async.series([
        server.ensureStarted.bind(server, settings),
        function deleteStream(stepDone) {
          request.del(pathToStream(childStream.id)).query({mergeEventsWithParent: false})
            .end(function (res) {
              validation.check(res, {
                status: 200,
                schema: streamsMethodsSchema.del.result
              });
              res.body.streamDeletion.id.should.eql(childStream.id);
              stepDone();
            });
        },
        function findDeletionInStorage(stepDone) {
          storage.findDeletion(user, {id: eventOnChildStream.id}, null,
            function (err, event) {
              if (err) {
                return stepDone(err);
              }
              should.exist(event);
              event.id.should.eql(eventOnChildStream.id);
              should.exist(event.deleted);
              stepDone();
            });
        },
        function checkThatHistoryIsDeleted(stepDone) {
          storage.findHistory(user, eventOnChildStream.id, null,
            function (err, events) {
              if (err) {
                return stepDone(err);
              }
              (events.length).should.be.eql(0);
              stepDone();
            });
        }
      ], done);
    });

    it('[4U91] must keep the events\' minimal history when their stream is deleted with ' +
    ' mergeEventsWithParents=false and deletionMode=\'keep-authors\'', function (done) {
      const settings = _.cloneDeep(helpers.dependencies.settings);
      settings.versioning = {
        deletionMode: 'keep-authors'
      };
      async.series([
        server.ensureStarted.bind(server, settings),
        function deleteStream(stepDone) {
          request.del(pathToStream(childStream.id)).query({mergeEventsWithParent: false})
            .end(function (res) {
              validation.check(res, {
                status: 200,
                schema: streamsMethodsSchema.del.result
              });
              res.body.streamDeletion.id.should.eql(childStream.id);
              stepDone();
            });
        },
        function verifyDeletedHeadInStorage(stepDone) {
          storage.findDeletion(user, {id: eventOnChildStream.id}, null,
            function (err, event) {
              if (err) {
                return stepDone(err);
              }
              should.exist(event);
              (Object.keys(event).length).should.eql(5);
              event.id.should.eql(eventOnChildStream.id);
              should.exist(event.deleted);
              should.exist(event.modified);
              should.exist(event.modifiedBy);
              should.exist(event.integrity);
              stepDone();
            });
        },
        function verifyDeletedHistoryInStorage(stepDone) {
          storage.findHistory(user, eventOnChildStream.id, null,
            function (err, events) {
              if (err) {
                return stepDone(err);
              }
              (events.length).should.be.eql(1);
              events.forEach(function (event) {
                (Object.keys(event).length).should.eql(5);
                should.exist(event.id);
                should.exist(event.headId);
                should.exist(event.modified);
                should.exist(event.modifiedBy);
                should.exist(event.integrity);
              });
              stepDone();
            });
        }
      ], done);
    });

    it('[D4CY] must not delete the events\' history when their stream is deleted with' +
    ' mergeEventsWithParents=false and deletionMode=\'keep-everything\'', function (done) {
      const settings = _.cloneDeep(helpers.dependencies.settings);
      settings.versioning = {
        deletionMode: 'keep-everything'
      };
      async.series([
        server.ensureStarted.bind(server, settings),
        function deleteStream(stepDone) {
          request.del(pathToStream(childStream.id)).query({mergeEventsWithParent: false})
            .end(function (res) {
              validation.check(res, {
                status: 200,
                schema: streamsMethodsSchema.del.result
              });
              res.body.streamDeletion.id.should.eql(childStream.id);
              stepDone();
            });
        },
        function verifyDeletedHeadInStory(stepDone) {
          storage.findDeletion(user, {id: eventOnChildStream.id}, null,
            function (err, event) {
              if (err) {
                return stepDone(err);
              }
              should.exist(event);
              const expected = _.cloneDeep(eventOnChildStream);
              delete expected.streamId;
              expected.deleted = event.deleted;
              integrity.events.set(expected);
              event.should.eql(expected);
              stepDone();
            });
        },
        function checkThatHistoryIsUnchanged(stepDone) {
          storage.findHistory(user, eventOnChildStream.id, null,
            function (err, events) {
              if (err) {
                return stepDone(err);
              }
              let checked = false;
              (events.length).should.eql(1);
              events.forEach(function (event) {
                event.headId.should.eql(eventOnChildStream.id);
                if (event.id === testData.events[26].id) {
                  event.should.eql(testData.events[26]);
                  checked = true;
                }
              });
              checked.should.eql(true);
              stepDone();
            });
        }
      ], done);
    });
  });

  describe('Users', function () {
    const req = require('superagent');
    before(async function () {
      const settings = _.cloneDeep(helpers.dependencies.settings);
      settings.versioning = {
        forceKeepHistory: true,
      };
      settings.dnsLess = { isActive: true };
      await bluebird.fromCallback(cb => server.ensureStarted.call(server, settings, cb));
    });

    function buildPath(path) {
      return url.resolve(server.url, path);
    }
    function generateRegisterBody() {
      return {
        username: charlatan.Lorem.characters(7),
        password: charlatan.Lorem.characters(7),
        email: charlatan.Internet.email(),
        appId: charlatan.Lorem.characters(7),
        insurancenumber: charlatan.Number.number(3),
        phoneNumber: charlatan.Number.number(3),
      };
    }
    function extractToken(apiEndpoint) {
      const hostname = apiEndpoint.split('//')[1];
      return hostname.split('@')[0];
    }

    it('[4ETL] must allow reusing unique values after they are in history', async () => {
      /**
       * 1. create user
       * 2. change unique field value
       * 3. ensure it is there in history
       * 4. create user with same unique value - must pass
       */

      // 1.
      const user1 = generateRegisterBody();
      const res = await req
        .post(buildPath('/users'))
        .send(user1);
      const token = extractToken(res.body.apiEndpoint);
      const resEvents = await req
        .get(buildPath(`/${user1.username}/events`))
        .set('Authorization',token)
        .query({streams: [SystemStreamSerializer.addCustomerPrefixToStreamId('email')]});
      const oldEmailEvent = resEvents.body.events[0];

      // 2.
      const resUpdate = await req
        .put(buildPath(`/${user1.username}/events/${oldEmailEvent.id}`))
        .set('Authorization',token)
        .send({
          content: charlatan.Internet.email(),
        });

      // 3.
      const resGet = await req
        .get(buildPath(`/${user1.username}/events/${oldEmailEvent.id}`))
        .set('Authorization',token)
        .query({ includeHistory: true });
      assert.equal(resGet.body.history[0].content, oldEmailEvent.content);

      // 4.
      const user2 = _.merge(generateRegisterBody(), { email: oldEmailEvent.content });
      const res2 = await req
        .post(buildPath('/users'))
        .send(user2);
      const token2 = extractToken(res2.body.apiEndpoint);
      const resEvents2 = await req
        .get(buildPath(`/${user2.username}/events`))
        .set('Authorization',token2)
        .query({streams: [SystemStreamSerializer.addCustomerPrefixToStreamId('email')]});
      const emailEvent = resEvents2.body.events[0];
      assert.equal(emailEvent.content, oldEmailEvent.content);
    });
  });

});
