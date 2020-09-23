/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it, beforeEach, after, before, afterEach */
const _ = require('lodash');
const chai = require('chai');
const assert = chai.assert; 
const R = require('ramda');
const cuid = require('cuid');
const debug = require('debug')('store_data.test');
const bluebird = require('bluebird');
const lodash = require('lodash');
const awaiting = require('awaiting');
const UsersRepository = require('components/business/src/users/repository');
const User = require('components/business/src/users/User');

const { getConfig } = require('components/api-server/config/Config');

const { 
  spawnContext, produceMongoConnection, 
  produceInfluxConnection, produceStorageLayer } = require('./test-helpers');
const { databaseFixture } = require('components/test-helpers');

const apiServerContext = require('components/api-server/test/test-helpers').context;

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
// this should be definitely done in the config and not in the test
async function spawnContextServerWithOptions (spawnContext, config) {
  return spawnContext.spawn(
    {
      openSource: config.get('openSource'),
      mongodb: config.get('mongodb')
    }
  ); 
}

describe('Storing data in a HF series', function() {

  let database,
    pryv,
    config;
  before(async function () {
    config = getConfig();
    await config.init();
    database = await produceMongoConnection();
    pryv = databaseFixture(database);
  });
  const influx = produceInfluxConnection();

  describe('Use Case: Store data in InfluxDB, Verification on either half', function () {
    let server; 
    before(async () => {
      debug('spawning');
      server = await spawnContextServerWithOptions(spawnContext, config);
    });
    after(() => {
      server.stop(); 
    });
    
    after(function () {
      pryv.clean(); 
    });

    const nowEvent = Date.now() / 1000;
      
    // Set up a few ids that we'll use for testing. NOTE that these ids will
    // change on every test run. 
    let userId, parentStreamId, secondStreamId, eventId, accessToken, secondStreamToken; 
    before(async () => {
      userId = cuid(); 
      parentStreamId = cuid(); 
      secondStreamId = cuid();
      eventId = cuid(); 
      accessToken = cuid(); 
      secondStreamToken = cuid();
      
      debug('build fixture');
      const user = await pryv.user(userId, {});
      await user.stream({id: secondStreamId});
      await user.stream({id: parentStreamId});
      await user.event({
        id: eventId, 
        type: 'series:mass/kg',
        time: nowEvent,
        streamIds: [parentStreamId, secondStreamId],
      });
      await user.access({token: accessToken, type: 'personal'});
      await user.session(accessToken);
      await user.access({ 
        token: secondStreamToken, 
        type: 'app',
        permissions: [
          {
            streamId: secondStreamId,
            level: 'create-only',
          }
        ]
      });
    });
    
    function storeData(data: {}, token: string): any {
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
        .set('authorization', token)
        .send(postData)
        .expect(200);
    }

    it('[ZUBI] should convert timestamp to deltaTime', async () => {
      const storageLayer = produceStorageLayer(database);

      const nowPlus1Sec = nowEvent + 1;
      const response = await storeData({ timestamp: nowPlus1Sec, value: 80.3 }, accessToken);

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
        '1970-01-01T00:00:01.000000000Z');
      assert.strictEqual(row.value, 80.3);
      
    });
    
    it('[GZIZ] should store data correctly', async () => {
      const response = await storeData({deltaTime: 1, value: 80.3}, accessToken);

      const body = response.body; 
      if (body == null || body.status == null) throw new Error(); 
      assert.strictEqual(body.status, 'ok'); 

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
        '1970-01-01T00:00:01.000000000Z'); 
      assert.strictEqual(row.value, 80.3);
    });

    it('[KC15] should return data once stored', async () => {
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
            timestamp: 2 * 1000000000, 
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
            fromDeltaTime: '1', toDeltaTime: '3' })
          // .then((res) => console.log(require('util').inspect(res.body, { depth: null })))
          .expect(200)
          .then((res) => {
            const points = res.body.points || [];
            
            assert.isNotEmpty(points);
            assert.deepEqual(
              points[0], 
              [2, 1234]); 
          });
      }
    });

    it('[YALY] should accept a request when the authorized permission is on the event\'s 2nd streamId', async () => {
      await storeData({ deltaTime: 10, value: 54}, secondStreamToken);
    });
  });


  describe('UPDATE and DELETE on handling event affect the serie', function () {
    this.timeout(5000);

    // TODO Worry about deleting data that we stored in earlier tests.
    let hfServer; 
    let apiServer;
    // Spawns a server.
    before(async () => {
      debug('spawning');
      hfServer = await spawnContextServerWithOptions(spawnContext, config);
      apiServer = await spawnContextServerWithOptions(apiServerContext, config);
      
    });
    after(() => {
      hfServer.stop();
      apiServer.stop();
    });

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
        user.stream({ id: parentStreamId }, function () { });

        user.access({ token: accessToken, type: 'personal' });
        user.session(accessToken);
      });
    });

    let storageLayer;
    before(function () {
      storageLayer = produceStorageLayer(database);
    });

    // Tries to store `data` in an event with attributes `attrs`. Returns 
    // true if the whole operation is successful. 
    // 
    async function tryStore(attrs: Object, header: Header, data: Rows): Promise<TryOpResult> {
      const effectiveAttrs = lodash.merge(
        { streamIds: [parentStreamId], time: Date.now() / 1000 },
        attrs
      );
      const usersRepository = new UsersRepository(storageLayer.events);
      const user: User = await usersRepository.getById(userId);
      assert.isNotNull(user);

      const event = await bluebird.fromCallback(
        cb => storageLayer.events.insertOne(user, effectiveAttrs, cb));

      const requestData = {
        format: 'flatJSON',
        fields: header,
        points: data,
      };

      const request = hfServer.request();
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


    async function storeData(eventId, data): any {
      const request = hfServer.request();
      const response = await request
        .post(`/${userId}/events/${eventId}/series`)
        .set('authorization', accessToken)
        .send(data);
      return response;
    }

    it('[UD1C] moving event in time does empty the cache', async () => {
      // This is visible if after moving the "timestamp" sugar is valid
      
      // 1 - Create an event with some values
      const result = await tryStore({ type: 'series:angular-speed/rad-s' },
        ['deltaTime', 'value'],
        [
          [1, 1],
          [2, 2],
          [3, 3]]);

      // move event to tomorrow 
      const newEventTime = (Date.now() / 1000) + 60 * 60 * 24;

      const response = await apiServer.request()
        .put('/' + result.user.username + '/events/'+ result.event.id )
        .set('authorization', accessToken)
        .send({ time: newEventTime });

      // There is the need to syncronize separate services, otherwise the new 
      // reference time is taken from the cache instead of mongodb (cache is not invalidated on time)
      await awaiting.delay(10)
      // add Data using timestamp sugar
      const result2 = await storeData(result.event.id, 
        {format: 'flatJSON',
        fields: ['timestamp', 'value'],
        points: [
          [newEventTime + 4, 4],
          [newEventTime + 5, 5],
          [newEventTime + 6, 6]]});
      // check Data 
      const request = hfServer.request();
      return request
        .get(`/${result.user.username}/events/${result.event.id}/series`)
        .set('authorization', accessToken)
        .query({  })
        // .then((res) => console.log(require('util').inspect(res.body, { depth: null })))
        .expect(200)
        .then((res) => {
          const points = res.body.points || [];
          assert.isNotEmpty(points);
          assert.deepEqual(
            points[5],
           [ 6, 6]);
        });
    });

    it('[UD2C] trashed event cannot be written to', async () => {
      // This is visible if after moving the "timestamp" sugar is valid
      
      // 1 - Create an event with some values
      const result = await tryStore({ type: 'series:angular-speed/rad-s' },
        ['deltaTime', 'value'],
        [
          [1, 1],
          [2, 2],
          [3, 3]]);

      // move event to tomorrow 
      const newEventTime = (Date.now() / 1000) + 60 * 60 * 24;

      const response = await apiServer.request()
        .delete('/' + result.user.username + '/events/' + result.event.id)
        .set('authorization', accessToken);
        
      // wait a moment before checking if event was deleted correctly
      await awaiting.delay(5);
      
      // add Data using timestamp sugar
      const result2 = await storeData(result.event.id,
        {
          format: 'flatJSON',
          fields: ['timestamp', 'value'],
          points: [
            [newEventTime + 4, 4],
            [newEventTime + 5, 5],
            [newEventTime + 6, 6]]
        });
      assert.strictEqual(result2.status, 400);
      const error = result2.body.error;
      assert.strictEqual(error.id, 'invalid-operation');
      assert.typeOf(error.message, 'string');
      assert.strictEqual(error.message, `The referenced event "${result.event.id}" is trashed.`);
      assert.deepEqual(error.data, {trashedReference: 'eventId'});
    });

    it('[ZTG6] deleted events deletes series', async function() {
      // This is visible if after moving the "timestamp" sugar is valid

      // 1 - Create an event with some values
      const result = await tryStore({ type: 'series:angular-speed/rad-s' },
        ['deltaTime', 'value'],
        [
          [1, 1],
          [2, 2],
          [3, 3]
        ]
      );

    
      const delete1 = await apiServer.request()
        .delete('/' + result.user.username + '/events/' + result.event.id)
        .set('authorization', accessToken);
      assert.strictEqual(delete1.status, 200);

      const query = `select * from "event.${result.event.id}"`;
      const opts = {
        database: `user.${result.user.id}`
      };
      const rows = await influx.query(query, opts);
      assert.strictEqual(rows.length, 3);
      
      const delete2 = await apiServer.request()
        .delete('/' + result.user.username + '/events/' + result.event.id)
        .set('authorization', accessToken);
      assert.strictEqual(delete2.status, 200);

      await awaiting.delay(100);

      const rows2 = await influx.query(query, opts);
      assert.strictEqual(rows2.length, 0);
  

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
          fields: ['deltaTime', 'value'], 
          points: [
            [0, 14.1], 
            [1, 14.2], 
            [2, 14.3], 
          ]
        };
      }

      describe('with auth success', function () {
        before(async () => {
          debug('spawning');
          server = await spawnContextServerWithOptions(spawnContext, config);
        });
        after(() => {
          server.stop(); 
        });
        
        // Bypass authentication check: Succeed always
        beforeEach(function () {
          server.process.
            sendToChild('mockAuthentication', true);
        });
        
        it('[N3PM] stores data into InfluxDB', function() {
          const data = produceData(); 
          
          return storeData(data)
            .expect(200)
            .then(queryData)
            .then((response) => {
              // Verify HTTP response content
              assert.isNotNull(response);
                
              assert.deepEqual(
                response.fields, 
                ['deltaTime', 'value']); 
              
              const pairEqual = ([given, expected]) => 
                assert.deepEqual(given, expected);

              assert.strictEqual(response.points.length, data.points.length);
              R.all(pairEqual, R.zip(response.points, data.points));
            });
        });

        // Fixes #212
        it('[TL0D] should return core-metadata in every call', async function() {
          const data = produceData(); 
          const res = await storeData(data);
          chai.expect(res).to.have.property('status').that.eql(200);
          chai.expect(res.body).to.have.property('meta');
        });
        
        it('[RESC] should reject non-JSON bodies', function () { 
          const response = server.request()
            .post(`/USERNAME/events/${EVENT_ID}/series`)
            .set('authorization', 'AUTH_TOKEN')
            .type('form')
            .send({ format: 'flatJSON' });
            
          return response
            .expect(400);
        });
        it('[KT1R] responds with headers that allow CORS on OPTIONS', async () => {
          const request = server.request(); 
          const response = await request
            .options(`/USERNAME/events/${EVENT_ID}/series`)
            .set('origin', 'https://foo.bar.baz')
            .set('authorization', 'AUTH_TOKEN')
            .send();
            
          assert.strictEqual(response.statusCode, 200);
          
          const headers = response.headers;
          assert.strictEqual(headers['access-control-allow-credentials'], 'true');
          assert.strictEqual(headers['access-control-allow-origin'], 
            'https://foo.bar.baz');
        });
        it('[H1CG] responds with headers that allow CORS on POST', async () => {
          const request = server.request(); 
          const response = await request
            .post(`/USERNAME/events/${EVENT_ID}/series`)
            .set('origin', 'https://foo.bar.baz')
            .set('authorization', 'AUTH_TOKEN')
            .send({});

          assert.strictEqual(response.statusCode, 400);
          
          const headers = response.headers;
          assert.strictEqual(headers['access-control-allow-credentials'], 'true');
          assert.strictEqual(headers['access-control-allow-origin'], 
            'https://foo.bar.baz');
        });

        describe('when request is malformed', function () {
          malformed('format is not flatJSON', {
            format: 'JSON', 
            fields: ['deltaTime', 'value'], 
            points: [
              [0, 14.1], 
              [1, 14.2], 
              [2, 14.3], 
            ]
          }, '96HC');
          malformed('matrix is not square - not enough fields', {
            format: 'flatJSON', 
            fields: ['deltaTime', 'value'], 
            points: [
              [0, 14.1], 
              [1], 
              [2, 14.3], 
            ]
          }, '38W3');
          malformed('no negative deltaTime', {
            format: 'flatJSON',
            fields: ['deltaTime', 'value'],
            points: [
              [-1, 14.1],
              [1, 14.2],
              [2, 14.3],
            ]
          }, 'GJL5');
          malformed('value types are not all valid', {
            format: 'flatJSON', 
            fields: ['deltaTime', 'value'], 
            points: [
              [0, 14.1], 
              [1, 'foobar'], 
              [2, 14.3], 
            ]
          }, 'GJL4');
          malformed('missing deltaTime column', {
            format: 'flatJSON', 
            fields: ['value'], 
            points: [
              [14.1], 
              [13.2], 
              [14.3], 
            ]
          }, 'JJRO');
          malformed('missing value column for a simple input', {
            format: 'flatJSON', 
            fields: ['deltaTime'], 
            points: [
              [0], 
              [1], 
              [2], 
            ]
          }, 'LKFG');
          
          function malformed(text, data, testID) {
            it(`[${testID}] should be rejected (${text})`, function () {
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
              scheduleUpdate: () => {  return Promise.resolve({ }); },
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
            server = await spawnContextServerWithOptions(spawnContext, config);
            
            rpcServer.close();
          });
          
          it('[GU3L] should schedule a metadata update on every store', async () => {
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
          server = await spawnContextServerWithOptions(spawnContext, config);
        });
        after(() => {
          server.stop(); 
        });
        
        // Bypass authentication check: Fail always
        beforeEach(async function () {
          await server.process.
            sendToChild('mockAuthentication', false);
        });

        it('[NLAW] refuses invalid/unauthorized accesses', function () {
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
        server = await spawnContextServerWithOptions(spawnContext, config);
      });
      after(() => {
        server.stop(); 
      });
      
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
      
      let storageLayer;
      before(function () {
        storageLayer = produceStorageLayer(database);
      });
            
      // Tries to store `data` in an event with attributes `attrs`. Returns 
      // true if the whole operation is successful. 
      // 
      async function tryStore(attrs: Object, header: Header, data: Rows): Promise<TryOpResult> {
        const effectiveAttrs = lodash.merge(
          { streamIds: [ parentStreamId ] , time: Date.now() / 1000}, 
          attrs
        );

        const usersRepository = new UsersRepository(storageLayer.events);
        const user: User = await usersRepository.getById(userId);

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
      
      it('[Y3BL] stores data of any basic type', async () => {
        const now = 6; 
        
        const result = await tryStore({ type: 'series:angular-speed/rad-s' }, 
          ['deltaTime', 'value'],
          [
            [now-3, 1], 
            [now-2, 2], 
            [now-1, 3] ]);
        
        assert.isTrue(result.ok); 
      });
      it('[3WGH] stores data of complex types', async () => {
        const now = 6; 
        const {ok} = await tryStore({ type: 'series:ratio/generic' }, 
          ['deltaTime', 'value', 'relativeTo'],
          [
            [now-3, 1, 2], 
            [now-2, 2, 2], 
            [now-1, 3, 2] ]); 
            
        assert.isTrue(ok);
      });
      it('[1NDB] doesn\'t accept data in non-series format', async () => {
        const now = 6; 
        const {ok, body} = await tryStore({ type: 'angular-speed/rad-s' }, 
          ['deltaTime', 'value'],
          [
            [now-3, 1], 
            [now-2, 2], 
            [now-1, 3] ]);
        
        assert.isFalse(ok);
        
        const error = body.error;
        assert.strictEqual(error.id, 'invalid-operation');
      });
      
      it('[YMHK] stores strings', async () => {
        const aLargeString = '2222222'.repeat(100);
        const now = 20; 
        
        const result = await tryStore({ type: 'series:call/telephone'}, 
          ['deltaTime', 'value'], 
          [
            [now-10, aLargeString]
          ]);
          
        assert.isTrue(result.ok);
      });
      it('[ZL7C] stores floats', async () => {
        const now = 10000000; 

        
        const aHundredRandomFloats = lodash.times(100, 
          idx => [now-100+idx, Math.random() * 1e6]);
        
        const result = await tryStore({ type: 'series:mass/kg'}, 
          ['deltaTime', 'value'], 
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
        server = await spawnContextServerWithOptions(spawnContext, config);
      });
      after(() => {
        server.stop(); 
      });

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
        let now = 6;
        let args = [
          ['deltaTime', 'value'],
          [
            [now-3, 1], 
            [now-2, 2], 
            [now-1, 3] ],
        ];
        
        it('[FNDT] refuses to store when not all required fields are given', async () => {
          assert.isFalse(
            await tryStore(...args));
        });
        it('[H525] returns error id "invalid-request-structure"', async () => {
          const { status, id, message } = await failStore(...args);
          
          assert.strictEqual(status, 400);
          assert.strictEqual(id, 'invalid-request-structure');
          assert.strictEqual(message, '"fields" field must contain valid field names for the series type.');
        });
      });
      it('[DTZ2] refuses to store when deltaTime is present twice (ambiguous!)', async () => {
        const now =6; 
        assert.isFalse(
          await tryStore(
            ['deltaTime', 'deltaTime', 'value', 'relativeTo'],
            [
              [now-3, now-6, 1, 1], 
              [now-2, now-5, 2, 2], 
              [now-1, now-4, 3, 3] ]));
      });
      it('[UU4R] refuses to store when other fields are present twice (ambiguous!)', async () => {
        const now = 6; 
        assert.isFalse(
          await tryStore(
            ['deltaTime', 'value', 'value', 'relativeTo'],
            [
              [now-3, 3, 1, 1], 
              [now-2, 2, 2, 2], 
              [now-1, 1, 3, 3] ]));
      });
      describe("when field names don't match the type", () => {
        const now = 6;
        const args = [
          ['deltaTime', 'value', 'relativeFrom'],
          [
            [now-3, 3, 1], 
            [now-2, 2, 2], 
            [now-1, 1, 3] ],
        ];
        
        it('[AJMS] refuses to store when field names don\'t match the type', async () => {
          assert.isFalse(
            await tryStore(...args));
        });
        it('[7CR7] returns the error message with the id "invalid-request-structure"', async () => {
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
        server = await spawnContextServerWithOptions(spawnContext, config);
      });
      after(() => {
        server.stop(); 
      });

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

      it('[UDHO] allows storing any number of optional fields, on each request', async () => {
        const now = 6; 
        
        assert.isTrue(
          await tryStore(
            ['deltaTime', 'latitude', 'longitude', 'altitude'],
            [
              [now-3, 1, 2, 3], 
              [now-2, 2, 3, 4], 
              [now-1, 3, 4, 5] ]));

        assert.isTrue(
          await tryStore(
            ['deltaTime', 'latitude', 'longitude', 'altitude', 'speed'],
            [
              [now-3, 1, 2, 3, 160], 
              [now-2, 2, 3, 4, 170], 
              [now-1, 3, 4, 5, 180] ]));
      });
      it('[JDTH] refuses unknown fields', async () => {
        const now = 6; 
        assert.isFalse(
          await tryStore(
            ['deltaTime', 'latitude', 'longitude', 'depth'],
            [
              [now-3, 1, 2, 3], 
              [now-2, 2, 3, 4], 
              [now-1, 3, 4, 5] ]));
      });
    });
    describe('using a "create-only" permissions', () => {

      before(async () => {
        server = await spawnContextServerWithOptions(spawnContext, config);
      });
      after(() => {
        server.stop(); 
      });
      
      after(function () {
        pryv.clean();
      });
      
      let userId, streamId, createOnlyToken, event; 
      before(async () => {
        userId = cuid(); 
        streamId = cuid(); 
        createOnlyToken = cuid(); 
        
        debug('build fixture');
        const user = await pryv.user(userId, {});
        user.access({
          token: createOnlyToken, 
          type: 'app',
          permissions: [{
            streamId: streamId,
            level: 'create-only'
          }]
        });
        const stream = await user.stream({id: streamId}, function () {});
        event = await stream.event({
          type: 'series:mass/kg'
        });
        event = event.attrs;
      });

      it('[YCGZ] should work', async () => {
        const res = await server
          .request()
          .post(`/${userId}/events/${event.id}/series`)
          .set('authorization', createOnlyToken)
          .send({
            format: 'flatJSON',
            fields: ['deltaTime', 'value'],
            points: [[1,1], [2,2]]
          });
        assert.equal(res.status, 200);
      });
    });
  }); 
});
