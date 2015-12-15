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
    settings.audit.forceKeepHistory = false;
    server.ensureStarted.call(server, settings, done);
  });

  describe('Events', function () {

    var original = testData.events[16];
    var trashedEvent = testData.events[19];

    it('must not return logged events when calling events.get', function (done) {

      //var queryParams = {limit: 100, streams: [testData.streams[0].children[0].id]};
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

    describe.skip('deletionMode', function () {

      beforeEach(function (done) {
        resetEvents(done);
      });

      it('must delete the event\'s history when deleting an event with deletionMode=keep-nothing',
        function (done) {
          var settings = _.cloneDeep(helpers.dependencies.settings);
          settings.audit.deletionMode = 'keep-nothing';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(trashedEvent.id)).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.del.result
                });
                res.body.eventDeletion.id.should.eql(trashedEvent.id);
                stepDone();
              });
            },
            function findDeletionInStorage(stepDone) {
              storage.findDeletion(user, {id: trashedEvent.id}, null, function (err, event) {
                if (err) {
                  return stepDone(err);
                }
                should.exist(event);
                event.id.should.eql(trashedEvent.id);
                should.exist(event.deleted);
                stepDone();
              });
            },
            function checkThatHistoryIsDeleted (stepDone) {
              var query = {
                headId: trashedEvent.id
              };

              storage.findPreviousVersions(user, query, null, function (err, events) {
                if (err) {
                  return stepDone(err);
                }
                (events.length).should.be.eql(0);
                stepDone();
              });
            }
          ], done);
        });

      it.skip('must minimize the history when deleting an event with deletionMode=keep-history',
        function (done) {
          var settings = _.cloneDeep(helpers.dependencies.settings);
          settings.audit.deletionMode = 'keep-history';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(original.id)).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.del.result
                });
                stepDone();
              });
            },
            function callGetOne(stepDone) {
              request.get(pathToEvent(original.id)).query({includePreviousVersions: true}).end(
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

      it.skip('must not modify the history when deleting an event with ' +
        'deletionMode=keep-everything',
        function (done) {
          var settings = _.cloneDeep(helpers.dependencies.settings);
          settings.audit.deletionMode = 'keep-everything';

          async.series([
            server.ensureStarted.bind(server, settings),
            function deleteEvent(stepDone) {
              request.del(pathToEvent(original.id)).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.del.result
                });
                stepDone();
              });
            },
            function callGetOne(stepDone) {
              request.get(pathToEvent(original.id)).query({includePreviousVersions: true}).end(
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
    });

    describe.skip('getOne', function () {

      it('must not return history when calling getOne with includePreviousVersions flag off',
        function (done) {
          request.get(pathToEvent(original.id)).query({includePreviousVersions: false}).end(
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

      it('must return history when calling getOne with includePreviousVersions flag on',
        function (done) {
          request.get(pathToEvent(original.id)).query({includePreviousVersions: true}).end(
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
    });

    describe.skip('forceKeepHistory is OFF', function () {

      before(function (done) {
        var settings = _.cloneDeep(helpers.dependencies.settings);
        settings.audit.forceKeepHistory = false;
        server.ensureStarted.call(server, settings, done);
      });

      beforeEach(function (done) {
        resetEvents(done);
      });

      it('must not generate a log when updating an event', function (done) {
        var updateData = {
          content: 'updated content'
        };
        async.series([
          function updateEvent(stepDone) {
            request.put(pathToEvent(original.id)).send(updateData).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });
              stepDone();
            });
          },
          function callGetOne(stepDone) {
            request.get(pathToEvent(original.id)).query({includePreviousVersions: true}).end(
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

      it.skip('must not create a log of the running event that was stopped ' +
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
              function fetchHistoryOfStoppedEvent (stepDone) {
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

      it('must not create a log when no event was stopped in the procedure of the start call ' +
        'on another event',
        function (done) {
          done();
        });

      it('must not create a log when calling stop on a running event', function (done) {
        done();
      });

    });


    describe.skip('forceKeepHistory is ON', function () {

      beforeEach(resetEvents);

      before(function (done) {
        var settings = _.cloneDeep(helpers.dependencies.settings);
        settings.audit.forceKeepHistory = true;
        async.series([
          server.ensureStarted.bind(server, settings)
        ], done);
      });

      it('must create a new log when updating an event', function (done) {
        var updateData = {
          content: 'first updated content'
        };
        async.series([
          function updateEventOnce(stepDone) {
            request.put(pathToEvent(original.id)).send(updateData).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });
              stepDone();
            });
          },
          function updateEventTwice(stepDone) {
            updateData.content = 'second updated content';
            request.put(pathToEvent(original.id)).send(updateData).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });
              stepDone();
            });
          },
          function callGetOne(stepDone) {
            request.get(pathToEvent(original.id)).query({includePreviousVersions: true}).end(
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
                  (log.headId).should.eql(original.id);
                  // check sorted by modified field
                  if (time !== 0) {
                    (log.modified).should.be.above(time);
                  }
                  time = log.modified;
                  (_.omit(log, ['id', 'headId', 'modified', 'modifiedBy', 'content'])).should.eql(
                    _.omit(original, ['id', 'headId', 'modified', 'modifiedBy', 'content']));
                });
                stepDone();
              });
          }
        ], done);
      });

      it('must create a log of the running event that was stopped because of the start call ' +
        'on another event',
        function (done) {
          done();
        });


      it('must not create a log when no event was stopped in the procedure of the start call ' +
        'on another event',
        function (done) {
          done();
        });

      it('must create a log when calling stop on a running event', function (done) {
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

    describe('deletionMode=\'keep-history\'', function () {

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

  function resetEvents(done) {
    async.series([
      testData.resetEvents,
      testData.resetAttachments
    ], done);
  }

});