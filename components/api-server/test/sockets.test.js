// @flow

/* global describe, before, beforeEach, afterEach, it */

/**
 * Tests Socket.IO access to the API.
 */

const timestamp = require('unix-timestamp');
const _ = require('lodash');
const R = require('ramda');
const assert = require('chai').assert; 
const bluebird = require('bluebird');
const async = require('async');
const io = require('socket.io-client');
// explicit require to benefit from static functions
const should = require('should'); 
const queryString = require('qs');

const { context } = require('./test-helpers'); 
const helpers = require('./helpers');
const ErrorIds = require('components/errors').ErrorIds;
const server = helpers.dependencies.instanceManager;
const streamsMethodsSchema = require('../src/schema/streamsMethods');
const eventsMethodsSchema = require('../src/schema/eventsMethods');
const validation = helpers.validation;
const testData = helpers.data;

const { ConditionVariable } = require('components/test-helpers').syncPrimitives; 

describe('Socket.IO', function () {

  const user = testData.users[0];
  const namespace = '/' + user.username;

  const otherUser = testData.users[1];
  let token = null;
  let otherToken = null;

  let cleanupConnections = []; 
  
  // Connects to `namespace` given `queryParams`. Connections are disconnected
  // after each test automatically.
  function connect(namespace, queryParams) {
    const paramsWithNS = _.defaults({resource: namespace}, queryParams || {});
    const url = server.url + namespace + '?' + queryString.stringify(paramsWithNS);
    
    const conn = io.connect(url, {
      'reconnect': false, 
      'force new connection': true});
      
    cleanupConnections.push(conn);
    
    return conn; 
  }
  // Disconnects all connections in cleanupConnections; then empties it. 
  afterEach(() => {
    for (const conn of cleanupConnections) {
      conn.disconnect(); 
    }
    
    cleanupConnections = []; 
  });

  let ioCons = {};
  
  // Waits until all the connections stored as properties of `ioCons` are 
  // connected.  
  function whenAllConnectedDo(callback) {
    var conKeys = Object.keys(ioCons),
        conCount = 0;
    conKeys.forEach(function (key) {
      ioCons[key].once('connect', function () {
        conCount++;
        if (conCount === conKeys.length) {
          callback();
        }
      });
    });
  }
  // Reset ioCons to be empty. 
  afterEach(() => {
    ioCons = {}; 
  });

  // Reset database contents for the tests here. 
  before(function (done) {
    var request = null,
        otherRequest = null;
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      function (stepDone) {
        // have some accesses ready for another account to check notifications
        testData.resetAccesses(stepDone, otherUser, null, true);
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
      token = request && request.token;
      otherToken = otherRequest && otherRequest.token;
      done();
    });
  });
  beforeEach(function (done) {
    async.series([
      testData.resetStreams,
      testData.resetEvents
    ], done);
  });
  
  it('must dynamically create a namespace for the user', function (done) {
    ioCons.con = connect(namespace, {auth: token});
  
    // We expect communication to work.
    ioCons.con.once('connect', done);
    
    ioCons.con.once('connect_error', function (err) {
      done(err || new Error('Connection failed.')); 
    });
  });
  it('must connect to a user with a dash in the username', function (done) {
    var dashUser = testData.users[4],
        dashRequest = null;
  
    async.series([
      function (stepDone) {
        testData.resetAccesses(stepDone, dashUser, null, true);
      },
      function (stepDone) {
        dashRequest = helpers.request(server.url);
        dashRequest.login(dashUser, stepDone);
      },
      function (stepDone) {
        ioCons.con = connect('/' + dashUser.username, {auth: testData.accesses[2].token});
  
        ioCons.con.once('error', function (e) {
          stepDone(e || new Error('Communication failed.')); 
        });
  
        ioCons.con.once('connect', stepDone);
      }
    ], done);
  });
  it('must refuse connection if no valid access token is provided', function (done) {
    ioCons.con = connect(namespace);
  
    ioCons.con.once('connect', function () {
      done(new Error('Connecting should have failed'));
    });
  
    ioCons.con.socket.once('error', function () {
      // We expect failure, so we're done here. 
      done();
    });
  });
  
  describe('calling API methods', function () {
    it('must properly route method call messages for events and return the results, including meta',function (done) {
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
    
        const testEvents = _.clone(testData.events);
        const chronologicalEvents = _.sortBy(testEvents, 'time');
        const expectedEvents = validation.removeDeletionsAndHistory(chronologicalEvents);
        
        result.events.should.eql(expectedEvents);
        
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
    it('must properly route method call messages for streams and return the results', function (done) {
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
    
    it('must notify other sockets for the same user about events changes', () => {
      ioCons.con1 = connect(namespace, {auth: token}); // personal access
      ioCons.con2 = connect(namespace, {auth: testData.accesses[2].token}); // "read all" access
    
      return new bluebird((resolve, reject) => {
        ioCons.con2.on('eventsChanged', function () {
          resolve(); 
        });
    
        whenAllConnectedDo(function () {
          const params = {
            time: timestamp.fromDate('2012-03-22T10:00'),
            duration: timestamp.duration('3h33m'),
            type: 'test/test',
            streamId: testData.streams[0].id
          };
    
          ioCons.con1.emit('events.create', params, function (err/*, result*/) {
            if (err) reject(err); 
          });
        });
      });
    });
    it('must notify other sockets for the same user (only) about streams changes', function () {
      ioCons.con1 = connect(namespace, {auth: token}); // personal access
      ioCons.otherCon = connect('/' + otherUser.username, {auth: otherToken});
    
      return new bluebird((res, rej) => {
        // We do _not_ want otherCon to be notified.
        ioCons.otherCon.once('streamsChanged', rej);
    
        // NOTE How to test if no notifications are sent to otherCon? We reject
        //  if we receive one - but have to wait for notifications to get in to
        //  make this effective. Let's sacrifice 100ms.
        setTimeout(res, 100);
    
        // Now create a stream for con1.
        whenAllConnectedDo(function () {
          var params = {
            name: 'Rutabaga',
            parentId: undefined
          };
          ioCons.con1.emit('streams.create', params, (err) => {
            if (err) rej(err); 
          });
        });
      });
    });
    it('must notify on each change', async function () {
      const tokens = [token, testData.accesses[2].token];
      const socketConnections = tokens.map(
        (token) => connect(namespace, {auth: token}));
    
      const createConnection = socketConnections[0];
    
      const donePromises = socketConnections.map(conn => {
        const [promise, cb] = expectNCalls(2);
    
        conn.on('streamsChanged', cb);
        return promise; 
      });
    
      await createStream(createConnection, {name: 'foo'}); 
      await createStream(createConnection, {name: 'bar'}); 
    
      return bluebird.all(donePromises);
    
      function createStream(conn, params) {
        return bluebird.fromCallback(
          (cb) => conn.emit('streams.create', params, cb));
      }
    });
  });
  
  describe('when spawning 2 api-server processes, A and B', () => {
    // Servers A and B, length will be 2
    let servers: Array<Server> = []; 
  
    // Client connections that we make. If you add your connection here, it 
    // will get #close()d. 
    let connections;
    beforeEach(() => { 
      connections = []; 
    });
  
    // Closes all `connections` after each test. 
    afterEach(() => {
      for (const conn of connections) {
        conn.disconnect(); 
      }
    });
  
    // Spawns A and B. 
    beforeEach(async () => {
      // Stop a few servers here; this is just so that we can maybe reclaim 
      // some memory and sockets. Actual cleanup is done in `after()` below. 
      if (servers && servers.length > 0) 
        for (const server of servers) server.stop();
  
      // Spawn two new servers.
      servers = await bluebird.all( context.spawn_multi(2) );
    });
  
    it('changes made in A notify clients of B', async () => {
      if (token == null) throw new Error('AF: token must be set');
  
      // Aggregate user data to be more contextual
      const user = {
        name: testData.users[0].username,
        token: token, 
      };
  
      const eventReceived = new ConditionVariable(); 
  
      const conn1 = connectTo(servers[0], user);
      const conn2 = connectTo(servers[1], user);
  
      const msgs = [];
      conn2.on('eventsChanged', () => {
        msgs.push('ec'); 
        eventReceived.broadcast(); 
      }); 
  
      await addEvent(conn1);
      if (msgs.length === 0)
        await eventReceived.wait(1000);
  
      assert.deepEqual(msgs, ['ec']);
    });
  
    // Connect to `server` using `user` as credentials. 
    function connectTo(server: Server, user: User): SocketIO$Client {
      const namespace = `/${user.name}`;
      const params = { auth: user.token, resource: namespace };
  
      const url = server.url(namespace) + 
        `?${queryString.stringify(params)}`;
  
      const connectOpts = {
        'reconnect': false,             // Once connection is interrupted, it stays interrupted.
        'force new connection': true,   // Connect again, don't reuse old connections.
      };
  
      const conn = io.connect(url, connectOpts);
  
      // Automatically add all created connections to the cleanup array: 
      connections.push(conn);
  
      return conn; 
    }
  
    // Creates an event, using socket connection `conn`.
    function addEvent(conn): Promise<void> {
      const stream = testData.streams[0];
      const attributes = {
        type: 'mass/kg', 
        content: '1',
        streamId: stream.id,
      };
      return bluebird.fromCallback(
        (cb) => conn.emit('events.create', attributes, cb));
    }
  
  });
});

type User = {
  name: string, 
  token: string, 
};
type SocketIO$Client = {
  on: (event: string, cb: () => void) => void;
  emit: (event: string, params: any, cb: () => void) => void;
};

// Returns a tuple of a (promise, callback). The promise fulfills when the
// callback is called `n` times. 
function expectNCalls(n: number): [Promise<void>, () => void] {
  let callCount = 0; 
  let deferred; 

  const promise = new bluebird((res) => {
    deferred = res; 
  }); 
  
  const fun = () => {
    callCount += 1; 
    
    if (deferred == null) 
      throw new Error('AF: deferred promise is created synchronously.');
    
    if (callCount >= n) deferred(); 
  };
  
  return [promise, fun];
}