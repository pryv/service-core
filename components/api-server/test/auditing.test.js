/*global describe, before, beforeEach, after, it */

var helpers = require('./helpers'),
  server = helpers.dependencies.instanceManager,
  async = require('async'),
  validation = helpers.validation,
  methodsSchema = require('../src/schema/eventsMethods'),
  should = require('should'), // explicit require to benefit from static functions
  _ = require('lodash'),
  storage = helpers.dependencies.storage.user.events,
  timestamp = require('unix-timestamp'),
  testData = helpers.data;
require('date-utils');

describe('Auditing', function () {

  var user = testData.users[0],
    request = null;

  function pathToEvent(eventId) {
    var resPath = '/' + user.username + '/events';
    if (eventId) {
      resPath += '/' + eventId;
    }
    return resPath;
  }

  before(function (done) {
    var settings = _.cloneDeep(helpers.dependencies.settings);
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
      }
    ], done);
  });

  after(function (done) {
    var settings = _.cloneDeep(helpers.dependencies.settings);
    settings.audit = {
      forceKeepHistory: false,
      deletionMode: 'keep-nothing'
    };
    server.ensureStarted.call(server, settings, done);
  });

  describe('Events', function () {

    var eventWithHistory = testData.events[16],
      trashedEventWithHistory = testData.events[19],
      eventWithNoHistory = testData.events[22];


    it('must not return history when calling events.get', function (done) {

      var queryParams = {limit: 100};

      request.get(pathToEvent(null)).query(queryParams).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result
        });
        var events = res.body.events;
        (events.length).should.be.above(0);
        events.forEach(function (event) {
          should.not.exist(event.headId);
        });
        done();
      });
    });

    describe('deletionMode', function () {

      beforeEach(testData.resetEvents);

      it('must delete the event\'s history when deleting it with deletionMode=keep-nothing',
        function (done) {
          var settings = _.cloneDeep(helpers.dependencies.settings);
          settings.audit.deletionMode = 'keep-nothing';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(trashedEventWithHistory.id)).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.del.result
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

      it('must minimize the event\'s history when deleting it with deletionMode=keep-authors',
        function (done) {
          var settings = _.cloneDeep(helpers.dependencies.settings);
          settings.audit.deletionMode = 'keep-authors';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(trashedEventWithHistory.id)).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.del.result
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
                function (err, events) {
                  if (err) {
                    return stepDone(err);
                  }
                  (events.length).should.be.eql(2);
                  events.forEach(function (event) {
                    (Object.keys(event).length).should.eql(4);
                    should.exist(event.id);
                    should.exist(event.headId);
                    should.exist(event.modified);
                    should.exist(event.modifiedBy);
                  });
                  stepDone();
                });
            }
          ], done);
        });

      it('must not modify the event\'s history when deleting it with ' +
        'deletionMode=keep-everything',
        function (done) {
          var settings = _.cloneDeep(helpers.dependencies.settings);
          settings.audit.deletionMode = 'keep-everything';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(trashedEventWithHistory.id)).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.del.result
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
                  event.should.eql(_.extend(trashedEventWithHistory, {deleted: event.deleted}));
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
                  var checked = {first: false, second: false};
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

    describe('getOne', function () {

      it('must not return an event\'s history when calling getOne with includeHistory flag off',
        function (done) {
          request.get(pathToEvent(eventWithHistory.id)).query({includeHistory: false}).end(
            function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.getOne.result
              });
              should.exist(res.body);
              should.not.exist(res.body.history);
              done();
            }
          );
        });

      it('must return an event\'s history when calling getOne with includeHistory flag on',
        function (done) {
          request.get(pathToEvent(eventWithHistory.id)).query({includeHistory: true}).end(
            function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.getOne.result
              });
              should.exist(res.body);
              should.exist(res.body.history);
              done();
            }
          );
        });
    });

    describe('forceKeepHistory is OFF', function () {

      before(function (done) {
        var settings = _.cloneDeep(helpers.dependencies.settings);
        settings.audit.forceKeepHistory = false;
        server.ensureStarted.call(server, settings, done);
      });

      beforeEach(testData.resetEvents);

      it('must not generate history when updating an event', function (done) {
        var updateData = {
          content: 'updated content'
        };
        async.series([
          function updateEvent(stepDone) {
            request.put(pathToEvent(eventWithNoHistory.id)).send(updateData).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });
              stepDone();
            });
          },
          function callGetOne(stepDone) {
            request.get(pathToEvent(eventWithNoHistory.id))
              .query({includeHistory: true}).end(
              function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.getOne.result
                });
                should.exist(res.body);
                should.not.exist(res.body.history);
                stepDone();
              });
          }
        ], done);
      });

      it.skip('must not generate history of the running event that was stopped ' +
        'because of the start call on another event',
        function (done) {
          var data = {
            // 15 minutes ago to make sure the previous duration is set accordingly
            time: timestamp.now('-15m'),
            type: 'activity/pryv',
            streamId: testData.streams[0].id,
            tags: ['houba']
          };
          var createdId;

          async.series([
              function addNewEvent(stepDone) {
                request.post(pathToEvent(null)).send(data).end(function (res) {
                  validation.check(res, {
                    status: 201,
                    schema: methodsSchema.create.result
                  });
                  createdId = res.body.event.id;
                  res.body.stoppedId.should.eql(testData.events[9].id);
                  stepDone();
                });
              },
              function fetchHistoryOfStoppedEvent(stepDone) {
                request.get(pathToEvent(testData.events[0].id)).end(function (res) {
                  validation.check(res, {
                    status: 201,
                    schema: methodsSchema.get.result
                  });
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

      it('must not generate history when no event was stopped in the procedure of the start call ' +
        'on another event',
        function (done) {
          done();
        });

      it('must not create a log when calling stop on a running event', function (done) {
        done();
      });

    });


    describe('forceKeepHistory is ON', function () {

      beforeEach(testData.resetEvents);

      before(function (done) {
        var settings = _.cloneDeep(helpers.dependencies.settings);
        settings.audit.forceKeepHistory = true;
        async.series([
          server.ensureStarted.bind(server, settings)
        ], done);
      });

      it('must generate history when updating an event', function (done) {
        var updateData = {
          content: 'first updated content'
        };
        async.series([
          function updateEventOnce(stepDone) {
            request.put(pathToEvent(eventWithNoHistory.id)).send(updateData).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });
              stepDone();
            });
          },
          function updateEventTwice(stepDone) {
            updateData.content = 'second updated content';
            request.put(pathToEvent(eventWithNoHistory.id)).send(updateData).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });
              stepDone();
            });
          },
          function callGetOne(stepDone) {
            request.get(pathToEvent(eventWithNoHistory.id))
              .query({includeHistory: true}).end(
              function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.getOne.result
                });
                should.exist(res.body);
                should.exist(res.body.history);
                (res.body.history.length).should.eql(2);
                var logs = res.body.history;
                var time = 0;
                logs.forEach(function (log) {
                  (log.headId).should.eql(eventWithNoHistory.id);
                  // check sorted by modified field
                  if (time !== 0) {
                    (log.modified).should.be.above(time);
                  }
                  time = log.modified;
                  (_.omit(log, ['id', 'headId', 'modified', 'modifiedBy', 'content'])).should.eql(
                    _.omit(eventWithNoHistory,
                      ['id', 'headId', 'modified', 'modifiedBy', 'content']));
                });
                stepDone();
              });
          }
        ], done);
      });

      it('must generate history of the running event that was stopped because of the start call ' +
        'on another event',
        function (done) {
          done();
        });


      it('must not generate history when no event was stopped in the procedure of the start call ' +
        'on another event',
        function (done) {
          done();
        });

      it('must generate history when calling stop on a running event', function (done) {
        done();
      });

    });

  });

  // TODO implement after Events
  describe('Streams', function () {

    describe('deletionMode=\'keep-nothing\'', function () {

      it('must not delete the events\' history when their stream is deleted with ' +
      ' mergeEventsWithParents=true', function (done) {
        done();
      });

      it('must delete the events\' history when their stream is deleted with ' +
      ' mergeEventsWithParents=false', function (done) {
        done();
      });

    });

    describe('deletionMode=\'keep-authors\'', function () {

      it('must not delete the events\' history when their stream is deleted with ' +
      ' mergeEventsWithParents=true', function (done) {
        done();
      });

      it('must keep the events\' minimal history when their stream is deleted with ' +
      ' mergeEventsWithParents=false', function (done) {
        done();
      });
    });

    describe('deletionMode=\'keep-everything\'', function () {

      it('must not delete the events\' history when their stream is deleted with ' +
      ' mergeEventsWithParents=true', function (done) {
        done();
      });

      it('must not delete the events\' history when their stream is deleted with ' +
      ' mergeEventsWithParents=false', function (done) {
        done();
      });
    });

  });

});