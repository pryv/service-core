/**
 * Created by ik on 11/23/15.
 */

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

describe('events-versioning', function () {

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
  server.on('events-changed', function () {
    eventsNotifCount++;
  });

  before(function (done) {
    helpers.dependencies.settings.forceKeepHistory = true
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
  })


  describe('GET /<event id>', function () {

    before(resetEvents);

    it('must return the requested event');

    it('must return the requested event with its history (deletion scheme:keep-history)');

    it('must return the requested event with its full history (deletion scheme:keep-everything)')

    it('must return the requested event without history although it was requested (deletion scheme:keep-nothing');

    it('must return an error when no event exists with such an id');


  });

  describe('PUT /<id>', function () {

    beforeEach(resetEvents);

    if('must create an event with the previous data and store it with a new id', function (done) {
        var original = testData.events[0],
          time;
        var data = {
          content: 'new modified content!'
        };
        async.series([
          function update(stepDone) {
            request.put(path(original.id)).send(data).end(function (res) {
              time = timestamp.now();
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });
              stepDone();
            });
          },
          function verifyStoredItem(stepDone) {
            storage.database.findOne(storage.getCollectionInfo(user), {_id: original.id}, {},
              function (err, dbEvent) {
                dbEvent.content.should.eql(data.content);
                stepDone();
              });
          },
          function verifyStoredOldVersion(stepDone) {
            // need to retrieve generated id somehow
            var oldId = 'oldVersionId';
            storage.database.findOne(storage.getCollectionInfo(user),
              {_id: oldId}, {},
              function (err, dbEvent) {
                dbEvent.headId.should.eql(original.id);
                stepDone();
              });
          }
        ], done);
      });

    it('must not create keep older versions if the flag \'forceKeepHistory\' is not set');

  });

  function resetEvents(done) {
    eventsNotifCount = 0;
    async.series([
      testData.resetEvents,
      testData.resetAttachments
    ], done);
  }

})