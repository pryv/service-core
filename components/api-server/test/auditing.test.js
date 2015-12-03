/*global describe, before, beforeEach, after, it */

var helpers = require('./helpers'),
  server = helpers.dependencies.instanceManager,
  async = require('async'),
  validation = helpers.validation,
  methodsSchema = require('../src/schema/eventsMethods'),
  should = require('should'), // explicit require to benefit from static functions
  storage = helpers.dependencies.storage.user.events,
  testData = helpers.data;
require('date-utils');

describe('Auditing', function () {

  var user = testData.users[0],
    basePath = '/' + user.username,
    request = null,
    access = null;

  // to verify data change notifications
  var eventsNotifCount;
  server.on('events-changed', function () {
    eventsNotifCount++;
  });

  before(function (done) {
    helpers.dependencies.settings.forceKeepHistory = true;
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

  after(function (done) {
    helpers.dependencies.settings.forceKeepHistory = null;
    delete (helpers.dependencies.settings).forceKeepHistory;
    done();
  });

  describe('Events', function () {

    var original = testData.events[0];
    var path = basePath + '/events/' + original.id;

    beforeEach(resetEvents);

    describe('keep-nothing', function () {

      before(function (done) {
        helpers.dependencies.settings.deletionScheme = 'keep-nothing';
        async.series([
          server.ensureStarted.bind(server, helpers.dependencies.settings)
        ], done);
      });

      it('must create a new log when updating an event', function (done) {
        // modify an event
        var data = {
          content: 'newContent'
        };
        async.series([
          function update(stepDone) {
            request.put(path).send(data).end(function (res) {
              console.log('res', res.body);
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });
              stepDone();
            });
          },
          function verifyStoredItem(stepDone) {
            storage.database.findOne(storage.getCollectionInfo(user),
              {_id: original.id}, {},
            function (err, dbEvent) {
              should.exist(dbEvent);
              dbEvent.id.should.eql(original.id);
              stepDone();
            });
          },
          function verifyStoredLog(stepDone) {
            storage.database.findOne(storage.getCollectionInfo(user), {
              _headId: original.id}, {},
            function (err, dbEvent) {
              should.exist(dbEvent);
              should.exist(dbEvent.headId);
              original.id.should.eql(dbEvent.headId);
              stepDone();
            });
          }
        ], done);

        // fetch it with flag includePreviousVersions
        // assert that nothing comes along although we just did a modification
      });

      it('must create a new log when deleting an event', function (done) {
        // delete an event
        // fetch it with flag includePreviousVersions
        // assert that nothing comes along although we just did a modification
        done();
      });

    });

    describe('keep-history', function () {

      before(function (done) {
        helpers.dependencies.settings.deletionScheme = 'keep-history';
        async.series([
          server.ensureStarted.bind(server, helpers.dependencies.settings)
        ], done);
      });


      after(function (done) {
        helpers.dependencies.settings.deletionScheme = 'keep-nothing';
        done();
      });

      it('must create a new log when updating an event', function (done) {
        // modify an event
        // fetch it with flag includePreviousVersions
        // assert that we receive the previous version's history, i.e. {id, timestamp, modifiedBy}
        done();
      });

      it('must create a new log when deleting an event', function (done) {
        // delete an event
        // fetch it with flag includePreviousVersions
        // assert that we receive the previous version's history, i.e. {id, timestamp, modifiedBy}
        done();
      });

    });

    describe('keep-everything', function () {

      before(function (done) {
        helpers.dependencies.settings.deletionScheme = 'keep-everything';
        async.series([
          server.ensureStarted.bind(server, helpers.dependencies.settings)
        ], done);
      });

      after(function (done) {
        helpers.dependencies.settings.deletionScheme = 'keep-nothing';
        done();
      });

      it('must create a new log when updating an event', function (done) {
        // modify an event
        // fetch it with flag includePreviousVersions
        // assert that we receive the previous version's full history, i.e. all fields
        done();
      });

      it('must create a new log when deleting an event', function (done) {
        // delete an event
        // fetch it with flag includePreviousVersions
        // assert that we receive the previous version's full history, i.e. all fields
        done();
      });

    });

  });

  // TODO implement after Events
  describe('Streams', function () {

  });

  function resetEvents(done) {
    eventsNotifCount = 0;
    async.series([
      testData.resetEvents,
      testData.resetAttachments
    ], done);
  }

});