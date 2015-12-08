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
    request = null;

  function path(eventId) {
    var resPath = '/' + user.username + '/events';
    if (eventId) {
      resPath += '/' + eventId;
    }
    return resPath;
  }

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

    it('must not return logged events when calling events.get', function (done) {

      var queryParams = {limit: 100};

      request.get(path(null)).query(queryParams).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result
        });
        res.body.events.forEach(function (event) {
          should.not.exist(event.headId);
        });
        done();
      });
    });

    describe('forceKeepHistory is off', function () {

      before(function (done) {
        helpers.dependencies.settings.forceKeepHistory = false;
        async.series([
          server.ensureStarted.bind(server, helpers.dependencies.settings)
        ], done);
      });

      it('must not return any history when calling getOne with includePreviousVersions set',
        function (done) {
          var updateData = {
            content: 'updateContent'
          };
          async.series([
            function updateEvent(stepDone) {
              request.put(path(original.id)).send(updateData).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.update.result
                });
                stepDone();
              });
            },
            function callGetOne(stepDone) {
              request.get(path(original.id, {includePreviousVersions: true})).end(function (res) {
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


    describe('forceKeepHistory is on', function () {

      beforeEach(resetEvents);

      describe.skip('keep-nothing', function () {

        before(function (done) {
          helpers.dependencies.settings.forceKeepHistory = true;
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
            function verifyNoStoredLog(stepDone) {
              storage.database.findOne(storage.getCollectionInfo(user), {
                  _headId: original.id}, {},
                function (err, dbEvent) {
                  should.not.exist(dbEvent);
                  stepDone();
                });
            }/*,
             function makeGetOneRequestWithIncludePreviousVersions (stepDone) {
             request.get(path +
             '?=includePreviousVersions=true').end(function (res) {
             validation.check(res, {
             status: 200,
             schema: methodsSchema.getOne.result
             });
             should.not.exist(res.history);
             stepDone();
             });
             }*/
          ], done);
        });

        it('must create a new log when deleting an event', function (done) {
          // delete an event
          // fetch it with flag includePreviousVersions
          // assert that nothing comes along although we just did a modification
          async.series([
            function deleteEvent(stepDone) {
              request.del(path).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.del.result
                });
                stepDone();
              });
            },
            function verifyNoStoredLog(stepDone) {
              storage.database.findOne(storage.getCollectionInfo(user), {
                  _headId: original.id}, {},
                function (err, dbEvent) {
                  should.not.exist(dbEvent);
                  stepDone();
                });
            }/*,
             function makeGetOneRequestWithIncludePreviousVersions (stepDone) {
             request.get(path +
             '?=includePreviousVersions=true').end(function (res) {
             validation.check(res, {
             status: 200,
             schema: methodsSchema.getOne.result
             });
             should.not.exist(res.history);
             stepDone();
             });
             }*/
          ], done);
        });

      });

      describe.skip('keep-history', function () {

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
          var data = {
            content: 'newContent'
          };
          async.series([
            function update(stepDone) {
              request.put(path).send(data).end(function (res) {
                //console.log('res of update', res.body);
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
                  headId: original.id}, {},
                function (err, dbEvent) {
                  should.exist(dbEvent);
                  should.exist(dbEvent.modifiedBy);
                  should.exist(dbEvent.modified);
                  stepDone();
                });
            }/*,
             function makeGetOneRequestWithIncludePreviousVersions (stepDone) {
             request.get(path +
             '?=includePreviousVersions=true').end(function (res) {
             validation.check(res, {
             status: 200,
             schema: methodsSchema.getOne.result
             });
             should.exist(res.history);
             res.history.length.should.eql(1);
             var record = res.history[0];
             should.exist(record.id);
             should.exist(record.modified);
             should.exist(record.modifiedBy);
             record.headId.should.eql(original.id);
             stepDone();
             });
             }*/
          ], done);
        });

        it('must create a new log when deleting an event', function (done) {
          // delete an event
          // fetch it with flag includePreviousVersions
          // assert that we receive the previous version's history, i.e. {id, timestamp, modifiedBy}
          async.series([
            function deleteEvent(stepDone) {
              request.del(path).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.del.result
                });
                stepDone();
              });
            },
            function verifyStoredLog(stepDone) {
              storage.database.findOne(storage.getCollectionInfo(user), {
                  headId: original.id}, {},
                function (err, dbEvent) {
                  should.exist(dbEvent);
                  stepDone();
                });
            }/*,
             function makeGetOneRequestWithIncludePreviousVersions (stepDone) {
             request.get(path +
             '?=includePreviousVersions=true').end(function (res) {
             validation.check(res, {
             status: 200,
             schema: methodsSchema.getOne.result
             });
             should.exist(res.history);
             res.history.length.should.eql(1);
             var record = res.history[0];
             should.exist(record.id);
             should.exist(record.modified);
             should.exist(record.modifiedBy);
             record.headId.should.eql(original.id);
             stepDone();
             });
             }*/
          ], done);
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
          var data = {
            content: 'newContent'
          };
          async.series([
            function update(stepDone) {
              request.put(path).send(data).end(function (res) {
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
                  headId: original.id}, {},
                function (err, dbEvent) {
                  should.exist(dbEvent);
                  should.exist(dbEvent.modifiedBy);
                  should.exist(dbEvent.modified);
                  should.exist(dbEvent);
                  stepDone();
                });
            }/*,
             function makeGetOneRequestWithIncludePreviousVersions (stepDone) {
             request.get(path +
             '?=includePreviousVersions=true').end(function (res) {
             validation.check(res, {
             status: 200,
             schema: methodsSchema.getOne.result
             });
             should.exist(res.history);
             res.history.length.should.eql(1);
             var record = res.history[0];
             should.exist(record.id);
             should.exist(record.modified);
             should.exist(record.modifiedBy);
             record.headId.should.eql(original.id);
             stepDone();
             });
             }*/
          ], done);
        });

        it('must create a new log when deleting an event', function (done) {
          // delete an event
          // fetch it with flag includePreviousVersions
          // assert that we receive the previous version's full history, i.e. all fields
          async.series([
            function deleteEvent(stepDone) {
              request.del(path).end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.del.result
                });
                stepDone();
              });
            },
            function verifyStoredLog(stepDone) {
              storage.database.findOne(storage.getCollectionInfo(user), {
                  headId: original.id}, {},
                function (err, dbEvent) {
                  should.exist(dbEvent);
                  stepDone();
                });
            }/*,

             function makeGetOneRequestWithIncludePreviousVersions (stepDone) {
             request.get(path +
             '?=includePreviousVersions=true').end(function (res) {
             validation.check(res, {
             status: 200,
             schema: methodsSchema.getOne.result
             });
             should.exist(res.history);
             res.history.length.should.eql(1);
             var record = res.history[0];
             should.exist(record.id);
             should.exist(record.modified);
             should.exist(record.modifiedBy);
             record.headId.should.eql(original.id);
             stepDone();
             });
             }*/
          ], done);
        });

    });

    });

  });

  // TODO implement after Events
  describe('Streams', function () {

  });

  function resetEvents(done) {
    async.series([
      testData.resetEvents,
      testData.resetAttachments
    ], done);
  }

});