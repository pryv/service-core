'use strict';
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it, beforeEach */
const { should, request, settings } = require('./test-helpers');
const memo = require('memo-is');
const R = require('ramda');

const Application = require('../../src/Application');

import type {MetadataRepository} from '../../src/metadata_cache';
import type {Response} from 'supertest';

describe('Storing data in a HF series', function() {
  const application = memo().is(()  => new Application().init(settings)); 
  const context = memo().is(()      => application().context); 
  const server = memo().is(()       => application().server); 

  const app = memo().is(()          => server().setupExpress());
  
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
          // Verify data here
          should(response).not.be.empty(); 
          
          should(response.fields).be.eql(['timestamp', 'value']);
          
          const pairEqual = ([given, expected]) => 
            should(given).be.eql(expected);
            
          should(response.points.length).be.eql(data.points.length);
          R.all(pairEqual, R.zip(response.points, data.points));
        });
    });
    it.skip('should reject non-JSON bodies', function () { });
    
    describe('when authToken is not valid', function () {
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
    describe('when request is malformed', function () {
      bad('format is not flatJSON', {
        elementType: 'mass/kg',
        format: 'JSON', 
        fields: ['timestamp', 'value'], 
        points: [
          [1481677845, 14.1], 
          [1481677846, 14.2], 
          [1481677847, 14.3], 
        ]
      });
      
      function bad(text, data) {
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
  describe('GET /events/EVENT_ID/series', function () {
    it.skip('should query data from the influx store', function () { });
    it.skip('should return correctly for empty sets', function () { });
  });
});
