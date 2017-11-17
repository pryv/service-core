/*global describe, before, beforeEach, afterEach, it */

/**
 * Tests Socket.IO access to the API.
 */

var helpers = require('./helpers'),
    ErrorIds = require('components/errors').ErrorIds,
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    streamsMethodsSchema = require('../src/schema/streamsMethods'),
    eventsMethodsSchema = require('../src/schema/eventsMethods'),
    validation = helpers.validation,
    io = require('socket.io-client'),
    queryString = require('qs'),
    should = require('should'), // explicit require to benefit from static functions
    testData = helpers.data,
    timestamp = require('unix-timestamp'),
    _ = require('lodash');
const R = require('ramda');

describe('Socket.IO', function () {

  var user = testData.users[0],
      otherUser = testData.users[1],
      token = null,
      otherToken = null;

  function connect(namespace, queryParams) {
    var paramsWithNS = _.defaults({resource: namespace}, queryParams || {}),
        url = server.url + namespace + '?' + queryString.stringify(paramsWithNS);
    return io.connect(url, {'force new connection': true});
  }

  // all Socket.IO connections used in tests should be added in there to simplify cleanup
  var ioCons = {};

  function whenAllConnectedDo(callback) {
    var conKeys = Object.keys(ioCons),
        conCount = 0;
    conKeys.forEach(function (key) {
      ioCons[key].on('connect', function () {
        conCount++;
        if (conCount === conKeys.length) {
          callback();
        }
      });
    });
  }

  before(function (done) {
    var request = null,
        otherRequest = null;
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      function (stepDone) {
        // have some accesses ready for another account to check notifications
        testData.resetAccesses(stepDone, otherUser);
      },
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      },
      function (stepDone) {
        otherRequest = helpers.request(server.url);
        otherRequest.login(otherUser, stepDone);
      }
    ], function (err) {
      if (err) { return done(err); }
      token = request.token;
      otherToken = otherRequest.token;
      done();
    });
  });

  beforeEach(function (done) {
    async.series([
      testData.resetStreams,
      testData.resetEvents
    ], done);
  });

  afterEach(function (done) {
    // cleanup open connections
    Object.keys(ioCons).forEach(function (key) {
      ioCons[key].disconnect();
      delete ioCons[key];
    });
    done();
  });

  var namespace = '/' + user.username;

  it('must dynamically create a namespace for the user', function (done) {
    ioCons.con = connect(namespace, {auth: token});

    ioCons.con.on('connect', function () {
      if (! ioCons.con) { return; }
      // if we get here, communication is properly established
      done();
    });
    ioCons.con.on('error', function () { throw new Error('Connection failed.'); });
  });

  it('must connect to a user with a dash in the username', function (done) {

    var dashUser = testData.users[4];
    var dashRequest = null;
    
    async.series([
      function (stepDone) {
        testData.resetAccesses(stepDone, dashUser);
      },
      function (stepDone) {
        dashRequest = helpers.request(server.url);
        dashRequest.login(dashUser, stepDone);
      },
      function (stepDone) {
        ioCons.con = connect('/' + dashUser.username, {auth: testData.accesses[2].token});

        ioCons.con.on('error', function (e) {
          should.not.exist(e);
          stepDone(e);
        });

        ioCons.con.on('connect', function () {
          should.exist(ioCons.con);
          stepDone();
        });
      }
    ], function (err) {
      if (err) { return done(err); }
      done();
    });
  });

  it('must refuse connection if no valid access token is provided', function (done) {
    ioCons.con = connect(namespace);

    ioCons.con.socket.on('error', function () {
      if (! ioCons.con) { return; }
      done();
    });

    ioCons.con.on('connect', function () {
      throw new Error('Connecting should have failed');
    });
  });

  describe('calling API methods', function () {

    afterEach(function (done) {
      // restart server if crashed
      if (server.crashed()) {
        return server.restart(done);
      }
      done();
    });

    it('must properly route method call messages for events and return the results, ' +
      'including meta',
        function (done) {
      ioCons.con = connect(namespace, {auth: token});
      var params = {
        sortAscending: true,
        state: 'all',
        includeDeletions: true,
        modifiedSince: -10000
      };
      ioCons.con.emit('events.get', params, function (err, result) {
        validation.checkSchema(result, eventsMethodsSchema.get.result);
        validation.sanitizeEvents(result.events);

        result.events.should.eql(validation.removeDeletionsAndHistory(_.clone(testData.events)
          .sort(function (a, b) {
            return a.time - b.time;
          }
        )));

        // check deletions
        let deleted = R.filter(R.where({deleted: R.equals(true)}), testData.events);
        for (let el of deleted) {
          let deletion = R.find(R.where({id: R.equals(el.id)}), result.eventDeletions);
          
          should(deletion).not.be.empty();
          should(deletion.deleted).be.true(); 
        }
        
        // check untrashed
        let getId = (e) => e.id; 
        let sortById = R.sortBy(getId);
        
        let resultEvents = sortById(result.events);
        let activeEvents = R.compose(sortById, R.reject(R.has('headId')));
        let activeTestEvents = activeEvents(
          validation.removeDeletions(testData.events));
        
        should(
          resultEvents
        ).be.eql(activeTestEvents);

        validation.checkMeta(result);
        done();
      });
    });

    it('must properly route method call messages for streams and return the results',
        function (done) {
      ioCons.con = connect(namespace, {auth: token});
      ioCons.con.emit('streams.get', {state: 'all'}, function (err, result) {
        validation.checkSchema(result, streamsMethodsSchema.get.result);
        result.streams.should.eql(validation.removeDeletions(testData.streams));
        done();
      });
    });

    it('must not crash when callers omit the callback', function (done) {
      ioCons.con = connect(namespace, {auth: token});
      ioCons.con.emit('events.get', {} /* no callback here */);
      process.nextTick(function () {
        server.crashed().should.eql(false);
        done();
      });
    });

    it('must fail if the called target does not exist', function (done) {
      ioCons.con = connect(namespace, {auth: token});
      ioCons.con.emit('badTarget.get', {}, function (err) {
        validation.checkSchema(err, validation.schemas.errorResult);
        err.error.id.should.eql(ErrorIds.InvalidMethod);
        done();
      });
    });

    it('must fail if the called method does not exist', function (done) {
      ioCons.con = connect(namespace, {auth: token});
      ioCons.con.emit('streams.badMethod', {}, function (err) {
        validation.checkSchema(err, validation.schemas.errorResult);
        err.error.id.should.eql(ErrorIds.InvalidMethod);
        done();
      });
    });

    it('must return API errors properly, including meta', function (done) {
      ioCons.con = connect(namespace, {auth: token});
      ioCons.con.emit('events.create', {badParam: 'bad-data'}, function (err/*, result*/) {
        validation.checkSchema(err, validation.schemas.errorResult);
        validation.checkMeta(err);
        done();
      });
    });

    it('must notify other sockets for the same user about events changes', function (done) {
      ioCons.con1 = connect(namespace, {auth: token}); // personal access
      ioCons.con2 = connect(namespace, {auth: testData.accesses[2].token}); // "read all" access

      var con2NotifsCount = 0;

      ioCons.con2.on('eventsChanged', function () {
        con2NotifsCount++;
      });

      whenAllConnectedDo(function () {
        var params = {
          time: timestamp.fromDate('2012-03-22T10:00'),
          duration: timestamp.duration('3h33m'),
          type: 'test/test',
          streamId: testData.streams[0].id
        };
        ioCons.con1.emit('events.create', params, function (err/*, result*/) {
          should.not.exist(err);

          setTimeout(function () { // pass turn to make sure notifs are received
            con2NotifsCount.should.eql(1, 'expected notifications');

            done();
          }, 0);
        });
      });
    });

    it('must notify other sockets for the same user (only) about streams changes',
        function (done) {
      ioCons.con1 = connect(namespace, {auth: token}); // personal access
      ioCons.con2 = connect(namespace, {auth: testData.accesses[2].token}); // "read all" access
      ioCons.otherCon = connect('/' + otherUser.username, {auth: otherToken});

      var con2NotifsCount = 0,
          otherConNotifsCount = 0;

      ioCons.con2.on('streamsChanged', function () {
        con2NotifsCount++;
      });
      ioCons.otherCon.on('streamsChanged', function () { otherConNotifsCount++; });

      whenAllConnectedDo(function () {
        var params = {
          name: 'Rutabaga',
          parentId: undefined
        };
        ioCons.con1.emit('streams.create', params, function (err/*, result*/) {
          should.not.exist(err);

          setTimeout(function () { // pass turn to make sure notifs are received
            con2NotifsCount.should.eql(1, 'expected notifications');
            otherConNotifsCount.should.eql(0, 'unexpected notifications');

            done();
          }, 0);
        });
      });
    });

  });

});
