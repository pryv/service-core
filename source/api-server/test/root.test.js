/*global describe, before, beforeEach, it */

require('./test-helpers'); 
var helpers = require('./helpers'),
    async = require('async'),
    server = helpers.dependencies.instanceManager,
    ErrorIds = require('components/errors').ErrorIds,
    should = require('should'), // explicit require to benefit from static functions
    methodsSchema = require('../src/schema/generalMethods'),
    url = require('url'),
    testData = helpers.data,
    superagent = require('superagent'),
    validation = helpers.validation,
    timestamp = require('unix-timestamp'),
    _ = require('lodash');

describe('root', function () {

  var user = testData.users[0],
      // these must be set after server instance started
      request = null,
      accessId = null;

  before(function (done) {
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
        helpers.dependencies.storage.user.accesses.findOne(user, {token: request.token}, null,
            function (err, access) {
          accessId = access.id;
          stepDone();
        });
      }
    ], done);
  });

  function path() {
    return url.resolve(server.url, '/');
  }

  describe('GET /', function () {

    /*jshint -W030*/

    it('should return basic server meta information as JSON when requested', function (done) {
      superagent.get(path()).set('Accept', 'application/json').end(function (res) {
        res.statusCode.should.eql(200);
        res.should.be.json;
        validation.checkMeta(res.body);
        done();
      });
    });

    it('should return basic server meta information as text otherwise', function (done) {
      superagent.get(path()).set('Accept', 'text/html').end(function (res) {
        res.statusCode.should.eql(200);
        res.should.be.text;
        res.text.should.match(/Pryv API/);
        done();
      });
    });

    it('should return an error if trying to access an unknown user account', function (done) {
      superagent.get(path() + 'unknown_user/events').end(function (res) {
        res.statusCode.should.eql(404);
        done();
      });
    });

  });

  // warning: the following tests assume the server instance is started, which is done in the
  //          previous test above

  describe('All requests:', function () {

    it('should return correct common HTTP headers + meta data in response body', function (done) {
      var origin = 'https://test.pryv.io',
          allowMethod = 'GET',
          allowHeaders = 'Content-Type';
      request.get(path() + user.username + '/events')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', allowMethod)
          .set('Access-Control-Request-Headers', allowHeaders)
          .end(function (res) {
        res.statusCode.should.eql(200);

        validation.checkHeaders(res, [
          { name: 'Access-Control-Allow-Origin', value: origin },
          { name: 'Access-Control-Allow-Methods', value: allowMethod },
          { name: 'Access-Control-Allow-Headers', value: allowHeaders },
          { name: 'Access-Control-Expose-Headers', value: 'API-Version' },
          { name: 'Access-Control-Allow-Credentials', value: 'true' },
          { name: 'API-Version', value: require('../package.json').version }
        ]);

        validation.checkMeta(res.body);

        should.not.exist(res.headers['x-powered-by']);

        done();
      });
    });

    it('should return meta data in response body for errors as well', function (done) {
      request.get(path() + user.username + '/bad-path').end(function (res) {
        res.statusCode.should.eql(404);
        validation.checkMeta(res.body);
        done();
      });
    });

    it('should properly translate the Host header\'s username (i.e. subdomain)', function (done) {
      request.get(path() + 'events')
          .set('Host', user.username + '.pryv.local')
          .end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

    it('should translate the username in subdomain also when it only contains numbers',
        function (done) {
      var u = testData.users[2];
      superagent.post(path() + 'auth/login')
          .send({ username: u.username, password: u.password, appId: 'pryv-test' })
          .set('Host', u.username + '.pryv.local')
          .set('Origin', 'http://test.pryv.local')
          .end(function (res) {
            res.statusCode.should.eql(200);
            done();
          });
    });

    it('should support POSTing "urlencoded" content with _json and _auth fields', function (done) {
      request.post(path() + user.username + '/streams')
          .type('form')
          .unset('authorization')
          .send({_auth: request.token})
          .send({_json: JSON.stringify({name: 'New stream'})})
          .end(function (res) {
        res.statusCode.should.eql(201);
        done();
      });
    });

    it('should support POSTing "urlencoded" content with _json, _method (PUT) and _auth fields',
        function (done) {
      request.post(path() + user.username + '/streams/' + testData.streams[3].id)
          .type('form')
          .unset('authorization')
          .send({_auth: request.token})
          .send({_method: 'PUT'})
          .send({_json: JSON.stringify({name: 'Abrhackadabra'})})
          .end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

    it('should support POSTing "urlencoded" content with _json, _method (DELETE) and _auth fields',
        function (done) {
      request.post(path() + user.username + '/streams/' + testData.streams[3].id)
          .type('form')
          .unset('authorization')
          .query({mergeEventsWithParent: false})
          .send({_auth: request.token})
          .send({_method: 'DELETE'})
          .end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

    it('should properly handle JSON errors when POSTing "urlencoded" content with _json field',
        function (done) {
      request.post(path() + user.username + '/streams')
          .type('form')
          .unset('authorization')
          .send({_auth: request.token})
          .send({_json: '{"name": "New stream"'}) // <- missing closing brace
          .end(function (res) {
        res.statusCode.should.eql(400);
        done();
      });
    });

    it('should update the access\'s "last used" time and *internal* request counters',
        function (done) {
      var expectedTime,
          calledMethodKey = 'events:get',
          originalCallCount;
      async.series([
        function checkOriginalAccess(stepDone) {
          helpers.dependencies.storage.user.accesses.findOne(user, {id: accessId}, null,
              function (err, access) {
            originalCallCount = (access.calls && access.calls[calledMethodKey]) ?
                access.calls[calledMethodKey] : 0;
            stepDone();
          });
        },
        function doRequest(stepDone) {
          request.get(path() + user.username + '/events').end(function () {
            expectedTime = timestamp.now();
            stepDone();
          });
        },
        function checkUpdatedAccess(stepDone) {
          helpers.dependencies.storage.user.accesses.findOne(user, {id: accessId}, null,
              function (err, access) {
            should.exist(access.lastUsed);
            Math.round(access.lastUsed).should.eql(Math.round(expectedTime));

            should.exist(access.calls);
            should.exist(access.calls[calledMethodKey]);
            access.calls[calledMethodKey].should.eql(originalCallCount + 1, 'number of calls');

            stepDone();
          });
        },
        function checkExposedAccess(stepDone) {
          request.get(path() + user.username + '/accesses').end(function (res) {
            var exposed = _.find(res.body.accesses, {id: accessId});
            should.not.exist(exposed.calls);
            stepDone();
          });
        }
      ], done);
    });

  });

  describe('OPTIONS /', function () {

    it('should return OK', function (done) {
      superagent.options(path()).end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

  });

  describe('GET /access-info', function () {

    var infoAccess = testData.accesses[1];

    it('must return current access information', function (done) {
      request.get('/' + user.username + '/access-info', infoAccess.token).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.getAccessInfo.result,
          body: {
            type: infoAccess.type,
            name: infoAccess.name,
            permissions: infoAccess.permissions
          }
        }, done);
      });
    });

  });

  describe('POST / (i.e. batch call)', function () {

    beforeEach(resetEvents);

    var path = '/' + user.username,
        testType = 'test/test',
        eventsNotifCount = 0;
    server.on('events-changed', function () { eventsNotifCount++; });

    it('must execute the given method calls and return the results', function (done) {
      var calls = [
        {
          method: 'events.create',
          params: {
            streamId: testData.streams[0].id,
            time: timestamp.now(),
            type: testType,
            description: 'valid event A'
          }
        },
        {
          method: 'events.create',
          params: {
            streamId: testData.streams[0].id,
            time: timestamp.now('1h'),
            duration: timestamp.duration('1h'),
            type: testType,
            description: 'valid event B',
            tags: ['hop']
          }
        },
        {
          method: 'events.create',
          params: {
            time: timestamp.now('2h'),
            type: testType,
            streamId: 'unknown',
            description: 'invalid event C (unknown stream)'
          }
        }
      ];
      request.post(path).send(calls).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.callBatch.result
        });

        var results = res.body.results;

        results.length.should.eql(calls.length, 'method call results');

        should.exist(results[0].event);
        validation.checkObjectEquality(results[0].event, _.defaults({
          id: results[0].event.id,
          tags: []
        }, calls[0].params));

        should.exist(results[1].event);
        validation.checkObjectEquality(results[1].event, _.defaults({
          id: results[1].event.id
        }, calls[1].params));
        should.exist(results[1].stoppedId);
        results[1].stoppedId.should.eql(testData.events[9].id);

        should.exist(results[2].error);
        results[2].error.id.should.eql(ErrorIds.UnknownReferencedResource);

        eventsNotifCount.should.eql(2, 'events notifications');

        done();
      });
    });

    it('must execute the method calls containing events.get and ' +
      'return the results', function (done) {
      var streamId = 'batch-call-streamId',
          calls = [
        {
          method: 'streams.create',
          params: {
            id: streamId,
            name: 'batch call root stream'
          }
        },
        {
          method: 'events.create',
          params: {
            streamId: streamId,
            type: 'note/txt',
            content: 'Hi, i am an event in a batch call',
            time: timestamp.now()
          }
        },
        {
          method: 'events.get',
          params: {modifiedSince: -1000000, includeDeletions: true}
        }
      ];
      request.post(path).send(calls).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.callBatch.result
        });

        validation.checkMeta(res.body);
        var results = res.body.results;

        results.length.should.eql(calls.length, 'method call results');

        should.exist(results[0].stream);
        validation.checkObjectEquality(results[0].stream, _.defaults({
          parentId: null
        }, calls[0].params));
        should.exist(results[1].event);
        validation.checkObjectEquality(results[1].event, _.defaults({
          tags: [],
          id: results[1].event.id
        }, calls[1].params));

        var getEventsResult = results[2];
        should.exist(getEventsResult.events);
        should.exist(getEventsResult.eventDeletions);

        done();
      });
    });

    it('must return an error if the sent data is badly formatted', function (done) {
      var calls = [
        {
          method: 'events.create',
          badProperty: 'bad value'
        }
      ];
      request.post(path).send(calls).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    function resetEvents(done) {
      eventsNotifCount = 0;
      testData.resetEvents(done);
    }

  });

});
