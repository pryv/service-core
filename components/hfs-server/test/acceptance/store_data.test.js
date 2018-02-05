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

import type {Response} from 'supertest';

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
    
    function storeData(data: {}): Response {
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
      await storeData({timestamp: 1481677845, value: 80.3});
      
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
    const EVENT_ID = 'EVENTID';
    
    let server; 
        
    // TODO Worry about deleting data that we stored in earlier tests.
    
    function storeData(data): Response {
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
          assert.typeOf(res.body.elementType, 'string');
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

    describe('when bypassing authentication (succeed always)', function () {
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
    });
    describe('when authentication fails', function () {
      before(async () => {
        debug('spawning');
        server = await spawnContext.spawn(); 
      });
      after(() => {
        server.stop(); 
      });
      
      // Bypass authentication check: Fail always
      beforeEach(function () {
        server.process.
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
    describe('storing data in different formats', () => {
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
      
      type Header = Array<string>; 
      type Rows   = Array<Row>; 
      type Row    = Array<number>;
      
      // Tries to store `data` in an event with attributes `attrs`. Returns 
      // true if the whole operation is successful. 
      // 
      async function tryStore(attrs: Object, header: Header, data: Rows): Promise<boolean> {
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
          
        return response.statusCode === 200;
      }
      
      it('stores data of any basic type', async () => {
        const now = (new Date()) / 1000; 
        assert.isTrue(
          await tryStore({ type: 'series:angular-speed/rad-s' }, 
            ['timestamp', 'value'],
            [
              [now-3, 1], 
              [now-2, 2], 
              [now-1, 3] ]));
      });
      it('stores data of complex types', async () => {
        const now = (new Date()) / 1000; 
        assert.isTrue(
          await tryStore({ type: 'series:ratio/generic' }, 
            ['timestamp', 'value', 'relativeTo'],
            [
              [now-3, 1, 2], 
              [now-2, 2, 2], 
              [now-1, 3, 2] ]));
      });
      it("doesn't accept data in non-series format", async () => {
        const now = (new Date()) / 1000; 
        assert.isFalse(
          await tryStore({ type: 'angular-speed/rad-s' }, 
            ['timestamp', 'value'],
            [
              [now-3, 1], 
              [now-2, 2], 
              [now-1, 3] ]));
      });
    });
  }); 
});
