/*global describe, before, beforeEach, it */

var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    async = require('async'),
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

    function path(id) {
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
      request.get(path(event.id) + '/' + attachment.id, token(3)).end(function (res) {
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
      request.put(path(testData.events[0].id), token(1)).send({content: {}}).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid updating events for \'read-only\' tags', function (done) {
      request.put(path(testData.events[11].id), token(5)).send({content: {}}).end(function (res) {
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
      request.del(path(testData.events[1].id), token(1)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid deleting events for \'read-only\' tags', function (done) {
      request.del(path(testData.events[11].id), token(5)).end(function (res) {
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

    function path(id) {
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
      request.del(path(testData.streams[1].children[0].id), token(1)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid updating \'contribute\' streams', function (done) {
      request.put(path(testData.streams[1].id), token(1)).send({name: 'Ba Gua'})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must forbid deleting \'contribute\' streams', function (done) {
      request.del(path(testData.streams[1].id), token(1)).query({mergeEventsWithParent: true})
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
      request.put(path(testData.streams[2].children[0].id), token(1))
          .send(update).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must allow deleting child streams in \'managed\' streams', function (done) {
      request.del(path(testData.streams[2].children[0].children[0].id), token(1))
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

});
