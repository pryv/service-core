'use strict';
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it, beforeEach, afterEach */
const bluebird = require('bluebird');
const should = require('should');
const request = require('supertest');
const R = require('ramda');
const cuid = require('cuid');

const { settings, produceMongoConnection, define, produceInfluxConnection } = require('./test-helpers');
const databaseFixture = require('../support/database_fixture');

const Application = require('../../src/Application');

import type {MetadataRepository} from '../../src/metadata_cache';
import type {Response} from 'supertest';

describe('Storing data in a HF series', function() {
  // Application, Context and Server are needed for influencing the way 
  // authentication works in some of the tests here. 
  const application = define(this, () => new Application().init(settings)); 
  const context = define(this, () => application().context); 
  const server = define(this, () => application().server); 

  // Express app that we test against.
  const app = define(this, () => server().setupExpress());

  describe('Use Case: Store data in InfluxDB', function () {
    const database = produceMongoConnection(); 
    const influx = produceInfluxConnection(); 

    const pryv = databaseFixture(database, this);
    afterEach(function () {
      pryv.clean(); 
    });
      
    // Set up a few ids that we'll use for testing. NOTE that these ids will
    // change on every test run. 
    const userId = define(this, cuid);
    const parentStreamId = define(this, cuid); 
    const eventId = define(this, cuid); 
    const accessToken = define(this, cuid);

    define(this, () => {
      return pryv.user(userId(), {}, function (user) {
        user.stream({id: parentStreamId()}, function (stream) {
          stream.event({
            id: eventId(), 
            type: 'mass/kg'});
        });

        user.access({token: accessToken(), type: 'personal'});
        user.session(accessToken());
      });
    });
    
    function storeData(data: {}): Response {
      // Insert some data into the events series:
      const postData = {
        format: 'flatJSON',
        fields: Object.keys(data), 
        points: [ 
          R.map(R.prop(R.__, data), Object.keys(data)),
        ]
      };
      return request(app())
        .post(`/${userId()}/events/${eventId()}/series`)
        .set('authorization', accessToken())
        .send(postData)
        .expect(200);
    }
    
    it('should store data correctly', function () {
      return bluebird
        // Store some data into InfluxDB
        .try(() => storeData({timestamp: 1481677845, value: 80.3}))
        
        // Check if the data is really there (1/2)
        .then(() => {
          const userName = userId(); // identical with id here, but will be user name in general. 
          const options = { database: `user.${userName}` };
          const query = `
            SELECT * FROM "event.${eventId()}"
          `;
          
          return influx.query(query, options);
        })
        
        // Check if the data is really there (2/2)
        .then((res) => {
          const row = res[0];
          if (row.time == null || row.value == null) 
            throw new Error("Should have time and value.");
          
          should(row.time.toNanoISOString()).be.eql('2016-12-14T01:10:45.000000000Z');
          should(row.value).be.eql(80.3);
        });
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
        canWrite: function canWrite(): boolean { return authTokenValid; },
        namespace: () => ['test', 'foo'],
      };
      return {
        forSeries: function forSeries() { return Promise.resolve(seriesMeta); }
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

    it.skip('should reject non-JSON bodies', function () { });
    
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
  describe('GET /events/EVENT_ID/series', function () {
    it.skip('should query data from the influx store', function () { });
    it.skip('should return correctly for empty sets', function () { });
  });
});
