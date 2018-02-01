// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it, beforeEach, after, before */
const bluebird = require('bluebird');
const should = require('should');
const R = require('ramda');
const cuid = require('cuid');
const debug = require('debug')('store_data.test');

const { spawnContext, produceMongoConnection, produceInfluxConnection } = require('./test-helpers');
const databaseFixture = require('../support/database_fixture');

import type {MetadataRepository} from '../../src/metadata_cache';
import type {Response} from 'supertest';

describe('Storing data in a HF series', function() {

  let server; 
  before(async () => {
    debug('spawning');
    server = await spawnContext.spawn(); 
  });
  after(() => {
    server.stop(); 
  });

  describe('Use Case: Store data in InfluxDB, Verification on either half', function () {
    const database = produceMongoConnection(); 
    const influx = produceInfluxConnection(); 

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
            type: 'mass/kg'});
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
      
      should(row.time.toNanoISOString()).be.eql('2016-12-14T01:10:45.000000000Z');
      should(row.value).be.eql(80.3);
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
            should(points).not.be.empty();
            should(points[0]).be.eql([1493647899, 1234]);
          });
      }
    });
  });
  
  describe('POST /events/EVENT_ID/series', function() {
    const EVENT_ID = 'EVENTID';
    
    // TODO Worry about deleting data that we stored in earlier tests.
    
    function storeData(data): Response {
      const response = request(app())
        .post(`/USERNAME/events/${EVENT_ID}/series`)
        .set('authorization', 'AUTH_TOKEN')
        .send(data);
        
      return response;
    }
    function queryData(): Promise<Object> {
      let response = request(app())
        .get(`/USERNAME/events/${EVENT_ID}/series`)
        .set('authorization', 'KEN SENT ME')
        .query({
          fromTime: '1481677844', 
          toTime: '1481677850',
        });

      return response
        .expect(200)
        .then((res) => {
          should(res.body.elementType).be.instanceof(String);
          return res.body;
        });
    }
    
    function produceMetadataLoader(authTokenValid=true): MetadataRepository {
      const seriesMeta = {
        canWrite: () => authTokenValid,
        canRead: () => authTokenValid, 
        namespace: () => ['test', 'foo'],
      };
      return {
        forSeries: function forSeries() { return bluebird.resolve(seriesMeta); }
      };
    }
    function produceData() {
      return {
        elementType: 'mass/kg',
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
      // Bypass authentication check: Succeed always
      beforeEach(function () {
        context().metadata = produceMetadataLoader();
      });
      
      it('stores data into InfluxDB', function() {
        const data = produceData(); 
        
        return storeData(data)
          .expect(200)
          .then(queryData)
          .then((response) => {
            // Verify HTTP response content
            should(response).not.be.empty(); 
            
            should(response.fields).be.eql(['timestamp', 'value']);
            
            const pairEqual = ([given, expected]) => 
              should(given).be.eql(expected);
              
            should(response.points.length).be.eql(data.points.length);
            R.all(pairEqual, R.zip(response.points, data.points));
          });
      });

      it('should reject non-JSON bodies', function () { 
        const response = request(app())
          .post(`/USERNAME/events/${EVENT_ID}/series`)
          .set('authorization', 'AUTH_TOKEN')
          .type('form')
          .send({ format: 'flatJSON' });
          
        return response
          .expect(400);
      });

      describe('when request is malformed', function () {
        malformed('format is not flatJSON', {
          elementType: 'mass/kg',
          format: 'JSON', 
          fields: ['timestamp', 'value'], 
          points: [
            [1481677845, 14.1], 
            [1481677846, 14.2], 
            [1481677847, 14.3], 
          ]
        });
        malformed('matrix is not square - not enough fields', {
          elementType: 'mass/kg',
          format: 'flatJSON', 
          fields: ['timestamp', 'value'], 
          points: [
            [1481677845, 14.1], 
            [1481677846], 
            [1481677847, 14.3], 
          ]
        });
        malformed('value types are not all valid', {
          elementType: 'mass/kg',
          format: 'flatJSON', 
          fields: ['timestamp', 'value'], 
          points: [
            [1481677845, 14.1], 
            [1481677846, 'foobar'], 
            [1481677847, 14.3], 
          ]
        });
        malformed('missing timestamp column', {
          elementType: 'mass/kg',
          format: 'flatJSON', 
          fields: ['value'], 
          points: [
            [14.1], 
            [13.2], 
            [14.3], 
          ]
        });
        malformed('missing value column for a simple input', {
          elementType: 'mass/kg',
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
                should(error.id).be.eql('invalid-request-structure');
              });
          });
        }
      });
    });
    describe('when authentication fails', function () {
      // Bypass authentication check: Fail always
      beforeEach(function () {
        context().metadata = produceMetadataLoader(false); 
      });

      it('refuses invalid/unauthorized accesses', function () {
        const data = produceData(); 
        
        return storeData(data)
          .expect(403)
          .then((res) => {
            const error = res.body.error; 
            should(error.id).be.eql('forbidden');
            should(error.message).be.instanceof(String);
          });
      });
    });
  }); 
});
