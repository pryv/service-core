/* global describe, before, beforeEach, after, it */

const helpers = require('./helpers');

const server = helpers.dependencies.instanceManager;
const async = require('async');

const { validation } = helpers;
const eventsMethodsSchema = require('../src/schema/eventsMethods');
const streamsMethodsSchema = require('../src/schema/streamsMethods');
const should = require('should'); // explicit require to benefit from static functions
const _ = require('lodash');

const storage = helpers.dependencies.storage.user.events;
const timestamp = require('unix-timestamp');

const testData = helpers.data;
require('date-utils');

describe('Auditing', () => {
  const user = testData.users[0];
  let request = null;

  function pathToEvent(eventId) {
    let resPath = `/${user.username}/events`;
    if (eventId) {
      resPath += `/${eventId}`;
    }
    return resPath;
  }

  function pathToStream(streamId) {
    let resPath = `/${user.username}/streams`;
    if (streamId) {
      resPath += `/${streamId}`;
    }
    return resPath;
  }

  before((done) => {
    const settings = _.cloneDeep(helpers.dependencies.settings);
    settings.audit.forceKeepHistory = true;
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
      },
    ], done);
  });

  after((done) => {
    const settings = _.cloneDeep(helpers.dependencies.settings);
    settings.audit = {
      forceKeepHistory: false,
      deletionMode: 'keep-nothing',
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

  describe('Events', () => {
    it('[RWIA] must not return history when calling events.get', (done) => {
      const queryParams = { limit: 100 };

      request.get(pathToEvent(null)).query(queryParams).end((res) => {
        validation.check(res, {
          status: 200,
          schema: eventsMethodsSchema.get.result,
        });
        const { events } = res.body;
        (events.length).should.be.above(0);
        events.forEach((event) => {
          should.not.exist(event.headId);
        });
        done();
      });
    });

    describe('deletionMode', () => {
      beforeEach(testData.resetEvents);

      it('[FLLW] must delete the event\'s history when deleting it with deletionMode=keep-nothing',
        (done) => {
          const settings = _.cloneDeep(helpers.dependencies.settings);
          settings.audit.deletionMode = 'keep-nothing';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(trashedEventWithHistory.id)).end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.del.result,
                });
                res.body.eventDeletion.id.should.eql(trashedEventWithHistory.id);
                stepDone();
              });
            },
            function findDeletionInStorage(stepDone) {
              storage.findDeletion(user, { id: trashedEventWithHistory.id }, null,
                (err, event) => {
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
                (err, events) => {
                  if (err) {
                    return stepDone(err);
                  }
                  (events.length).should.be.eql(0);
                  stepDone();
                });
            },
          ], done);
        });

      it('[6W0B] must minimize the event\'s history when deleting it with deletionMode=keep-authors',
        (done) => {
          const settings = _.cloneDeep(helpers.dependencies.settings);
          settings.audit.deletionMode = 'keep-authors';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(trashedEventWithHistory.id)).end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.del.result,
                });
                stepDone();
              });
            },
            function verifyDeletedHeadInStorage(stepDone) {
              storage.findDeletion(user, { id: trashedEventWithHistory.id }, null,
                (err, event) => {
                  if (err) {
                    return stepDone(err);
                  }
                  should.exist(event);
                  (Object.keys(event).length).should.eql(4);
                  event.id.should.eql(trashedEventWithHistory.id);
                  should.exist(event.deleted);
                  should.exist(event.modified);
                  should.exist(event.modifiedBy);
                  stepDone();
                });
            },
            function verifyDeletedHistoryInStorage(stepDone) {
              storage.findHistory(user, trashedEventWithHistory.id, null,
                (err, events) => {
                  if (err) {
                    return stepDone(err);
                  }
                  (events.length).should.be.eql(2);
                  events.forEach((event) => {
                    (Object.keys(event).length).should.eql(4);
                    should.exist(event.id);
                    should.exist(event.headId);
                    should.exist(event.modified);
                    should.exist(event.modifiedBy);
                  });
                  stepDone();
                });
            },
          ], done);
        });

      it('[1DBC] must not modify the event\'s history when deleting it with '
        + 'deletionMode=keep-everything',
      (done) => {
        const settings = _.cloneDeep(helpers.dependencies.settings);
        settings.audit.deletionMode = 'keep-everything';

        async.series([
          server.ensureStarted.bind(server, settings),
          function deleteEvent(stepDone) {
            request.del(pathToEvent(trashedEventWithHistory.id)).end((res) => {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.del.result,
              });
              stepDone();
            });
          },
          function verifyDeletedHeadInStory(stepDone) {
            storage.findDeletion(user, { id: trashedEventWithHistory.id }, null,
              (err, event) => {
                if (err) {
                  return stepDone(err);
                }
                should.exist(event);
                const expected = _.cloneDeep(trashedEventWithHistory);
                delete expected.streamId;
                event.should.eql(_.extend({ deleted: event.deleted }, expected));
                stepDone();
              });
          },
          function checkThatHistoryIsUnchanged(stepDone) {
            storage.findHistory(user, trashedEventWithHistory.id, null,
              (err, events) => {
                if (err) {
                  return stepDone(err);
                }
                // TODO clean this test
                const checked = { first: false, second: false };
                (events.length).should.eql(2);
                events.forEach((event) => {
                  if (event.id === testData.events[20].id) {
                    event.should.eql(testData.events[20]);
                    checked.first = true;
                  } else if (event.id === testData.events[21].id) {
                    event.should.eql(testData.events[21]);
                    checked.second = true;
                  }
                });
                checked.should.eql({ first: true, second: true });
                stepDone();
              });
          },
        ], done);
      });
    });

    describe('getOne', () => {
      it('[YRI7] must not return an event\'s history when calling getOne with includeHistory flag off',
        (done) => {
          request.get(pathToEvent(eventWithHistory.id)).query({ includeHistory: false }).end(
            (res) => {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.getOne.result,
              });
              should.not.exist(res.body.history);
              done();
            },
          );
        });

      it('[KPQZ] must return an event\'s history when calling getOne with includeHistory flag on',
        (done) => {
          request.get(pathToEvent(eventWithHistory.id)).query({ includeHistory: true }).end(
            (res) => {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.getOne.result,
              });
              should.exist(res.body.history);

              done();
            },
          );
        });
    });

    describe('forceKeepHistory is OFF', () => {
      before((done) => {
        const settings = _.cloneDeep(helpers.dependencies.settings);
        settings.audit.forceKeepHistory = false;
        server.ensureStarted.call(server, settings, done);
      });

      beforeEach(testData.resetEvents);

      it('[PKA9] must not generate history when updating an event', (done) => {
        const updateData = {
          content: 'updated content',
        };
        async.series([
          function updateEvent(stepDone) {
            request.put(pathToEvent(eventWithNoHistory.id)).send(updateData).end((res) => {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.update.result,
              });
              stepDone();
            });
          },
          function callGetOne(stepDone) {
            request.get(pathToEvent(eventWithNoHistory.id)).query({ includeHistory: true }).end(
              (res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result,
                });
                should.exist(res.body);
                (res.body.history.length).should.eql(0);
                stepDone();
              },
            );
          },
        ], done);
      });

      it.skip('[TLG6] must not generate history of the running event that was stopped '
        + 'because of the start call on another event',
      (done) => {
        const data = {
          time: timestamp.now(''),
          type: 'activity/pryv',
          duration: null,
          streamId: singleActivityStream.id,
          tags: ['houba'],
        };
        data.streamIds = [data.streamId];
        let createdId;

        async.series([
          function startEvent(stepDone) {
            request.post(`/${user.username}/events/start`).send(data).end((res) => {
              validation.check(res, {
                status: 201,
                schema: eventsMethodsSchema.create.result,
              });
              createdId = res.body.event.id;
              res.body.stoppedId.should.eql(runningEventOnSingleActivityStream.id);
              stepDone();
            });
          },
          function fetchHistoryOfStoppedEvent(stepDone) {
            request.get(pathToEvent(runningEventOnSingleActivityStream.id))
              .query({ includeHistory: true }).end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result,
                });
                (res.body.event.id).should.eql(runningEventOnSingleActivityStream.id);
                const { history } = res.body;
                history.length.should.eql(0);
                stepDone();
              });
          },
        ], done);
      });

      it.skip('[DZMK] must not generate history when no event was stopped in the procedure of the start call '
        + 'on another event',
      (done) => {
        const data = {
          time: timestamp.now(''),
          type: 'activity/pryv',
          duration: null,
          streamId: normalStream.id,
          tags: ['houba'],
        };
        data.streamIds = [data.streamId];
        let createdId;

        async.series([
          function startEvent(stepDone) {
            request.post(`/${user.username}/events/start`).send(data).end((res) => {
              validation.check(res, {
                status: 201,
                schema: eventsMethodsSchema.create.result,
              });
              createdId = res.body.event.id;
              should.not.exist(res.body.stoppedId);
              stepDone();
            });
          },
          function fetchHistoryOfEventThat(stepDone) {
            request.get(pathToEvent(runningEventOnNormalStream.id))
              .query({ includeHistory: true }).end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result,
                });
                (res.body.event.id).should.eql(runningEventOnNormalStream.id);
                const { history } = res.body;
                history.length.should.eql(0);
                stepDone();
              });
          },
        ], done);
      });

      it.skip('[MB48] must not generate history when calling stop on a running event', (done) => {
        const data = {
          streamId: normalStream.id,
          id: runningEventOnNormalStream.id,
          type: runningEventOnNormalStream.type,
        };
        async.series([
          function stopEvent(stepDone) {
            request.post(`/${user.username}/events/stop`).send(data)
              .end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.stop.result,
                });
                res.body.stoppedId.should.eql(testData.events[23].id);
                stepDone();
              });
          },
          function checkThatStoppedEventHasNoHistory(stepDone) {
            request.get(pathToEvent(runningEventOnNormalStream.id))
              .query({ includeHistory: true }).end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result,
                });
                (res.body.event.id).should.eql(runningEventOnNormalStream.id);
                (res.body.history.length).should.eql(0);
                stepDone();
              });
          },
        ], done);
      });
    });

    describe('forceKeepHistory is ON', () => {
      beforeEach(testData.resetEvents);

      before((done) => {
        const settings = _.cloneDeep(helpers.dependencies.settings);
        settings.audit.forceKeepHistory = true;
        async.series([
          server.ensureStarted.bind(server, settings),
        ], done);
      });

      it('[0P6S] must generate history when updating an event', (done) => {
        const updateData = {
          content: 'first updated content',
        };
        async.series([
          function updateEventOnce(stepDone) {
            request.put(pathToEvent(eventWithNoHistory.id)).send(updateData).end((res) => {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.update.result,
              });
              stepDone();
            });
          },
          function updateEventTwice(stepDone) {
            updateData.content = 'second updated content';
            request.put(pathToEvent(eventWithNoHistory.id)).send(updateData).end((res) => {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.update.result,
              });
              stepDone();
            });
          },
          function verifyThatHistoryIsIncludedAndSorted(stepDone) {
            request.get(pathToEvent(eventWithNoHistory.id))
              .query({ includeHistory: true }).end(
                (res) => {
                  validation.check(res, {
                    status: 200,
                    schema: eventsMethodsSchema.getOne.result,
                  });
                  should.exist(res.body);
                  should.exist(res.body.history);
                  (res.body.history.length).should.eql(2);
                  const { history } = res.body;
                  let time = 0;
                  history.forEach((previousVersion) => {
                    delete previousVersion.streamId;
                    (previousVersion.headId).should.eql(eventWithNoHistory.id);
                    // check sorted by modified field
                    if (time !== 0) {
                      (previousVersion.modified).should.be.above(time);
                    }
                    time = previousVersion.modified;
                    (_.omit(previousVersion, ['id', 'headId', 'modified', 'modifiedBy', 'content']))
                      .should.eql(_.omit(eventWithNoHistory,
                        ['id', 'headId', 'modified', 'modifiedBy', 'content']));
                  });
                  stepDone();
                },
              );
          },
        ], done);
      });

      it.skip('[Y4CH] must generate history of the running event that was stopped because of the start call '
        + 'on another event',
      (done) => {
        const data = {
          time: timestamp.now(''),
          type: 'activity/pryv',
          duration: null,
          streamId: singleActivityStream.id,
          tags: ['houba'],
        };
        data.streamIds = [data.streamId];
        let createdId;

        async.series([
          function startEvent(stepDone) {
            request.post(`/${user.username}/events/start`).send(data).end((res) => {
              validation.check(res, {
                status: 201,
                schema: eventsMethodsSchema.create.result,
              });
              createdId = res.body.event.id;
              res.body.stoppedId.should.eql(runningEventOnSingleActivityStream.id);
              stepDone();
            });
          },
          function fetchHistoryOfStoppedEvent(stepDone) {
            request.get(pathToEvent(runningEventOnSingleActivityStream.id))
              .query({ includeHistory: true }).end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result,
                });
                (res.body.event.id).should.eql(runningEventOnSingleActivityStream.id);
                const { history } = res.body;
                history.length.should.eql(1);
                const previousVersion = history[0];
                previousVersion.headId.should.eql(runningEventOnSingleActivityStream.id);
                stepDone();
              });
          },
        ], done);
      });

      it.skip('[M90Z] must not generate history when no event was stopped in the procedure of the start call '
        + 'on another event',
      (done) => {
        const data = {
          time: timestamp.now(''),
          type: 'activity/pryv',
          duration: null,
          streamId: normalStream.id,
          tags: ['houba'],
        };
        data.streamIds = [data.streamId];
        let createdId;

        async.series([
          function startEvent(stepDone) {
            request.post(`/${user.username}/events/start`).send(data).end((res) => {
              validation.check(res, {
                status: 201,
                schema: eventsMethodsSchema.create.result,
              });
              createdId = res.body.event.id;
              should.not.exist(res.body.stoppedId);
              stepDone();
            });
          },
          function fetchHistoryOfEventThat(stepDone) {
            request.get(pathToEvent(runningEventOnNormalStream.id))
              .query({ includeHistory: true }).end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result,
                });
                (res.body.event.id).should.eql(runningEventOnNormalStream.id);
                const { history } = res.body;
                history.length.should.eql(0);
                stepDone();
              });
          },
        ], done);
      });

      it.skip('[519W] must generate history when calling stop on a running event', (done) => {
        const data = {
          streamId: normalStream.id,
          id: runningEventOnNormalStream.id,
          type: runningEventOnNormalStream.type,
        };
        async.series([
          function stopEvent(stepDone) {
            request.post(`/${user.username}/events/stop`).send(data)
              .end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.stop.result,
                });
                res.body.stoppedId.should.eql(testData.events[23].id);
                stepDone();
              });
          },
          function checkThatStoppedEventHasNoHistory(stepDone) {
            request.get(pathToEvent(runningEventOnNormalStream.id))
              .query({ includeHistory: true }).end((res) => {
                validation.check(res, {
                  status: 200,
                  schema: eventsMethodsSchema.getOne.result,
                });
                (res.body.event.id).should.eql(runningEventOnNormalStream.id);
                const { history } = res.body;
                (history.length).should.eql(1);
                const previousVersion = history[0];
                previousVersion.headId.should.eql(runningEventOnNormalStream.id);
                stepDone();
              });
          },
        ], done);
      });
    });
  });

  describe('Streams', () => {
    before((done) => {
      const settings = _.cloneDeep(helpers.dependencies.settings);
      settings.audit = {
        forceKeepHistory: true,
      };
      server.ensureStarted.call(server, settings, done);
    });

    beforeEach((done) => {
      async.series([
        testData.resetStreams,
        testData.resetEvents,
      ], done);
    });

    it('[H1PK] must generate events\' history when their stream is deleted with '
    + ' mergeEventsWithParents=true since their streamId is modified', (done) => {
      async.series([
        function deleteStream(stepDone) {
          request.del(pathToStream(childStream.id))
            .query({ mergeEventsWithParent: true }).end((res) => {
              validation.check(res, {
                status: 200,
                schema: streamsMethodsSchema.del.result,
              });
              res.body.streamDeletion.id.should.eql(childStream.id);
              stepDone();
            });
        },
        function verifyHistory(stepDone) {
          request.get(pathToEvent(eventOnChildStream.id)).query({ includeHistory: true })
            .end((res) => {
              validation.check(res, {
                status: 200,
                schema: eventsMethodsSchema.getOne.result,
              });
              const { event } = res.body;
              event.streamId.should.eql(normalStream.id);
              const { history } = res.body;
              should.exist(history);
              history.length.should.eql(2);
              history.forEach((previousVersion) => {
                previousVersion.headId.should.eql(eventOnChildStream.id);
                previousVersion.streamId.should.eql(childStream.id);
              });
              stepDone();
            });
        },
      ], done);
    });

    it('[95TJ] must delete the events\' history when their stream is deleted with '
    + ' mergeEventsWithParents=false and deletionMode=\'keep-nothing\'', (done) => {
      const settings = _.cloneDeep(helpers.dependencies.settings);
      settings.audit = {
        deletionMode: 'keep-nothing',
      };
      async.series([
        server.ensureStarted.bind(server, settings),
        function deleteStream(stepDone) {
          request.del(pathToStream(childStream.id)).query({ mergeEventsWithParent: false })
            .end((res) => {
              validation.check(res, {
                status: 200,
                schema: streamsMethodsSchema.del.result,
              });
              res.body.streamDeletion.id.should.eql(childStream.id);
              stepDone();
            });
        },
        function findDeletionInStorage(stepDone) {
          storage.findDeletion(user, { id: eventOnChildStream.id }, null,
            (err, event) => {
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
            (err, events) => {
              if (err) {
                return stepDone(err);
              }
              (events.length).should.be.eql(0);
              stepDone();
            });
        },
      ], done);
    });

    it('[4U91] must keep the events\' minimal history when their stream is deleted with '
    + ' mergeEventsWithParents=false and deletionMode=\'keep-authors\'', (done) => {
      const settings = _.cloneDeep(helpers.dependencies.settings);
      settings.audit = {
        deletionMode: 'keep-authors',
      };
      async.series([
        server.ensureStarted.bind(server, settings),
        function deleteStream(stepDone) {
          request.del(pathToStream(childStream.id)).query({ mergeEventsWithParent: false })
            .end((res) => {
              validation.check(res, {
                status: 200,
                schema: streamsMethodsSchema.del.result,
              });
              res.body.streamDeletion.id.should.eql(childStream.id);
              stepDone();
            });
        },
        function verifyDeletedHeadInStorage(stepDone) {
          storage.findDeletion(user, { id: eventOnChildStream.id }, null,
            (err, event) => {
              if (err) {
                return stepDone(err);
              }
              should.exist(event);
              (Object.keys(event).length).should.eql(4);
              event.id.should.eql(eventOnChildStream.id);
              should.exist(event.deleted);
              should.exist(event.modified);
              should.exist(event.modifiedBy);
              stepDone();
            });
        },
        function verifyDeletedHistoryInStorage(stepDone) {
          storage.findHistory(user, eventOnChildStream.id, null,
            (err, events) => {
              if (err) {
                return stepDone(err);
              }
              (events.length).should.be.eql(1);
              events.forEach((event) => {
                (Object.keys(event).length).should.eql(4);
                should.exist(event.id);
                should.exist(event.headId);
                should.exist(event.modified);
                should.exist(event.modifiedBy);
              });
              stepDone();
            });
        },
      ], done);
    });

    it('[D4CY] must not delete the events\' history when their stream is deleted with'
    + ' mergeEventsWithParents=false and deletionMode=\'keep-everything\'', (done) => {
      const settings = _.cloneDeep(helpers.dependencies.settings);
      settings.audit = {
        deletionMode: 'keep-everything',
      };
      async.series([
        server.ensureStarted.bind(server, settings),
        function deleteStream(stepDone) {
          request.del(pathToStream(childStream.id)).query({ mergeEventsWithParent: false })
            .end((res) => {
              validation.check(res, {
                status: 200,
                schema: streamsMethodsSchema.del.result,
              });
              res.body.streamDeletion.id.should.eql(childStream.id);
              stepDone();
            });
        },
        function verifyDeletedHeadInStory(stepDone) {
          storage.findDeletion(user, { id: eventOnChildStream.id }, null,
            (err, event) => {
              if (err) {
                return stepDone(err);
              }
              should.exist(event);
              const expected = _.cloneDeep(eventOnChildStream);
              delete expected.streamId;
              event.should.eql(_.extend({ deleted: event.deleted }, expected));
              stepDone();
            });
        },
        function checkThatHistoryIsUnchanged(stepDone) {
          storage.findHistory(user, eventOnChildStream.id, null,
            (err, events) => {
              if (err) {
                return stepDone(err);
              }
              let checked = false;
              (events.length).should.eql(1);
              events.forEach((event) => {
                event.headId.should.eql(eventOnChildStream.id);
                if (event.id === testData.events[26].id) {
                  event.should.eql(testData.events[26]);
                  checked = true;
                }
              });
              checked.should.eql(true);
              stepDone();
            });
        },
      ], done);
    });
  });

  describe.skip('Nightly task', () => {
    before(testData.resetEvents);

    it('[QT0Z] must delete history data from the storage', (done) => {
      async.series([
        function fetchHistoryEventsFromStorage(stepDone) {
          stepDone();
        },
        function RunNightlyScript(stepDone) {
          stepDone();
        },
        function verifyEventsEraseFromStorage(stepDone) {
          stepDone();
        },
      ], done);
    });
  });
});
