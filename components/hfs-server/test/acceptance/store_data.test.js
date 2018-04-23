// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it, beforeEach, after, before, afterEach */
const chai = require('chai');
const assert = chai.assert; 
const R = require('ramda');
const cuid = require('cuid');
const debug = require('debug')('store_data.test');
const bluebird = require('bluebird');
const lodash = require('lodash');

const { 
  spawnContext, produceMongoConnection, 
  produceInfluxConnection, produceStorageLayer } = require('./test-helpers');
const { databaseFixture } = require('components/test-helpers');

const rpc = require('components/tprpc');
const metadata = require('components/metadata');

import type { IMetadataUpdaterService } from 'components/metadata';

type Header = Array<string>; 
type Rows   = Array<Row>; 
type Row    = Array<DataPoint>;
type DataPoint = string | number | boolean;

type TryOpResult = {
  ok: boolean, 
  user: { id: string }, 
  event: { id: string },
  status: number, 
  body: Object,
}
type ErrorDocument = {
  status: number,
  id: string, 
  message: string, 
}

describe('Storing data in a HF series', function() {
  const database = produceMongoConnection(); 
  const influx = produceInfluxConnection(); 

  describe('Use Case: Store data in InfluxDB, Verification on either half', function () {
    let server; 
    before(async () => {
      debug('spawning');
      server = await spawnContext.spawn(); 
    });
    after(() => {
      server.stop(); 
    });
    
    const pryv = databaseFixture(database);
    after(function () {
      pryv.clean(); 
    });
      
    // Set up a few ids that we'll use for testing. NOTE that these ids will
    // change on every test run. 
    let userId, parentStreamId, eventId, accessToken; 
    before(() => {
      userId = cuid(); 
      parentStreamId = cuid(); 
      eventId = cuid(); 
      accessToken = cuid(); 
      
      debug('build fixture');
      return pryv.user(userId, {}, function (user) {
        user.stream({id: parentStreamId}, function (stream) {
          stream.event({
            id: eventId, 
            type: 'series:mass/kg'});
        });

        user.access({token: accessToken, type: 'personal'});
        user.session(accessToken);
      });
    });
    
    function storeData(data: {}): any {
      debug('storing some data', data);
      
      // Insert some data into the events series:
      const postData = {
        format: 'flatJSON',
        fields: Object.keys(data), 
        points: [ 
          R.map(R.prop(R.__, data), Object.keys(data)),
        ]
      };
      const request = server.request(); 
      return request
        .post(`/${userId}/events/${eventId}/series`)
        .set('authorization', accessToken)
        .send(postData)
        .expect(200);
    }
    
    it('should store data correctly', async () => {
      const response = await storeData({timestamp: 1481677845, value: 80.3});

      const body = response.body; 
      if (body == null || body.status == null) throw new Error(); 
      assert.strictEqual(body.status, 'ok'); 

      const headers: {[string]: string} = response.headers; 
      assert.strictEqual(headers['api-version'], '1.0.0');
      
      // Check if the data is really there
      const userName = userId; // identical with id here, but will be user name in general. 
      const options = { database: `user.${userName}` };
      const query = `
        SELECT * FROM "event.${eventId}"
      `;
        
      const result = await influx.query(query, options);
      const row = result[0];
      if (row.time == null || row.value == null) 
        throw new Error('Should have time and value.');
      
      assert.strictEqual(
        row.time.toNanoISOString(), 
        '2016-12-14T01:10:45.000000000Z'); 
      assert.strictEqual(row.value, 80.3);
    });
    it('should return data once stored', async () => {
      // identical with id here, but will be user name in general. 
      const userName = userId; 
      const dbName = `user.${userName}`; 
      const measurementName = `event.${eventId}`;

      await cycleDatabase(dbName);
      await storeSampleMeasurement(dbName, measurementName);
      await queryData();

      function cycleDatabase(dbName: string) {
        return influx.dropDatabase(dbName).
          then(() => influx.createDatabase(dbName));
      }
      function storeSampleMeasurement(dbName: string, measurementName: string) {
        const options = { database: dbName };

        const points = [
          {
            fields: { value: 1234 }, 
            timestamp: 1493647899000000000, 
          }
        ];
        
        return influx.writeMeasurement(measurementName, points, options);
      }
      function queryData() {
        const request = server.request();
        return request
          .get(`/${userId}/events/${eventId}/series`)
          .set('authorization', accessToken)
          .query({
            fromTime: '1493647898', toTime: '1493647900' })
          // .then((res) => console.log(require('util').inspect(res.body, { depth: null })))
          .expect(200)
          .then((res) => {
            const points = res.body.points || [];
            
            assert.isNotEmpty(points);
            assert.deepEqual(
              points[0], 
              [1493647899, 1234]); 
          });
      }
    });
  });
  
  describe('POST /events/EVENT_ID/series', function() {
        
    // TODO Worry about deleting data that we stored in earlier tests.
    let server; 
    
    describe('bypassing authentication', () => {
      const EVENT_ID = 'EVENTID';

      function storeData(data): any {
        const request = server.request(); 
        const response = request
          .post(`/USERNAME/events/${EVENT_ID}/series`)
          .set('authorization', 'AUTH_TOKEN')
          .send(data);
          
        return response;
      }
      function queryData(): Promise<Object> {
        const request = server.request(); 
        let response = request
          .get(`/USERNAME/events/${EVENT_ID}/series`)
          .set('authorization', 'KEN SENT ME')
          .query({
            fromTime: '1481677844', 
            toTime: '1481677850',
          });

        return response
          .expect(200)
          .then((res) => {
            return res.body;
          });
      }
      
      function produceData() {
        return {
          format: 'flatJSON', 
          fields: ['timestamp', 'value'], 
          points: [
            [1481677845, 14.1], 
            [1481677846, 14.2], 
            [1481677847, 14.3], 
          ]
        };
      }

      describe('with auth success', function () {
        before(async () => {
          debug('spawning');
          server = await spawnContext.spawn(); 
        });
        after(() => {
          server.stop(); 
        });
        
        // Bypass authentication check: Succeed always
        beforeEach(function () {
          server.process.
            sendToChild('mockAuthentication', true);
        });
        
        it('stores data into InfluxDB', function() {
          const data = produceData(); 
          
          return storeData(data)
            .expect(200)
            .then(queryData)
            .then((response) => {
              // Verify HTTP response content
              assert.isNotNull(response);
                
              assert.deepEqual(
                response.fields, 
                ['timestamp', 'value']); 
              
              const pairEqual = ([given, expected]) => 
                assert.deepEqual(given, expected);

              assert.strictEqual(response.points.length, data.points.length);
              R.all(pairEqual, R.zip(response.points, data.points));
            });
        });

        it('should reject non-JSON bodies', function () { 
          const response = server.request()
            .post(`/USERNAME/events/${EVENT_ID}/series`)
            .set('authorization', 'AUTH_TOKEN')
            .type('form')
            .send({ format: 'flatJSON' });
            
          return response
            .expect(400);
        });
      it('responds with headers that allow CORS on OPTIONS', async () => {
        const request = server.request(); 
        const response = await request
          .options(`/USERNAME/events/${EVENT_ID}/series`)
          .set('origin', 'https://foo.bar.baz')
          .set('authorization', 'AUTH_TOKEN')
          .send();
        
        const headers = response.headers;
        assert.strictEqual(headers['access-control-allow-credentials'], 'true');
        assert.strictEqual(headers['access-control-allow-origin'], 
          'https://foo.bar.baz');
      });
      it('responds with headers that allow CORS on POST', async () => {
        const request = server.request(); 
        const response = await request
          .post(`/USERNAME/events/${EVENT_ID}/series`)
          .set('origin', 'https://foo.bar.baz')
          .set('authorization', 'AUTH_TOKEN')
          .send({});
        
        const headers = response.headers;
        assert.strictEqual(headers['access-control-allow-credentials'], 'true');
        assert.strictEqual(headers['access-control-allow-origin'], 
          'https://foo.bar.baz');
      });

        describe('when request is malformed', function () {
          malformed('format is not flatJSON', {
            format: 'JSON', 
            fields: ['timestamp', 'value'], 
            points: [
              [1481677845, 14.1], 
              [1481677846, 14.2], 
              [1481677847, 14.3], 
            ]
          });
          malformed('matrix is not square - not enough fields', {
            format: 'flatJSON', 
            fields: ['timestamp', 'value'], 
            points: [
              [1481677845, 14.1], 
              [1481677846], 
              [1481677847, 14.3], 
            ]
          });
          malformed('value types are not all valid', {
            format: 'flatJSON', 
            fields: ['timestamp', 'value'], 
            points: [
              [1481677845, 14.1], 
              [1481677846, 'foobar'], 
              [1481677847, 14.3], 
            ]
          });
          malformed('missing timestamp column', {
            format: 'flatJSON', 
            fields: ['value'], 
            points: [
              [14.1], 
              [13.2], 
              [14.3], 
            ]
          });
          malformed('missing value column for a simple input', {
            format: 'flatJSON', 
            fields: ['timestamp'], 
            points: [
              [1481677845], 
              [1481677846], 
              [1481677847], 
            ]
          });
          
          function malformed(text, data) {
            it(`should be rejected (${text})`, function () {
              return storeData(data).expect(400)
                .then((res) => {
                  const error = res.body.error; 
                  assert.strictEqual(error.id, 'invalid-request-structure'); 
                });
            });
          }
        });
        describe('when using a metadata updater stub', () => {
          // A stub for the real service. Tests might replace parts of this to do 
          // custom assertions.
          let stub: IMetadataUpdaterService;
          beforeEach(() => {
            stub = {
              scheduleUpdate: () => { return Promise.resolve({ }); },
              getPendingUpdate: () => { return Promise.resolve({ found: false, deadline: 0 }); },
            };
          });
          
          // Loads the definition for the MetadataUpdaterService.
          let definition;
          before(async () => {
            definition = await metadata.updater.definition;
          });
          
          // Constructs and launches an RPC server on port 14000.
          let rpcServer;
          beforeEach(async () => {
            const endpoint = '127.0.0.1:14000';

            rpcServer = new rpc.Server(); 
            rpcServer.add(definition, 'MetadataUpdaterService', (stub: IMetadataUpdaterService));
            await rpcServer.listen(endpoint);
            
            // Tell the server (already running) to use our rpc server. 
            await server.process.sendToChild('useMetadataUpdater', endpoint);
          });
          afterEach(async () => {
            // Since we modified the test server, spawn a new one that is clean. 
            server.stop(); 
            server = await spawnContext.spawn(); 
            
            rpcServer.close();
          });
          
          it('should schedule a metadata update on every store', async () => {
            let updaterCalled = false; 
            // FLOW This is ok, we're replacing the stub with something compatible.
            stub.scheduleUpdate = () => {
              updaterCalled = true;
              return Promise.resolve({ });
            };
            
            const data = produceData(); 
            await storeData(data).expect(200);
            
            assert.isTrue(updaterCalled);
          });
        });
      });
      describe('with auth failure', function () {
        before(async () => {
          debug('spawning');
          server = await spawnContext.spawn(); 
        });
        after(() => {
          server.stop(); 
        });
        
        // Bypass authentication check: Fail always
        beforeEach(async function () {
          await server.process.
            sendToChild('mockAuthentication', false);
        });

        it('refuses invalid/unauthorized accesses', function () {
          const data = produceData(); 
          
          return storeData(data)
            .expect(403)
            .then((res) => {
              const error = res.body.error; 
              assert.strictEqual(error.id, 'forbidden'); 
              assert.typeOf(error.message, 'string'); 
            });
        });
      });
    });
    describe('storing data in different formats', () => {
      // Spawns a server.
      before(async () => {
        debug('spawning');
        server = await spawnContext.spawn(); 
      });
      after(() => {
        server.stop(); 
      });
      
      const pryv = databaseFixture(database);
      after(function () {
        pryv.clean(); 
      });
      
      let userId, parentStreamId, accessToken; 
      before(() => {
        userId = cuid(); 
        parentStreamId = cuid(); 
        accessToken = cuid(); 
        
        debug('build fixture');
        return pryv.user(userId, {}, function (user) {
          user.stream({id: parentStreamId}, function () {});

          user.access({token: accessToken, type: 'personal'});
          user.session(accessToken);
        });
      });
      
      const storageLayer = produceStorageLayer(database);
            
      // Tries to store `data` in an event with attributes `attrs`. Returns 
      // true if the whole operation is successful. 
      // 
      async function tryStore(attrs: Object, header: Header, data: Rows): Promise<TryOpResult> {
        const userQuery = {id: userId};
        const effectiveAttrs = lodash.merge(
          { streamId: parentStreamId }, 
          attrs
        );

        const user = await bluebird.fromCallback(
          cb => storageLayer.users.findOne(userQuery, null, cb));
        
        assert.isNotNull(user);
          
        const event = await bluebird.fromCallback(
          cb => storageLayer.events.insertOne(user, effectiveAttrs, cb));

        const requestData = {
          format: 'flatJSON',
          fields: header, 
          points: data,
        };
        
        const request = server.request(); 
        const response = await request
          .post(`/${userId}/events/${event.id}/series`)
          .set('authorization', accessToken)
          .send(requestData);
          
        if (response.statusCode != 200) {
          debug('Failed to store data, debug report:'); 
          debug('response.body', response.body);
        }
        
        debug('Enter these commands into influx CLI to inspect the data:');
        debug(`  use "user.${user.id}"`);
        debug(`  select * from "event.${event.id}"`);
        debug(`  show field keys from "event.${event.id}"`);
        
        return {
          ok: response.statusCode === 200, 
          user: user, 
          event: event,
          status: response.statusCode,
          body: response.body,
        };
      }
      
      it('stores data of any basic type', async () => {
        const now = (new Date()) / 1000; 
        
        const result = await tryStore({ type: 'series:angular-speed/rad-s' }, 
          ['timestamp', 'value'],
          [
            [now-3, 1], 
            [now-2, 2], 
            [now-1, 3] ]);
        
        assert.isTrue(result.ok); 
      });
      it('stores data of complex types', async () => {
        const now = (new Date()) / 1000; 
        const {ok} = await tryStore({ type: 'series:ratio/generic' }, 
          ['timestamp', 'value', 'relativeTo'],
          [
            [now-3, 1, 2], 
            [now-2, 2, 2], 
            [now-1, 3, 2] ]); 
            
        assert.isTrue(ok);
      });
      it("doesn't accept data in non-series format", async () => {
        const now = (new Date()) / 1000; 
        const {ok, body} = await tryStore({ type: 'angular-speed/rad-s' }, 
          ['timestamp', 'value'],
          [
            [now-3, 1], 
            [now-2, 2], 
            [now-1, 3] ]);
        
        assert.isFalse(ok);
        
        const error = body.error;
        assert.strictEqual(error.id, 'invalid-operation');
      });
      
      it('stores strings', async () => {
        const aLargeString = '2222222'.repeat(100);
        const now = (new Date()) / 1000; 
        
        const result = await tryStore({ type: 'series:call/telephone'}, 
          ['timestamp', 'value'], 
          [
            [now-10, aLargeString]
          ]);
          
        assert.isTrue(result.ok);
      });
      it('stores floats', async () => {
        const now = (new Date()) / 1000; 
        
        const aHundredRandomFloats = lodash.times(100, 
          idx => [now-100+idx, Math.random() * 1e6]);
          
        const result = await tryStore({ type: 'series:mass/kg'}, 
          ['timestamp', 'value'], 
          aHundredRandomFloats);
        
        assert.isTrue(result.ok); 
        
        const query = `select * from "event.${result.event.id}"`;
        const opts = {
          database: `user.${result.user.id}` };
        const rows = await influx.query(query, opts);
        
        assert.strictEqual(rows.length, aHundredRandomFloats.length);
        for (const [exp, act] of lodash.zip(aHundredRandomFloats, rows)) {
          if (act.time == null) throw new Error('AF: time cannot be null');
          const influxTimestamp = Number(act.time.getNanoTime()) / 1e9;
          
          if (typeof exp[1] !== 'number') throw new Error('AF: ridiculous flow inference removal');
          
          const expectedTs = Number(exp[0]);
          const expectedValue = Number(exp[1]);  
          assert.approximately(expectedTs, influxTimestamp, 0.1); 
          assert.approximately(expectedValue, act.value, 0.001); 
        }
      });
    });
    describe('complex types such as ratio/generic', () => {
      // Spawns a server.
      before(async () => {
        debug('spawning');
        server = await spawnContext.spawn(); 
      });
      after(() => {
        server.stop(); 
      });

      // Database fixture infrastructure
      const pryv = databaseFixture(database);
      after(function () {
        pryv.clean(); 
      });

      // Database fixture: `eventId` will contain the event that has a type 
      // 'series:ratio/generic'
      let userId, parentStreamId, eventId, accessToken; 
      before(() => {
        userId = cuid(); 
        parentStreamId = cuid(); 
        eventId = cuid(); 
        accessToken = cuid(); 
        
        debug('build fixture');
        return pryv.user(userId, {}, function (user) {
          user.stream({id: parentStreamId}, function (stream) {
            stream.event({
              id: eventId, 
              type: 'series:ratio/generic'});
          });

          user.access({token: accessToken, type: 'personal'});
          user.session(accessToken);
        });
      });
      
      // Tries to store complex `data` in the event identified by `eventId`.
      // 
      async function tryStore(header: Header, data: Rows): Promise<boolean> {
        const response = await storeOp(header, data);
                    
        return response.statusCode === 200;
      }
      // Attempts a store operation and expects to fail. Returns details on
      // the error.
      async function failStore(header: Header, data: Rows): Promise<ErrorDocument> {
        const response = await storeOp(header, data);
        
        assert.notStrictEqual(response.statusCode, 200);
              
        const body = response.body;
        const error = body.error; 
        return {
          status: response.statusCode,
          id: error.id,
          message: error.message,
        };
      }
      async function storeOp(header: Header, data: Rows): Promise<any> {
        const requestData = {
          format: 'flatJSON',
          fields: header, 
          points: data,
        };
        
        const request = server.request(); 
        const response = await request
          .post(`/${userId}/events/${eventId}/series`)
          .set('authorization', accessToken)
          .send(requestData);
        
        return response;
      }
      
      describe('when not all required fields are given', () => {
        let now = (new Date()) / 1000;
        let args = [
          ['timestamp', 'value'],
          [
            [now-3, 1], 
            [now-2, 2], 
            [now-1, 3] ],
        ];
        
        it('refuses to store when not all required fields are given', async () => {
          assert.isFalse(
            await tryStore(...args));
        });
        it('returns error id "invalid-request-structure"', async () => {
          const { status, id, message } = await failStore(...args);
          
          assert.strictEqual(status, 400);
          assert.strictEqual(id, 'invalid-request-structure');
          assert.strictEqual(message, '"fields" field must contain valid field names for the series type.');
        });
      });
      it('refuses to store when timestamp is present twice (ambiguous!)', async () => {
        const now = (new Date()) / 1000; 
        assert.isFalse(
          await tryStore(
            ['timestamp', 'timestamp', 'value', 'relativeTo'],
            [
              [now-3, now-6, 1, 1], 
              [now-2, now-5, 2, 2], 
              [now-1, now-4, 3, 3] ]));
      });
      it('refuses to store when other fields are present twice (ambiguous!)', async () => {
        const now = (new Date()) / 1000; 
        assert.isFalse(
          await tryStore(
            ['timestamp', 'value', 'value', 'relativeTo'],
            [
              [now-3, 3, 1, 1], 
              [now-2, 2, 2, 2], 
              [now-1, 1, 3, 3] ]));
      });
      describe("when field names don't match the type", () => {
        const now = (new Date()) / 1000;
        const args = [
          ['timestamp', 'value', 'relativeFrom'],
          [
            [now-3, 3, 1], 
            [now-2, 2, 2], 
            [now-1, 1, 3] ],
        ];
        
        it("refuses to store when field names don't match the type", async () => {
          assert.isFalse(
            await tryStore(...args));
        });
        it('returns the error message with the id "invalid-request-structure"', async () => {
          const { status, id, message } = await failStore(...args);
          
          assert.strictEqual(status, 400);
          assert.strictEqual(id, 'invalid-request-structure');
          assert.strictEqual(message, '"fields" field must contain valid field names for the series type.');
        });
      });
    });
    describe('complex types such as position/wgs84', () => {
      // Spawns a server.
      before(async () => {
        debug('spawning');
        server = await spawnContext.spawn(); 
      });
      after(() => {
        server.stop(); 
      });

      // Database fixture infrastructure
      const pryv = databaseFixture(database);
      after(function () {
        pryv.clean(); 
      });

      // Database fixture: `eventId` will contain the event that has a type 
      // 'series:ratio/generic'
      let userId, parentStreamId, eventId, accessToken; 
      before(() => {
        userId = cuid(); 
        parentStreamId = cuid(); 
        eventId = cuid(); 
        accessToken = cuid(); 
        
        debug('build fixture');
        return pryv.user(userId, {}, function (user) {
          user.stream({id: parentStreamId}, function (stream) {
            stream.event({
              id: eventId, 
              type: 'series:position/wgs84'});
          });

          user.access({token: accessToken, type: 'personal'});
          user.session(accessToken);
        });
      });
      
      // Tries to store complex `data` in the event identified by `eventId`.
      // 
      async function tryStore(header: Header, data: Rows): Promise<boolean> {
        const requestData = {
          format: 'flatJSON',
          fields: header, 
          points: data,
        };
        
        const request = server.request(); 
        const response = await request
          .post(`/${userId}/events/${eventId}/series`)
          .set('authorization', accessToken)
          .send(requestData);
                    
        return response.statusCode === 200;
      }

      it('allows storing any number of optional fields, on each request', async () => {
        const now = (new Date()) / 1000; 
        assert.isTrue(
          await tryStore(
            ['timestamp', 'latitude', 'longitude', 'altitude'],
            [
              [now-3, 1, 2, 3], 
              [now-2, 2, 3, 4], 
              [now-1, 3, 4, 5] ]));

        assert.isTrue(
          await tryStore(
            ['timestamp', 'latitude', 'longitude', 'altitude', 'speed'],
            [
              [now-3, 1, 2, 3, 160], 
              [now-2, 2, 3, 4, 170], 
              [now-1, 3, 4, 5, 180] ]));
      });
      it('refuses unknown fields', async () => {
        const now = (new Date()) / 1000; 
        assert.isFalse(
          await tryStore(
            ['timestamp', 'latitude', 'longitude', 'depth'],
            [
              [now-3, 1, 2, 3], 
              [now-2, 2, 3, 4], 
              [now-1, 3, 4, 5] ]));
      });
    });
  }); 
});
