/*global describe, before, beforeEach, after, it */

var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    should = require('should'), // explicit require to benefit from static functions
    validation = helpers.validation,
    testData = helpers.data,
    timestamp = require('unix-timestamp'),
    _ = require('lodash');

describe('Access permissions', function () {

  var user = testData.users[0],
      request = null, // must be set after server instance started
      filesReadTokenSecret = helpers.dependencies.settings.auth.filesReadTokenSecret;

  function token(testAccessIndex) {
    return testData.accesses[testAccessIndex].token;
  }

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) { request = helpers.request(server.url); stepDone(); }
    ], done);
  });

  describe('Events', function () {

    before(function (done) {
      async.series([
        testData.resetStreams,
        testData.resetAttachments
      ], done);
    });

    beforeEach(testData.resetEvents);

    var basePath = '/' + user.username + '/events';

    function reqPath(id) {
      return basePath + '/' + id;
    }

    it('`get` must only return events in accessible streams', function (done) {
      var params = {
        limit: 100, // i.e. all
        state: 'all'
      };
      request.get(basePath, token(1)).query(params).end(function (res) {
        validation.checkFilesReadToken(res.body.events, testData.accesses[1],
            filesReadTokenSecret);
        validation.sanitizeEvents(res.body.events);

        res.body.events.should.eql(_.without(validation.removeDeletions(testData.events),
                testData.events[6], testData.events[7], testData.events[12])
            .reverse());

        done();
      });
    });

    it('`get` must return all events when permissions are defined for "all streams" (*)',
        function (done) {
      var params = {
        limit: 100, // i.e. all
        state: 'all'
      };
      request.get(basePath, token(2)).query(params).end(function (res) {
        validation.checkFilesReadToken(res.body.events, testData.accesses[2],
            filesReadTokenSecret);
        validation.sanitizeEvents(res.body.events);

        res.body.events.should.eql(validation.removeDeletions(testData.events).reverse());
        done();
      });
    });

    it('`get` must only return events with accessible tags', function (done) {
      request.get(basePath, token(5)).end(function (res) {
        validation.sanitizeEvents(res.body.events);
        res.body.events.should.eql(_.at(testData.events, 11, 3, 2, 0));
        done();
      });
    });

    it('`get` must only return events in accessible streams *and* with accessible tags when both ' +
        'are defined', function (done) {
      request.get(basePath, token(6)).end(function (res) {
        validation.sanitizeEvents(res.body.events);
        res.body.events.should.eql(_.at(testData.events, 0));
        done();
      });
    });

    it('`get` (or any request) must alternatively accept the access token in the query string',
        function (done) {
      var query = {
        auth: token(1),
        streams: [testData.streams[2].children[0].id],
        state: 'all'
      };
      request.get(basePath, token(1)).unset('Authorization').query(query).end(function (res) {
        res.body.events.should.eql([testData.events[8]]);
        done();
      });
    });

    it('must forbid getting an attached file if permissions are insufficient', function (done) {
      var event = testData.events[0],
          attachment = event.attachments[0];
      request.get(reqPath(event.id) + '/' + attachment.id, token(3)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid creating events for \'read-only\' streams', function (done) {
      var params = {
        type: 'test/test',
        streamId: testData.streams[0].id
      };
      request.post(basePath, token(1)).send(params).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid creating events for \'read-only\' tags', function (done) {
      var params = {
        type: 'test/test',
        streamId: testData.streams[0].id,
        tags: ['fragilistic']
      };
      request.post(basePath, token(5)).send(params).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid updating events for \'read-only\' streams', function (done) {
      // also check recursive permissions
      request.put(reqPath(testData.events[0].id), token(1)).send({content: {}}).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid updating events for \'read-only\' tags', function (done) {
      request.put(reqPath(testData.events[11].id), token(5)).send({content: {}})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid stopping events for \'read-only\' streams', function (done) {
      request.post(basePath + '/stop', token(2)).send({id: testData.events[9].id})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid stopping events for \'read-only\' tags', function (done) {
      request.post(basePath + '/stop', token(5)).send({id: testData.events[11].id})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid deleting events for \'read-only\' streams', function (done) {
      request.del(reqPath(testData.events[1].id), token(1)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid deleting events for \'read-only\' tags', function (done) {
      request.del(reqPath(testData.events[11].id), token(5)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must allow creating events for \'contribute\' streams', function (done) {
      var data = {
        time: timestamp.now('-5h'),
        duration: timestamp.duration('1h'),
        type: 'test/test',
        streamId: testData.streams[1].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        res.statusCode.should.eql(201);
        done();
      });
    });

    it('must allow creating events for \'contribute\' tags', function (done) {
      var data = {
        type: 'test/test',
        streamId: testData.streams[1].id,
        tags: ['super']
      };
      request.post(basePath, token(5)).send(data).end(function (res) {
        res.statusCode.should.eql(201);
        done();
      });
    });

  });

  describe('Streams', function () {

    before(testData.resetEvents);

    beforeEach(testData.resetStreams);

    var basePath = '/' + user.username + '/streams';

    function reqPath(id) {
      return basePath + '/' + id;
    }

    // note: personal (i.e. full) access is implicitly covered by streams/events tests

    it('`get` must only return streams for which permissions are defined', function (done) {
      request.get(basePath, token(1)).query({state: 'all'}).end(function (res) {
        res.body.streams.should.eql([
          // must not include inaccessible parentIds
          _.omit(testData.streams[0], 'parentId'),
          _.omit(testData.streams[1], 'parentId'),
          _.omit(testData.streams[2].children[0], 'parentId')
        ]);

        done();
      });
    });

    it('must forbid creating child streams in \'read-only\' streams', function (done) {
      var data = {
        name: 'Tai Ji',
        parentId: testData.streams[0].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid creating child streams in \'contribute\' streams', function (done) {
      var data = {
        name: 'Xing Yi',
        parentId: testData.streams[1].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid deleting child streams in \'contribute\' streams', function (done) {
      request.del(reqPath(testData.streams[1].children[0].id), token(1)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid updating \'contribute\' streams', function (done) {
      request.put(reqPath(testData.streams[1].id), token(1)).send({name: 'Ba Gua'})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid deleting \'contribute\' streams', function (done) {
      request.del(reqPath(testData.streams[1].id), token(1)).query({mergeEventsWithParent: true})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must allow creating child streams in \'managed\' streams', function (done) {
      var data = {
        name: 'Dzogchen',
        parentId: testData.streams[2].children[0].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        res.statusCode.should.eql(201);
        done();
      });
    });

    it('must forbid moving streams into non-\'managed\' parent streams', function (done) {
      var update = {parentId: testData.streams[1].id};
      request.put(reqPath(testData.streams[2].children[0].id), token(1))
          .send(update).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must allow deleting child streams in \'managed\' streams', function (done) {
      request.del(reqPath(testData.streams[2].children[0].children[0].id), token(1))
      .end(function (res) {
        res.statusCode.should.eql(200); // trashed -> considered an update
        done();
      });
    });

    it('must recursively apply permissions to the streams\' child streams', function (done) {
      var data = {
        name: 'Zen',
        parentId: testData.streams[0].children[0].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must allow access to all streams when no specific stream permissions are defined',
        function (done) {
      request.get(basePath, token(2)).query({state: 'all'}).end(function (res) {
        res.body.streams.should.eql(validation.removeDeletions(testData.streams));
        done();
      });
    });

    it('must allow access to all streams when only tag permissions are defined', function (done) {
      request.get(basePath, token(5)).query({state: 'all'}).end(function (res) {
        res.body.streams.should.eql(validation.removeDeletions(testData.streams));
        done();
      });
    });

    it('must only allow access to set streams when both tag and stream permissions are defined',
        function (done) {
      request.get(basePath, token(6)).end(function (res) {
        res.body.streams.should.eql([_.omit(testData.streams[0], 'parentId')]);
        done();
      });
    });

  });

  describe('Auth and change tracking', function () {

    before(testData.resetStreams);

    beforeEach(testData.resetEvents);

    var basePath = '/' + user.username + '/events',
        sharedAccessIndex = 1,
        callerId = 'test-caller-id',
        auth = token(sharedAccessIndex) + ' ' + callerId;
    var newEventData = {
      type: 'test/test',
      streamId: testData.streams[1].id
    };

    it('must handle optional caller id in auth (in addition to token)', function (done) {
      request.post(basePath, auth).send(newEventData).end(function (res) {
        res.statusCode.should.eql(201);
        var event = res.body.event,
            expectedAuthor = testData.accesses[sharedAccessIndex].id + ' ' + callerId;
        event.createdBy.should.eql(expectedAuthor);
        event.modifiedBy.should.eql(expectedAuthor);
        done();
      });
    });

    describe('custom auth step (e.g. to validate/parse caller id)', function () {

      var fileName = 'customAuthStepFn.js',
          srcPath = path.join(__dirname, 'permissions.fixtures', fileName),
          destPath = path.join(__dirname, '../../../custom-extensions', fileName);

      before(function (done) {
        async.series([
          function setupCustomAuthStep(stepDone) {
            fs.readFile(srcPath, function (err, data) {
              if (err) {
                return stepDone(err);
              }
              fs.writeFile(destPath, data, stepDone);
            });
          },
          server.restart.bind(server)
        ], function (err) { 
          if (err) {
            throw new Error(err);
          }
          if (! fs.existsSync(destPath)) {
            throw new Error('Failed creating :' + destPath);
          }
          done(err);
        });
      });

      after(function (done) {
        async.series([
          function teardownCustomAuthStep(stepDone) {
            fs.unlink(destPath, stepDone);
          },
          server.restart.bind(server)
        ], done);
      });

      it('must be supported and deny access when failing', function (done) {
        request.post(basePath, auth).send(newEventData).end(function (res) {
          validation.checkErrorInvalidAccess(res, done);
        });
      });

      it('must allow access when successful', function (done) {
        var successAuth = token(sharedAccessIndex) + ' Georges (unparsed)';
        request.post(basePath, successAuth).send(newEventData).end(function (res) {
          res.statusCode.should.eql(201);
          var event = res.body.event,
              expectedAuthor = testData.accesses[sharedAccessIndex].id + ' Georges (parsed)';
          event.createdBy.should.eql(expectedAuthor);
          event.modifiedBy.should.eql(expectedAuthor);
          done();
        });
      });

      it('must fail properly (i.e. not granting access) when the custom function crashes',
          function (done) {
        var crashAuth = token(sharedAccessIndex) + ' Please Crash';
        request.post(basePath, crashAuth).send(newEventData).end(function (res) {
          res.statusCode.should.eql(500);
          done();
        });
      });

      it('must validate the custom function at startup time', function (done) {
        async.series([
          function setupCustomAuthStep(stepDone) {
            var srcPath = path.join(__dirname, 'permissions.fixtures', 'customAuthStepFn.invalid');
            fs.readFile(srcPath, function (err, data) {
              fs.writeFile(destPath, data, stepDone);
            });
          },
          server.restart.bind(server)
        ], function (err) {
          should.exist(err);
          // basic validation; users are expected to check console output
          err.message.should.match(/Server failed/);
          done();
        });
      });

    });

  });

});
